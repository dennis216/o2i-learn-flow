// Task 4C: actual PostgreSQL, disposable loopback/tmpfs container only. No remote credentials.
import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';

const root=new URL('../../',import.meta.url),read=p=>readFileSync(new URL(p,root),'utf8');
const container=`o2i-task4c-${process.pid}`,port=55441,password=randomBytes(32).toString('hex');
const docker=args=>{
  try{return execFileSync('docker',args,{encoding:'utf8',stdio:['pipe','pipe','pipe']});}
  catch(error){throw new Error(`Local Docker step failed: ${String(error.stderr??error.message).replaceAll(password,'[redacted]')}`);}
};
const adminId='93000000-0000-0000-0000-000000000001',studentId='93000000-0000-0000-0000-000000000002',superId='93000000-0000-0000-0000-000000000003';
const connect=async(role='authenticated',id=adminId)=>{
  const c=new pg.Client({host:'127.0.0.1',port,database:'postgres',user:'postgres',password,connectionTimeoutMillis:5000});await c.connect();
  if(role){assert.ok(['authenticated','anon'].includes(role));await c.query(`SET ROLE ${role}`);await c.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)",[id,role]);}
  return c;
};
const fn=(sql,name)=>{const m=sql.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?AS \\$\\$[\\s\\S]*?\\$\\$[^;]*;`));assert.ok(m);return m[0];};
const bootstrap=()=>{
  const tax=read('supabase/migrations/20260920010000_ap_calculus_ced_framework.sql'),roles=read('supabase/migrations/20260920000000_content_admin_roles.sql');
  // Dependency DDL only; never execute taxonomy's destructive course/video seed tail.
  return `CREATE TYPE public.app_role AS ENUM('admin','instructor','student','super_admin');
    CREATE TABLE public.user_roles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES auth.users(id),role public.app_role,UNIQUE(user_id,role));
    ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
    CREATE TABLE public.courses(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),title text);
    CREATE TABLE public.course_videos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),course_id uuid REFERENCES public.courses(id),title text);
    CREATE TABLE public.practice_problems(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),sentinel text);
    ${tax.slice(tax.indexOf('CREATE TABLE public.curriculum_frameworks'),tax.indexOf('ALTER TABLE public.course_videos'))}
    ${fn(roles,'has_role')}${fn(roles,'is_super_admin')}
    ${fn(read('supabase/migrations/20250910020036_7f5646ab-55d4-4412-823b-b244048be7ba.sql'),'update_updated_at_column')}
    INSERT INTO auth.users(id,email) VALUES('${adminId}','task4c-admin@example.test'),('${studentId}','task4c-student@example.test'),('${superId}','task4c-super@example.test');
    INSERT INTO public.user_roles(user_id,role) VALUES('${adminId}','admin'),('${studentId}','student'),('${superId}','super_admin');
    INSERT INTO public.courses(title) VALUES('Synthetic existing course');
    INSERT INTO public.course_videos(course_id,title) SELECT id,'Synthetic existing video' FROM public.courses;
    INSERT INTO public.practice_problems(sentinel) VALUES('Synthetic legacy unchanged');
    INSERT INTO public.curriculum_frameworks(code,title,version,source_title) VALUES('LOCAL-4C','Synthetic','test','Synthetic');
    INSERT INTO public.curriculum_units(framework_id,unit_number,title) SELECT id,1,'Synthetic unit' FROM public.curriculum_frameworks;
    INSERT INTO public.curriculum_topics(unit_id,topic_code,title,big_idea,order_index) SELECT id,'1.1','Synthetic topic','LIM',1 FROM public.curriculum_units;
    INSERT INTO public.curriculum_topics(unit_id,topic_code,title,big_idea,order_index) SELECT id,'1.2','Synthetic second topic','LIM',2 FROM public.curriculum_units;
    INSERT INTO public.curriculum_practices(code,name,description) VALUES(1,'Synthetic','Synthetic');
    INSERT INTO public.curriculum_practice_skills(practice_code,skill_code,description) VALUES(1,'1.A','Synthetic A'),(1,'1.B','Synthetic B');
    CREATE POLICY "Local topic read" ON public.curriculum_topics FOR SELECT TO authenticated USING(true);
    CREATE POLICY "Local skill read" ON public.curriculum_practice_skills FOR SELECT TO authenticated USING(true);
    CREATE POLICY "Local framework read" ON public.curriculum_frameworks FOR SELECT TO authenticated USING(true);`;
};
const scalar=async(c,sql,args=[])=>(await c.query(sql,args)).rows[0].result;
const precheck=(c,s,action='publish')=>scalar(c,'SELECT public.precheck_question_publication($1,$2,$3) result',[s.q,s.v,action]);
const state=(c,s)=>scalar(c,'SELECT public.get_question_publication_state($1) result',[s.q]);
const getDraft=(c,s)=>scalar(c,'SELECT public.get_question_bank_draft($1,$2) result',[s.q,s.v]);
let serial=0;
async function fixture(c,overrides={}){
  const item={external_id:`SYNTHETIC-4C-${++serial}`,stem:'Synthetic \\(x^2\\)',solution:'Synthetic \\[2x\\]',difficulty:'easy',course_scope:'AB',
    primary_topic_code:'1.1',practice_skill_codes:['1.A'],representation_type:'analytical',calculator_policy:null,
    source_document:'SYNTHETIC.pdf',source_page:'12-13',source_locator:'p012-item01',requires_figure:false,correct_option_key:'A',
    import_evidence:{human_review_status:'pending',ai_flags:['ANSWER_AI_INFERRED'],human_review_notes:'Keep original review note',
      review_gates:{math_review_status:'pending',taxonomy_review_status:'pending',source_rights_status:'pending',render_review_status:'pending'}},
    options:[{option_key:'A',option_text:'Synthetic correct',is_correct:true,import_evidence:{option_explanation:'Keep option note'}},
      {option_key:'B',option_text:'Synthetic wrong',is_correct:false,import_evidence:{}}],...overrides};
  const s=(await scalar(c,'SELECT public.save_question_bank_drafts($1::jsonb) result',[JSON.stringify([item])]))[0];
  return {q:s.question_id,v:s.version_id};
}
const reviewInput=()=>({math:{confirmed:true,notes:'Synthetic independent computation checked.'},taxonomy:{confirmed:true,notes:'Synthetic Topic and Skill checked.'},
  source:{confirmed:true,notes:'Synthetic local test fixture only; original author is the test.',source_type:'original',locator_verified:true,printed_number_verified:false},
  render:{confirmed:true,notes:'Synthetic inline and display rendering checked.'},calculator_policy:'no_calculator',
  flag_resolutions:{ANSWER_AI_INFERRED:'Independently recomputed the synthetic answer.'}});
const record=async(c,s,input=reviewInput())=>scalar(c,'SELECT public.record_question_version_review($1,$2,$3,$4::jsonb) result',[s.q,s.v,(await precheck(c,s)).fingerprint,JSON.stringify(input)]);
const ready=async(c,s)=>{const r=await record(c,s);assert.equal(r.precheck.eligible,true,JSON.stringify(r.precheck.issues));return r.precheck;};
const publish=async(c,s,p)=>scalar(c,'SELECT public.publish_question_version($1,$2,$3) result',[s.q,s.v,(p??await precheck(c,s)).fingerprint]);
const action=async(c,name,s,fingerprint)=>scalar(c,`SELECT public.${name}($1,$2,$3) result`,[s.q,s.v,fingerprint??(await precheck(c,s)).fingerprint]);
const target=(s,p,action='publish')=>({question_id:s.q,version_id:s.v,expected_fingerprint:p.fingerprint,action});
const batch=(c,items)=>scalar(c,'SELECT public.publish_question_versions($1::jsonb) result',[JSON.stringify(items)]);
const metadata=()=>({difficulty:'hard',calculator_policy:'no_calculator',course_scope:'AB',representation_type:'analytical',
  primary_topic_code:'1.1',practice_skill_codes:['1.A'],source_page:'12-13',source_locator:'p012-item01'});
const revision=async(c,s,values=metadata())=>{
  const r=await scalar(c,'SELECT public.save_question_bank_revision($1,$2,$3,$4::jsonb) result',[s.q,s.v,(await precheck(c,s)).fingerprint,JSON.stringify(values)]);
  return {q:r.question_id,v:r.version_id};
};
const blocked=async(p,code)=>assert.rejects(p,e=>{assert.equal(JSON.parse(e.detail).code,code,e.message);return true;});
async function waitLock(rootClient,c){
  const pid=(await c.query('SELECT pg_backend_pid() pid')).rows[0].pid;
  return async()=>{for(let i=0;i<100;i++){if((await rootClient.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0]?.wait_event_type==='Lock')return;await new Promise(r=>setTimeout(r,20));}assert.fail('Expected a real PostgreSQL lock wait');};
}

test('Task 4C real disposable PostgreSQL publication', {timeout:180000},async t=>{
  let created=false,db,admin;
  try{
    docker(['run','--pull','never','-d','--name',container,'--label','o2i.purpose=task4c-publication-tests','--tmpfs','/var/lib/postgresql/data:rw',
      '-p',`127.0.0.1:${port}:5432`,'-e',`POSTGRES_PASSWORD=${password}`,'public.ecr.aws/supabase/postgres:17.11.0.002']);created=true;
    const inspect=JSON.parse(docker(['inspect',container]))[0];assert.equal(inspect.Config.Labels['o2i.purpose'],'task4c-publication-tests');
    assert.deepEqual(inspect.HostConfig.PortBindings['5432/tcp'],[{HostIp:'127.0.0.1',HostPort:String(port)}]);assert.ok(inspect.Mounts.every(m=>m.Type==='tmpfs'));
    let available=false;for(let i=0;i<120;i++){try{docker(['exec',container,'pg_isready','-h','127.0.0.1','-U','supabase_admin']);available=true;break;}catch{await new Promise(r=>setTimeout(r,250));}}assert.ok(available);
    docker(['exec',container,'psql','-U','supabase_admin','-d','postgres','-c',`ALTER ROLE postgres PASSWORD '${password}';`]);
    db=await connect(null);await db.query(bootstrap());
    for(const name of ['20260926000000_question_bank_foundation','20261004000000_question_bank_draft_import','20261018000000_question_bank_draft_management'])await db.query(`BEGIN;${read(`supabase/migrations/${name}.sql`)}COMMIT;`);
    const baseline=async()=>{const hashes={};for(const table of ['auth.users','public.user_roles','public.courses','public.course_videos','public.practice_problems'])hashes[table]=await scalar(db,`SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY id)::text) result FROM ${table} t`);return hashes;};
    const original=await baseline();
    // Simulate a previously approved row from the old lifecycle before applying 4C.
    const legacyAdmin=await connect();let legacy;
    try{legacy=await fixture(legacyAdmin);await legacyAdmin.query("UPDATE public.question_versions SET calculator_policy='no_calculator',source_type='original',source_locator_verified=true WHERE id=$1",[legacy.v]);
      await legacyAdmin.query('SELECT public.submit_question_version_for_review($1,$2)',[legacy.q,legacy.v]);await legacyAdmin.query('SELECT public.approve_question_version($1,$2)',[legacy.q,legacy.v]);
    }finally{await legacyAdmin.end();}
    const enumSql=read('supabase/migrations/20261019000000_question_bank_unpublished_status.sql'),publicationSql=read('supabase/migrations/20261019010000_question_bank_publication.sql');
    await t.test('same-transaction new enum use fails and rolls back; separate committed migrations succeed',async()=>{
      await assert.rejects(db.query(`BEGIN;${enumSql}${publicationSql}COMMIT;`),e=>e.code==='55P04');await db.query('ROLLBACK');
      assert.equal(await scalar(db,"SELECT count(*)::int result FROM pg_enum WHERE enumtypid='public.question_status'::regtype AND enumlabel='unpublished'"),0);
      await db.query(`BEGIN;${enumSql}COMMIT;`);await db.query(`BEGIN;${publicationSql}COMMIT;`);
    });
    admin=await connect();
    await t.test('legacy approved content is preserved but restoration requires fresh trusted confirmation',async()=>{
      const before=await state(admin,legacy);assert.equal(before.status,'approved');assert.equal(before.versions[0].version_id,legacy.v);
      await action(admin,'unpublish_question',legacy);await blocked(action(admin,'republish_question',legacy),'QB_REVIEW_REQUIRED');
      await record(admin,legacy);await action(admin,'republish_question',legacy);assert.equal((await state(admin,legacy)).status,'approved');
    });
    await t.test('import remains draft; precheck is read-only and XLSX claims never establish trusted review',async()=>{
      const s=await fixture(admin,{import_evidence:{human_review_status:'approved',ai_flags:['ANSWER_AI_INFERRED'],review_gates:{math_review_status:'passed',taxonomy_review_status:'passed',source_rights_status:'passed',render_review_status:'passed'}}});
      const before=await state(admin,s),p=await precheck(admin,s);assert.equal(p.eligible,false);assert.ok(p.issues.some(i=>i.code==='QB_REVIEW_REQUIRED'));
      assert.ok(p.issues.some(i=>i.code==='QB_FLAG_UNRESOLVED'));assert.deepEqual(await state(admin,s),before);
      await blocked(publish(admin,s,p),'QB_LOCATOR_UNVERIFIED');assert.equal((await state(admin,s)).status,'draft');
      assert.equal(await scalar(db,'SELECT count(*)::int result FROM public.question_version_reviews WHERE question_version_id=$1',[s.v]),0);
    });
    await t.test('first publication uses explicit server review; withdraw/republish retain same approved version and audit',async()=>{
      const s=await fixture(admin),originalEvidence=(await getDraft(admin,s)).version.import_evidence;
      await publish(admin,s,await ready(admin,s));let st=await state(admin,s);assert.equal(st.status,'approved');assert.equal(st.current_version_id,s.v);
      const r=await scalar(db,'SELECT to_jsonb(r) result FROM public.question_version_reviews r WHERE question_version_id=$1',[s.v]);assert.equal(r.reviewed_by,adminId);assert.ok(Date.parse(r.reviewed_at));
      assert.deepEqual(await scalar(db,'SELECT import_evidence result FROM public.question_versions WHERE id=$1',[s.v]),originalEvidence);
      await action(admin,'unpublish_question',s);st=await state(admin,s);assert.equal(st.status,'unpublished');assert.equal(st.current_version_id,s.v);assert.equal(st.versions[0].status,'approved');
      await action(admin,'republish_question',s);st=await state(admin,s);assert.equal(st.status,'approved');assert.equal(st.versions.length,1);
      assert.deepEqual(st.events.map(e=>e.action),['publish','unpublish','republish']);assert.ok(st.events.every(e=>e.actor_id===adminId));
    });
    await t.test('published and withdrawn revisions clone/save atomically, never on read, and require new review',async()=>{
      const s=await fixture(admin);await publish(admin,s,await ready(admin,s));const before=await state(admin,s);
      await precheck(admin,s);await state(admin,s);assert.deepEqual(await state(admin,s),before);
      await blocked(revision(admin,s,{...metadata(),practice_skill_codes:['9.Z']}),'QB_METADATA_INVALID');
      assert.deepEqual(await state(admin,s),before);
      const r=await revision(admin,s);let st=await state(admin,s);assert.equal(st.current_version_id,s.v);assert.equal(st.status,'approved');
      const student=await connect('authenticated',studentId);try{assert.equal((await student.query('SELECT current_version_id FROM public.questions WHERE id=$1',[s.q])).rows[0].current_version_id,s.v);}finally{await student.end();}
      assert.deepEqual(st.versions.map(v=>v.status),['approved','draft']);assert.ok((await precheck(admin,r)).issues.some(i=>i.code==='QB_REVIEW_REQUIRED'));
      const d=await getDraft(admin,r);assert.equal(d.version.difficulty,'hard');assert.equal(d.options.length,2);assert.deepEqual(d.skill_codes,['1.A']);
      assert.equal(d.version.import_evidence.ai_flags[0],'ANSWER_AI_INFERRED');assert.equal(d.options[0].import_evidence.option_explanation,'Keep option note');
      await ready(admin,r);await admin.query('SELECT public.submit_question_version_for_review($1,$2)',[r.q,r.v]);
      st=await state(admin,s);assert.deepEqual(st.versions.map(v=>v.status),['approved','review']);assert.equal(st.current_version_id,s.v);
      await publish(admin,r);st=await state(admin,s);assert.equal(st.current_version_id,r.v);assert.deepEqual(st.versions.map(v=>v.status),['superseded','approved']);
      await assert.rejects(admin.query("UPDATE public.question_versions SET difficulty='easy' WHERE id=$1",[s.v]),/immutable/);
      await blocked(publish(admin,s),'QB_VERSION_NOT_WORKING');
      await action(admin,'unpublish_question',r);const withdrawn=await revision(admin,r,{...metadata(),difficulty:'medium'});
      st=await state(admin,s);assert.equal(st.status,'unpublished');assert.equal(st.current_version_id,r.v);
      await publish(admin,withdrawn,await ready(admin,withdrawn));st=await state(admin,s);assert.equal(st.status,'approved');assert.equal(st.current_version_id,withdrawn.v);
    });
    await t.test('missing confirmations, unresolved/unknown flags and spoofed audit identity fail without mutations',async()=>{
      const s=await fixture(admin),before=await getDraft(admin,s);
      for(const [change,code] of [
        [x=>{x.math.confirmed=false;},'QB_CONFIRMATION_REQUIRED'],[x=>{x.source.notes='';},'QB_CONFIRMATION_REQUIRED'],
        [x=>{x.source.locator_verified=false;},'QB_LOCATOR_UNVERIFIED'],[x=>{x.flag_resolutions={};},'QB_FLAG_UNRESOLVED'],
        [x=>{x.flag_resolutions.UNKNOWN='Invented';},'QB_UNKNOWN_FLAG'],[x=>{x.reviewed_by=studentId;},'QB_INVALID_REVIEW'],
        [x=>{x.calculator_policy='unknown';},'QB_INVALID_REVIEW'],
      ]){const input=reviewInput();change(input);await blocked(record(admin,s,input),code);assert.deepEqual(await getDraft(admin,s),before);}
    });
    await t.test('raw answer/solution tables and reviews remain admin-only; withdrawal hides identity from students and anon',async()=>{
      const s=await fixture(admin);await publish(admin,s,await ready(admin,s));
      for(const [role,id] of [['authenticated',studentId],['anon','']]){
        const c=await connect(role,id);try{
          assert.equal((await c.query('SELECT id FROM public.questions WHERE id=$1',[s.q])).rowCount,role==='authenticated'?1:0);
          assert.equal((await c.query('SELECT solution FROM public.question_versions WHERE id=$1',[s.v])).rowCount,0);
          assert.equal((await c.query('SELECT is_correct FROM public.question_options WHERE question_version_id=$1',[s.v])).rowCount,0);
          if(role==='authenticated')await blocked(precheck(c,s),'QB_FORBIDDEN');else await assert.rejects(precheck(c,s),/permission denied/);
        }finally{await c.end();}
      }
      await action(admin,'unpublish_question',s);const student=await connect('authenticated',studentId);
      try{assert.equal((await student.query('SELECT id FROM public.questions WHERE id=$1',[s.q])).rowCount,0);}finally{await student.end();}
    });
    await t.test('direct status/GUC/evidence writes and legacy mutation RPCs cannot bypass trusted publication',async()=>{
      const s=await fixture(admin);await admin.query("SELECT set_config('o2i.question_lifecycle','approve_version',false),set_config('o2i.question_version_transition','approve_version',false)");
      try{for(const sql of ["UPDATE public.questions SET status='approved',current_version_id=$2 WHERE id=$1",
        "UPDATE public.question_versions SET status='approved',reviewed_by=auth.uid(),approved_at=now() WHERE question_id=$1 AND id=$2",
        "UPDATE public.question_versions SET import_evidence='{}' WHERE question_id=$1 AND id=$2"])
        await assert.rejects(admin.query(sql,[s.q,s.v]),/permission denied/);
      }finally{await admin.query("SELECT set_config('o2i.question_lifecycle','',false),set_config('o2i.question_version_transition','',false)");}
      for(const [name,args] of [['approve_question_version',[s.q,s.v]],['create_question_revision',[s.q]],['retire_question',[s.q]]])await assert.rejects(admin.query(`SELECT public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args),/permission denied/);
      await assert.rejects(admin.query("INSERT INTO public.question_version_reviews(question_version_id,content_fingerprint,review_data,reviewed_by) VALUES($1,'fake','{}',$2)",[s.v,adminId]),/permission denied/);
    });
    await t.test('content and child edit/revert permanently stale previous confirmation; 4B metadata remains usable',async()=>{
      const s=await fixture(admin);await ready(admin,s);const originalRevision=(await getDraft(admin,s)).version.editorial_revision;
      await admin.query("UPDATE public.question_versions SET stem='Changed synthetic' WHERE id=$1",[s.v]);
      await admin.query("UPDATE public.question_versions SET stem='Synthetic \\(x^2\\)' WHERE id=$1",[s.v]);
      assert.ok((await getDraft(admin,s)).version.editorial_revision>originalRevision);assert.ok((await precheck(admin,s)).issues.some(i=>i.code==='QB_REVIEW_STALE'));
      await ready(admin,s);const d=await getDraft(admin,s);
      await admin.query("INSERT INTO public.question_practice_skills SELECT $1,id FROM public.curriculum_practice_skills WHERE skill_code='1.B'",[s.v]);
      await admin.query("DELETE FROM public.question_practice_skills WHERE question_version_id=$1 AND practice_skill_id=(SELECT id FROM public.curriculum_practice_skills WHERE skill_code='1.B')",[s.v]);
      assert.ok((await precheck(admin,s)).issues.some(i=>i.code==='QB_REVIEW_STALE'));
      await assert.rejects(admin.query('SELECT public.update_question_bank_draft_metadata($1,$2,$3,$4::jsonb)',[s.q,s.v,d.fingerprint,JSON.stringify(metadata())]),/changed since/);
      const latest=await getDraft(admin,s);await admin.query('SELECT public.update_question_bank_draft_metadata($1,$2,$3,$4::jsonb)',[s.q,s.v,latest.fingerprint,JSON.stringify(metadata())]);
      assert.equal((await getDraft(admin,s)).version.difficulty,'hard');assert.ok((await precheck(admin,s)).issues.some(i=>i.code==='QB_REVIEW_STALE'));
    });
    await t.test('missing options, correct answer, canonical skill, figure or publication facts block content checks',async()=>{
      const s=await fixture(admin);await ready(admin,s);
      await admin.query('UPDATE public.question_options SET is_correct=false WHERE question_version_id=$1',[s.v]);
      assert.ok((await precheck(admin,s)).issues.some(i=>i.code==='QB_CORRECT_COUNT'));
      await admin.query("UPDATE public.question_options SET is_correct=true WHERE question_version_id=$1 AND option_key='A'",[s.v]);
      await admin.query('DELETE FROM public.question_options WHERE question_version_id=$1 AND NOT is_correct',[s.v]);
      assert.ok((await precheck(admin,s)).issues.some(i=>i.code==='QB_OPTION_COUNT'));
      await admin.query('DELETE FROM public.question_practice_skills WHERE question_version_id=$1',[s.v]);
      assert.ok((await precheck(admin,s)).issues.some(i=>i.code==='QB_TAXONOMY'));
      await admin.query('UPDATE public.question_versions SET requires_figure=true,calculator_policy=NULL,source_type=NULL WHERE id=$1',[s.v]);
      const codes=(await precheck(admin,s)).issues.map(i=>i.code);for(const code of ['QB_FIGURE_REQUIRED','QB_CALCULATOR_REQUIRED','QB_SOURCE_TYPE_REQUIRED'])assert.ok(codes.includes(code));
      await assert.rejects(publish(admin,s));assert.equal((await state(admin,s)).status,'draft');
      const printed=await fixture(admin,{source_question_number:'8',source_locator:null});const input=reviewInput();input.source.locator_verified=false;
      await blocked(record(admin,printed,input),'QB_PRINTED_NUMBER_UNVERIFIED');input.source.printed_number_verified=true;assert.equal((await record(admin,printed,input)).precheck.eligible,true);
    });
    await t.test('no reparenting can steal published options, skills or secondary topics into another draft',async()=>{
      const s=await fixture(admin),d=await fixture(admin);
      await admin.query("INSERT INTO public.question_topics SELECT $1,id FROM public.curriculum_topics WHERE topic_code='1.2'",[s.v]);
      await admin.query("INSERT INTO public.misconceptions(code,name,description) VALUES('SYNTHETIC-4C','Synthetic only','Synthetic only')");
      const wrong=(await getDraft(admin,s)).options.find(o=>!o.is_correct),otherWrong=(await getDraft(admin,d)).options.find(o=>!o.is_correct);
      await admin.query("INSERT INTO public.option_misconceptions SELECT $1,id FROM public.misconceptions WHERE code='SYNTHETIC-4C'",[wrong.id]);
      await publish(admin,s,await ready(admin,s));
      for(const table of ['question_options','question_practice_skills','question_topics'])
        await blocked(admin.query(`UPDATE public.${table} SET question_version_id=$1 WHERE question_version_id=$2`,[d.v,s.v]),'QB_CHILD_REPARENT');
      await blocked(admin.query('UPDATE public.option_misconceptions SET option_id=$1 WHERE option_id=$2',[otherWrong.id,wrong.id]),'QB_CHILD_REPARENT');
      assert.equal(await scalar(db,'SELECT count(*)::int result FROM public.question_options WHERE question_version_id=$1',[s.v]),2);
      assert.equal(await scalar(db,'SELECT count(*)::int result FROM public.question_practice_skills WHERE question_version_id=$1',[s.v]),1);
    });
    await t.test('deleting a saved working revision does not revive an earlier create/save request token',async()=>{
      const s=await fixture(admin);await publish(admin,s,await ready(admin,s));const old=await precheck(admin,s),r=await revision(admin,s),d=await getDraft(admin,r);
      await admin.query('SELECT public.delete_question_bank_draft($1,$2,$3,false)',[r.q,r.v,d.fingerprint]);
      assert.notEqual((await precheck(admin,s)).fingerprint,old.fingerprint);
      await blocked(scalar(admin,'SELECT public.save_question_bank_revision($1,$2,$3,$4::jsonb) result',[s.q,s.v,old.fingerprint,JSON.stringify(metadata())]),'QB_STALE');
      assert.equal((await state(admin,s)).versions.length,1);
    });
    await t.test('batch rejects duplicate/oversized/malformed targets and invalid batch never publishes any member',async()=>{
      const a=await fixture(admin),b=await fixture(admin),pa=await ready(admin,a),pb=await precheck(admin,b);
      await blocked(batch(admin,[target(a,pa),target(a,pa)]),'QB_DUPLICATE_TARGET');
      await blocked(batch(admin,Array.from({length:21},()=>target(a,pa))),'QB_BATCH_LIMIT');
      await blocked(batch(admin,[{...target(a,pa),extra:'no'}]),'QB_INVALID_BATCH');
      await assert.rejects(batch(admin,[target(a,pa),target(b,pb)]));
      assert.equal((await state(admin,a)).status,'draft');assert.equal((await state(admin,b)).status,'draft');
      assert.equal((await state(admin,a)).events.length,0);
    });
    await t.test('valid batch publishes all; repeat request and stale version targets do not duplicate versions/events',async()=>{
      const a=await fixture(admin),b=await fixture(admin),items=[target(a,await ready(admin,a)),target(b,await ready(admin,b))];
      assert.equal((await batch(admin,[...items].reverse())).length,2);await blocked(batch(admin,items),'QB_STALE');
      for(const s of [a,b]){const st=await state(admin,s);assert.equal(st.status,'approved');assert.equal(st.events.length,1);assert.equal(st.versions.length,1);}
    });
    await t.test('a withdrawn current version is restored only with explicit republish even when a working revision exists',async()=>{
      const s=await fixture(admin);await publish(admin,s,await ready(admin,s));await action(admin,'unpublish_question',s);const r=await revision(admin,s);
      await blocked(publish(admin,s),'QB_VERSION_NOT_WORKING');
      const p=await precheck(admin,s,'republish');assert.equal(p.working_version_id,r.v);assert.equal(p.eligible,true);
      await batch(admin,[target(s,p,'republish')]);const st=await state(admin,s);assert.equal(st.status,'approved');assert.equal(st.current_version_id,s.v);assert.equal(st.versions.at(-1).status,'draft');
    });
    await t.test('failure after first publication rolls back the entire batch including status, review transitions and events',async()=>{
      const a=await fixture(admin),b=await fixture(admin),items=[target(a,await ready(admin,a)),target(b,await ready(admin,b))].sort((a,b)=>a.question_id.localeCompare(b.question_id));
      await db.query(`CREATE FUNCTION public.local_publication_fail() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.question_id='${items[1].question_id}'::uuid THEN RAISE EXCEPTION 'LOCAL injected publication failure';END IF;RETURN NEW;END;$$;
        CREATE TRIGGER local_publication_fail BEFORE INSERT ON public.question_publication_events FOR EACH ROW EXECUTE FUNCTION public.local_publication_fail();`);
      try{await assert.rejects(batch(admin,items),/LOCAL injected/);}finally{await db.query('DROP TRIGGER local_publication_fail ON public.question_publication_events;DROP FUNCTION public.local_publication_fail();');}
      for(const s of [a,b]){const st=await state(admin,s);assert.equal(st.status,'draft');assert.equal(st.versions[0].status,'draft');assert.equal(st.events.length,0);}
    });
    await t.test('super-admin uses existing role model; normal users cannot use any new mutation RPC',async()=>{
      const s=await fixture(admin),p=await ready(admin,s),superAdmin=await connect('authenticated',superId);try{await publish(superAdmin,s,p);}finally{await superAdmin.end();}
      assert.equal(await scalar(db,'SELECT reviewed_by result FROM public.question_versions WHERE id=$1',[s.v]),adminId);
      assert.equal((await state(admin,s)).events[0].actor_id,superId);
      const student=await connect('authenticated',studentId);try{
        for(const name of ['publish_question_version','republish_question','unpublish_question','archive_question'])await blocked(action(student,name,s,'fake'),'QB_FORBIDDEN');
        await blocked(record(student,s),'QB_FORBIDDEN');await blocked(revision(student,s),'QB_FORBIDDEN');await blocked(batch(student,[]),'QB_FORBIDDEN');
      }finally{await student.end();}
    });
    await t.test('archive requires withdrawal and resolved working revision; cannot permanently delete withdrawn history',async()=>{
      const s=await fixture(admin);await publish(admin,s,await ready(admin,s));await blocked(action(admin,'archive_question',s),'QB_NOT_UNPUBLISHED');await action(admin,'unpublish_question',s);
      await blocked(admin.query('DELETE FROM public.questions WHERE id=$1',[s.q]),'QB_DELETE_HISTORY');
      const r=await revision(admin,s);await blocked(action(admin,'archive_question',s),'QB_WORKING_REVISION_EXISTS');
      const d=await getDraft(admin,r);await admin.query('SELECT public.delete_question_bank_draft($1,$2,$3,false)',[r.q,r.v,d.fingerprint]);
      await action(admin,'archive_question',s);const st=await state(admin,s);assert.equal(st.status,'retired');assert.equal(st.current_version_id,null);assert.equal(st.versions[0].status,'superseded');
      await assert.rejects(action(admin,'republish_question',s));assert.equal((await state(admin,s)).events.at(-1).action,'archive');
    });
    await t.test('4B delete is still atomic for never-published drafts and review versions remain read-only',async()=>{
      const s=await fixture(admin),d=await getDraft(admin,s);await admin.query('SELECT public.delete_question_bank_draft($1,$2,$3,true)',[s.q,s.v,d.fingerprint]);
      await blocked(state(admin,s),'QB_NOT_FOUND');
      const r=await fixture(admin);await ready(admin,r);await admin.query('SELECT public.submit_question_version_for_review($1,$2)',[r.q,r.v]);const rd=await getDraft(admin,r);
      await assert.rejects(admin.query('SELECT public.update_question_bank_draft_metadata($1,$2,$3,$4::jsonb)',[r.q,r.v,rd.fingerprint,JSON.stringify(metadata())]),/only an unpublished draft/);
      await assert.rejects(admin.query('SELECT public.delete_question_bank_draft($1,$2,$3,true)',[r.q,r.v,rd.fingerprint]),/only an unpublished draft/);
      await admin.query('SELECT public.return_question_version_to_draft($1,$2)',[r.q,r.v]);const latest=await getDraft(admin,r);
      assert.ok((await precheck(admin,r)).issues.some(i=>i.code==='QB_REVIEW_STALE'));
      await admin.query('SELECT public.update_question_bank_draft_metadata($1,$2,$3,$4::jsonb)',[r.q,r.v,latest.fingerprint,JSON.stringify(metadata())]);
      assert.equal((await getDraft(admin,r)).version.difficulty,'hard');
    });
    const draftReady=async()=>{const s=await fixture(admin);return {s,p:await ready(admin,s),d:await getDraft(admin,s)};};
    const currentReady=async()=>{const data=await draftReady();await publish(admin,data.s,data.p);return {...data,p:await precheck(admin,data.s)};};
    for(const scenario of [
      {name:'duplicate publication requests',setup:draftReady,first:(c,x)=>publish(c,x.s,x.p),second:(c,x)=>publish(c,x.s,x.p),code:'QB_STALE'},
      {name:'metadata edit wins over publication',setup:draftReady,first:(c,x)=>c.query('SELECT public.update_question_bank_draft_metadata($1,$2,$3,$4::jsonb)',[x.s.q,x.s.v,x.d.fingerprint,JSON.stringify(metadata())]),second:(c,x)=>publish(c,x.s,x.p),code:'QB_STALE'},
      {name:'publication wins over stale metadata edit',setup:draftReady,first:(c,x)=>publish(c,x.s,x.p),second:(c,x)=>c.query('SELECT public.update_question_bank_draft_metadata($1,$2,$3,$4::jsonb)',[x.s.q,x.s.v,x.d.fingerprint,JSON.stringify(metadata())]),pattern:/only an unpublished draft/},
      {name:'publication wins over draft deletion',setup:draftReady,first:(c,x)=>publish(c,x.s,x.p),second:(c,x)=>c.query('SELECT public.delete_question_bank_draft($1,$2,$3,true)',[x.s.q,x.s.v,x.d.fingerprint]),pattern:/only an unpublished draft/},
      {name:'draft deletion wins over publication',setup:draftReady,first:(c,x)=>c.query('SELECT public.delete_question_bank_draft($1,$2,$3,true)',[x.s.q,x.s.v,x.d.fingerprint]),second:(c,x)=>publish(c,x.s,x.p),code:'QB_NOT_FOUND'},
      {name:'concurrent save revision requests',setup:currentReady,first:(c,x)=>scalar(c,'SELECT public.save_question_bank_revision($1,$2,$3,$4::jsonb) result',[x.s.q,x.s.v,x.p.fingerprint,JSON.stringify(metadata())]),second:(c,x)=>scalar(c,'SELECT public.save_question_bank_revision($1,$2,$3,$4::jsonb) result',[x.s.q,x.s.v,x.p.fingerprint,JSON.stringify(metadata())]),code:'QB_STALE'},
      {name:'withdrawal wins over stale revision save',setup:currentReady,first:(c,x)=>action(c,'unpublish_question',x.s,x.p.fingerprint),second:(c,x)=>scalar(c,'SELECT public.save_question_bank_revision($1,$2,$3,$4::jsonb) result',[x.s.q,x.s.v,x.p.fingerprint,JSON.stringify(metadata())]),code:'QB_STALE'},
    ])await t.test(`real two-connection lock race: ${scenario.name}`,async()=>{
      const x=await scenario.setup(),a=await connect(),b=await connect();let outcome;
      try{await a.query('BEGIN');await scenario.first(a,x);const waiting=await waitLock(db,b);
        const pending=scenario.second(b,x).then(value=>({value}),error=>({error}));await waiting();await a.query('COMMIT');outcome=await pending;
        assert.ok(outcome.error,'Stale competing request unexpectedly succeeded');
        if(scenario.code)assert.equal(JSON.parse(outcome.error.detail).code,scenario.code,outcome.error.message);else assert.match(outcome.error.message,scenario.pattern);
      }finally{await a.query('ROLLBACK');await a.end();await b.end();}
    });
    await t.test('overlapping batches lock in stable UUID order, not caller order, without partial or duplicate publication',async()=>{
      const s=await fixture(admin),r=await fixture(admin),items=[target(s,await ready(admin,s)),target(r,await ready(admin,r))],a=await connect(),b=await connect();
      try{await a.query('BEGIN');await batch(a,items);const waiting=await waitLock(db,b);
        const pending=batch(b,[...items].reverse()).then(()=>null,e=>e);await waiting();await a.query('COMMIT');assert.equal(JSON.parse((await pending).detail).code,'QB_STALE');
        for(const x of [s,r]){const st=await state(admin,x);assert.equal(st.events.length,1);assert.equal(st.status,'approved');}
      }finally{await a.query('ROLLBACK');await a.end();await b.end();}
    });
    await t.test('independent reader sees old publication until revision transaction commits, then only the new pointer',async()=>{
      const s=await fixture(admin);await publish(admin,s,await ready(admin,s));const r=await revision(admin,s),p=await ready(admin,r),a=await connect(),reader=await connect('authenticated',studentId);
      try{await a.query('BEGIN');await publish(a,r,p);
        assert.equal((await reader.query('SELECT current_version_id FROM public.questions WHERE id=$1',[s.q])).rows[0].current_version_id,s.v);
        await a.query('COMMIT');assert.equal((await reader.query('SELECT current_version_id FROM public.questions WHERE id=$1',[s.q])).rows[0].current_version_id,r.v);
        assert.deepEqual((await state(admin,s)).versions.map(v=>v.status),['superseded','approved']);
      }finally{await a.query('ROLLBACK');await a.end();await reader.end();}
    });
    await t.test('ordinary/anonymous readers cannot see new audit tables and existing data remains unchanged',async()=>{
      const student=await connect('authenticated',studentId);try{for(const table of ['question_version_reviews','question_publication_events'])assert.equal((await student.query(`SELECT * FROM public.${table}`)).rowCount,0);}finally{await student.end();}
      assert.deepEqual(await baseline(),original);
    });
    await t.test('latest-schema pgTAP suite executes all 30 assertions and rolls back its own fixtures',async()=>{
      const results=await db.query(read('supabase/tests/question_bank_publication_test.sql'));
      const lines=results.flatMap(r=>r.rows.flatMap(row=>Object.values(row))).filter(v=>typeof v==='string');
      assert.ok(!lines.some(line=>/^(not ok|# Looks like)/m.test(line)),lines.filter(line=>/not ok|Looks like/.test(line)).join('\n'));
      assert.equal(lines.filter(line=>/^ok \d+/m.test(line)).length,30);assert.deepEqual(await baseline(),original);
    });
    await t.test('standard official pg_prove runner also accepts the latest-schema SQL suite',async()=>{
      const file=new URL('supabase/tests/question_bank_publication_test.sql',root).pathname;
      const output=docker(['run','--rm','--pull','never','--network',`container:${container}`,
        '--mount',`type=bind,source=${file},target=/tmp/latest.sql,readonly`,'-e',`PGPASSWORD=${password}`,
        'public.ecr.aws/supabase/pg_prove:3.36','pg_prove','--norc','--host','127.0.0.1','--port','5432','--username','postgres','--dbname','postgres','/tmp/latest.sql']);
      assert.match(output,/Result: PASS/);assert.match(output,/Tests=30/);assert.deepEqual(await baseline(),original);
    });
    await t.test('actual RPC/column/enum metadata matches the manually maintained TypeScript contract and privileges',async()=>{
      const types=read('src/integrations/supabase/types.ts');
      const names=['precheck_question_publication','get_question_publication_state','record_question_version_review','save_question_bank_revision',
        'publish_question_versions','publish_question_version','unpublish_question','republish_question','archive_question'];
      const rows=(await db.query('SELECT proname,proargnames,pg_get_function_result(oid) result,prosecdef FROM pg_proc WHERE pronamespace=\'public\'::regnamespace AND proname=ANY($1)',[names])).rows;
      assert.equal(rows.length,names.length);
      for(const row of rows){const match=types.match(new RegExp(`${row.proname}: \\{\\s*Args: \\{([^}]+)\\}\\s*Returns: (\\w+)`));assert.ok(match,row.proname);
        assert.deepEqual([...match[1].matchAll(/(_[a-z_]+):/g)].map(x=>x[1]),row.proargnames);assert.equal(match[2],'Json');assert.equal(row.result,'jsonb');assert.equal(row.prosecdef,true);
      }
      for(const table of ['question_version_reviews','question_publication_events']){
        const cols=(await db.query('SELECT column_name FROM information_schema.columns WHERE table_schema=\'public\' AND table_name=$1 ORDER BY column_name',[table])).rows.map(r=>r.column_name);
        const block=types.split(`${table}: {`)[1].split('Insert:')[0];assert.deepEqual([...block.matchAll(/^\s+([a-z_]+):/gm)].map(x=>x[1]).filter(x=>x!=='Row').sort(),cols);
        assert.equal(await scalar(db,"SELECT relrowsecurity result FROM pg_class WHERE oid=$1::regclass",[`public.${table}`]),true);
        assert.equal(await scalar(db,"SELECT has_table_privilege('authenticated',$1,'INSERT,UPDATE,DELETE') result",[`public.${table}`]),false);
      }
      for(const [table,column] of [['question_versions','status'],['question_versions','editorial_revision'],['question_versions','import_evidence'],['question_versions','source_locator_verified'],['questions','status'],['questions','lifecycle_revision']])
        assert.equal(await scalar(db,"SELECT has_column_privilege('authenticated',$1,$2,'UPDATE') result",[`public.${table}`,column]),false);
      assert.ok(types.includes('question_status: ["draft", "approved", "retired", "unpublished"]'));
      assert.deepEqual((await db.query("SELECT enumlabel FROM pg_enum WHERE enumtypid='public.question_status'::regtype ORDER BY enumsortorder")).rows.map(r=>r.enumlabel),['draft','approved','retired','unpublished']);
    });
  }finally{
    await admin?.end();await db?.end();if(created){assert.equal(docker(['inspect',container,'--format','{{index .Config.Labels "o2i.purpose"}}']).trim(),'task4c-publication-tests');docker(['rm','-f',container]);}
  }
});
