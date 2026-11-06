// Synthetic auth fixtures; this suite checks presentation and navigation only.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
const { chromium } = await import(process.env.O2I_PLAYWRIGHT_MODULE ?? '/Users/mucenyao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');

const app = 'http://127.0.0.1:5196', api = 'http://127.0.0.1:55529';
const uid = '22222222-2222-4222-8222-222222222222';
const jwt = payload => ['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', Buffer.from(JSON.stringify(payload)).toString('base64url'), 'synthetic'].join('.');
const session = { access_token: jwt({ sub: uid, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }), refresh_token: 'synthetic', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user: { id: uid, aud: 'authenticated', role: 'authenticated', email: 'test@example.test', app_metadata: { provider: 'email' }, user_metadata: {} } };
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5196', '--strictPort'], {
  env: { ...process.env, VITE_LOCAL_SUPABASE_URL: api, VITE_LOCAL_SUPABASE_ANON_KEY: jwt({ role: 'anon' }) }, stdio: 'ignore',
});
let browser;
try {
  for (let n = 0; ; n++) {
    try { if ((await fetch(app)).ok) break; } catch {}
    if (n > 100) throw new Error('Vite startup timeout');
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  for (const mode of ['guest', 'student', 'admin']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin === app) return route.continue();
      if (url.origin !== api) return route.abort();
      let body = [];
      const name = url.pathname.split('/').at(-1);
      if (name === 'get_admin_access') body = { courses: mode === 'admin', questions: false, playground: false, team: false, users: false };
      if (name === 'profiles') body = { user_id: uid, full_name: 'Synthetic User' };
      if (name === 'logout') body = {};
      const preflight = route.request().method() === 'OPTIONS';
      await route.fulfill({ status: preflight ? 204 : 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }, contentType: 'application/json', body: preflight ? '' : JSON.stringify(body) });
    });
    if (mode !== 'guest') await context.addInitScript(value => localStorage.setItem('sb-127-auth-token', JSON.stringify(value)), session);
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${app}/about`);
    await page.getByRole('heading', { level: 1, name: 'Math makes more sense together.' }).waitFor();
    const nav = page.locator('nav').first();
    const scroll = page.getByRole('region', { name: 'Scrollable navigation' });
    if (mode !== 'guest') await nav.getByRole('button', { name: 'Sign Out', exact: true }).waitFor();
    if (mode === 'admin') await scroll.getByRole('button', { name: 'Admin', exact: true }).waitFor();
    for (const width of [1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      const layout = await scroll.evaluate(el => {
        const rect = item => { const { left, right, width } = item.getBoundingClientRect(); return { left, right, width }; };
        const row = el.closest('nav').firstElementChild;
        return { container: rect(row), logo: rect(row.querySelector('a')), scroll: rect(el), links: rect(el.firstElementChild), auth: rect(el.parentElement.lastElementChild), overflowing: el.scrollWidth > el.clientWidth, pageWidth: document.documentElement.scrollWidth };
      });
      assert(Math.abs(layout.container.left + layout.container.right - width) <= 1, 'header container is centered');
      assert(layout.logo.right <= layout.scroll.left && layout.scroll.right <= layout.auth.left, 'navigation never overlaps logo or account');
      assert.equal(layout.pageWidth, width, 'no page-level horizontal overflow');
      if (!layout.overflowing) assert(Math.abs(layout.links.left + layout.links.right - layout.scroll.left - layout.scroll.right) <= 1, 'menu is centered in available space');
      // Force long navigation without changing the real menu or auth fixtures.
      await scroll.evaluate(el => { el.firstElementChild.style.minWidth = '1400px'; el.scrollLeft = 0; });
      const before = await nav.getByRole('link', { name: 'O2I Institute' }).boundingBox();
      const authBefore = await scroll.locator('..').locator(':scope > div').last().boundingBox();
      await scroll.focus();
      await page.keyboard.press('ArrowRight');
      await page.waitForFunction(() => document.querySelector('[aria-label="Scrollable navigation"]').scrollLeft > 0);
      assert.deepEqual(await nav.getByRole('link', { name: 'O2I Institute' }).boundingBox(), before);
      assert.deepEqual(await scroll.locator('..').locator(':scope > div').last().boundingBox(), authBefore);
      await scroll.evaluate(el => { el.firstElementChild.style.minWidth = ''; el.scrollLeft = 0; });
      await page.getByRole('heading', { level: 1 }).click();
      await page.screenshot({ path: `/tmp/o2i-about-${mode}-${width}.png`, fullPage: true });
      console.log(`PASS ${mode} desktop ${width}px: centered menu, no overlap, keyboard scrolling`);
    }
    await nav.getByRole('link', { name: 'About Us', exact: true }).click();
    await page.waitForURL(`${app}/about`);
    await page.reload();
    await page.getByRole('heading', { level: 1 }).waitFor();
    for (const width of [320, 390, 768, 1279]) {
      await page.setViewportSize({ width, height: 900 });
      await nav.getByRole('button', { name: 'Open menu' }).click();
      await page.getByRole('dialog').getByRole('link', { name: 'About Us', exact: true }).click();
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
      await page.screenshot({ path: `/tmp/o2i-about-${mode}-${width}.png`, fullPage: true });
      console.log(`PASS ${mode} mobile ${width}px: About Us menu and no overflow`);
    }
    for (const [name, path] of [['Explore courses', '/courses'], ['Start practicing', '/practice'], ['View solution requests', '/solution-requests'], ['Meet the team', '/team'], ['Meet the people behind O2I', '/team']]) {
      await page.getByRole('main').getByRole('link', { name, exact: true }).first().click();
      await page.waitForURL(`${app}${path}`);
      await page.goto(`${app}/about`);
      await page.getByRole('heading', { level: 1 }).waitFor();
    }
    if (mode !== 'guest') {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await nav.getByRole('button', { name: 'Sign Out', exact: true }).click();
      await nav.getByRole('link', { name: 'Sign In / Sign Up' }).waitFor();
    }
    assert.deepEqual(errors, []);
    console.log(`PASS ${mode}: centered desktop navbar, fixed account, keyboard overflow, mobile About Us menu, direct reload, page links${mode === 'guest' ? '' : ', sign out'}`);
    await context.close();
  }
} finally {
  await browser?.close();
  vite.kill();
}
