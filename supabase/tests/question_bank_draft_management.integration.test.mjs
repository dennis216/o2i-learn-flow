// LOCAL ONLY: creates and removes its own tmpfs PostgreSQL container. No existing DB/credentials.
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import pg from 'pg';

const root = new URL('../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const container = `o2i-task4b-${process.pid}`;
const port = 55440;
const password = randomBytes(32).toString('hex');
const docker = args => execFileSync('docker', args, { encoding: 'utf8', stdio: ['pipe','pipe','pipe'] });
const adminId = '92000000-0000-0000-0000-000000000001';
const studentId = '92000000-0000-0000-0000-000000000002';
const connect = async (role = 'authenticated', user = adminId) => {
  const client = new pg.Client({host:'127.0.0.1',port,database:'postgres',user:'postgres',password,connectionTimeoutMillis:5000});
  await client.connect();
  if (role) {
    assert.ok(['authenticated','anon'].includes(role));
    await client.query(`SET ROLE ${role}`);
    await client.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)",[user,role]);
  }
  return client;
};
const fn = (sql, name) => {
  const result = sql.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?AS \\$\\$[\\s\\S]*?\\$\\$[^;]*;`));
  assert.ok(result); return result[0];
};
const bootstrap = () => {
  const taxonomy = read('supabase/migrations/20260920010000_ap_calculus_ced_framework.sql');
  const roles = read('supabase/migrations/20260920000000_content_admin_roles.sql');
  return `CREATE TYPE public.app_role AS ENUM('admin','instructor','student','super_admin');
    CREATE TABLE public.user_roles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES auth.users(id),role public.app_role,UNIQUE(user_id,role));
    ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
    CREATE TABLE public.courses(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),title text);
    CREATE TABLE public.course_videos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),course_id uuid REFERENCES public.courses(id),title text);
    CREATE TABLE public.practice_problems(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),sentinel text);
    ${taxonomy.slice(taxonomy.indexOf('CREATE TABLE public.curriculum_frameworks'),taxonomy.indexOf('ALTER TABLE public.course_videos'))}
    ${fn(roles,'has_role')} ${fn(roles,'is_super_admin')}
    ${fn(read('supabase/migrations/20250910020036_7f5646ab-55d4-4412-823b-b244048be7ba.sql'),'update_updated_at_column')}
    INSERT INTO auth.users(id,email) VALUES('${adminId}','task4b-admin@example.test'),('${studentId}','task4b-student@example.test');
    INSERT INTO public.user_roles(user_id,role) VALUES('${adminId}','admin'),('${studentId}','student');
    INSERT INTO public.courses(title) VALUES('Synthetic existing course');
    INSERT INTO public.course_videos(course_id,title) SELECT id,'Synthetic existing video' FROM public.courses;
    INSERT INTO public.practice_problems(sentinel) VALUES('Synthetic legacy untouched');
    INSERT INTO public.curriculum_frameworks(code,title,version,source_title) VALUES('LOCAL-TEST','Synthetic','test','Synthetic');
    INSERT INTO public.curriculum_units(framework_id,unit_number,title) SELECT id,1,'Synthetic unit' FROM public.curriculum_frameworks;
    INSERT INTO public.curriculum_topics(unit_id,topic_code,title,big_idea,order_index) SELECT id,'1.1','Synthetic topic 1','LIM',1 FROM public.curriculum_units;
    INSERT INTO public.curriculum_topics(unit_id,topic_code,title,big_idea,order_index) SELECT id,'1.2','Synthetic topic 2','LIM',2 FROM public.curriculum_units;
    INSERT INTO public.curriculum_practices(code,name,description) VALUES(1,'Synthetic','Synthetic');
    INSERT INTO public.curriculum_practice_skills(practice_code,skill_code,description) VALUES(1,'1.A','Synthetic A'),(1,'1.B','Synthetic B');
    CREATE POLICY "Local topic read" ON public.curriculum_topics FOR SELECT TO authenticated USING(true);
    CREATE POLICY "Local skill read" ON public.curriculum_practice_skills FOR SELECT TO authenticated USING(true);
    CREATE POLICY "Local framework read" ON public.curriculum_frameworks FOR SELECT TO authenticated USING(true);`;
};
let serial=0;
const fixture = async client => {
  const item = {external_id:`SYNTHETIC-4B-${++serial}`,stem:'Synthetic \\(x^2\\)',solution:'Synthetic \\[2x\\]',
    difficulty:'easy',course_scope:'AB',primary_topic_code:'1.1',practice_skill_codes:['1.A'],representation_type:'analytical',
    calculator_policy:null,source_document:'SYNTHETIC.pdf',source_page:'12-13',source_locator:'p012-item01',requires_figure:false,
    correct_option_key:'A',import_evidence:{original_source_page:'12-13',human_review_status:'approved',human_review_notes:'Preserve note',
      ai_flags:['ANSWER_AI_INFERRED'],manual_edits:[{field:'difficulty',before:'medium',after:'easy'}],
      review_gates:{math_review_status:'passed',source_rights_status:'passed',taxonomy_review_status:'passed',render_review_status:'passed'}},
    options:[{option_key:'A',option_text:'Synthetic correct',is_correct:true,import_evidence:{option_explanation:'Preserve choice note'}},
      {option_key:'B',option_text:'Synthetic wrong',is_correct:false,import_evidence:{}}]};
  const saved=(await client.query('SELECT public.save_question_bank_drafts($1::jsonb) result',[JSON.stringify([item])])).rows[0].result[0];
  return get(client,saved.question_id,saved.version_id);
};
const get = async (c,q,v) => (await c.query('SELECT public.get_question_bank_draft($1,$2) result',[q,v])).rows[0].result;
const metadata = s => ({difficulty:s.version.difficulty,calculator_policy:s.version.calculator_policy,course_scope:s.version.course_scope,
  representation_type:s.version.representation_type,primary_topic_code:s.topic_code,practice_skill_codes:s.skill_codes,
  source_page:s.version.source_reference ?? String(s.version.source_page),source_locator:s.version.source_locator});
const update = (c,s,patch={}) => c.query('SELECT public.update_question_bank_draft_metadata($1,$2,$3,$4::jsonb)',
  [s.question.id,s.version.id,s.fingerprint,JSON.stringify({...metadata(s),...patch})]);
const remove = (c,s,whole=s.delete_scope==='question') => c.query('SELECT public.delete_question_bank_draft($1,$2,$3,$4)',[s.question.id,s.version.id,s.fingerprint,whole]);
const lifecycle = (c,name,s) => c.query(`SELECT public.${name}($1,$2)`,[s.question.id,s.version.id]);
const publish = async (c,s) => {
  await c.query("UPDATE public.question_versions SET calculator_policy='no_calculator',source_type='original',source_locator_verified=true WHERE id=$1",[s.version.id]);
  await lifecycle(c,'submit_question_version_for_review',s); await lifecycle(c,'approve_question_version',s);
};
const revision = async (c,s) => {
  await publish(c,s);
  const v=(await c.query('SELECT public.create_question_revision($1) id',[s.question.id])).rows[0].id;
  return get(c,s.question.id,v);
};
async function expectBlocked(_c,promise,pattern) {
  await assert.rejects(promise, error => pattern.test(error.message));
}
async function waitForLock(rootClient, backendPid) {
  for(let i=0;i<80;i++) {
    const row=(await rootClient.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',[backendPid])).rows[0];
    if(row?.wait_event_type==='Lock') return;
    await new Promise(resolve=>setTimeout(resolve,25));
  }
  assert.fail('Second real connection did not block on a database lock');
}

test('Task 4B real disposable PostgreSQL integration', {timeout:180000}, async t => {
  let rootClient, admin, created=false;
  try {
    docker(['run','--pull','never','-d','--name',container,'--label','o2i.purpose=task4b-draft-tests',
      '--tmpfs','/var/lib/postgresql/data:rw','-p',`127.0.0.1:${port}:5432`,'-e',`POSTGRES_PASSWORD=${password}`,
      'public.ecr.aws/supabase/postgres:17.11.0.002']);
    created=true;
    const inspection=JSON.parse(docker(['inspect',container]))[0];
    assert.equal(inspection.Config.Labels['o2i.purpose'],'task4b-draft-tests');
    assert.deepEqual(inspection.HostConfig.PortBindings['5432/tcp'],[{HostIp:'127.0.0.1',HostPort:String(port)}]);
    assert.ok(inspection.Mounts.every(m=>m.Type==='tmpfs'),'Never attach existing volumes');
    // Image initialization briefly starts a Unix-socket-only server and restarts it.
    // Wait for the final TCP server, not that temporary bootstrap server.
    let ready=false;
    for(let i=0;i<120;i++) {try {docker(['exec',container,'pg_isready','-h','127.0.0.1','-U','supabase_admin']);ready=true;break;} catch {await new Promise(r=>setTimeout(r,250));}}
    assert.ok(ready,'Disposable PostgreSQL did not become TCP-ready');
    docker(['exec','-i',container,'psql','-U','supabase_admin','-d','postgres','-c',`ALTER ROLE postgres PASSWORD '${password}';`]);
    rootClient=await connect(null); await rootClient.query(bootstrap());
    await rootClient.query(`BEGIN;${read('supabase/migrations/20260926000000_question_bank_foundation.sql')}
      ${read('supabase/migrations/20261004000000_question_bank_draft_import.sql')}
      ${read('supabase/migrations/20261018000000_question_bank_draft_management.sql')}COMMIT;`);
    admin=await connect();
    const unrelated=['auth.users','public.user_roles','public.courses','public.course_videos','public.practice_problems'];
    const unchangedSnapshot=async()=>{
      const result={};
      for(const table of unrelated) result[table]=(await rootClient.query(`SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY id)::text) hash FROM ${table} t`)).rows[0].hash;
      return result;
    };
    const original=await unchangedSnapshot();
    await t.test('original foundation and draft-import pgTAP regressions execute (99 + 29 assertions)',async()=>{
      for(const file of ['question_bank_foundation_test.sql','question_bank_draft_import_test.sql']) {
        // Historical pgTAP fixtures target the three-migration 4B baseline,
        // not the intentionally stricter 4C publication contract.
        const results=await rootClient.query(read(`supabase/tests/fixtures/${file}.fixture`));
        const lines=results.flatMap(result=>result.rows.flatMap(row=>Object.values(row))).filter(value=>typeof value==='string');
        assert.ok(!lines.some(line=>/^(not ok|# Looks like)/m.test(line)),lines.filter(line=>/not ok|Looks like/.test(line)).join('\n'));
        assert.equal(lines.filter(line=>/^ok \d+/m.test(line)).length,file.includes('foundation')?99:29);
      }
    });
    await t.test('opening editor is read-only; valid edit persists with skills, server audit and review invalidation',async()=>{
      const s=await fixture(admin), before=await get(admin,s.question.id,s.version.id);
      assert.deepEqual(s,before);
      await update(admin,s,{difficulty:'hard',calculator_policy:'calculator_allowed',course_scope:'BOTH',representation_type:'mixed',
        primary_topic_code:'1.2',practice_skill_codes:['1.B'],source_page:'14-15',source_locator:'p014-item02'});
      const after=await get(admin,s.question.id,s.version.id), e=after.version.import_evidence;
      assert.equal(after.version.difficulty,'hard');assert.equal(after.version.source_page,14);assert.equal(after.version.source_reference,'14-15');
      assert.deepEqual(after.skill_codes,['1.B']); assert.equal(after.version.source_locator_verified,false);
      assert.equal(after.version.status,'draft');assert.equal(after.question.current_version_id,null);
      assert.deepEqual(e.original_import_evidence,s.version.import_evidence);assert.deepEqual(e.ai_flags,s.version.import_evidence.ai_flags);
      assert.deepEqual(e.manual_edits,s.version.import_evidence.manual_edits);assert.equal(e.human_review_notes,'Preserve note');
      assert.equal(e.human_review_status,'pending');assert.ok(Object.values(e.review_gates).every(x=>x==='pending'));
      assert.equal(e.metadata_edits[0].actor_id,adminId);assert.ok(Date.parse(e.metadata_edits[0].at));
      assert.equal(e.metadata_edits[0].human_review_status_before,'approved');assert.equal(e.metadata_edits[0].human_review_status_after,'pending');
      assert.equal(e.metadata_edits[0].before.source_page,'12-13');assert.equal(e.metadata_edits[0].after.source_page,'14-15');
      assert.equal(after.options[0].import_evidence.option_explanation,'Preserve choice note');
    });
    await t.test('range clearing and unrelated source reference retain original evidence',async()=>{
      let s=await fixture(admin);await update(admin,s,{source_page:'12'});s=await get(admin,s.question.id,s.version.id);
      assert.equal(s.version.source_reference,null);assert.equal(s.version.import_evidence.original_source_page,'12-13');
      await admin.query("UPDATE public.question_versions SET source_reference='Additional source evidence' WHERE id=$1",[s.version.id]);
      s=await get(admin,s.question.id,s.version.id);await update(admin,s,{difficulty:'medium',source_page:'12'});
      assert.equal((await get(admin,s.question.id,s.version.id)).version.source_reference,'Additional source evidence');
    });
    await t.test('server whitelist, enum, provenance, canonical and duplicate-skill failures leave no partial writes',async()=>{
      const s=await fixture(admin);
      for(const patch of [{stem:'Forbidden'}, {difficulty:'invalid'}, {primary_topic_code:'9.9'}, {practice_skill_codes:['9.Z']},
        {practice_skill_codes:['1.A','1.A']},{practice_skill_codes:[]},{source_page:'0'}, {source_page:'14-12'}, {source_locator:null},
        {source_page:'14',source_locator:'p012-item01'}, {calculator_policy:'fictional'}]) {
        await expectBlocked(admin,update(admin,s,patch),/rejected|invalid input/i);
        assert.equal((await get(admin,s.question.id,s.version.id)).fingerprint,s.fingerprint);
      }
    });
    await t.test('association-only change invalidates stale edit and deletion snapshots',async()=>{
      const s=await fixture(admin);
      await admin.query("INSERT INTO public.question_practice_skills SELECT $1,id FROM public.curriculum_practice_skills WHERE skill_code='1.B'",[s.version.id]);
      const latest=await get(admin,s.question.id,s.version.id);
      assert.deepEqual(latest.version,s.version);assert.notEqual(latest.fingerprint,s.fingerprint);
      await expectBlocked(admin,update(admin,s,{difficulty:'hard'}),/changed since/);
      await expectBlocked(admin,remove(admin,s),/changed since/);assert.deepEqual((await get(admin,s.question.id,s.version.id)).skill_codes,['1.A','1.B']);
    });
    await t.test('injected child write failure rolls metadata, skills and audit back atomically',async()=>{
      const s=await fixture(admin);
      await rootClient.query(`CREATE FUNCTION public.local_4b_fail() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'LOCAL injected child failure';END;$$;
        CREATE TRIGGER local_4b_fail BEFORE INSERT ON public.question_practice_skills FOR EACH ROW EXECUTE FUNCTION public.local_4b_fail();`);
      try {await expectBlocked(admin,update(admin,s,{difficulty:'hard',practice_skill_codes:['1.B']}),/injected child/);}
      finally {await rootClient.query('DROP TRIGGER local_4b_fail ON public.question_practice_skills;DROP FUNCTION public.local_4b_fail();');}
      assert.deepEqual(await get(admin,s.question.id,s.version.id),s);
    });
    await t.test('non-admin and anonymous callers cannot read editor, edit or delete; drafts remain hidden',async()=>{
      const s=await fixture(admin);
      for(const [role,user] of [['authenticated',studentId],['anon','']]) {
        const c=await connect(role,user);
        try {await expectBlocked(c,get(c,s.question.id,s.version.id),/admin|permission denied/i);
          await expectBlocked(c,update(c,s,{difficulty:'hard'}),/admin|permission denied/i);
          await expectBlocked(c,remove(c,s),/admin|permission denied/i);
          assert.equal((await c.query('SELECT * FROM public.questions WHERE id=$1',[s.question.id])).rowCount,0);
          assert.equal((await c.query('SELECT * FROM public.question_versions WHERE id=$1',[s.version.id])).rowCount,0);
        } finally {await c.end();}
      }
    });
    await t.test('delete never-published identity cascades only exclusive children, retains shared catalogs',async()=>{
      let s=await fixture(admin);
      await admin.query("INSERT INTO public.question_topics SELECT $1,id FROM public.curriculum_topics WHERE topic_code='1.2'",[s.version.id]);
      await admin.query("INSERT INTO public.misconceptions(code,name,description) VALUES('SYNTHETIC-4B','Synthetic','Synthetic')");
      await admin.query("INSERT INTO public.option_misconceptions SELECT $1,id FROM public.misconceptions WHERE code='SYNTHETIC-4B'",[s.options[1].id]);
      await admin.query('INSERT INTO public.question_course_videos SELECT $1,id FROM public.course_videos',[s.question.id]);
      s=await get(admin,s.question.id,s.version.id);await remove(admin,s);
      for(const [table,key,id] of [['questions','id',s.question.id],['question_versions','question_id',s.question.id],['question_options','question_version_id',s.version.id],
        ['question_topics','question_version_id',s.version.id],['question_practice_skills','question_version_id',s.version.id],['question_course_videos','question_id',s.question.id]])
        assert.equal((await rootClient.query(`SELECT * FROM public.${table} WHERE ${key}=$1`,[id])).rowCount,0);
      assert.equal((await rootClient.query("SELECT * FROM public.misconceptions WHERE code='SYNTHETIC-4B'")).rowCount,1);
    });
    await t.test('review is read-only until controlled return; approved/historical targets cannot edit or delete',async()=>{
      const s=await fixture(admin);await lifecycle(admin,'submit_question_version_for_review',s);
      await expectBlocked(admin,update(admin,s,{difficulty:'hard'}),/only an unpublished draft/);
      await expectBlocked(admin,remove(admin,s),/only an unpublished draft/);
      await lifecycle(admin,'return_question_version_to_draft',s);
      await update(admin,await get(admin,s.question.id,s.version.id),{difficulty:'hard'});
      const r=await revision(admin,await fixture(admin));
      const publishedId=r.question.current_version_id;
      await expectBlocked(admin,update(admin,{...r,version:{...r.version,id:publishedId}},{difficulty:'hard'}),/only an unpublished draft/);
      await expectBlocked(admin,remove(admin,r,true),/scope changed/);
      await remove(admin,r,false);
      const q=(await rootClient.query('SELECT * FROM public.questions WHERE id=$1',[r.question.id])).rows[0];
      assert.equal(q.current_version_id,publishedId);assert.equal(q.status,'approved');
      assert.equal((await rootClient.query('SELECT status FROM public.question_versions WHERE id=$1',[publishedId])).rows[0].status,'approved');
    });
    // Two real pg clients, transactions held open, observed PostgreSQL lock wait before releasing winner.
    for(const [name,first,second,pattern] of [
      ['concurrent save vs save', (c,s)=>update(c,s,{difficulty:'hard'}),(c,s)=>update(c,s,{difficulty:'medium'}),/changed since/],
      ['save vs deletion', (c,s)=>update(c,s,{difficulty:'hard'}),(c,s)=>remove(c,s),/changed since/],
      ['deletion vs save', (c,s)=>remove(c,s),(c,s)=>update(c,s,{difficulty:'hard'}),/missing|unpublished draft/],
      ['review submission vs deletion', (c,s)=>lifecycle(c,'submit_question_version_for_review',s),(c,s)=>remove(c,s),/only an unpublished draft/],
      ['deletion vs review submission', (c,s)=>remove(c,s),(c,s)=>lifecycle(c,'submit_question_version_for_review',s),/missing|target must/],
    ]) await t.test(name,async()=>{
      const s=await fixture(admin), a=await connect(),b=await connect();
      try {await a.query('BEGIN');await first(a,s);
        const pid=(await b.query('SELECT pg_backend_pid() pid')).rows[0].pid;
        const pending=second(b,s).then(()=>({ok:true}),error=>({error}));
        await waitForLock(rootClient,pid);await a.query('COMMIT');
        const outcome=await pending;assert.ok(outcome.error && pattern.test(outcome.error.message),outcome.error?.message??'unexpected success');
      } finally {await a.query('ROLLBACK');await a.end();await b.end();}
    });
    await t.test('approval racing stale draft deletion retains current publication and history',async()=>{
      const r=await revision(admin,await fixture(admin));await lifecycle(admin,'submit_question_version_for_review',r);
      const a=await connect(),b=await connect();
      try {await a.query('BEGIN');await lifecycle(a,'approve_question_version',r);
        const pid=(await b.query('SELECT pg_backend_pid() pid')).rows[0].pid;
        const pending=remove(b,r,false).then(()=>null,e=>e);await waitForLock(rootClient,pid);await a.query('COMMIT');
        assert.match((await pending).message,/only an unpublished draft/);
        const q=(await rootClient.query('SELECT * FROM public.questions WHERE id=$1',[r.question.id])).rows[0];assert.equal(q.current_version_id,r.version.id);
        assert.deepEqual((await rootClient.query('SELECT status FROM public.question_versions WHERE question_id=$1 ORDER BY version_number',[r.question.id])).rows.map(x=>x.status),['superseded','approved']);
      } finally {await a.query('ROLLBACK');await a.end();await b.end();}
    });
    await t.test('approval racing stale metadata edit rejects the edit without replacing the published values',async()=>{
      const r=await revision(admin,await fixture(admin));await lifecycle(admin,'submit_question_version_for_review',r);
      const a=await connect(),b=await connect();
      try {await a.query('BEGIN');await lifecycle(a,'approve_question_version',r);
        const pid=(await b.query('SELECT pg_backend_pid() pid')).rows[0].pid;
        const pending=update(b,r,{difficulty:'hard'}).then(()=>null,e=>e);await waitForLock(rootClient,pid);await a.query('COMMIT');
        assert.match((await pending).message,/only an unpublished draft/);
        const v=(await rootClient.query('SELECT status,difficulty FROM public.question_versions WHERE id=$1',[r.version.id])).rows[0];
        assert.deepEqual(v,{status:'approved',difficulty:'easy'});
      } finally {await a.query('ROLLBACK');await a.end();await b.end();}
    });
    await t.test('deleting later working revision retains current AND superseded history; neither is editable/deletable',async()=>{
      const r=await revision(admin,await fixture(admin));await lifecycle(admin,'submit_question_version_for_review',r);await lifecycle(admin,'approve_question_version',r);
      const id=(await admin.query('SELECT public.create_question_revision($1) id',[r.question.id])).rows[0].id;
      const draft=await get(admin,r.question.id,id);await remove(admin,draft,false);
      const history=(await rootClient.query('SELECT id,status FROM public.question_versions WHERE question_id=$1 ORDER BY version_number',[r.question.id])).rows;
      assert.deepEqual(history.map(v=>v.status),['superseded','approved']);
      for(const v of history) {
        const stale={...r,version:{...r.version,id:v.id}};
        await expectBlocked(admin,update(admin,stale,{difficulty:'hard'}),/only an unpublished draft/);
        await expectBlocked(admin,remove(admin,stale,false),/only an unpublished draft/);
        await expectBlocked(admin,admin.query("UPDATE public.question_versions SET difficulty='hard' WHERE id=$1",[v.id]),/immutable/i);
        await expectBlocked(admin,admin.query('DELETE FROM public.question_versions WHERE id=$1',[v.id]),/Only draft/);
      }
    });
    await t.test('injected delete cascade failure rolls identity and all exclusive records back',async()=>{
      const s=await fixture(admin);
      await rootClient.query(`CREATE FUNCTION public.local_4b_delete_fail() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'LOCAL injected delete failure';END;$$;
        CREATE TRIGGER local_4b_delete_fail BEFORE DELETE ON public.question_options FOR EACH ROW EXECUTE FUNCTION public.local_4b_delete_fail();`);
      try {await expectBlocked(admin,remove(admin,s),/injected delete/);}
      finally {await rootClient.query('DROP TRIGGER local_4b_delete_fail ON public.question_options;DROP FUNCTION public.local_4b_delete_fail();');}
      assert.deepEqual(await get(admin,s.question.id,s.version.id),s);
    });
    await t.test('RPC signatures match the manually added TypeScript definitions; private helper is not executable',async()=>{
      const rows=(await rootClient.query(`SELECT proname,proargnames,pg_get_function_result(oid) result FROM pg_proc
        WHERE pronamespace='public'::regnamespace AND proname IN ('get_question_bank_draft','update_question_bank_draft_metadata','delete_question_bank_draft') ORDER BY proname`)).rows;
      assert.deepEqual(rows.map(r=>[r.proname,r.proargnames,r.result]),[
        ['delete_question_bank_draft',['_question_id','_version_id','_expected_fingerprint','_delete_question'],'jsonb'],
        ['get_question_bank_draft',['_question_id','_version_id'],'jsonb'],
        ['update_question_bank_draft_metadata',['_question_id','_version_id','_expected_fingerprint','_metadata'],'uuid']]);
      assert.equal((await rootClient.query("SELECT has_function_privilege('authenticated','public.question_bank_draft_fingerprint(uuid,uuid)','EXECUTE') allowed")).rows[0].allowed,false);
    });
    await t.test('existing course/video/account/legacy fixtures remain unchanged',async()=>{
      assert.deepEqual(await unchangedSnapshot(),original);
      assert.equal((await rootClient.query('SELECT * FROM public.practice_problems')).rowCount,1);
      assert.equal((await rootClient.query('SELECT * FROM auth.users')).rowCount,2);
    });
  } finally {
    await admin?.end();await rootClient?.end();
    if(created) {
      const label=docker(['inspect',container,'--format','{{index .Config.Labels "o2i.purpose"}}']).trim();
      assert.equal(label,'task4b-draft-tests');docker(['rm','-f',container]);
    }
  }
});
