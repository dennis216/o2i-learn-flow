// End-to-end check of the Solution Requests pages against the real migration in a disposable local PostgreSQL.
// A small stand-in serves the Supabase REST RPC and Storage calls the pages use, running each call as the signed-in role.
// SR_TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/srbrowser npm run test:solution-requests:browser
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { chromium } = await import(process.env.O2I_PLAYWRIGHT_MODULE ?? 'playwright');
const url = process.env.SR_TEST_DATABASE_URL;
assert.ok(url && /127\.0\.0\.1|localhost/.test(url), 'Set SR_TEST_DATABASE_URL to a disposable local database.');
const shots = process.env.SR_SCREENSHOTS ?? join(tmpdir(), 'o2i-solution-requests');
mkdirSync(shots, { recursive: true });

const sql = (text, sub = '', role = 'postgres') => execFileSync('psql', [url, '-qtAX', '-v', 'ON_ERROR_STOP=1', '-c', role === 'postgres' ? text : `
  BEGIN; SELECT set_config('request.jwt.claim.sub', '${sub}', true); SELECT set_config('request.jwt.claim.role', '${role}', true);
  SET LOCAL ROLE ${role}; ${text}; COMMIT;`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim().split('\n').pop();
const file = path => execFileSync('psql', [url, '-qX', '-v', 'ON_ERROR_STOP=1', '-f', new URL(path, import.meta.url).pathname], { stdio: ['ignore', 'pipe', 'pipe'] });
const lit = v => v === null || v === undefined ? 'NULL' : typeof v === 'boolean' || typeof v === 'number' ? String(v)
  : Array.isArray(v) ? (v.length ? `ARRAY[${v.map(lit).join(',')}]::text[]` : `'{}'::text[]`) : `'${String(v).replaceAll("'", "''")}'`;

const users = { alice: randomUUID(), bob: randomUUID(), quinn: randomUUID() };
sql('DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA IF EXISTS storage CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO PUBLIC;');
file('../supabase/tests/fixtures/solution_requests_baseline.sql');
sql(`INSERT INTO auth.users(id) VALUES ('${users.alice}'), ('${users.bob}'), ('${users.quinn}');
  INSERT INTO public.profiles(user_id, full_name) VALUES ('${users.alice}', 'Alice Real'), ('${users.bob}', 'Bob Real'), ('${users.quinn}', 'Quinn Teacher');
  INSERT INTO public.user_roles(user_id, role) VALUES ('${users.alice}', 'student'), ('${users.bob}', 'student'), ('${users.quinn}', 'question_admin')`);
file('../supabase/migrations/20261111000000_solution_request_threads.sql');

// ---- Supabase stand-in ----
const app = 'http://127.0.0.1:5198', api = 'http://127.0.0.1:55530';
const files = new Map();
const claims = req => {
  try { return JSON.parse(Buffer.from((req.headers.authorization ?? '').split('.')[1], 'base64url').toString()); } catch { return {}; }
};
const pgError = e => {
  const text = String(e.stderr ?? e.message);
  return { code: 'P0001', message: /ERROR:\s+(.+)/.exec(text)?.[1] ?? text, details: /DETAIL:\s+(.+)/.exec(text)?.[1] ?? null, hint: null };
};
// supabase-js sends a File as multipart form data; keep only the file part.
const fileFromUpload = (type, body) => {
  const boundary = /boundary=(.+)$/.exec(type)?.[1];
  if (!boundary) return { data: body, type: type || 'image/png' };
  for (const part of body.toString('latin1').split(`--${boundary}`)) {
    const split = part.indexOf('\r\n\r\n');
    const head = part.slice(0, split);
    if (!/filename=/.test(head)) continue;
    return { data: Buffer.from(part.slice(split + 4, part.lastIndexOf('\r\n')), 'latin1'), type: /Content-Type:\s*(\S+)/i.exec(head)?.[1] ?? 'image/png' };
  }
  return { data: body, type: 'image/png' };
};
const server = createServer(async (req, res) => {
  const body = await new Promise(resolve => { const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', () => resolve(Buffer.concat(chunks))); });
  const send = (status, data, type = 'application/json') => {
    res.writeHead(status, { 'content-type': type, 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' });
    res.end(type === 'application/json' ? JSON.stringify(data) : data);
  };
  if (req.method === 'OPTIONS') return send(204, '', 'text/plain');
  const { pathname } = new URL(req.url, api);
  const { sub = '', role = 'anon' } = claims(req);
  const as = role === 'authenticated' ? 'authenticated' : 'anon';
  try {
    let m;
    if ((m = /^\/rest\/v1\/rpc\/(\w+)$/.exec(pathname))) {
      const args = body.length ? JSON.parse(body) : {};
      const call = `public.${m[1]}(${Object.entries(args).map(([k, v]) => `${k} => ${lit(v)}`).join(', ')})`;
      const out = sql(`SELECT to_jsonb(r)->'x' FROM (SELECT ${call} AS x) r`, sub, as);
      return send(200, out === '' ? null : JSON.parse(out));
    }
    if (pathname === '/rest/v1/profiles') return send(200, { user_id: sub, full_name: 'Signed in', role: 'student' });
    if (pathname.startsWith('/rest/v1/')) return send(req.method === 'GET' ? 200 : 201, []);
    if (pathname === '/auth/v1/user') return send(200, { id: sub, aud: 'authenticated', role: 'authenticated' });
    if ((m = /^\/storage\/v1\/object\/sign\/([\w-]+)$/.exec(pathname))) {
      const { paths } = JSON.parse(body);
      return send(200, paths.map(path => sql(`SELECT count(*) FROM storage.objects WHERE bucket_id = ${lit(m[1])} AND name = ${lit(path)}`, sub, as) === '1'
        ? { path, signedURL: `/object/sign/${m[1]}/${path}?token=t`, error: null } : { path, signedURL: null, error: 'not found' }));
    }
    if ((m = /^\/storage\/v1\/object\/sign\/([\w-]+)\/(.+)$/.exec(pathname))) {
      const stored = files.get(decodeURIComponent(m[2]));
      return stored ? send(200, stored.data, stored.type) : send(404, { message: 'not found' });
    }
    if (req.method === 'POST' && (m = /^\/storage\/v1\/object\/([\w-]+)\/(.+)$/.exec(pathname))) {
      const name = decodeURIComponent(m[2]);
      sql(`INSERT INTO storage.objects(bucket_id, name, owner_id) VALUES (${lit(m[1])}, ${lit(name)}, ${lit(sub)})`, sub, as);
      files.set(name, fileFromUpload(req.headers['content-type'] ?? '', body));
      return send(200, { Key: `${m[1]}/${name}`, Id: randomUUID() });
    }
    if (req.method === 'DELETE' && (m = /^\/storage\/v1\/object\/([\w-]+)$/.exec(pathname))) {
      const { prefixes } = JSON.parse(body);
      const out = sql(`WITH d AS (DELETE FROM storage.objects WHERE bucket_id = ${lit(m[1])} AND name = ANY(${lit(prefixes)}) RETURNING name) SELECT coalesce(json_agg(json_build_object('name', name)), '[]') FROM d`, sub, as);
      return send(200, JSON.parse(out));
    }
    return send(404, { message: `unhandled ${req.method} ${pathname}` });
  } catch (e) {
    return send(400, pgError(e));
  }
});
await new Promise(resolve => server.listen(55530, '127.0.0.1', resolve));

const anonKey = ['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url'), 'synthetic'].join('.');
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5198', '--strictPort'],
  { env: { ...process.env, VITE_LOCAL_SUPABASE_URL: api, VITE_LOCAL_SUPABASE_ANON_KEY: anonKey }, stdio: 'ignore' });
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
let browser;
const errors = [];
try {
  for (let n = 0; ; n++) {
    try { if ((await fetch(app)).ok) break; } catch { /* starting */ }
    if (n > 150) throw new Error('Vite startup timeout');
    await new Promise(r => setTimeout(r, 200));
  }
  browser = await chromium.launch();
  const open = async (uid, viewport = { width: 1280, height: 900 }, language = 'en') => {
    const context = await browser.newContext({ viewport });
    if (uid) {
      const token = `${anonKey.split('.')[0]}.${Buffer.from(JSON.stringify({ sub: uid, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.synthetic`;
      await context.addInitScript(({ token, uid }) => {
        localStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token: token, refresh_token: 'synthetic', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer',
          user: { id: uid, aud: 'authenticated', role: 'authenticated', email: 'synthetic@example.test', app_metadata: { provider: 'email' }, user_metadata: {} } }));
      }, { token, uid });
    }
    await context.addInitScript(language => localStorage.setItem('o2i-language', language), language);
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror', e => errors.push(e.message));
    return page;
  };
  const pick = async (page, label, option) => { await page.getByLabel(label).click(); await page.getByRole('option', { name: option, exact: true }).click(); };

  // Alice asks a public, anonymous question with an image.
  const alice = await open(users.alice);
  await alice.goto(`${app}/solution-requests`);
  await alice.getByText('5 of 5 questions left in 24 hours').waitFor();
  await alice.getByRole('button', { name: 'Ask a question' }).click();
  await alice.getByLabel('Title').fill('Why is sin x / x → 1?');
  await pick(alice, 'Problem type', 'Calculus');
  await alice.getByLabel('Where are you stuck?').fill('I get $\\frac{0}{0}$ for $\\lim_{x\\to 0} \\frac{\\sin x}{x}$.');
  await alice.locator('#sr-images').setInputFiles({ name: 'problem.png', mimeType: 'image/png', buffer: png });
  await alice.getByRole('button', { name: 'Post question' }).click();
  await alice.waitForURL(/\/solution-requests\/[0-9a-f-]{36}$/);
  const threadUrl = alice.url();
  await alice.getByRole('heading', { name: 'Why is sin x / x → 1?' }).waitFor();
  await alice.getByText('Anonymous (you)').waitFor();
  await alice.locator('.katex').first().waitFor();
  const shown = alice.locator('img[src*="/object/sign/solution-images/r/"]');
  await shown.waitFor();
  await alice.waitForFunction(img => img.complete && img.naturalWidth > 0, await shown.elementHandle());
  assert.equal(sql(`SELECT image_paths[1] ~ '^r/[0-9a-f-]{36}\\.png$' FROM public.solution_requests`), 't');

  // Bob sees it anonymously and replies.
  const bob = await open(users.bob);
  await bob.goto(`${app}/solution-requests`);
  await bob.getByRole('link', { name: /Why is sin x/ }).click();
  await bob.getByRole('heading', { name: 'Why is sin x / x → 1?' }).waitFor();
  assert.ok(!(await bob.content()).includes('Alice'), 'anonymous author name must not reach other students');
  await bob.getByLabel('Your reply').fill('Use the squeeze theorem: $\\cos x \\le \\frac{\\sin x}{x} \\le 1$.');
  await bob.getByRole('button', { name: 'Post reply' }).click();
  await bob.getByText('Has replies').waitFor();
  await bob.locator('#floor-1').getByText('Bob Real').waitFor();

  // The admin answers from the Answers tab and sees the real name.
  const quinn = await open(users.quinn);
  await quinn.goto(`${app}/admin`);
  await quinn.getByRole('tab', { name: /^Answers/ }).click();
  await quinn.getByRole('button', { name: /Why is sin x/ }).click();
  await quinn.getByText(/^Anonymous \(Alice Real\) ·/).waitFor();
  await quinn.getByLabel('Your reply').fill('Official: compare areas in the unit circle, then squeeze.');
  await quinn.getByRole('button', { name: 'Post official answer' }).click();
  await quinn.locator('#floor-2').getByText('O2I official').waitFor();
  await quinn.getByText('Nothing is waiting for an answer.').waitFor();
  await quinn.screenshot({ path: `${shots}/admin-answers.png`, fullPage: true });

  // Alice accepts Bob's reply, which marks it solved, then closes the thread.
  await alice.reload();
  await alice.locator('#floor-1').getByRole('button', { name: 'Accept as solution' }).click();
  await alice.locator('#floor-1').getByText('Accepted').waitFor();
  await alice.getByText('Solved', { exact: true }).waitFor();
  await alice.getByRole('button', { name: 'Close thread' }).click();
  await alice.getByText('This thread is closed. The asker or an admin can reopen it.').waitFor();
  await alice.screenshot({ path: `${shots}/thread-desktop.png`, fullPage: true });

  // Bob can no longer reply.
  await bob.reload();
  await bob.getByText('This thread is closed. The asker or an admin can reopen it.').waitFor();
  assert.equal(await bob.getByLabel('Your reply').count(), 0);

  // An admins-only question is invisible to Bob; Alice can withdraw it.
  await alice.goto(`${app}/solution-requests`);
  await alice.getByRole('button', { name: 'Ask a question' }).click();
  await alice.getByLabel('Title').fill('Private homework question');
  await pick(alice, 'Problem type', 'Algebra');
  await alice.getByLabel('Admins only: only O2I teachers see it and answer').check();
  await alice.getByRole('button', { name: 'Post question' }).click();
  await alice.waitForURL(/\/solution-requests\/[0-9a-f-]{36}$/);
  const privateUrl = alice.url();
  await alice.getByText('Admins only', { exact: true }).waitFor();
  await bob.goto(`${app}/solution-requests`);
  await bob.getByRole('link', { name: /Why is sin x/ }).waitFor();
  assert.equal(await bob.getByRole('link', { name: /Private homework/ }).count(), 0);
  await bob.goto(privateUrl);
  await bob.getByText('This question is not available.').waitFor();
  await alice.getByRole('button', { name: 'Withdraw' }).click();
  await alice.getByRole('alertdialog').getByRole('button', { name: 'Withdraw' }).click();
  await alice.waitForURL(`${app}/solution-requests`);
  await alice.getByRole('tab', { name: 'My questions' }).click();
  await alice.getByRole('link', { name: /Why is sin x/ }).waitFor();
  assert.equal(await alice.getByRole('link', { name: /Private homework/ }).count(), 0);
  await alice.getByText('3 of 5 questions left in 24 hours').waitFor();

  // Signed-out visitors can read but not reply; phone width, Chinese.
  const visitor = await open(null, { width: 390, height: 844 }, 'zh');
  await visitor.goto(`${app}/solution-requests`);
  await visitor.getByRole('link', { name: /Why is sin x/ }).waitFor();
  await visitor.screenshot({ path: `${shots}/list-phone-zh.png`, fullPage: true });
  await visitor.goto(threadUrl);
  await visitor.getByRole('link', { name: '登录后回复' }).waitFor();
  assert.equal(await visitor.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'no horizontal scroll at phone width');
  await visitor.screenshot({ path: `${shots}/thread-phone-zh.png`, fullPage: true });

  assert.deepEqual(errors, []);
  console.log(`Solution Requests browser flow passed. Screenshots in ${shots}/`);
} finally {
  await browser?.close();
  vite.kill();
  server.close();
}
