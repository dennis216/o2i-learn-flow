// Disposable local Auth/REST/database/browser acceptance. No production connection or credentials.
import assert from 'node:assert/strict';
import { execFileSync,spawn } from 'node:child_process';
import { randomBytes,randomUUID,createHmac } from 'node:crypto';
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { parseQuestionBankWorkbook,validateQuestionBankSheets } from '../src/lib/questionBankImport.ts';
import { buildQuestionBankDraftSavePlan } from '../src/lib/questionBankDraftSave.ts';
const root=fileURLToPath(new URL('../',import.meta.url));
assert.equal(process.cwd(),root.replace(/\/$/,''));
const {chromium}=await import(process.env.O2I_PLAYWRIGHT_MODULE??'playwright');
const output=resolve(root,'node_modules/.cache/student-practice');mkdirSync(output,{recursive:true,mode:0o700});
const read=p=>readFileSync(resolve(root,p),'utf8');
const prefix='o2i-practice-'+process.pid,network=prefix+'-net';
const dbPort=55512,authPort=55513,restPort=55514,apiPort=55515,appPort=5192;
const api='http://127.0.0.1:'+apiPort,app='http://127.0.0.1:'+appPort;
const password=randomBytes(32).toString('hex'),jwtSecret=randomBytes(48).toString('hex'),testPassword=randomBytes(24).toString('base64url')+'aA1!';
const jwt=role=>{const body=[{alg:'HS256',typ:'JWT'},{iss:'supabase',role,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+7200}].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.');return body+'.'+createHmac('sha256',jwtSecret).update(body).digest('base64url');};
const anon=jwt('anon'),service=jwt('service_role'),secrets=[password,jwtSecret,testPassword,service];
const redact=value=>secrets.reduce((s,k)=>s.replaceAll(k,'[redacted]'),String(value));
const docker=args=>{try{return execFileSync('docker',args,{encoding:'utf8',stdio:['pipe','pipe','pipe']});}catch(e){throw new Error(redact(e.stderr??e.message));}};
const created=[];let networkCreated=false,db,browser,context,page,proxy,vite;
const report={checks:[],cleanup:false};
const check=name=>{report.checks.push(name);console.log('PASS '+name);};
const fn=(sql,name)=>{const match=sql.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?AS \\$\\$[\\s\\S]*?\\$\\$[^;]*;`));assert.ok(match);return match[0];};
const wait=async op=>{let last;for(let i=0;i<160;i++){try{const v=await op();if(v)return v;}catch(e){last=e;}await new Promise(r=>setTimeout(r,250));}throw new Error('Local service timeout: '+redact(last?.message??''));};
const scalar=async(sql,args=[])=>(await db.query(sql,args)).rows[0]?.result;
const ok=async promise=>{const r=await promise;assert.ifError(r.error);return r.data;};
const fail=async promise=>{const r=await promise;assert.ok(r.error,'Expected request to be refused');return r.error;};
const rpc=(c,name,args={})=>ok(c.rpc(name,args));
const safe=s=>{for(const q of s.questions){assert.equal(q.attempt,null);assert.deepEqual(Object.keys(q.options[0]).sort(),['id','key','text']);for(const key of ['solution','correct_option_id','correct_option_key','import_evidence','is_correct'])assert.equal(Object.hasOwn(q,key),false,key);}};
const shot=async name=>page.screenshot({path:resolve(output,name+'.png'),fullPage:false});
try {
  console.log('Starting isolated local Auth, REST and PostgreSQL; no existing database is used.');
  // Docker Desktop does not publish host ports for an --internal network.
  // Dedicated bridge + loopback-only bindings; browser rejects every non-loopback request.
  docker(['network','create','--label','o2i.purpose=student-practice',network]);networkCreated=true;
  const run=(name,image,args=[])=>{docker(['run','--pull','never','-d','--name',name,'--network',network,'--label','o2i.purpose=student-practice',...args,image]);created.push(name);};
  const dbName=prefix+'-db';run(dbName,'public.ecr.aws/supabase/postgres:17.11.0.002',['--tmpfs','/var/lib/postgresql/data:rw','-p',`127.0.0.1:${dbPort}:5432`,'-e',`POSTGRES_PASSWORD=${password}`]);
  await wait(()=>docker(['exec',dbName,'pg_isready','-h','127.0.0.1','-U','supabase_admin']).includes('accepting connections'));
  docker(['exec',dbName,'psql','-U','supabase_admin','-d','postgres','-c',`ALTER ROLE postgres PASSWORD '${password}'; ALTER ROLE supabase_auth_admin PASSWORD '${password}'; ALTER ROLE authenticator PASSWORD '${password}';`]);
  db=await wait(async()=>{const c=new pg.Client({host:'127.0.0.1',port:dbPort,database:'postgres',user:'postgres',password,connectionTimeoutMillis:1000});
    try{await c.connect();await c.query('SELECT 1');return c;}catch(error){await c.end().catch(()=>{});throw error;}});
  proxy=createServer(async(req,res)=>{
    if(req.url==='/synthetic-figure.svg'){res.setHeader('Content-Type','image/svg+xml');res.end('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="40"><text x="8" y="25">Synthetic figure</text></svg>');return;}
    res.setHeader('Access-Control-Allow-Origin',app);res.setHeader('Access-Control-Allow-Headers','authorization,apikey,content-type,x-client-info,prefer,range,accept-profile,content-profile,x-supabase-api-version');
    res.setHeader('Access-Control-Allow-Methods','GET,HEAD,POST,PATCH,DELETE,OPTIONS');res.setHeader('Access-Control-Expose-Headers','Content-Range');
    if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
    const auth=req.url.startsWith('/auth/v1/'),rest=req.url.startsWith('/rest/v1/');if(!auth&&!rest){res.writeHead(404);res.end();return;}
    try{let body='';for await(const chunk of req)body+=chunk;
      const headers={...req.headers};delete headers.host;delete headers['content-length'];delete headers.connection;
      const upstream=await fetch(`http://127.0.0.1:${auth?authPort:restPort}`+req.url.replace(auth?'/auth/v1':'/rest/v1',''),{method:req.method,headers,...(['GET','HEAD'].includes(req.method)?{}:{body})});
      res.statusCode=upstream.status;for(const key of ['content-type','content-range','preference-applied'])if(upstream.headers.get(key))res.setHeader(key,upstream.headers.get(key));res.end(Buffer.from(await upstream.arrayBuffer()));
    }catch{res.writeHead(502);res.end('Local service unavailable');}
  });await new Promise(r=>proxy.listen(apiPort,'127.0.0.1',r));
  run(prefix+'-auth','public.ecr.aws/supabase/gotrue:v2.197.0',[
    '-p',`127.0.0.1:${authPort}:9999`,'-e','GOTRUE_API_HOST=0.0.0.0','-e','GOTRUE_API_PORT=9999',
    '-e',`API_EXTERNAL_URL=${api}`,'-e',`GOTRUE_SITE_URL=${app}`,'-e','GOTRUE_DB_DRIVER=postgres',
    '-e',`GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:${password}@${dbName}:5432/postgres?sslmode=disable`,
    '-e',`GOTRUE_JWT_SECRET=${jwtSecret}`,'-e','GOTRUE_JWT_ADMIN_ROLES=service_role','-e','GOTRUE_JWT_AUD=authenticated',
    '-e','GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated','-e','GOTRUE_DISABLE_SIGNUP=false','-e','GOTRUE_EXTERNAL_EMAIL_ENABLED=true','-e','GOTRUE_MAILER_AUTOCONFIRM=true']);
  await wait(async()=> (await fetch(api+'/auth/v1/health')).ok);
  const taxonomy=read('supabase/migrations/20260920010000_ap_calculus_ced_framework.sql');
  await db.query(`CREATE TYPE public.app_role AS ENUM('admin','instructor','student','super_admin');
    CREATE TABLE public.user_roles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES auth.users(id),role public.app_role,UNIQUE(user_id,role));ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
    CREATE TABLE public.courses(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),title text,description text,level text,subject text,price numeric,created_at timestamptz DEFAULT now(),is_published boolean DEFAULT false);
    CREATE TABLE public.course_videos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),course_id uuid REFERENCES public.courses(id),title text,subtitle text,video_url text,transcript text,exam_tips text,notes_url text,order_index int);
    CREATE TABLE public.practice_problems(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),title text,content text,solution text,video_id uuid,image_url text,unit_number int,lesson_number int,created_at timestamptz DEFAULT now());
    CREATE TABLE public.profiles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid UNIQUE REFERENCES auth.users(id),full_name text,email text,role text);
    CREATE TABLE public.user_login_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES auth.users(id),created_at timestamptz DEFAULT now());
    CREATE TABLE public.subjects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text,category text,order_index int);
    CREATE TABLE public.team_members(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_index int);
    ${fn(read('supabase/migrations/20260920000000_content_admin_roles.sql'),'has_role')}
    ${fn(read('supabase/migrations/20260920000000_content_admin_roles.sql'),'is_super_admin')}
    ${fn(read('supabase/migrations/20250910020036_7f5646ab-55d4-4412-823b-b244048be7ba.sql'),'update_updated_at_column')}
    ${taxonomy.slice(taxonomy.indexOf('CREATE TABLE public.curriculum_frameworks'),taxonomy.indexOf('-- Reuse the two existing AP Calculus course records'))}`);
  for(const migration of ['20260926000000_question_bank_foundation','20261004000000_question_bank_draft_import','20261018000000_question_bank_draft_management','20261019000000_question_bank_unpublished_status','20261019010000_question_bank_publication'])await db.query('BEGIN;'+read('supabase/migrations/'+migration+'.sql')+'COMMIT;');
  run(prefix+'-rest','public.ecr.aws/supabase/postgrest:v16.4',['-p',`127.0.0.1:${restPort}:3000`,'-e',`PGRST_DB_URI=postgres://authenticator:${password}@${dbName}:5432/postgres`,'-e','PGRST_DB_SCHEMAS=public','-e','PGRST_DB_ANON_ROLE=anon','-e',`PGRST_JWT_SECRET=${jwtSecret}`]);
  await wait(async()=> (await fetch(api+'/rest/v1/')).ok);
  const serviceClient=createClient(api,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const accounts=[];
  for(const role of ['admin','student','student']){
    const {data,error}=await serviceClient.auth.admin.createUser({email:`practice-${process.pid}-${accounts.length}-${role}@example.test`,password:testPassword,email_confirm:true});assert.ifError(error);accounts.push({role,id:data.user.id,email:data.user.email});
    await db.query('INSERT INTO public.user_roles(user_id,role) VALUES($1,$2)',[data.user.id,role]);
    await db.query('INSERT INTO public.profiles(user_id,full_name,email,role) VALUES($1,$2,$3,$4)',[data.user.id,'Disposable Task 4D',data.user.email,role]);
  }
  const admin=createClient(api,anon,{auth:{persistSession:false,autoRefreshToken:false}});assert.ifError((await admin.auth.signInWithPassword({email:accounts[0].email,password:testPassword})).error);
  const topics=(await admin.from('curriculum_topics').select('id,topic_code,title')).data,skills=(await admin.from('curriculum_practice_skills').select('id,skill_code,description')).data;
  assert.equal(topics.length,111);assert.equal(skills.length,23);check('Actual local migrations and canonical 111 Topics / 23 Skills loaded');
  await db.query('BEGIN;'+read('supabase/migrations/20261020000000_question_bank_simple_publication.sql')+'COMMIT;');
  await db.query('CREATE SCHEMA IF NOT EXISTS supabase_migrations; CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations(version text PRIMARY KEY,name text,statements text[]);');
  await db.query("INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261020000000','question_bank_simple_publication',ARRAY[$1])",[read('supabase/migrations/20261020000000_question_bank_simple_publication.sql')]);
  const releasePreflight = async (studentStatus, randomStatus) => {
    const result = (await db.query(read('docs/question-bank/production/student-practice-release/00_preflight_readonly.sql'))).rows[0].release_preflight;
    assert.deepEqual(result.stages, { simple_publication: 'matches', student_practice: studentStatus, random_selection: randomStatus });
    assert.equal(result.adaptive_present, false);
    assert.ok(Object.values(result.practice_tables).every(value => value === (studentStatus === 'matches')));
    assert.equal(result.start_rpc_exists, studentStatus === 'matches');
  };
  await releasePreflight('absent', 'absent');
  await db.query(read('docs/question-bank/production/student-practice/10_deploy.sql'));
  await releasePreflight('matches', 'absent');
  const verification=(await db.query(read('docs/question-bank/production/student-practice/20_verify_readonly.sql'))).rows[0].student_practice_verification;
  assert.equal(verification.all_checks_pass,true,JSON.stringify(verification));check('Copyable deployment transaction, matching ledger and all catalog/privilege checks');
  await assert.rejects(db.query(read('docs/question-bank/production/student-practice/10_deploy.sql')),/already recorded/);await db.query('ROLLBACK');
  await db.query(read('docs/question-bank/production/practice-selection/30_review_deploy.sql'));
  assert.equal((await db.query(read('docs/question-bank/production/practice-selection/31_review_verify.sql'))).rows[0].practice_selection_verification.all_checks_pass,true);
  await assert.rejects(db.query(read('docs/question-bank/production/practice-selection/30_review_deploy.sql')),/already recorded/);await db.query('ROLLBACK');
  assert.equal(await scalar("SELECT count(*)::int result FROM information_schema.columns WHERE table_schema='public' AND table_name='question_practice_sessions' AND column_name='selection_summary'"),0);
  check('Review forward migration works before random/adaptive migrations, rejects replay, and passes ledger/privilege checks');
  await db.query(read('docs/question-bank/production/practice-selection/10_random_deploy.sql'));
  assert.equal((await db.query(read('docs/question-bank/production/practice-selection/11_random_verify.sql'))).rows[0].practice_selection_verification.all_checks_pass,true);
  await assert.rejects(db.query(read('docs/question-bank/production/practice-selection/10_random_deploy.sql')),/already recorded/);await db.query('ROLLBACK');
  await releasePreflight('matches', 'matches');
  await db.query('BEGIN');
  await db.query("UPDATE supabase_migrations.schema_migrations SET name='synthetic-drift' WHERE version='20261023000000'");
  const drift = (await db.query(read('docs/question-bank/production/student-practice-release/00_preflight_readonly.sql'))).rows[0].release_preflight;
  assert.equal(drift.stages.random_selection, 'ledger_mismatch');
  await db.query('ROLLBACK');
  check('Release preflight identifies absent, matching and drifted stages without returning account or question content');

  await db.query("NOTIFY pgrst,'reload schema'");
  await new Promise(r=>setTimeout(r,500));
  const students=[];for(const a of accounts.slice(1)){const c=createClient(api,anon,{auth:{persistSession:false,autoRefreshToken:false}});await ok(c.auth.signInWithPassword({email:a.email,password:testPassword}));students.push(c);}
  const [student,other]=students, visitor=createClient(api,anon,{auth:{persistSession:false,autoRefreshToken:false}});
  const start=(c,topicId,id=randomUUID())=>rpc(c,'start_question_practice',{_session_id:id,...(topicId?{_topic_id:topicId}:{})});
  const submit=(c,s,q,o)=>rpc(c,'submit_question_practice',{_session_id:s.id,_question_id:q.question_id,_option_id:o,_elapsed_seconds:7});
  const precheck=async(s,action='publish')=>rpc(admin,'precheck_question_publication',{_question_id:s.question_id,_version_id:s.version_id,_action:action});
  const publish=async s=>{let p=await precheck(s);const r=await rpc(admin,'record_question_version_review',{_question_id:s.question_id,_version_id:s.version_id,_expected_fingerprint:p.fingerprint,_review:{confirmed:true}});assert.equal(r.precheck.eligible,true,JSON.stringify(r));p=r.precheck;return rpc(admin,'publish_question_version',{_question_id:s.question_id,_version_id:s.version_id,_expected_fingerprint:p.fingerprint});};
  let serial=0;
  const fixture=async(topic='1.1',published=true,difficulty='easy',metadata={})=>{
    const [s]=await rpc(admin,'save_question_bank_drafts',{_items:[{external_id:'SYNTHETIC-PRACTICE-'+(++serial),stem:'Synthetic: find $\\frac{d}{dx}x^2$.',solution:'Synthetic: $2x$ by the power rule.',difficulty,course_scope:'AB',primary_topic_code:topic,practice_skill_codes:['1.A'],representation_type:'analytical',calculator_policy:null,source_document:'Synthetic.pdf',source_page:'1',source_locator:'p001-item'+String(serial).padStart(2,'0'),requires_figure:topic==='1.2',image_url:topic==='1.2'?api+'/synthetic-figure.svg':null,...metadata,correct_option_key:'A',import_evidence:{ai_flags:['CALCULATOR_POLICY_UNCERTAIN'],human_review_status:'pending'},options:[{option_key:'A',option_text:'$2x$',is_correct:true,import_evidence:{}},{option_key:'B',option_text:'$x$',is_correct:false,import_evidence:{}}]}]});
    if(published)await publish(s);return s;
  };
  const t1=topics.find(t=>t.topic_code==='1.1'),t2=topics.find(t=>t.topic_code==='1.2'),empty=topics.find(t=>t.topic_code==='1.3');
  assert.deepEqual(await rpc(student,'list_question_practice_topics'),[]);
  const emptySession=await start(student);assert.equal(emptySession.questions.length,0);check('Zero published questions returns an actual empty session, not sample questions');
  const published=[];for(let i=0;i<7;i++)published.push(await fixture());for(let i=0;i<2;i++)await fixture('1.2');
  const draft=await fixture('1.1',false),withdrawn=await fixture(),archived=await fixture();
  const action=async(s,name)=>{const p=await precheck(s,name==='republish_question'?'republish':'publish');return rpc(admin,name,{_question_id:s.question_id,_version_id:s.version_id,_expected_fingerprint:p.fingerprint});};
  await action(withdrawn,'unpublish_question');await action(archived,'unpublish_question');await action(archived,'archive_question');
  const list=await rpc(student,'list_question_practice_topics');assert.equal(list.find(t=>t.code==='1.1').question_count,7);assert.equal(list.find(t=>t.code==='1.2').question_count,2);assert.equal(list.length,2);
  const session=await start(student,t1.id);assert.equal(session.questions.length,5);assert.equal(new Set(session.questions.map(q=>q.question_id)).size,5);safe(session);
  const small=await start(student,t2.id);assert.equal(small.questions.length,2);safe(small);assert.equal((await start(student,empty.id)).questions.length,0);
  const excluded=new Set([draft,withdrawn,archived].map(s=>s.question_id));assert.ok(session.questions.every(q=>!excluded.has(q.question_id)));check('Canonical Topic counts, max five distinct, fewer than five, draft/withdrawn/archive exclusion and safe delivery');
  const repeated=await Promise.all([start(student,t1.id,session.id),start(student,t1.id,session.id)]);assert.deepEqual(repeated[0],session);assert.deepEqual(repeated[1],session);
  await fail(other.rpc('get_question_practice',{_session_id:session.id}));await fail(other.rpc('start_question_practice',{_session_id:session.id}));
  await fail(student.rpc('start_question_practice',{_session_id:session.id,_topic_id:t2.id}));
  await fail(visitor.rpc('list_question_practice_topics'));await fail(visitor.rpc('start_question_practice',{_session_id:randomUUID()}));
  await fail(student.rpc('question_practice_snapshot',{_session_id:session.id}));await fail(student.rpc('question_practice_require_user'));
  assert.deepEqual(await ok(student.from('question_versions').select('id,solution')),[]);assert.deepEqual(await ok(student.from('question_options').select('id,is_correct')),[]);
  await fail(student.rpc('get_question_practice',{_session_id:randomUUID()}));check('Session ownership, scope consistency, anonymous and private helpers denied; raw answers retain admin-only RLS');
  const q=session.questions[0],oid=q.options.find(o=>o.key==='A').id;
  await fail(other.rpc('submit_question_practice',{_session_id:session.id,_question_id:q.question_id,_option_id:oid}));
  await fail(student.rpc('submit_question_practice',{_session_id:session.id,_question_id:draft.question_id,_option_id:oid}));
  await fail(student.rpc('submit_question_practice',{_session_id:session.id,_question_id:q.question_id,_option_id:small.questions[0].options[0].id}));
  await fail(student.rpc('submit_question_practice',{_session_id:session.id,_question_id:q.question_id,_option_id:oid,correct:true}));
  await fail(student.from('question_practice_attempts').insert({user_id:accounts[1].id,session_id:session.id,question_id:q.question_id,version_id:q.version_id,selected_option_id:oid,is_correct:true}));
  const results=await Promise.all([submit(student,session,q,oid),submit(student,session,q,oid)]);assert.deepEqual(results[0],results[1]);assert.equal(results[0].questions[0].attempt.is_correct,true);assert.match(results[0].questions[0].attempt.solution,/power rule/);
  const count=()=>scalar('SELECT count(*)::int result FROM public.question_practice_attempts WHERE session_id=$1 AND question_id=$2',[session.id,q.question_id]);assert.equal(await count(),1);
  await fail(student.rpc('submit_question_practice',{_session_id:session.id,_question_id:q.question_id,_option_id:q.options.find(o=>o.key==='B').id}));
  await fail(student.from('question_practice_attempts').update({is_correct:false}).eq('session_id',session.id));await fail(student.from('question_practice_attempts').delete().eq('session_id',session.id));
  const wrongQ=session.questions[1];const graded=await submit(student,session,wrongQ,wrongQ.options.find(o=>o.key==='B').id);assert.equal(graded.questions[1].attempt.is_correct,false);
  assert.equal((await rpc(student,'get_question_practice',{_session_id:session.id})).questions[0].attempt.id,results[0].questions[0].attempt.id);
  assert.equal((await rpc(student,'list_question_practice_attempts')).length,2);assert.deepEqual(await rpc(other,'list_question_practice_attempts'),[]);assert.deepEqual(await ok(other.from('question_practice_attempts').select('*')),[]);check('Server correct/wrong grading, immutable own attempts, account isolation, concurrent retries once, saved result readback');
  await (await import('./review.acceptance.mjs')).verifyReviewDatabase({db,start,submit,rpc,student,other,visitor,topicId:t2.id,check});
  await (await import('./profile.acceptance.mjs')).verifyProfileDatabase({db,start,submit,student,other,visitor,topicId:t2.id,check});
  // A database error after INSERT must roll back both grading and the saved attempt.
  await db.query("CREATE FUNCTION public.local_practice_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic transaction failure'; END $$; CREATE TRIGGER local_practice_fail AFTER INSERT ON public.question_practice_attempts FOR EACH ROW EXECUTE FUNCTION public.local_practice_fail();");
  const failureQ=session.questions[2];await fail(student.rpc('submit_question_practice',{_session_id:session.id,_question_id:failureQ.question_id,_option_id:failureQ.options[0].id}));assert.equal(await scalar('SELECT count(*)::int result FROM public.question_practice_attempts WHERE question_id=$1',[failureQ.question_id]),0);
  await db.query('DROP TRIGGER local_practice_fail ON public.question_practice_attempts; DROP FUNCTION public.local_practice_fail()');check('Injected server failure atomically rolls back attempt and grading');
  // Issue v1, then publish v2 with the other answer. The issued item must remain bound to v1.
  const original=published.find(p=>p.question_id===failureQ.question_id);const state=await precheck(original);
  const revision=await rpc(admin,'save_question_bank_revision',{_question_id:original.question_id,_source_version_id:original.version_id,_expected_fingerprint:state.fingerprint,_metadata:{difficulty:'medium',calculator_policy:null,course_scope:'AB',representation_type:'analytical',primary_topic_code:'1.1',practice_skill_codes:['1.A'],source_page:'1',source_locator:'p001-item01'}});
  const newV=revision.version_id??revision.id;assert.ok(newV,JSON.stringify(revision));
  await db.query("UPDATE public.question_options SET is_correct=(option_key='B') WHERE question_version_id=$1",[newV]);
  await publish({question_id:original.question_id,version_id:newV});
  const retained=await submit(student,session,failureQ,failureQ.options.find(o=>o.key==='A').id);assert.equal(retained.questions[2].version_id,original.version_id);assert.equal(retained.questions[2].attempt.is_correct,true);
  const revisionSets=[await start(student,t1.id),await start(student,t1.id)];assert.equal(revisionSets.flatMap(s=>s.questions).find(q=>q.question_id===original.question_id)?.version_id,newV);check('Published revision does not change the answer or identity of an already issued version');
  await (await import('./practice-selection.acceptance.mjs')).verifyRandomSelection({db,fixture,topics,start,student,other,rpc,safe,check});
  // Prove the v2 forward package works without deploying v1, then roll back this rehearsal.
  const directV2Package=read('docs/question-bank/production/adaptation-v2/10_deploy.sql').replace('BEGIN;\n','').replace(/\nCOMMIT;\n$/, '\n');
  await db.query('BEGIN;'+directV2Package);
  assert.equal((await db.query(read('docs/question-bank/production/adaptation-v2/20_verify_readonly.sql'))).rows[0].adaptation_verification.all_checks_pass,true);
  await db.query("SELECT set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:accounts[1].id,role:'authenticated'})]);
  assert.equal((await db.query('SELECT public.start_question_practice($1,$2) AS session',[randomUUID(),t1.id])).rows[0].session.adaptation_summary.rule_version,'practice-adaptation-v2');
  await db.query('ROLLBACK');
  check('Adaptation v2: random-only database upgrades directly without replaying the optional v1 migration');
  await db.query(read('docs/question-bank/production/practice-selection/20_adaptive_deploy.sql'));
  assert.equal((await db.query(read('docs/question-bank/production/practice-selection/21_adaptive_verify.sql'))).rows[0].practice_selection_verification.all_checks_pass,true);
  await assert.rejects(db.query(read('docs/question-bank/production/practice-selection/20_adaptive_deploy.sql')),/already recorded/);await db.query('ROLLBACK');
  await db.query("NOTIFY pgrst,'reload schema'");
  assert.equal((await rpc(student,'get_question_practice',{_session_id:session.id})).selection_summary,null);
  await (await import('./practice-selection.acceptance.mjs')).verifyTopicAdaptation({db,fixture,topics,start,student,other,rpc,submit,check,admin,precheck,publish});
  await db.query(read('docs/question-bank/production/adaptation-v2/10_deploy.sql'));
  const v2Verification=(await db.query(read('docs/question-bank/production/adaptation-v2/20_verify_readonly.sql'))).rows[0].adaptation_verification;
  assert.equal(v2Verification.all_checks_pass,true,JSON.stringify(v2Verification));
  await assert.rejects(db.query(read('docs/question-bank/production/adaptation-v2/10_deploy.sql')),/already recorded/);await db.query('ROLLBACK');
  await db.query("NOTIFY pgrst,'reload schema'");
  await wait(async()=>!(await student.rpc('get_question_practice_analysis',{})).error);
  const v2Fixture=await (await import('./adaptation-v2.acceptance.mjs')).verifyAdaptationV2({db,fixture,topics,start,student,other,visitor,admin,rpc,safe,check,precheck,publish});
  let realRows=[];
  if(process.env.O2I_ACCEPTANCE_XLSX){
    const b=readFileSync(process.env.O2I_ACCEPTANCE_XLSX),sheets=await parseQuestionBankWorkbook(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));
    const validated=validateQuestionBankSheets(sheets,{topicCodes:new Set(topics.map(t=>t.topic_code)),practiceSkillCodes:new Set(skills.map(s=>s.skill_code))});
    const plan=buildQuestionBankDraftSavePlan(validated,{topics,skills,existingExternalIds:new Set()});assert.equal(plan.payload.length,8);assert.equal(plan.canSave,true);
    const saved=await rpc(admin,'save_question_bank_drafts',{_items:plan.payload});
    for(const s of saved){
      const v=(await db.query('SELECT * FROM public.question_versions WHERE id=$1',[s.version_id])).rows[0],p=plan.payload.find(p=>p.external_id===s.external_id)??plan.payload[saved.indexOf(s)];
      const options=(await db.query('SELECT id,option_key AS key,option_text AS text FROM public.question_options WHERE question_version_id=$1 ORDER BY order_index',[v.id])).rows;
      assert.equal(v.stem,p.stem);assert.equal(v.difficulty,p.difficulty);assert.equal(v.calculator_policy,p.calculator_policy);assert.equal(v.course_scope,p.course_scope);assert.equal(options.length,4);assert.deepEqual(options.map(o=>o.text),p.options.map(o=>o.option_text));assert.equal(v.status,'draft');
      const t=topics.find(t=>t.id===v.primary_topic_id);assert.equal(t.topic_code,p.primary_topic_code);
      const codes=(await db.query('SELECT s.skill_code FROM public.question_practice_skills p JOIN public.curriculum_practice_skills s ON s.id=p.practice_skill_id WHERE p.question_version_id=$1 ORDER BY s.skill_code',[v.id])).rows.map(r=>r.skill_code);assert.deepEqual(codes,[...p.practice_skill_codes].sort());
      realRows.push({question_id:s.question_id,version_id:v.id,position:1,stem:v.stem,image_url:v.image_url,requires_figure:v.requires_figure,difficulty:v.difficulty,calculator_policy:v.calculator_policy,course_scope:v.course_scope,topic:{id:t.id,code:t.topic_code,title:t.title},skills:codes,options,attempt:null});
    }
    assert.equal(realRows.length,8);const afterReal=await start(student);assert.ok(afterReal.questions.every(q=>!realRows.some(r=>r.question_id===q.question_id)));
    check('Real workbook: all eight drafts / 32 options, canonical labels and formula text round-trip through actual local save RPC; never published or issued');
  }
  vite=spawn(process.execPath,[resolve(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(appPort),'--strictPort'],{cwd:root,env:{...process.env,VITE_LOCAL_SUPABASE_URL:api,VITE_LOCAL_SUPABASE_ANON_KEY:anon},stdio:'ignore'});await wait(async()=> (await fetch(app)).ok);
  browser=await chromium.launch({headless:true,executablePath:process.env.O2I_CHROME_EXECUTABLE??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  context=await browser.newContext({viewport:{width:1280,height:960}});context.setDefaultTimeout(20000);
  const remote=[];let startRequests=0;const safeResponses=[];
  await context.route('**/*',async route=>{const u=new URL(route.request().url());if(!['127.0.0.1','localhost'].includes(u.hostname)){remote.push(u.hostname);return route.abort();}if(u.pathname.endsWith('/start_question_practice'))startRequests++;return route.continue();});
  page=await context.newPage();page.on('response',async res=>{if(res.url().endsWith('/start_question_practice')&&res.ok())safeResponses.push(await res.json());});
  const login=async n=>{await page.goto(app+'/auth');await page.locator('input[name="email"]').first().fill(accounts[n].email);await page.locator('input[name="password"]').first().fill(testPassword);await page.getByRole('button',{name:'Sign In',exact:true}).click();await page.waitForURL(app+'/');};
  await page.goto(app+'/practice');await page.getByText('Sign in to start practice and read your saved answers.',{exact:true}).waitFor();await login(1);
  await page.evaluate(()=>localStorage.setItem('o2i-learning-prototype-v1',JSON.stringify({attempts:[{id:'FAKE_LOCALSTORAGE',correct:true,skillIds:[],misconceptionTags:[],overTarget:false}]})));
  await page.goto(app+'/practice');await page.getByRole('heading',{name:'Choose a published Topic'}).waitFor();assert.equal(await page.getByText('FAKE_LOCALSTORAGE').count(),0);
  const browserSession=randomUUID();await page.goto(app+'/quiz?topic='+t2.id+'&session='+browserSession);await page.getByRole('heading',{name:'Question 1 of 2'}).waitFor();await page.getByLabel('Saved question labels').waitFor();assert.equal(await page.getByLabel('Saved answer',{exact:true}).count(),0);assert.equal(await page.getByText('Correct answer:',{exact:false}).count(),0);
  await wait(()=>safeResponses.length);safe(safeResponses.at(-1));assert.ok(await page.locator('.katex').count());await page.getByRole('img',{name:'Question figure',exact:true}).waitFor();assert.ok(await page.getByRole('img',{name:'Question figure',exact:true}).evaluate(img=>img.complete&&img.naturalWidth>0));await page.getByLabel('Selection rationale').filter({hasText:'Building your practice history'}).waitFor();await shot('01-safe-question');
  // The first failure is before the database request; do not display a saved result.
  await page.route('**/rpc/submit_question_practice_v2',r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Synthetic server unavailable'})}));
  await page.getByRole('button',{name:'Option A',exact:true}).click();await page.getByRole('button',{name:'Submit answer',exact:true}).click();await page.getByRole('alert').filter({hasText:'Save could not be confirmed'}).waitFor();assert.equal(await page.getByText('Saved to your account',{exact:false}).count(),0);assert.equal(await scalar('SELECT count(*)::int result FROM public.question_practice_attempts WHERE session_id=$1',[browserSession]),0);
  await shot('02-save-failure');await page.unroute('**/rpc/submit_question_practice_v2');
  await page.getByRole('button',{name:'Retry submission',exact:true}).click();await page.getByRole('region',{name:'Saved answer',exact:true}).waitFor();assert.equal(await scalar('SELECT count(*)::int result FROM public.question_practice_attempts WHERE session_id=$1',[browserSession]),1);await shot('03-saved-answer');
  await page.getByRole('button',{name:'Next question',exact:true}).click();await page.getByRole('heading',{name:'Question 2 of 2'}).waitFor();
  // A committed answer with a lost response is recovered by the read-only result RPC.
  await page.route('**/rpc/submit_question_practice_v2',async route=>{await route.fetch();await route.abort('failed');});await page.getByRole('button',{name:'Option B',exact:true}).click();await page.getByRole('button',{name:'Submit answer',exact:true}).click();await page.getByRole('button',{name:'Check saved answer',exact:true}).waitFor();assert.equal(await page.getByText('Saved to your account',{exact:false}).count(),0);
  await page.unroute('**/rpc/submit_question_practice_v2');await page.getByRole('button',{name:'Check saved answer',exact:true}).click();await page.getByRole('region',{name:'Saved answer',exact:true}).waitFor();await page.getByRole('button',{name:'Finish practice',exact:true}).click();await page.getByRole('heading',{name:'Practice complete'}).waitFor();assert.equal(await scalar('SELECT count(*)::int result FROM public.question_practice_attempts WHERE session_id=$1',[browserSession]),2);
  await page.reload();await page.getByRole('heading',{name:'Practice complete'}).waitFor();assert.equal(await page.getByRole('region',{name:'Saved answer',exact:true}).count(),2);
  await page.goto(app+'/practice');await page.getByRole('heading',{name:'Recent account answers'}).waitFor();await page.locator(`a[href="/quiz?session=${browserSession}"]`).first().waitFor();await shot('04-account-history');check('Browser real authenticated practice, safe network response, correct/wrong results, server failure/retry, lost response lookup and refresh/account history');
  await (await import('./review.acceptance.mjs')).verifyReviewBrowser({page,context,app,start,submit,rpc,student,topicId:t2.id,browserSession,check,shot});
  await (await import('./profile.acceptance.mjs')).verifyProfileBrowser({page,context,app,db,start,student,other,login,topicId:t2.id,check,shot});
  const before=startRequests;await page.goto(app+'/quiz?subject=calculus&lesson=limits&source=lesson');await page.getByRole('heading',{name:'This practice scope is not connected'}).waitFor();assert.equal(startRequests,before);
  await page.goto(app+'/learn/limits-foundations');await page.waitForURL(app+'/courses');await page.getByRole('heading',{name:'Math Courses',exact:true}).waitFor();assert.equal(startRequests,before);
  await page.goto(app+'/review');await page.getByRole('link',{name:'Choose published practice',exact:true}).waitFor();assert.equal(await page.getByRole('link',{name:'Choose published practice',exact:true}).getAttribute('href'),'/practice');
  await page.goto(app+'/quiz?topic='+empty.id);await page.getByRole('heading',{name:'No published questions in this practice scope'}).waitFor();check('Legacy Learn redirects to Courses, Lesson filters explicitly refused; Review goes to canonical Topic selection; zero-topic quiz has real empty state');
  // Render the real saved draft projection only in a local browser fixture. This is not publication.
  for(const [i,row] of realRows.entries()){
    const id=randomUUID();await page.route('**/rpc/start_question_practice',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({id,topic_id:row.topic.id,created_at:new Date().toISOString(),questions:[row]})}));
    await page.goto(app+'/quiz?session='+id);await page.getByRole('heading',{name:'Question 1 of 1'}).waitFor();assert.equal(await page.getByRole('button',{name:/^Option [A-D]$/}).count(),4);await page.getByLabel('Saved question labels').filter({hasText:row.topic.code}).waitFor();assert.equal(await page.locator('.katex-error').count(),0);assert.ok(await page.locator('.katex').count(),'Real question math must actually render');assert.equal(await page.getByRole('region',{name:'Saved answer',exact:true}).count(),0);
    assert.equal(await page.getByLabel('Question content').innerText().then(s=>s.length>0),true);if(i===3)await shot('05-real-question-4-render-fixture');await page.unroute('**/rpc/start_question_practice');
  }
  if(realRows.length)check('All eight real saved draft projections render four options, readonly labels and math in Quiz (local UI fixture only; no real publication or grading)');
  await (await import('./review.acceptance.mjs')).verifyReviewAccountSwitch({page,context,app,other,login,browserSession,check});
  await page.goto(app+'/practice');await page.getByRole('button',{name:'Sign Out',exact:true}).click();await page.getByRole('link',{name:'Sign In / Sign Up',exact:true}).waitFor();await page.goto(app+'/practice');await page.getByText('Sign in to start practice and read your saved answers.',{exact:true}).waitFor();assert.equal(await page.locator(`a[href="/quiz?session=${browserSession}"]`).count(),0);
  await login(2);await page.goto(app+'/practice');await page.getByText('Your saved answers will appear here after you submit a published question.',{exact:true}).waitFor();await page.goto(app+'/quiz?session='+browserSession);await page.getByRole('alert').filter({hasText:'not available to your account'}).waitFor();assert.equal(await page.getByText('Saved to your account',{exact:false}).count(),0);
  await page.goto(app+'/quiz?topic='+t2.id);await page.getByRole('heading',{name:'Question 1 of 2'}).waitFor();await page.setViewportSize({width:390,height:844});await shot('06-mobile');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.ok(remote.every(host=>host==='storage.googleapis.com'),'Unexpected non-loopback backend request');report.blockedExternalHosts=[...new Set(remote)];check('Logout/account switch removes prior account data; another account cannot resume it; mobile layout and loopback-only network');
  await (await import('./adaptation-v2-browser.acceptance.mjs')).verifyAdaptationV2Browser({page,app,db,login,student,topics,v2Fixture,check,shot,userId:accounts[1].id});
} catch(error){if(page)await page.screenshot({path:resolve(output,'failure.png')}).catch(()=>{});report.error=redact(error.stack??error);console.error(report.error);process.exitCode=1;}
finally {
  if(browser)await browser.close().catch(()=>{});if(vite&&vite.exitCode===null){vite.kill('SIGTERM');await new Promise(r=>vite.once('exit',r));}if(proxy){proxy.closeAllConnections();await new Promise(r=>proxy.close(r));}if(db)await db.end().catch(()=>{});
  for(const name of created.reverse()){const info=JSON.parse(docker(['inspect',name]))[0];assert.equal(info.Config.Labels['o2i.purpose'],'student-practice');docker(['rm','-f',name]);}if(networkCreated)docker(['network','rm',network]);
  report.cleanup=true;writeFileSync(resolve(output,'results.json'),JSON.stringify(report,null,2),{mode:0o600});console.log('Completed '+report.checks.length+' checks; local containers removed.');
}
