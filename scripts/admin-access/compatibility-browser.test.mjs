// Actual React UI with synthetic network fixtures; never connects to production.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const { chromium } = await import(process.env.O2I_PLAYWRIGHT_MODULE ?? '/Users/mucenyao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const app = 'http://127.0.0.1:5196', api = 'http://127.0.0.1:55526';
const id = 'b0000000-0000-4000-8000-000000000001';
const noAccess = { courses: false, questions: false, playground: false, team: false, users: false };
const key = 'header.' + Buffer.from('{"role":"anon"}').toString('base64url') + '.synthetic';
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5196', '--strictPort'], { env: { ...process.env, VITE_LOCAL_SUPABASE_URL: api, VITE_LOCAL_SUPABASE_ANON_KEY: key }, stdio: 'ignore' });
const passed = [];
let browser;
try {
  for (let i = 0;; i++) { try { if ((await fetch(app)).ok) break; } catch {} if (i > 120) throw Error('Vite timeout'); await new Promise(r => setTimeout(r, 250)); }
  browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  for (const scenario of ['legacy-super_admin', 'legacy-admin', 'legacy-student', 'legacy-instructor', 'error-retry', 'wrong-rpc', 'stale-legacy']) {
    const role = scenario.replace('legacy-', ''), calls = [], errors = [];
    let failed = true, release, pending;
    const gate = new Promise(r => { release = r; });
    const entered = new Promise(r => { pending = r; });
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const identity = { id, email: 'synthetic@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} };
    const token = 'header.' + Buffer.from(JSON.stringify({ sub: id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url') + '.synthetic';
    await context.addInitScript(({ token, identity }) => localStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token: token, refresh_token: 'synthetic', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user: identity })), { token, identity });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url()), fn = url.pathname.split('/').at(-1);
      if (url.origin === app) return route.continue();
      if (url.origin !== api) return route.abort();
      calls.push(fn);
      let body = [], status = 200;
      const missing = name => ({ code: 'PGRST202', message: `Could not find the function public.${name}() in the schema cache` });
      if (fn === 'user') body = identity;
      else if (fn === 'logout') body = {};
      else if (fn === 'get_admin_access' || fn === 'has_admin_module') {
        if (scenario === 'error-retry') { status = failed ? 503 : 200; body = failed ? { code: 'PGRST000', message: 'Connection failed' } : { ...noAccess, courses: true, playground: true }; }
        else { status = 404; body = missing(scenario === 'wrong-rpc' ? 'unrelated_rpc' : fn); }
      } else if (fn === 'is_super_admin' || fn === 'has_role') {
        if (scenario === 'stale-legacy') { pending(); await gate; }
        assert.equal(route.request().postDataJSON()._user_id, id);
        body = scenario === 'stale-legacy' || (fn === 'is_super_admin' ? role === 'super_admin' : role === 'admin');
      } else if (fn === 'profiles') {
        const profile = { id, user_id: id, full_name: 'Synthetic account', email: identity.email, role: 'student', created_at: '2026-10-24T00:00:00Z' };
        body = url.searchParams.has('user_id') ? profile : [profile, { ...profile, id: 'b0000000-0000-4000-8000-000000000002', user_id: 'b0000000-0000-4000-8000-000000000002', email: 'student@example.test' }];
      } else if (fn === 'user_roles') body = [{ user_id: id, role }];
      return route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': app, 'access-control-allow-headers': '*', 'access-control-expose-headers': 'content-range', 'content-range': '*/0' }, body: JSON.stringify(body) });
    });
    const page = await context.newPage(); page.setDefaultTimeout(12000); page.on('pageerror', e => errors.push(e.message));
    await page.goto(app + (scenario === 'stale-legacy' ? '/profile' : '/admin'));
    if (scenario === 'stale-legacy') {
      await entered;
      await page.getByRole('button', { name: 'Sign Out', exact: true }).click();
      await page.getByRole('link', { name: 'Sign In / Sign Up', exact: true }).waitFor();
      release();
      await page.waitForLoadState('networkidle');
      assert.equal(await page.getByRole('link', { name: 'Admin', exact: true }).count(), 0);
      passed.push('delayed legacy responses cannot restore permissions after sign-out');
    } else if (['error-retry', 'wrong-rpc'].includes(scenario)) {
      await page.getByRole('heading', { name: 'Account permissions unavailable' }).waitFor();
      assert.equal(page.url(), app + '/admin');
      assert.equal(calls.includes('has_role'), false);
      assert.equal(calls.includes('courses'), false);
      if (scenario === 'error-retry') {
        failed = false;
        await page.getByRole('button', { name: 'Retry', exact: true }).click();
        await page.getByRole('heading', { name: 'Admin Dashboard', exact: true }).waitFor();
        assert.deepEqual(await page.getByRole('tab').allTextContents(), ['Courses', 'Playground']);
      }
      passed.push(scenario + ': visible error, no fallback or redirect, safe retry');
    } else if (['student', 'instructor'].includes(role)) {
      await page.waitForURL(app + '/');
      assert.equal(await page.getByRole('link', { name: 'Admin', exact: true }).count(), 0);
      passed.push(role + ' remains denied on old database');
    } else {
      await page.getByRole('heading', { name: 'Admin Dashboard', exact: true }).waitFor();
      assert.deepEqual(await page.getByRole('tab').allTextContents(), role === 'super_admin' ? ['Courses', 'Question Bank', 'Playground', 'Team', 'Users'] : ['Courses', 'Question Bank', 'Playground', 'Team']);
      await page.getByRole('tab', { name: 'Question Bank', exact: true }).click();
      await page.getByText('No saved drafts yet.', { exact: true }).waitFor();
      if (role === 'super_admin') {
        await page.getByRole('tab', { name: 'Users', exact: true }).click();
        await page.getByText('Account invitations, role changes and deletion are unavailable until the administrator permissions update is installed.').waitFor();
        assert.equal(await page.getByRole('button', { name: 'Send invite', exact: true }).isDisabled(), true);
        assert.equal(await page.getByRole('combobox', { name: 'Account type for student@example.test' }).isDisabled(), true);
        assert.equal(await page.getByRole('button', { name: 'Delete student@example.test', exact: true }).count(), 0);
      }
      await page.screenshot({ path: `docs/admin-access/screenshots/repair-${scenario}.png`, fullPage: true });
      passed.push(role + ': old database restores Admin and Question Bank; unavailable account mutations disabled');
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
  const signupContext = await browser.newContext();
  let signupRedirect, signupSeen;
  const signupRequest = new Promise(resolve => { signupSeen = resolve; });
  await signupContext.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === app) return route.continue();
    if (url.origin === api && url.pathname === '/auth/v1/signup') {
      signupRedirect = url.searchParams.get('redirect_to'); signupSeen();
      return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ msg: 'Synthetic signup intercepted; no email or account created' }) });
    }
    return route.abort();
  });
  const signup = await signupContext.newPage();
  await signup.goto(app + '/auth');
  await signup.getByRole('tab', { name: 'Sign Up', exact: true }).click();
  await signup.locator('#signup-name').fill('Synthetic registration');
  await signup.locator('#signup-email').fill('registration@example.test');
  await signup.locator('#signup-password').fill('Synthetic-only-2026!');
  await signup.getByRole('button', { name: 'Sign Up', exact: true }).click();
  await signupRequest;
  assert.equal(signupRedirect, app + '/');
  passed.push('registration confirmation link stays on current site origin, including 127.0.0.1 development');
  await signupContext.close();
  writeFileSync('docs/admin-access/repair-browser-results.txt', 'LOCAL React UI; synthetic network and accounts, not production acceptance.\n' + passed.map(s => 'PASS ' + s).join('\n') + '\n');
  console.log(passed.join('\n'));
} finally { await browser?.close(); vite.kill(); }
