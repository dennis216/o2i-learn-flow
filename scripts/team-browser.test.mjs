import { legacyFixtureAccessSql } from './admin-access/legacy-fixture-access.mjs';
// Opt-in Team acceptance: disposable local Auth/PostgREST/PostgreSQL, never an existing database.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { CURRICULUM_GROUPS, TEAM_DEPARTMENTS } from '../src/lib/teamDepartments.ts';

const { chromium } = await import(process.env.O2I_PLAYWRIGHT_MODULE ?? 'playwright');
const root = process.cwd(), output = resolve(root, 'node_modules/.cache/team-acceptance');
mkdirSync(output, { recursive: true });
const prefix = 'o2i-team-' + process.pid, network = prefix + '-net', label = 'team-browser';
const ports = { db: 55552, auth: 55553, rest: 55554, api: 55565, app: 5186 };
const api = 'http://127.0.0.1:' + ports.api, app = 'http://127.0.0.1:' + ports.app;
const password = randomBytes(32).toString('hex'), secret = randomBytes(48).toString('hex'), testPassword = randomBytes(24).toString('base64url') + 'aA1!';
const jwt = role => { const body = [{ alg: 'HS256', typ: 'JWT' }, { iss: 'supabase', role, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 }].map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.'); return body + '.' + createHmac('sha256', secret).update(body).digest('base64url'); };
const anon = jwt('anon'), service = jwt('service_role');
const redact = value => [password, secret, testPassword, service].reduce((text, key) => text.replaceAll(key, '[redacted]'), String(value));
const docker = args => { try { return execFileSync('docker', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }); } catch (error) { throw new Error(redact(error.stderr ?? error.message)); } };
const read = file => readFileSync(resolve(root, file), 'utf8');
const fn = (source, name) => { const match = source.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?AS \\$\\$[\\s\\S]*?\\$\\$[^;]*;`)); assert.ok(match); return match[0]; };
const wait = async operation => { for (let index = 0; index < 160; index++) { try { const value = await operation(); if (value) return value; } catch {} await new Promise(resolve => setTimeout(resolve, 250)); } throw Error('Local Team service readiness timeout'); };
const report = { checks: [], cleanup: false }, created = [];
let networkCreated = false, db, proxy, vite, browser;
const pass = name => { report.checks.push(name); console.log('PASS ' + name); };
const run = (name, image, args = []) => { docker(['run', '--pull', 'never', '-d', '--name', name, '--network', network, '--label', 'o2i.purpose=' + label, ...args, image]); created.push(name); };
const state = async () => (await db.query('SELECT * FROM public.team_members ORDER BY order_index,id')).rows;
let teamWrites = 0, failTeamRead = false, emptyTeamRead = false;
const remoteRequests = [];

try {
  docker(['network', 'create', '--label', 'o2i.purpose=' + label, network]); networkCreated = true;
  const dbName = prefix + '-db';
  run(dbName, 'public.ecr.aws/supabase/postgres:17.11.0.002', ['--tmpfs', '/var/lib/postgresql/data:rw', '-p', `127.0.0.1:${ports.db}:5432`, '-e', 'POSTGRES_PASSWORD=' + password]);
  await wait(() => docker(['exec', dbName, 'pg_isready', '-h', '127.0.0.1', '-U', 'supabase_admin']).includes('accepting connections'));
  docker(['exec', dbName, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-c', `ALTER ROLE postgres PASSWORD '${password}'; ALTER ROLE supabase_auth_admin PASSWORD '${password}'; ALTER ROLE authenticator PASSWORD '${password}';`]);
  db = await wait(async () => { const client = new pg.Client({ host: '127.0.0.1', port: ports.db, database: 'postgres', user: 'postgres', password, connectionTimeoutMillis: 1000 }); try { await client.connect(); return client; } catch (error) { await client.end().catch(() => {}); throw error; } });

  const rolesMigration = read('supabase/migrations/20260920000000_content_admin_roles.sql');
  const teamMigration = read('supabase/migrations/20260115210328_3ff6cd50-a61d-40da-9536-98e529fd6380.sql');
  await db.query(`CREATE TYPE public.app_role AS ENUM('admin','instructor','student','super_admin');
    CREATE TABLE public.user_roles(user_id uuid,role public.app_role); ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
    CREATE TABLE public.profiles(id uuid DEFAULT gen_random_uuid(),user_id uuid,full_name text,email text,role text);
    CREATE TABLE public.user_login_events(id uuid DEFAULT gen_random_uuid(),user_id uuid,created_at timestamptz DEFAULT now());
    ${fn(rolesMigration, 'has_role')} ${fn(rolesMigration, 'is_super_admin')} ${legacyFixtureAccessSql()}
    ${teamMigration.slice(0, teamMigration.indexOf('-- Create storage bucket'))}
    ALTER TABLE public.team_members ADD COLUMN department text NOT NULL DEFAULT 'Publicity';
    INSERT INTO public.team_members(name,role,bio,order_index,department) VALUES('Legacy Co-founder','Co-founder & Team Leader','Migrated legacy member',0,'Curriculum Content & Production');`);
  await db.query(read('supabase/migrations/20261020010000_team_member_roles_and_departments.sql'));
  const legacy = (await state())[0];
  assert.deepEqual(legacy.roles, ['Co-founder', 'Team Leader']);
  assert.deepEqual(legacy.departments, [TEAM_DEPARTMENTS[2]]);
  pass('Forward migration preserves and converts known legacy Team values');

  const fixtures = [
    ['Public Member', ['Team Member'], [TEAM_DEPARTMENTS[0]], 1],
    ['Founder Person', ['Founder'], [TEAM_DEPARTMENTS[1], CURRICULUM_GROUPS[0]], 2],
    ['Co-founder Person', ['Co-founder', 'Team Leader'], [TEAM_DEPARTMENTS[0], CURRICULUM_GROUPS[0]], 3],
    ['Chemistry Person', ['Team Member'], [CURRICULUM_GROUPS[1]], 4],
  ];
  for (const [name, roles, departments, order] of fixtures) await db.query('INSERT INTO public.team_members(name,roles,departments,bio,photo_url,order_index) VALUES($1,$2,$3,$4,$5,$6)', [name, roles, departments, name + ' bio', app + '/placeholder.svg', order]);

  proxy = createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', app); res.setHeader('Access-Control-Allow-Headers', 'authorization,apikey,content-type,x-client-info,prefer,accept-profile,content-profile,x-supabase-api-version'); res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS'); res.setHeader('Access-Control-Expose-Headers', 'Content-Range');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    const auth = req.url.startsWith('/auth/v1/'), rest = req.url.startsWith('/rest/v1/'); if (!auth && !rest) { res.writeHead(404); res.end(); return; }
    if (rest && /^\/rest\/v1\/(courses|course_videos|practice_problems|subjects)(\?|$)/.test(req.url)) { res.setHeader('Content-Type', 'application/json'); res.end('[]'); return; }
    if (req.url.startsWith('/rest/v1/team_members')) {
      if (req.method === 'GET' && (failTeamRead || emptyTeamRead)) { res.setHeader('Content-Type', 'application/json'); res.statusCode = failTeamRead ? 503 : 200; res.end(failTeamRead ? JSON.stringify({ message: 'Synthetic Team outage' }) : '[]'); return; }
      if (['POST', 'PATCH', 'DELETE'].includes(req.method)) teamWrites++;
    }
    try { let body = ''; for await (const chunk of req) body += chunk; const headers = { ...req.headers }; delete headers.host; delete headers['content-length']; delete headers.connection;
      const upstream = await fetch(`http://127.0.0.1:${auth ? ports.auth : ports.rest}` + req.url.replace(auth ? '/auth/v1' : '/rest/v1', ''), { method: req.method, headers, ...(req.method === 'GET' ? {} : { body }) });
      res.statusCode = upstream.status; for (const key of ['content-type', 'content-range']) if (upstream.headers.get(key)) res.setHeader(key, upstream.headers.get(key)); res.end(Buffer.from(await upstream.arrayBuffer()));
    } catch { res.writeHead(502); res.end('Local service unavailable'); }
  });
  await new Promise((resolve, reject) => { proxy.once('error', reject); proxy.listen(ports.api, '127.0.0.1', resolve); });
  run(prefix + '-auth', 'public.ecr.aws/supabase/gotrue:v2.197.0', ['-p', `127.0.0.1:${ports.auth}:9999`, '-e', 'GOTRUE_API_HOST=0.0.0.0', '-e', 'GOTRUE_API_PORT=9999', '-e', 'API_EXTERNAL_URL=' + api, '-e', 'GOTRUE_SITE_URL=' + app, '-e', 'GOTRUE_DB_DRIVER=postgres', '-e', `GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:${password}@${dbName}:5432/postgres?sslmode=disable`, '-e', 'GOTRUE_JWT_SECRET=' + secret, '-e', 'GOTRUE_JWT_ADMIN_ROLES=service_role', '-e', 'GOTRUE_JWT_AUD=authenticated', '-e', 'GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated', '-e', 'GOTRUE_EXTERNAL_EMAIL_ENABLED=true', '-e', 'GOTRUE_MAILER_AUTOCONFIRM=true']);
  await wait(async () => (await fetch(api + '/auth/v1/health')).ok);
  run(prefix + '-rest', 'public.ecr.aws/supabase/postgrest:v16.4', ['-p', `127.0.0.1:${ports.rest}:3000`, '-e', `PGRST_DB_URI=postgres://authenticator:${password}@${dbName}:5432/postgres`, '-e', 'PGRST_DB_SCHEMAS=public', '-e', 'PGRST_DB_ANON_ROLE=anon', '-e', 'PGRST_JWT_SECRET=' + secret]);
  await wait(async () => (await fetch(api + '/rest/v1/')).ok);

  const svc = createClient(api, service, { auth: { persistSession: false, autoRefreshToken: false } }), accounts = [];
  for (const role of ['admin', 'student']) { const { data, error } = await svc.auth.admin.createUser({ email: `team-${process.pid}-${role}@example.test`, password: testPassword, email_confirm: true }); assert.ifError(error); accounts.push(data.user); await db.query('INSERT INTO public.user_roles VALUES($1,$2)', [data.user.id, role]); await db.query('INSERT INTO public.profiles(user_id,full_name,email,role) VALUES($1,$2,$3,$4)', [data.user.id, 'Synthetic ' + role, data.user.email, role]); }
  const visitor = createClient(api, anon, { auth: { persistSession: false, autoRefreshToken: false } }), baseline = await state();
  assert.equal((await visitor.from('team_members').select('*')).data.length, 5);
  const denied = await visitor.from('team_members').update({ departments: [CURRICULUM_GROUPS[3]] }).eq('id', baseline[0].id).select(); assert.ok(denied.error || denied.data.length === 0); assert.deepEqual(await state(), baseline);
  const student = createClient(api, anon, { auth: { persistSession: false, autoRefreshToken: false } }); assert.ifError((await student.auth.signInWithPassword({ email: accounts[1].email, password: testPassword })).error);
  const studentUpdate = await student.from('team_members').update({ departments: [CURRICULUM_GROUPS[3]] }).eq('id', baseline[0].id).select(); assert.ok(studentUpdate.error || studentUpdate.data.length === 0); assert.ok((await student.from('team_members').insert({ name: 'Denied' })).error); assert.deepEqual(await state(), baseline);
  pass('Existing Team RLS still permits public reads and rejects anonymous or non-admin writes');

  vite = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(ports.app), '--strictPort'], { cwd: root, env: { ...process.env, VITE_LOCAL_SUPABASE_URL: api, VITE_LOCAL_SUPABASE_ANON_KEY: anon }, stdio: 'ignore' });
  await wait(async () => (await fetch(app)).ok);
  browser = await chromium.launch({ headless: true, ...(process.env.O2I_CHROME_EXECUTABLE ? { executablePath: process.env.O2I_CHROME_EXECUTABLE } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); context.setDefaultTimeout(15000);
  await context.route('**/*', route => { const url = new URL(route.request().url()); if (!['localhost', '127.0.0.1'].includes(url.hostname)) { if (url.hostname.endsWith('.supabase.co')) remoteRequests.push(url.hostname); return route.abort(); } return route.continue(); });
  const page = await context.newPage(), section = name => page.locator('section').filter({ has: page.getByRole('heading', { name, exact: true }) });
  await page.goto(app + '/team'); await page.getByRole('heading', { name: 'Leadership', exact: true }).waitFor();
  assert.equal(await section('Leadership').getByRole('heading', { name: 'Founder Person', exact: true }).count(), 1);
  assert.equal(await section('Leadership').getByRole('heading', { name: 'Co-founder Person', exact: true }).count(), 1);
  assert.equal(await section(TEAM_DEPARTMENTS[0]).getByRole('heading', { name: 'Co-founder Person', exact: true }).count(), 1);
  assert.equal(await section(TEAM_DEPARTMENTS[2]).getByRole('heading', { name: CURRICULUM_GROUPS[0], exact: true }).count(), 1);
  assert.equal(await section(TEAM_DEPARTMENTS[2]).getByRole('heading', { name: 'Co-founder Person', exact: true }).count(), 1);
  assert.equal(await section('Leadership').getByText('Co-founder', { exact: true }).count(), 2);
  assert.equal(await section('Leadership').getByText('Team Leader', { exact: true }).count(), 2);
  pass('Team shows leadership first, repeats leaders below and preserves role badges');

  failTeamRead = true; await page.reload(); await page.getByRole('alert').getByText('Could not load team members. Please try again.', { exact: true }).waitFor(); failTeamRead = false; await page.getByRole('button', { name: 'Retry', exact: true }).click(); await page.getByRole('heading', { name: 'Leadership', exact: true }).waitFor();
  emptyTeamRead = true; await page.reload(); await page.getByText('Team information coming soon', { exact: true }).waitFor(); emptyTeamRead = false;
  pass('Team loading error, retry and empty states remain distinct');

  await page.goto(app + '/auth'); await page.locator('input[name="email"]').first().fill(accounts[0].email); await page.locator('input[name="password"]').first().fill(testPassword); await page.getByRole('button', { name: 'Sign In', exact: true }).click(); await page.waitForURL(app + '/');
  const openAdmin = async () => { await page.goto(app + '/admin'); await page.getByRole('tab', { name: 'Team', exact: true }).click(); await page.getByRole('button', { name: 'Edit team member Co-founder Person', exact: true }).waitFor(); };
  const dialog = () => page.getByRole('dialog');
  await openAdmin(); await page.getByRole('button', { name: 'Edit team member Co-founder Person', exact: true }).click();
  assert.equal(await dialog().getByRole('checkbox', { name: 'Co-founder', exact: true }).isChecked(), true);
  assert.equal(await dialog().getByRole('checkbox', { name: 'Team Leader', exact: true }).isChecked(), true);
  assert.equal(await dialog().getByRole('checkbox', { name: CURRICULUM_GROUPS[0], exact: true }).isChecked(), true);
  const writesBefore = teamWrites; await dialog().getByRole('checkbox', { name: CURRICULUM_GROUPS[1], exact: true }).click(); await dialog().getByRole('button', { name: 'Cancel', exact: true }).click(); assert.equal(teamWrites, writesBefore); assert.deepEqual(await state(), baseline);
  pass('Admin Cancel preserves all Team fields without a write');

  await page.getByRole('button', { name: 'Edit team member Co-founder Person', exact: true }).click(); await dialog().getByRole('checkbox', { name: CURRICULUM_GROUPS[3], exact: true }).click(); await dialog().getByRole('button', { name: 'Save Changes', exact: true }).click(); await dialog().waitFor({ state: 'hidden' });
  const changed = await state(), edited = changed.find(member => member.name === 'Co-founder Person'); assert.deepEqual(edited.departments, [TEAM_DEPARTMENTS[0], CURRICULUM_GROUPS[0], CURRICULUM_GROUPS[3]]); assert.ok(teamWrites > writesBefore);
  await page.reload(); await page.getByRole('tab', { name: 'Team', exact: true }).click(); await page.getByRole('button', { name: 'Edit team member Co-founder Person', exact: true }).click(); assert.equal(await dialog().getByRole('checkbox', { name: CURRICULUM_GROUPS[3], exact: true }).isChecked(), true); await dialog().getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.screenshot({ path: resolve(output, 'admin-team-structure.png'), fullPage: true });
  pass('Admin saves and reloads multiple roles and memberships');

  await page.goto(app + '/team'); await section(TEAM_DEPARTMENTS[2]).getByRole('heading', { name: CURRICULUM_GROUPS[3], exact: true }).waitFor(); await section(TEAM_DEPARTMENTS[2]).getByRole('heading', { name: 'Co-founder Person', exact: true }).last().waitFor();
  await page.screenshot({ path: resolve(output, 'team-structure.png'), fullPage: true });
  pass('Public Team renders the saved hierarchy and repeated membership');

  await openAdmin(); const addForm = page.locator('form').filter({ has: page.locator('#team_name') });
  assert.equal(await addForm.getByRole('checkbox', { name: 'Team Member', exact: true }).isChecked(), true); assert.equal(await addForm.getByRole('checkbox', { name: TEAM_DEPARTMENTS[0], exact: true }).isChecked(), true);
  await addForm.getByLabel('Name *', { exact: true }).fill('New Physics Member'); await addForm.getByRole('checkbox', { name: TEAM_DEPARTMENTS[0], exact: true }).click(); await addForm.getByRole('checkbox', { name: CURRICULUM_GROUPS[2], exact: true }).click(); await addForm.getByRole('button', { name: 'Add Team Member', exact: true }).click(); await page.getByRole('button', { name: 'Edit team member New Physics Member', exact: true }).waitFor();
  const added = (await state()).find(member => member.name === 'New Physics Member'); assert.deepEqual(added.roles, ['Team Member']); assert.deepEqual(added.departments, [CURRICULUM_GROUPS[2]]);
  pass('Admin creates a member with controlled multi-select values');
  assert.deepEqual(remoteRequests, []); pass('Auth and Team APIs stayed local; external assets were blocked');
} catch (error) {
  report.error = redact(error.stack ?? error); console.error(report.error); process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  if (vite && vite.exitCode === null) { vite.kill('SIGTERM'); await new Promise(resolve => vite.once('exit', resolve)); }
  if (proxy?.listening) { proxy.closeAllConnections(); await new Promise(resolve => proxy.close(resolve)); }
  if (db) await db.end().catch(() => {});
  for (const name of created.reverse()) { const info = JSON.parse(docker(['inspect', name]))[0]; assert.equal(info.Config.Labels['o2i.purpose'], label); docker(['rm', '-f', name]); }
  if (networkCreated) docker(['network', 'rm', network]);
  report.cleanup = !docker(['ps', '-a', '--filter', 'label=o2i.purpose=' + label, '--format', '{{.Names}}']).trim();
  writeFileSync(resolve(output, 'results.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(`Completed ${report.checks.length} Team checks; disposable cleanup: ${report.cleanup}`);
}
