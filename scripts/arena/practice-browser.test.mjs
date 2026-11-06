// Synthetic API fixtures exercise the shipped host/iframe, Profile and Review. No production writes.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
const { chromium } = await import(process.env.O2I_PLAYWRIGHT_MODULE ?? '/Users/mucenyao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const app = 'http://127.0.0.1:5196', api = 'http://127.0.0.1:55528';
const uid = '33333333-3333-4333-8333-333333333333', sid = '11111111-1111-4111-8111-111111111111', qid = '22222222-2222-4222-8222-222222222222';
const options = [uid, sid, qid, '44444444-4444-4444-8444-444444444444'].map((id, i) => ({ id, key: 'ABCD'[i], text: `Option $x^{${i}}$` }));
const image = app + '/synthetic-figure.svg';
const stem = 'Synthetic $x^2$\n\n| x | y |\n| --- | --- |\n| 1 | 2 |\n\n<script>window.__arenaInjected=true</script>';
const issued = { status: 'ok', issue_id: sid, unit: 1, tier: 2, topic: '1.1 <img src=x onerror="window.__arenaInjected=true">', stem, image_url: image, opts: options.map(o => o.text), graph: null, table: null };
const saved = { id: uid, session_id: sid, question_id: qid, version_id: uid, selected_option_id: options[1].id, is_correct: false, submitted_at: '2026-11-05T12:00:00Z', elapsed_seconds: null, topic_code: '1.1', topic_title: 'Synthetic Topic', source: 'arena' };
const session = { id: sid, topic_id: null, created_at: saved.submitted_at, source: 'arena', mode: 'set', ended_at: null,
  questions: [{ question_id: qid, version_id: uid, position: 1, stem, image_url: image, requires_figure: true, difficulty: 'medium', calculator_policy: 'not_allowed', course_scope: 'BOTH',
    topic: { id: qid, code: '1.1', title: 'Synthetic Topic' }, skills: ['1.A'], options,
    attempt: { ...saved, correct_option_id: options[0].id, solution: 'Synthetic solution $x^2$', timing_complete: false } }] };
const tokenBase = ['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url'), 'synthetic'];
const anon = tokenBase.join('.');
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5196', '--strictPort'], { env: { ...process.env, VITE_LOCAL_SUPABASE_URL: api, VITE_LOCAL_SUPABASE_ANON_KEY: anon }, stdio: 'ignore' });
let browser;
try {
  for (let n = 0; ; n++) { try { if ((await fetch(app)).ok) break; } catch {} if (n > 100) throw Error('Vite timeout'); await new Promise(r => setTimeout(r, 200)); }
  browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const context = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  const calls = [], errors = [];
  let statsFail = false;
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.href === image) return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><path d="M0 60L120 0" stroke="black"/></svg>' });
    if (url.origin === app) return route.continue();
    if (url.origin !== api) return route.abort();
    const fn = url.pathname.split('/').at(-1); calls.push(fn);
    const headers = { 'access-control-allow-origin': app, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (fn === 'get_question_practice_statistics' && statsFail) return route.fulfill({ status: 503, headers, contentType: 'application/json', body: '{"message":"Synthetic outage"}' });
    let data = [];
    if (fn === 'arena_practice_catalog') data = { counts: { 1: 4 } };
    else if (fn === 'arena_practice_next_question') data = issued;
    else if (fn === 'arena_practice_submit_answer') data = { status: 'ok', correct: false, correct_index: 0, selected_index: 1, explanation: 'Synthetic solution $x^2$' };
    else if (fn === 'get_question_practice_statistics') data = { sessionCount: 3, attemptCount: 5, correctCount: 3, sources: [{ source: 'arena', sessionCount: 1, attemptCount: 1, correctCount: 0 }, { source: 'practice', sessionCount: 2, attemptCount: 4, correctCount: 3 }] };
    else if (fn === 'list_question_practice_attempts') data = [saved];
    else if (fn === 'get_question_practice' || fn === 'start_question_practice') data = session;
    else if (fn === 'get_open_continuous_question_practice') data = null;
    else if (fn === 'profiles') data = { user_id: uid, full_name: 'Synthetic student' };
    else if (fn === 'get_admin_access') data = { courses: false, questions: false, playground: false, team: false, users: false };
    else if (fn === 'is_super_admin' || fn === 'has_role') data = false;
    return route.fulfill({ headers, contentType: 'application/json', body: JSON.stringify(data) });
  });
  const token = [tokenBase[0], Buffer.from(JSON.stringify({ sub: uid, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'), 'synthetic'].join('.');
  await context.addInitScript(({ token, uid }) => {
    localStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token: token, refresh_token: 'synthetic', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user: { id: uid, aud: 'authenticated', role: 'authenticated', email: 'synthetic@example.test', app_metadata: { provider: 'email' }, user_metadata: {} } }));
    localStorage.setItem('cq-arena-lang', 'zh');
  }, { token, uid });
  const page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', e => errors.push(e.message));
  await page.goto(app + '/arena');
  const iframe = page.frameLocator('iframe'); await iframe.locator('#lang').waitFor();
  const frame = page.frames().find(f => f.url().includes('/games/limit-arena.html')); assert.ok(frame);
  assert.equal(await frame.locator('html').getAttribute('lang'), 'zh-CN');
  const probe = async (action, payload) => frame.evaluate(({ action, payload }) => new Promise((resolve, reject) => {
    const id = 9999; const timer = setTimeout(() => reject(Error('Bridge timeout')), 10000);
    const receive = e => { if (e.source === parent && e.data?.source === 'limit-arena-host' && e.data.id === id) { clearTimeout(timer); removeEventListener('message', receive); resolve(e.data); } };
    addEventListener('message', receive); parent.postMessage({ source: 'limit-arena', id, action, payload }, location.origin);
  }), { action, payload });
  const reply = await probe('next', { runId: sid, units: [1], currentUnit: 1, tier: 2, preferCurrent: true });
  assert.equal(reply.ok, true); assert.ok(reply.data.stem.includes('katex')); assert.ok(reply.data.stem.includes('<table>'));
  assert.ok(!reply.data.topic.includes('<img')); assert.ok(!reply.data.stem.includes('<script'));
  await frame.evaluate(data => { const preview = document.createElement('section'); preview.id = 'synthetic-preview'; preview.className = 'qz'; preview.style.cssText = 'position:fixed;inset:30px;z-index:99999;background:white;color:black;padding:20px;overflow:auto'; preview.innerHTML = data.stem + data.opts.join(''); document.body.append(preview); }, reply.data);
  await iframe.locator('#synthetic-preview img').waitFor();
  assert.ok(await iframe.locator('#synthetic-preview .katex').count() >= 5);
  assert.equal(await frame.evaluate(() => !!window.__arenaInjected), false);
  const result = await probe('answer', { issueId: sid, index: 1 });
  assert.ok(result.data.explanation.includes('katex'));
  mkdirSync('node_modules/.cache/arena-practice', { recursive: true });
  await page.screenshot({ path: 'node_modules/.cache/arena-practice/iframe-content.png' });
  await page.goto(app + '/profile');
  const totals = page.locator('dl[aria-label="Practice statistics"] dd'); await totals.first().waitFor();
  assert.deepEqual(await totals.allTextContents(), ['3', '5', '60.0%']);
  const arenaRow = page.getByRole('row', { name: 'Arena 1 1 0.0%' }); await arenaRow.waitFor();
  statsFail = true; await page.reload(); await page.getByRole('alert').filter({ hasText: 'Synthetic outage' }).waitFor();
  statsFail = false; await page.getByRole('button', { name: 'Retry', exact: true }).click(); await totals.first().waitFor();
  await page.goto(app + '/review');
  await page.getByText('Arena', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Only incorrect', exact: true }).click();
  const savedLink = page.getByRole('link', { name: /Synthetic Topic/ }); await savedLink.waitFor();
  assert.ok((await savedLink.getAttribute('href')).includes(`question=${qid}`)); await savedLink.click();
  await page.getByRole('heading', { name: 'Arena · Saved answers' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Submit answer', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Option B', exact: true }).getAttribute('aria-pressed'), 'true');
  await page.getByRole('heading', { name: 'Solution', exact: true }).waitFor();
  assert.ok(await page.locator('.katex').count() > 0); assert.equal(await page.locator('img[alt="Question figure"]').count(), 1);
  assert.equal(await page.getByRole('link', { name: 'Practice this Topic' }).getAttribute('href'), `/quiz?subject=calculus&mode=continuous&topic=${qid}`);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: 'node_modules/.cache/arena-practice/review-mobile.png', fullPage: true });
  assert.ok(calls.includes('arena_practice_next_question')); assert.ok(!calls.includes('arena_next_question'));
  assert.deepEqual(errors, []);
  console.log('PASS Arena browser: partner Chinese UI, safe Markdown/math/table/image bridge, source totals, outage/retry, tagged wrong-answer Review, frozen read-only detail, Topic link and mobile width');
} finally { await browser?.close(); vite.kill('SIGTERM'); }
