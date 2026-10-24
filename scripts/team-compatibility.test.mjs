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
const root = process.cwd(), output = resolve(root, 'node_modules/.cache/team-schema-compatibility');
mkdirSync(output, { recursive: true });
const prefix = 'o2i-team-compat-' + process.pid, network = prefix + '-net', label = 'team-compatibility';
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
  `);

  const shape=[
    ['Co-founder & Team Leader','Math Group',0],
    ['Co-founder & Website Developer & Team Leader','Math Group',0],
    ['Team Leader','Chemistry Group',1],['Team Leader','Physics Group',1],
    ['Team Member','Physics Group',2],['Team Member','Math Group',2],
    ['Team Member','Chemistry Group',2],['Team Member','Chemistry Group',3],
  ];
  for(const [i,[role,department,order]] of shape.entries())await db.query('INSERT INTO public.team_members(name,role,department,bio,photo_url,order_index) VALUES($1,$2,$3,$4,$5,$6)',['Local Member '+(i+1),role,department,'Preserved biography '+i,app+'/placeholder.svg',order]);
  const original=await state();
  assert.throws(()=>original[0].roles.includes('Founder'));
  await assert.rejects(db.query('BEGIN;'+read('supabase/migrations/20261020010000_team_member_roles_and_departments.sql')+'COMMIT;'),/unsupported existing role/);await db.query('ROLLBACK');
  assert.deepEqual(await state(),original);pass('Reproduced array access crash and original migration rejection with production eight-member role/group shapes and synthetic identities');
  await db.query("BEGIN; ALTER TABLE public.team_members ADD roles text[],ADD departments text[]; UPDATE public.team_members SET roles=ARRAY['Advisor'],departments=ARRAY['Research']; ALTER TABLE public.team_members DROP role,DROP department;");
  await db.query(read('supabase/migrations/20261022000000_team_schema_compatibility.sql'));
  assert.ok((await state()).every(m=>m.roles[0]==='Advisor'&&m.departments[0]==='Research'));
  await db.query('ROLLBACK');assert.deepEqual(await state(),original);pass('Additive upgrade supports array-only schema and preserves unknown memberships');
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
  vite = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(ports.app), '--strictPort'], { cwd: root, env: { ...process.env, VITE_LOCAL_SUPABASE_URL: api, VITE_LOCAL_SUPABASE_ANON_KEY: anon }, stdio: 'ignore' });
  await wait(async () => (await fetch(app)).ok);
  browser = await chromium.launch({ headless: true, ...(process.env.O2I_CHROME_EXECUTABLE ? { executablePath: process.env.O2I_CHROME_EXECUTABLE } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); context.setDefaultTimeout(15000);
  await context.route('**/*', route => { const url = new URL(route.request().url()); if (!['localhost', '127.0.0.1'].includes(url.hostname)) { if (url.hostname.endsWith('.supabase.co')) remoteRequests.push(url.hostname); return route.abort(); } return route.continue(); });
  const page = await context.newPage(), section = name => page.locator('section').filter({ has: page.getByRole('heading', { name, exact: true }) });

  const runtimeErrors=[];page.on('pageerror',e=>runtimeErrors.push(e.message));
  const visitor=createClient(api,anon,{auth:{persistSession:false,autoRefreshToken:false}});
  assert.equal((await visitor.from('team_members').select('*')).data.length,8);
  await page.goto(app+'/team');await page.getByRole('heading',{name:'Leadership',exact:true}).waitFor();
  for(let i=1;i<=8;i++)await page.getByRole('heading',{name:'Local Member '+i,exact:true}).first().waitFor();
  await page.screenshot({path:resolve(output,'team-legacy-eight.png'),fullPage:true});
  pass('Anonymous Team renders all eight legacy members, compound roles and science groups');
  failTeamRead=true;await page.reload();await page.getByRole('alert').getByText('Could not load team members. Please try again.',{exact:true}).waitFor();failTeamRead=false;await page.getByRole('button',{name:'Retry',exact:true}).click();await page.getByRole('heading',{name:'Leadership',exact:true}).waitFor();
  emptyTeamRead=true;await page.reload();await page.getByText('Team information coming soon',{exact:true}).waitFor();emptyTeamRead=false;
  pass('Request failure, retry and empty states remain distinct');
  await page.goto(app+'/auth');await page.locator('input[name="email"]').first().fill(accounts[0].email);await page.locator('input[name="password"]').first().fill(testPassword);await page.getByRole('button',{name:'Sign In',exact:true}).click();await page.waitForURL(app+'/');
  await page.goto(app+'/admin');assert.equal(await page.getByRole('button',{name:'Add Video',exact:true}).isEnabled(),true);
  const openTeam=async()=>{await page.getByRole('tab',{name:'Team',exact:true}).click();await page.getByRole('button',{name:'Edit team member Local Member 2',exact:true}).waitFor();};
  await openTeam();await page.getByText(/Team data uses the legacy database schema/).waitFor();
  assert.equal(await page.getByRole('button',{name:'Add Team Member',exact:true}).isEnabled(),false);
  await page.screenshot({path:resolve(output,'admin-legacy-eight.png'),fullPage:true});
  const dialog=()=>page.getByRole('dialog'),beforeWrites=teamWrites;
  await page.getByRole('button',{name:'Edit team member Local Member 2',exact:true}).click();
  for(const role of ['Co-founder','Website Developer','Team Leader'])assert.equal(await dialog().getByRole('checkbox',{name:role,exact:true}).isChecked(),true);
  assert.equal(await dialog().getByRole('button',{name:'Save Changes',exact:true}).isEnabled(),false);
  await dialog().getByRole('checkbox',{name:'Team Leader',exact:true}).click();await dialog().getByRole('button',{name:'Cancel',exact:true}).click();
  assert.equal(teamWrites,beforeWrites);assert.deepEqual(await state(),original);assert.deepEqual(runtimeErrors,[]);
  pass('Legacy Admin list and editor safe; add/save disabled, Cancel zero writes; other admin forms enabled');
  await db.query('CREATE SCHEMA IF NOT EXISTS supabase_migrations; CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations(version text PRIMARY KEY,name text,statements text[]);');
  const deploy=read('docs/team-schema-compatibility/10_upgrade.sql');
  await assert.rejects(db.query(deploy.replace(/\nCOMMIT;\s*$/,()=>"\nDO $$ BEGIN RAISE EXCEPTION 'Synthetic upgrade failure'; END $$;\nCOMMIT;")),/Synthetic upgrade failure/);await db.query('ROLLBACK');
  assert.deepEqual(await state(),original);assert.equal((await db.query("SELECT count(*)::int n FROM supabase_migrations.schema_migrations")).rows[0].n,0);
  pass('Injected upgrade failure rolls back DDL, member conversion and both ledger entries');
  await db.query(deploy);
  const upgraded=await state();
  for(const row of original){const next=upgraded.find(m=>m.id===row.id);for(const key of Object.keys(row))assert.deepEqual(next[key],row[key]);}
  assert.deepEqual(upgraded.find(m=>m.name==='Local Member 2').roles,['Co-founder','Website Developer','Team Leader']);
  const verification=(await db.query(read('docs/team-schema-compatibility/20_verify_readonly.sql'))).rows[0].team_compatibility_verification;
  assert.equal(verification.all_checks_pass,true,JSON.stringify(verification));assert.equal(verification.member_count,8);assert.equal(verification.old_migration_disposition,'superseded_by_20261022000000');
  await assert.rejects(db.query(deploy),/already recorded/);await db.query('ROLLBACK');
  await wait(async()=>!(await visitor.from('team_members').select('roles,departments').limit(0)).error);
  pass('Upgrade preserves original fields and compound roles; eight catalog checks and superseded ledger pass');
  const admin=createClient(api,anon,{auth:{persistSession:false,autoRefreshToken:false}});
  assert.ifError((await admin.auth.signInWithPassword({email:accounts[0].email,password:testPassword})).error);
  const added=await admin.from('team_members').insert({name:'Legacy alias member',role:'Co-founder & Leader',department:'Publicity',bio:'Kept'}).select().single();assert.ifError(added.error);assert.deepEqual(added.data.roles,['Co-founder','Team Leader']);assert.deepEqual(added.data.departments,[TEAM_DEPARTMENTS[0]]);
  const unknown=await admin.from('team_members').insert({name:'Unknown member',roles:['Research Mentor'],departments:['Robotics'],bio:'Keep unknown'}).select().single();assert.ifError(unknown.error);
  assert.ifError((await admin.from('team_members').insert({name:'Empty member',roles:[],departments:[]})).error);
  await page.reload();await openTeam();assert.equal(await page.getByRole('button',{name:'Add Team Member',exact:true}).isEnabled(),true);
  await page.getByRole('button',{name:'Edit team member Local Member 2',exact:true}).click();
  await dialog().getByRole('checkbox',{name:'Physics Group',exact:true}).click();
  await dialog().getByRole('button',{name:'Save Changes',exact:true}).click();await dialog().waitFor({state:'hidden'});
  const changed=(await state()).find(m=>m.name==='Local Member 2');assert.deepEqual(changed.departments,['Math Group','Physics Group']);assert.deepEqual(changed.roles,['Co-founder','Website Developer','Team Leader']);
  await page.reload();await openTeam();await page.getByRole('button',{name:'Edit team member Local Member 2',exact:true}).click();assert.equal(await dialog().getByRole('checkbox',{name:'Physics Group',exact:true}).isChecked(),true);await dialog().getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByRole('button',{name:'Edit team member Unknown member',exact:true}).click();await dialog().getByLabel('Bio',{exact:true}).fill('Edited biography, memberships retained');await dialog().getByRole('button',{name:'Save Changes',exact:true}).click();await dialog().waitFor({state:'hidden'});
  assert.deepEqual((await state()).find(m=>m.name==='Unknown member').departments,['Robotics']);
  const form=page.locator('form').filter({has:page.locator('#team_name')});await form.getByLabel('Name *',{exact:true}).fill('New Array Member');await form.getByRole('button',{name:'Add Team Member',exact:true}).click();await page.getByRole('button',{name:'Edit team member New Array Member',exact:true}).waitFor();
  const createdMember=(await state()).find(m=>m.name==='New Array Member');assert.deepEqual(createdMember.roles,['Team Member']);assert.equal(createdMember.role,'Team Member');
  pass('Upgraded Admin edit/add/refresh works with retained scalar NOT NULL columns; unknown values and legacy writes retained');
  const protectedState=await state();
  const anonUpdate=await visitor.from('team_members').update({roles:['Founder']}).eq('id',original[0].id).select();assert.ok(anonUpdate.error||!anonUpdate.data.length);
  const student=createClient(api,anon,{auth:{persistSession:false,autoRefreshToken:false}});assert.ifError((await student.auth.signInWithPassword({email:accounts[1].email,password:testPassword})).error);
  const denied=await student.from('team_members').update({department:'Publicity'}).eq('id',original[0].id).select();assert.ok(denied.error||!denied.data.length);assert.deepEqual(await state(),protectedState);
  pass('Anonymous reads retained; anonymous and non-admin writes denied');
  await page.goto(app+'/team');for(const name of ['Unknown member','Empty member','New Array Member'])await page.getByRole('heading',{name,exact:true}).waitFor();
  await page.getByRole('heading',{name:'Team Members',exact:true}).waitFor();await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.setViewportSize({width:1440,height:1000});
  await db.query("DROP TRIGGER sync_team_member_shapes ON public.team_members; ALTER TABLE public.team_members DROP COLUMN role,DROP COLUMN department; NOTIFY pgrst,'reload schema';");
  await wait(async()=>!!(await visitor.from('team_members').select('role').limit(0)).error);
  await page.goto(app+'/admin');await openTeam();await page.getByRole('button',{name:'Edit team member Local Member 2',exact:true}).click();await dialog().getByLabel('Name',{exact:true}).fill('Array-only renamed member');await dialog().getByRole('button',{name:'Save Changes',exact:true}).click();await dialog().waitFor({state:'hidden'});assert.ok((await state()).some(m=>m.name==='Array-only renamed member'));
  assert.deepEqual(runtimeErrors,[]);assert.deepEqual(remoteRequests,[]);
  pass('Array-only frontend remains editable; unknown/empty members visible; mobile and both pages without runtime exceptions');
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
