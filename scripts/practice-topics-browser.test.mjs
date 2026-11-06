// Synthetic API fixtures verify presentation only; no production writes.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const { chromium } = await import(process.env.O2I_PLAYWRIGHT_MODULE ?? '/Users/mucenyao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const app = 'http://127.0.0.1:5197', api = 'http://127.0.0.1:55529';
const uid = '33333333-3333-4333-8333-333333333333';
const anon = ['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url'), 'synthetic'].join('.');
let topics = ['10.1', '1.15', '2.1', '1.6', '1.5'].map((code, n) => ({ id: `11111111-1111-4111-8111-11111111111${n}`, code, title: `Synthetic Topic ${code}`, question_count: 1 }));
const answer = { id: uid, session_id: uid, question_id: uid, version_id: uid, selected_option_id: uid, is_correct: true, submitted_at: '2026-10-24T12:00:00Z', elapsed_seconds: 5, topic_code: '1.5', topic_title: 'Synthetic saved history' };
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5197', '--strictPort'], { env: { ...process.env, VITE_LOCAL_SUPABASE_URL: api, VITE_LOCAL_SUPABASE_ANON_KEY: anon }, stdio: 'ignore' });
let browser;
try {
  for (let n = 0; ; n++) {
    try { if ((await fetch(app)).ok) break; } catch {}
    if (n > 100) throw new Error('Vite startup timeout');
    await new Promise(r => setTimeout(r, 200));
  }
  browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const context = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  const calls = [], errors = [];
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === app) return route.continue();
    if (url.origin !== api) return route.abort();
    const fn = url.pathname.split('/').at(-1); calls.push(fn);
    let data = [];
    if (fn === 'list_question_practice_topics') data = topics;
    else if (fn === 'list_question_practice_attempts') data = [answer];
    else if (fn === 'profiles') data = { user_id: uid, full_name: 'Synthetic student' };
    else if (fn === 'get_admin_access') data = { courses: false, questions: false, playground: false, team: false, users: false };
    else if (fn === 'is_super_admin' || fn === 'has_role') data = false;
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data), headers: { 'access-control-allow-origin': app, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  });
  const token = anon.split('.')[0] + '.' + Buffer.from(JSON.stringify({ sub: uid, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url') + '.synthetic';
  await context.addInitScript(({ token, uid }) => {
    localStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token: token, refresh_token: 'synthetic', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user: { id: uid, aud: 'authenticated', role: 'authenticated', email: 'synthetic@example.test', app_metadata: { provider: 'email' }, user_metadata: {} } }));
  }, { token, uid });
  const page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', e => errors.push(e.message));
  const cards = page.locator('a[href*="&topic="]');
  const codes = async () => (await cards.allTextContents()).map(text => text.split(' · ')[0]);
  await page.goto(app + '/practice');
  await page.getByRole('button', { name: 'Unit 10', exact: true }).waitFor();
  assert.deepEqual(await codes(), ['1.5', '1.6', '1.15', '2.1', '10.1']);
  const quick = page.getByRole('link', { name: /Start up to 5/ });
  const quickHref = await quick.getAttribute('href');
  const history = page.getByRole('link', { name: /Synthetic saved history/ });
  const historyText = await history.innerText(), historyHref = await history.getAttribute('href');
  const before = calls.length;
  const unit1 = page.getByRole('button', { name: 'Unit 1', exact: true });
  await unit1.focus(); await page.keyboard.press('Enter');
  assert.equal(await unit1.getAttribute('aria-pressed'), 'true');
  assert.deepEqual(await codes(), ['1.5', '1.6', '1.15']);
  assert.equal(await quick.getAttribute('href'), quickHref);
  assert.equal(await cards.first().getAttribute('href'), `/quiz?subject=calculus&topic=${topics[4].id}&source=quick`);
  assert.equal(await history.innerText(), historyText); assert.equal(await history.getAttribute('href'), historyHref);
  assert.equal(calls.length, before, 'Filtering must not call APIs');
  const all = page.getByRole('button', { name: 'All', exact: true });
  await all.click(); assert.equal(await cards.count(), 5);
  topics = topics.map(t => t.code === '1.15' ? { ...t, question_count: 7 } : t);
  topics.push({ id: uid, code: '3.2', title: 'Synthetic newly published ' + 'LongTitle'.repeat(12), question_count: 2 });
  await page.reload(); await page.getByRole('button', { name: 'Unit 3', exact: true }).waitFor();
  assert.equal(await cards.count(), 6);
  assert.match(await cards.filter({ hasText: '1.15 ·' }).innerText(), /7 published questions/);
  await page.getByRole('button', { name: 'Unit 3', exact: true }).click();
  assert.deepEqual(await codes(), ['3.2']); assert.match(await cards.innerText(), /2 published questions/);
  await all.click();
  const out = resolve('outputs/practice-topics'); mkdirSync(out, { recursive: true });
  await page.screenshot({ path: resolve(out, 'desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  const boxes = await cards.evaluateAll(rows => rows.map(row => { const r = row.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width }; }));
  assert.ok(boxes.every(box => box.x === boxes[0].x && box.width <= 375));
  assert.ok(boxes[1].y > boxes[0].y);
  await page.getByRole('button', { name: 'Unit 10', exact: true }).click(); assert.deepEqual(await codes(), ['10.1']);
  await all.click(); await page.screenshot({ path: resolve(out, 'mobile.png'), fullPage: true });
  topics = []; await page.reload(); await page.getByText('No published questions are available yet.').waitFor();
  assert.equal(await cards.count(), 0); assert.equal(await all.getAttribute('aria-pressed'), 'true');
  assert.deepEqual(errors, []);
  assert.ok(!calls.some(fn => fn.startsWith('start_') || fn.startsWith('submit_')), 'Presentation must not issue practice sessions or answers');
  console.log('PASS Practice browser: natural order, Unit/All, keyboard, unchanged links/history, no filter RPCs, refreshed publication/counts, mobile, empty state');
} finally { await browser?.close(); vite.kill(); }
