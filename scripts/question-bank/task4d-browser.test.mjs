import { legacyFixtureAccessSql } from '../admin-access/legacy-fixture-access.mjs';
// Opt-in real Auth + PostgREST + PostgreSQL acceptance. NEVER uses an existing database.
// O2I_PLAYWRIGHT_MODULE points to the locally installed Playwright entrypoint.
// O2I_SYNTHETIC_XLSX is an existing synthetic-only intake fixture, never a real question file.
// O2I_ACCEPTANCE_XLSX optionally enables real-file draft-only checks; content is not committed.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { parseQuestionBankWorkbook, validateQuestionBankSheets } from '../../src/lib/questionBankImport.ts';
import { buildQuestionBankDraftSavePlan } from '../../src/lib/questionBankDraftSave.ts';
import { loadQuestionBankPage, loadQuestionBankVersionPreview } from '../../src/lib/questionBankDraftRepository.ts';
import { loadPublicationPlan } from '../../src/lib/questionBankPublicationWorkflow.ts';
import { verifyManualQuestionBrowser } from './manual-entry.acceptance.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
assert.equal(process.cwd(),root.replace(/\/$/,''),'Run only from the repository root');
const synthetic=process.env.O2I_SYNTHETIC_XLSX, real=process.env.O2I_ACCEPTANCE_XLSX;
assert.ok(synthetic&&existsSync(synthetic),'Provide an existing synthetic-only XLSX fixture');
const {chromium}=await import(process.env.O2I_PLAYWRIGHT_MODULE??'playwright');
const output=resolve(root,'.task4d-browser.local');
mkdirSync(output,{recursive:true,mode:0o700});
execFileSync('git',['check-ignore','--quiet',output],{cwd:root});
const read=path=>readFileSync(resolve(root,path),'utf8');
const prefix=`o2i-task4d-${process.pid}`, network=prefix+'-net';
const dbPort=55442,authPort=55443,restPort=55444,apiPort=55445,appPort=5184;
const api=`http://127.0.0.1:${apiPort}`,app=`http://127.0.0.1:${appPort}`;
const password=randomBytes(32).toString('hex'),jwtSecret=randomBytes(48).toString('hex'),testPassword=randomBytes(24).toString('base64url')+'aA1!';
const jwt=role=>{const body=[{alg:'HS256',typ:'JWT'},{iss:'supabase',role,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+7200}].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.');return body+'.'+createHmac('sha256',jwtSecret).update(body).digest('base64url');};
const anon=jwt('anon'),service=jwt('service_role');
const secrets=[password,jwtSecret,testPassword,service];
const redact=value=>secrets.reduce((s,key)=>s.replaceAll(key,'[redacted]'),String(value));
const docker=args=>{try{return execFileSync('docker',args,{encoding:'utf8',stdio:['pipe','pipe','pipe']});}catch(e){throw new Error(redact(e.stderr??e.message));}};
const created=[];let networkCreated=false,db,browser,context,page,proxy,vite;
const report={checks:[],realWorkbook:real?'pending':'not supplied',cleanup:false};
const remoteRequests=[],writeRequests=[],draftSaveRequests=[];
const check=name=>{report.checks.push(name);console.log('PASS '+name);};
const fn=(sql,name)=>{const match=sql.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?AS \\$\\$[\\s\\S]*?\\$\\$[^;]*;`));assert.ok(match);return match[0];};
const wait=async operation=>{let last;for(let i=0;i<160;i++){try{const value=await operation();if(value)return value;}catch(e){last=e;}await new Promise(r=>setTimeout(r,250));}throw new Error('Local service did not become ready: '+redact(last?.message??'timeout'));};
const scalar=async(sql,args=[])=>(await db.query(sql,args)).rows[0]?.result??null;
const state=async()=>scalar(`SELECT jsonb_build_object('questions',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM public.questions t),
 'versions',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM public.question_versions t),
 'options',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM public.question_options t),
 'skills',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY question_version_id,practice_skill_id),'[]') FROM public.question_practice_skills t),
 'reviews',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM public.question_version_reviews t),
 'events',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM public.question_publication_events t)) result`);
const parse=async path=>{const b=readFileSync(path);return parseQuestionBankWorkbook(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));};
const questionState=async id=>scalar('SELECT to_jsonb(q) result FROM public.questions q WHERE external_id=$1',[id]);
const questionVersions=async id=>(await db.query('SELECT v.* FROM public.question_versions v JOIN public.questions q ON q.id=v.question_id WHERE q.external_id=$1 ORDER BY version_number',[id])).rows;
const shot=async name=>page.screenshot({path:resolve(output,name+'.png'),fullPage:false});
const openBank=async()=>{
  if(page.url()!==app+'/admin')await page.goto(app+'/admin');
  await page.getByRole('tab',{name:'Question Bank',exact:true}).click();
  await page.getByRole('button',{name:'Refresh saved drafts',exact:true}).click();
  await page.getByRole('button',{name:'Refresh published problems',exact:true}).click();
  await page.getByText('Loading saved drafts…',{exact:true}).waitFor({state:'hidden'});
};
const card=(id,kind='Saved drafts')=>page.getByRole('region',{name:kind,exact:true}).getByRole('article',{name:'Problem '+id,exact:true});
const dialog=()=>page.getByRole('dialog');
const selectFixture=async path=>{await page.getByLabel('Choose question bank XLSX').setInputFiles(path);await page.getByRole('button',{name:/^Save \d+ drafts$/}).waitFor();};
const saveImport=async()=>{await page.getByRole('button',{name:/^Save \d+ drafts$/}).click();await page.getByText(/Saved \d+ unpublished drafts\. Nothing was approved or published\./).waitFor();};
const closeEditor=async()=>{await dialog().getByRole('button',{name:'Cancel',exact:true}).click();};
const confirmation=()=>dialog().getByRole('checkbox',{name:/I have checked the selected problems/});
const fillReview=async()=>{
  await confirmation().waitFor();assert.equal(await confirmation().isChecked(),false);
  assert.equal(await dialog().getByRole('button',{name:/^Publish \d+ problems$/}).isEnabled(),false);
  assert.equal(await dialog().locator('input:not([type=checkbox]),select,textarea').count(),0);
  assert.equal(await dialog().getByText(/TAXONOMY_UNCERTAIN|DIFFICULTY_UNCERTAIN|CALCULATOR_POLICY_UNCERTAIN|Original import evidence|Source and original AI information/).count(),0);
  await confirmation().check();
};
const finishPublish=async(n=1)=>{
  const count=writeRequests.filter(name=>name==='publish_question_versions').length;
  await dialog().getByRole('button',{name:`Publish ${n} problems`,exact:true}).evaluate(button=>{button.click();button.click();});
  await page.getByText(new RegExp(`Published ${n} problems? and verified`)).waitFor();
  assert.equal(writeRequests.filter(name=>name==='publish_question_versions').length,count+1,'Double clicks must send one publication RPC');
};
const publishOne=async id=>{await card(id).getByRole('button',{name:'Publish',exact:true}).click();await dialog().getByText('Maximum 20 per atomic batch.',{exact:false}).waitFor();
  await fillReview();await finishPublish();};

try {
  console.log('Starting isolated local Auth, REST and PostgreSQL; no existing database is used.');
  // Docker Desktop does not publish host ports for an --internal network.
  // Dedicated bridge + loopback-only bindings; browser rejects every non-loopback request.
  docker(['network','create','--label','o2i.purpose=task4d-browser',network]);networkCreated=true;
  const run=(name,image,args=[])=>{docker(['run','--pull','never','-d','--name',name,'--network',network,'--label','o2i.purpose=task4d-browser',...args,image]);created.push(name);};
  const dbName=prefix+'-db';run(dbName,'public.ecr.aws/supabase/postgres:17.11.0.002',['--tmpfs','/var/lib/postgresql/data:rw','-p',`127.0.0.1:${dbPort}:5432`,'-e',`POSTGRES_PASSWORD=${password}`]);
  await wait(()=>docker(['exec',dbName,'pg_isready','-h','127.0.0.1','-U','supabase_admin']).includes('accepting connections'));
  docker(['exec',dbName,'psql','-U','supabase_admin','-d','postgres','-c',`ALTER ROLE postgres PASSWORD '${password}'; ALTER ROLE supabase_auth_admin PASSWORD '${password}'; ALTER ROLE authenticator PASSWORD '${password}';`]);
  db=await wait(async()=>{const c=new pg.Client({host:'127.0.0.1',port:dbPort,database:'postgres',user:'postgres',password,connectionTimeoutMillis:1000});
    try{await c.connect();await c.query('SELECT 1');return c;}catch(error){await c.end().catch(()=>{});throw error;}});
  proxy=createServer(async(req,res)=>{
    res.setHeader('Access-Control-Allow-Origin',app);res.setHeader('Access-Control-Allow-Headers','authorization,apikey,content-type,x-client-info,prefer,range,accept-profile,content-profile,x-supabase-api-version');
    res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,DELETE,OPTIONS');res.setHeader('Access-Control-Expose-Headers','Content-Range');
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
    ${fn(read('supabase/migrations/20260920000000_content_admin_roles.sql'),'is_super_admin')} ${legacyFixtureAccessSql()}
    ${fn(read('supabase/migrations/20250910020036_7f5646ab-55d4-4412-823b-b244048be7ba.sql'),'update_updated_at_column')}
    ${taxonomy.slice(taxonomy.indexOf('CREATE TABLE public.curriculum_frameworks'),taxonomy.indexOf('-- Reuse the two existing AP Calculus course records'))}`);
  for(const migration of ['20260926000000_question_bank_foundation','20261004000000_question_bank_draft_import','20261018000000_question_bank_draft_management','20261019000000_question_bank_unpublished_status','20261019010000_question_bank_publication'])await db.query('BEGIN;'+read('supabase/migrations/'+migration+'.sql')+'COMMIT;');
  run(prefix+'-rest','public.ecr.aws/supabase/postgrest:v16.4',['-p',`127.0.0.1:${restPort}:3000`,'-e',`PGRST_DB_URI=postgres://authenticator:${password}@${dbName}:5432/postgres`,'-e','PGRST_DB_SCHEMAS=public','-e','PGRST_DB_ANON_ROLE=anon','-e',`PGRST_JWT_SECRET=${jwtSecret}`]);
  await wait(async()=> (await fetch(api+'/rest/v1/')).ok);
  const serviceClient=createClient(api,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const accounts=[];
  for(const role of ['admin','student']){
    const {data,error}=await serviceClient.auth.admin.createUser({email:`task4d-${process.pid}-${role}@example.test`,password:testPassword,email_confirm:true});assert.ifError(error);accounts.push({role,id:data.user.id,email:data.user.email});
    await db.query('INSERT INTO public.user_roles(user_id,role) VALUES($1,$2)',[data.user.id,role]);
    await db.query('INSERT INTO public.profiles(user_id,full_name,email,role) VALUES($1,$2,$3,$4)',[data.user.id,'Disposable Task 4D',data.user.email,role]);
  }
  const admin=createClient(api,anon,{auth:{persistSession:false,autoRefreshToken:false}});assert.ifError((await admin.auth.signInWithPassword({email:accounts[0].email,password:testPassword})).error);
  const topics=(await admin.from('curriculum_topics').select('id,topic_code,title')).data,skills=(await admin.from('curriculum_practice_skills').select('id,skill_code,description')).data;
  assert.equal(topics.length,111);assert.equal(skills.length,23);check('Actual local migrations and canonical 111 Topics / 23 Skills loaded');
  let realAudit;
  if(real){
    const oldSheets=await parse(real),oldReport=validateQuestionBankSheets(oldSheets,{topicCodes:new Set(topics.map(t=>t.topic_code)),practiceSkillCodes:new Set(skills.map(s=>s.skill_code))});
    const oldPlan=buildQuestionBankDraftSavePlan(oldReport,{topics,skills,existingExternalIds:new Set()});
    assert.equal(oldPlan.payload.length,8);assert.equal(oldPlan.canSave,true);
    const raw=process.env.O2I_RAW_AUDIT_JSON?JSON.parse(readFileSync(process.env.O2I_RAW_AUDIT_JSON,'utf8')):null;
    realAudit=oldReport.questions.map(q=>{
      const payload=oldPlan.payload.find(p=>p.external_id===q.externalId);
      const parsed={external_id:q.externalId,source_question_number:q.sourceQuestionNumber||null,difficulty:q.difficulty,
        calculator_policy:q.calculatorPolicy||null,course_scope:q.courseScope,primary_topic_code:q.primaryTopicCode,practice_skill_codes:q.practiceSkillCodes,
        source_document:q.sourceDocument,source_page:q.sourcePage,source_locator:q.sourceLocator||null,ai_flags:q.aiFlags,human_review_notes:q.humanReviewNotes};
      const savedPayload=Object.fromEntries(Object.keys(parsed).map(k=>[k,payload[k]??payload.import_evidence[k]??null]));
      assert.deepEqual(savedPayload,parsed);
      const source=raw?.questions.find(r=>r.external_id===q.externalId);
      if(raw)assert.deepEqual(parsed,source,'Raw XLSX cells must match parsed data and save payload');
      return {number:q.sourceQuestionNumber,raw:source,parsed,payload:savedPayload};
    });

    assert.ifError((await admin.rpc('save_question_bank_drafts',{_items:oldPlan.payload})).error);
  }
  const oldState=await state();
  await db.query('BEGIN;'+read('supabase/migrations/20261020000000_question_bank_simple_publication.sql')+'COMMIT;');
  assert.deepEqual(await state(),oldState);check('New migration preserves pre-existing drafts and original evidence without reimport');
  if(realAudit){
    const items=(await loadQuestionBankPage(admin,'drafts',0,100)).items;
    for(const row of realAudit){
      const item=items.find(i=>i.externalId===row.parsed.external_id),v=(await questionVersions(item.externalId))[0];
      const view=await loadQuestionBankVersionPreview(admin,item),[plan]=await loadPublicationPlan(admin,item);
      const readback={external_id:item.externalId,source_question_number:v.source_question_number,difficulty:v.difficulty,calculator_policy:v.calculator_policy,
        course_scope:v.course_scope,primary_topic_code:item.topicCode,practice_skill_codes:item.practiceSkillCodes,source_document:v.source_document,
        source_page:String(v.source_page),source_locator:v.source_locator,ai_flags:v.import_evidence.ai_flags,human_review_notes:v.import_evidence.human_review_notes};
      assert.deepEqual(readback,row.parsed);row.readback=readback;
      for(const meta of [item,view,plan.item]){
        assert.equal(meta.difficulty,row.parsed.difficulty);assert.equal(meta.calculatorPolicy,row.parsed.calculator_policy);
        assert.equal(meta.courseScope,row.parsed.course_scope);assert.equal(meta.topicCode,row.parsed.primary_topic_code);assert.deepEqual(meta.practiceSkillCodes,row.parsed.practice_skill_codes);
      }
      assert.deepEqual(view.evidence.ai_flags,row.parsed.ai_flags);assert.deepEqual(plan.check.issues.map(i=>i.code),['QB_REVIEW_REQUIRED']);
    }
    writeFileSync(resolve(output,'real-metadata-audit.json'),JSON.stringify(realAudit,null,2));
    check('All eight raw XLSX metadata rows match parser, payload, local database and exact-version preview/plan readback');
  }


  const syntheticSheets=await parse(synthetic),syntheticReport=validateQuestionBankSheets(syntheticSheets);
  assert.equal(syntheticReport.questions.length,1);assert.match(syntheticReport.questions[0].externalId,/^synthetic-/i);const synthId=syntheticReport.questions[0].externalId;
  vite=spawn(process.execPath,[resolve(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(appPort),'--strictPort'],{cwd:root,env:{...process.env,VITE_LOCAL_SUPABASE_URL:api,VITE_LOCAL_SUPABASE_ANON_KEY:anon},stdio:'ignore'});
  await wait(async()=> (await fetch(app)).ok);
  browser=await chromium.launch({headless:true,...(process.env.O2I_CHROME_EXECUTABLE?{executablePath:process.env.O2I_CHROME_EXECUTABLE}:{})});
  context=await browser.newContext({viewport:{width:1280,height:960}});context.setDefaultTimeout(20000);
  await context.route('**/*',route=>{
    const u=new URL(route.request().url());if(!['127.0.0.1','localhost'].includes(u.hostname)){if(u.hostname.includes('supabase'))remoteRequests.push(u.hostname);return route.abort();}
    if(u.origin===api&&u.pathname==='/rest/v1/rpc/save_question_bank_drafts'&&route.request().method()==='POST')draftSaveRequests.push(route.request().postDataJSON()._items);
    if(u.origin===api&&u.pathname.startsWith('/rest/v1/rpc/')&&!['has_role','is_super_admin','get_admin_access','has_admin_module','get_question_bank_draft','get_question_publication_state','precheck_question_publication'].includes(u.pathname.split('/').at(-1)))writeRequests.push(u.pathname.split('/').at(-1));
    return route.continue();
  });
  page=await context.newPage();await page.goto(app+'/auth');await page.locator('input[name="email"]').first().fill(accounts[0].email);await page.locator('input[name="password"]').first().fill(testPassword);
  await page.getByRole('button',{name:'Sign In',exact:true}).click();await page.waitForURL(app+'/');await openBank();assert.deepEqual(remoteRequests,[]);check('Real local .test admin login; browser uses loopback Supabase only');
  // Full lifecycle on synthetic content, not fictional confirmations about real source questions.
  await verifyManualQuestionBrowser({page,context,api,db,state,selectFixture,synthetic,writeRequests,check,output});
  let before=await state();await selectFixture(synthetic);await page.getByRole('button',{name:'Cancel',exact:true}).click();assert.deepEqual(await state(),before);check('Upload preview and Cancel cause zero question-bank writes');
  assert.equal(syntheticReport.questions[0].calculatorPolicy,'','Regression fixture must start with a blank calculator policy');
  for(const policy of ['calculator_allowed','calculator_required']){
    await selectFixture(synthetic);await page.getByText('Adjust metadata',{exact:true}).click();
    const selector=page.getByLabel(synthId+' Calculator policy',{exact:true});
    assert.equal(await selector.inputValue(),'');await selector.selectOption(policy);assert.equal(await selector.inputValue(),policy);
    await saveImport();assert.equal((await questionState(synthId)).status,'draft');
    const payload=draftSaveRequests.at(-1).find(item=>item.external_id===synthId);
    assert.equal(payload.calculator_policy,policy);
    assert.ok(payload.import_evidence.manual_edits.some(edit=>edit.field==='calculator_policy'&&edit.before===''&&edit.after===policy));
    const v=(await questionVersions(synthId))[0];assert.equal(v.calculator_policy,policy);
    await page.reload();await openBank();
    const saved=(await loadQuestionBankPage(admin,'drafts',0,100)).items.find(item=>item.externalId===synthId);
    assert.equal(saved.versionId,v.id);assert.equal(saved.calculatorPolicy,policy);
    before=await state();await card(synthId).getByRole('button',{name:/^Edit /}).click();
    assert.equal(await dialog().getByLabel(synthId+' Calculator policy',{exact:true}).inputValue(),policy);await closeEditor();
    await card(synthId).getByRole('button',{name:'Publish',exact:true}).click();
    await dialog().getByLabel('Saved question metadata',{exact:true}).getByText(policy.replaceAll('_',' '),{exact:true}).waitFor();
    await closeEditor();assert.deepEqual(await state(),before);
    check('Blank XLSX calculator edited to '+policy+' survives final payload, save RPC, database, reload, exact working version, Edit and Publish');
    if(policy==='calculator_allowed'){
      await card(synthId).getByRole('button',{name:'Delete',exact:true}).click();
      await dialog().getByRole('button',{name:'Confirm deletion',exact:true}).click();await dialog().waitFor({state:'hidden'});
      assert.equal(await questionState(synthId),null);
    }
  }
  await openBank();await card(synthId).waitFor();check('Synthetic XLSX import, draft save, refresh and persistent list');
  before=await state();await card(synthId).getByRole('button',{name:/^Edit /}).click();await dialog().getByLabel(synthId+' Difficulty',{exact:true}).selectOption('hard');await closeEditor();assert.deepEqual(await state(),before);
  await card(synthId).getByRole('button',{name:/^Edit /}).click();await dialog().getByLabel(synthId+' Difficulty',{exact:true}).selectOption('hard');await dialog().getByRole('button',{name:'Save changes',exact:true}).click();await dialog().getByText('Changes saved and read back.',{exact:false}).waitFor();await closeEditor();
  assert.equal((await questionVersions(synthId))[0].difficulty,'hard');check('Draft metadata edit saves and reads back; edit Cancel writes nothing');
  before=await state();await card(synthId).getByRole('button',{name:'Publish',exact:true}).click();
  await dialog().getByText('Correct answer',{exact:true}).waitFor();
  assert.equal(await dialog().getByText('Question preview',{exact:true}).locator('..').getAttribute('open')!==null,true);
  await fillReview();
  const targetChoice=dialog().getByRole('article').getByRole('checkbox').first();
  await targetChoice.uncheck();assert.equal(await confirmation().isChecked(),false);
  await targetChoice.check();await fillReview();await closeEditor();assert.deepEqual(await state(),before);check('Publication review work copy and Cancel write nothing');
  await publishOne(synthId);await card(synthId,'Published problems').waitFor();const first=(await questionState(synthId)).current_version_id;assert.ok(first);const published=(await questionVersions(synthId))[0];assert.equal(published.calculator_policy,'calculator_required');assert.equal(published.source_type,null);assert.deepEqual(published.import_evidence.ai_flags,syntheticReport.questions[0].aiFlags);await shot('01-published');check('First publication uses real review and atomic publication RPCs');
  before=await state();await card(synthId,'Published problems').getByRole('button',{name:/^Edit /}).click();await dialog().getByLabel(synthId+' Difficulty',{exact:true}).selectOption('easy');await closeEditor();assert.deepEqual(await state(),before);check('Opening/cancelling published Edit creates no revision');
  await card(synthId,'Published problems').getByRole('button',{name:/^Edit /}).click();await dialog().getByLabel(synthId+' Difficulty',{exact:true}).selectOption('easy');await dialog().getByRole('button',{name:'Save changes',exact:true}).click();await dialog().getByText('Changes saved and read back.',{exact:false}).waitFor();await closeEditor();
  assert.equal((await questionState(synthId)).current_version_id,first);assert.equal((await questionVersions(synthId)).length,2);await card(synthId,'Published problems').getByText('Unpublished changes',{exact:false}).waitFor();check('Revision is created only on Save; old published pointer remains');
  before=await state();await card(synthId,'Published problems').getByRole('button',{name:'Unpublish',exact:true}).click();await dialog().getByRole('button',{name:'Confirm unpublish',exact:true}).waitFor();await closeEditor();assert.deepEqual(await state(),before);
  await card(synthId,'Published problems').getByRole('button',{name:'Unpublish',exact:true}).click();await dialog().getByRole('button',{name:'Confirm unpublish',exact:true}).click();await page.getByText('Problem unpublished.',{exact:false}).waitFor();assert.equal((await questionState(synthId)).current_version_id,first);assert.equal((await questionVersions(synthId)).length,2);check('Unpublish retains current approved version and working revision; Cancel writes nothing');
  await card(synthId).getByRole('button',{name:'Archive',exact:true}).click();await dialog().getByText('A working revision exists.',{exact:false}).waitFor();assert.equal(await dialog().getByRole('button',{name:'Confirm archive',exact:true}).isEnabled(),false);await closeEditor();
  await card(synthId).getByRole('button',{name:'Delete draft',exact:true}).click();await dialog().getByRole('button',{name:'Confirm deletion',exact:true}).click();await dialog().waitFor({state:'hidden'});assert.equal((await questionVersions(synthId)).length,1);assert.equal((await questionState(synthId)).current_version_id,first);check('Delete draft removes only working revision; Archive never silently deletes it');
  await card(synthId).getByText('Unpublished · Version',{exact:false}).waitFor();await publishOne(synthId);assert.equal((await questionState(synthId)).current_version_id,first);check('Withdrawn current approved version is listed and republished with one new explicit confirmation and retained history');
  await card(synthId,'Published problems').getByRole('button',{name:/^Edit /}).click();await dialog().getByLabel(synthId+' Difficulty',{exact:true}).selectOption('medium');await dialog().getByRole('button',{name:'Save changes',exact:true}).click();await dialog().getByText('Changes saved and read back.',{exact:false}).waitFor();await closeEditor();await publishOne(synthId);
  const history=await questionVersions(synthId);assert.equal(history.length,2);assert.equal(history[0].status,'superseded');assert.equal(history[1].status,'approved');assert.equal((await questionState(synthId)).current_version_id,history[1].id);check('Publishing a reviewed revision switches pointer and preserves superseded history');
  // Extra synthetic drafts for deletion, stale edits and atomic batch failure.
  const base=buildQuestionBankDraftSavePlan(validateQuestionBankSheets(syntheticSheets,{topicCodes:new Set(topics.map(t=>t.topic_code)),practiceSkillCodes:new Set(skills.map(s=>s.skill_code))}),{topics,skills,existingExternalIds:new Set()}).payload[0];assert.ok(base);
  const seed=async id=>{const {error}=await admin.rpc('save_question_bank_drafts',{_items:[{...base,external_id:id}]});assert.ifError(error);};
  await seed('SYNTHETIC-DELETE');await openBank();await card('SYNTHETIC-DELETE').getByRole('button',{name:'Delete',exact:true}).click();before=await state();await closeEditor();assert.deepEqual(await state(),before);
  await card('SYNTHETIC-DELETE').getByRole('button',{name:'Delete',exact:true}).click();await dialog().getByRole('button',{name:'Confirm deletion',exact:true}).click();await dialog().waitFor({state:'hidden'});assert.equal(await questionState('SYNTHETIC-DELETE'),null);check('Never-published Delete removes identity and exclusive records; Cancel writes nothing');
  await seed('SYNTHETIC-STALE');await openBank();await card('SYNTHETIC-STALE').getByRole('button',{name:/^Edit /}).click();await dialog().getByLabel('SYNTHETIC-STALE Difficulty',{exact:true}).selectOption('hard');
  const stale=(await questionVersions('SYNTHETIC-STALE'))[0];const latest=await admin.rpc('get_question_bank_draft',{_question_id:stale.question_id,_version_id:stale.id});assert.ifError(latest.error);
  const externalMeta={difficulty:'medium',calculator_policy:stale.calculator_policy,course_scope:stale.course_scope,representation_type:stale.representation_type,primary_topic_code:latest.data.topic_code,practice_skill_codes:latest.data.skill_codes,source_page:String(stale.source_page),source_locator:stale.source_locator};
  assert.ifError((await admin.rpc('update_question_bank_draft_metadata',{_question_id:stale.question_id,_version_id:stale.id,_expected_fingerprint:latest.data.fingerprint,_metadata:externalMeta})).error);
  await dialog().getByRole('button',{name:'Save changes',exact:true}).click();await dialog().getByRole('alert').waitFor();assert.equal(await dialog().getByLabel('SYNTHETIC-STALE Difficulty',{exact:true}).inputValue(),'hard');assert.equal((await questionVersions('SYNTHETIC-STALE'))[0].difficulty,'medium');await closeEditor();check('Real stale editing is rejected without overwriting another admin; local input retained');
  // Real workbook: draft-only acceptance. No claims of actual math/rights approval.
  if(real){assert.ok(existsSync(real));const bytes=readFileSync(real),hash=createHash('sha256').update(bytes).digest('hex');const sheets=await parse(real),r=validateQuestionBankSheets(sheets);assert.equal(r.questions.length,8);assert.equal(r.questions.reduce((n,q)=>n+q.options.length,0),32);
    await selectFixture(real);assert.ok(await page.getByRole('region',{name:'Preview and adjust',exact:true}).locator('.katex').count()>0);assert.ok(await page.getByRole('region',{name:'Preview and adjust',exact:true}).locator('.katex-display').count()>0);await shot('02-real-eight-preview');assert.equal(await page.getByRole('button',{name:'Save 8 drafts',exact:true}).isEnabled(),false);await page.getByRole('button',{name:'Cancel',exact:true}).click();
    for(const q of r.questions){const saved=await questionState(q.externalId),v=(await questionVersions(q.externalId))[0];assert.equal(saved.status,'draft');assert.equal(saved.current_version_id,null);assert.equal(v.status,'draft');assert.equal(v.stem,q.stem);assert.equal(v.solution,q.solution);assert.deepEqual(v.import_evidence.ai_flags,q.aiFlags);assert.equal(v.import_evidence.human_review_notes,q.humanReviewNotes);
      assert.equal(v.source_document,q.sourceDocument);assert.equal(v.source_page,Number(q.sourcePage.split('-')[0]));assert.equal(v.source_question_number,q.sourceQuestionNumber||null);assert.equal(v.source_locator,q.sourceLocator||null);
      const options=(await db.query('SELECT * FROM public.question_options WHERE question_version_id=$1 ORDER BY order_index',[v.id])).rows;assert.equal(options.length,q.options.length);
      for(const o of q.options){const saved=options.find(row=>row.option_key===o.key);assert.equal(saved.option_text,o.text);assert.equal(saved.is_correct,o.isCorrect);assert.equal(saved.import_evidence.option_explanation,o.explanation);}
    }
    const displayQuestion=r.questions.find(q=>q.solution.includes(String.fromCharCode(92)+'['));assert.ok(displayQuestion,'Real acceptance needs a representative display formula');
    await openBank();
    for(const q of r.questions){
      const preExisting=await state();await card(q.externalId).getByRole('button',{name:'Publish',exact:true}).click();
      await dialog().getByText('Correct answer',{exact:true}).waitFor();
      const summary=dialog().getByLabel('Saved question metadata',{exact:true});
      const value=label=>summary.getByText(label,{exact:true}).locator('..').locator('dd');
      assert.equal(await value('Difficulty').textContent(),q.difficulty);
      assert.equal(await value('Calculator policy').textContent(),q.calculatorPolicy?q.calculatorPolicy.replaceAll('_',' '):'Not specified (optional)');
      assert.equal(await value('AB/BC').textContent(),q.courseScope==='BOTH'?'AB & BC':q.courseScope);
      assert.ok((await value('Topic').textContent()).startsWith(q.primaryTopicCode+' · '));
      assert.equal(await value('Skills').textContent(),q.practiceSkillCodes.join(', '));
      assert.equal(await confirmation().isChecked(),false);assert.equal(await dialog().getByRole('alert').count(),0);
      assert.equal(await dialog().locator('input:not([type=checkbox]),select,textarea,pre').count(),0);
      assert.equal(await dialog().getByText(/UNCERTAIN|Original import evidence/).count(),0);
      await dialog().locator('summary').filter({hasText:/^Source details$/}).click();
      await dialog().getByText('Printed question number: '+q.sourceQuestionNumber+' · Locator: not provided',{exact:true}).waitFor();
      if(q.sourceQuestionNumber==='4'){
        await page.setViewportSize({width:1280,height:1440});await dialog().locator('summary').filter({hasText:/^Source details$/}).click();
        await shot('07-real-q004-publication-preview');await page.setViewportSize({width:1280,height:960});
      }
      await closeEditor();assert.deepEqual(await state(),preExisting);
    }
    check('All eight real drafts show saved read-only tags, default-open question/answer/solution and no flags or review fields; Cancel writes nothing');
    await card(displayQuestion.externalId).getByRole('button',{name:/^Preview /}).click();await dialog().getByText('Correct answer',{exact:true}).waitFor();await shot('03-real-saved-preview');
    await dialog().getByText('Original import evidence',{exact:true}).click();await dialog().getByText(/TAXONOMY_UNCERTAIN/).waitFor();
    await dialog().locator('summary').filter({hasText:/^Solution$/}).click();await dialog().locator('.katex-display').first().scrollIntoViewIfNeeded();await shot('03a-real-solution-formula');await dialog().getByRole('button',{name:'Close preview',exact:true}).click();
    await selectFixture(real);await page.getByText(/field issue\(s\) block draft saving/).waitFor();assert.equal(await page.getByRole('button',{name:'Save 8 drafts',exact:true}).isEnabled(),false);await page.getByRole('button',{name:'Cancel',exact:true}).click();
    assert.equal(createHash('sha256').update(readFileSync(real)).digest('hex'),hash);report.realWorkbook='8 questions / 32 options: preview, formulas, draft save/readback, evidence and duplicate block passed; not published';check('Real 8/32 XLSX saved only as drafts; original file unchanged, evidence retained, duplicate blocked');
  }
  const uncertaintyFlags=['TAXONOMY_UNCERTAIN','DIFFICULTY_UNCERTAIN','CALCULATOR_POLICY_UNCERTAIN'];
  assert.ifError((await admin.rpc('save_question_bank_drafts',{_items:[{...base,external_id:'SYNTHETIC-UNCERTAIN',difficulty:'medium',calculator_policy:'calculator_allowed',course_scope:'BOTH',import_evidence:{...base.import_evidence,ai_flags:uncertaintyFlags}}]})).error);
  await openBank();await card('SYNTHETIC-UNCERTAIN').getByRole('button',{name:'Publish',exact:true}).click();
  await dialog().getByText('Correct answer',{exact:true}).waitFor();
  await dialog().getByLabel('Saved question metadata',{exact:true}).getByText('calculator allowed',{exact:true}).waitFor();
  await shot('08-synthetic-complete-publication-preview');await fillReview();await finishPublish();
  const complete=(await questionVersions('SYNTHETIC-UNCERTAIN'))[0];assert.equal(complete.difficulty,'medium');assert.equal(complete.calculator_policy,'calculator_allowed');
  assert.equal(complete.course_scope,'BOTH');assert.deepEqual(complete.import_evidence.ai_flags,uncertaintyFlags);
  check('Complete synthetic saved fields with all three legacy UNCERTAIN flags publish without refilling or evidence changes');
  // Full all-page scope and a real server failure after the first publication mutation.
  await seed('SYNTHETIC-BATCH-A');await seed('SYNTHETIC-BATCH-B');await seed('SYNTHETIC-BATCH-BAD');
  await db.query("UPDATE public.question_versions SET requires_figure=true,image_url=NULL WHERE question_id=(SELECT id FROM public.questions WHERE external_id='SYNTHETIC-BATCH-BAD')");
  await openBank();await page.getByRole('button',{name:'Publish all',exact:true}).click();await dialog().getByText('Maximum 20 per atomic batch.',{exact:false}).waitFor();
  assert.equal(await dialog().getByText('Correct answer',{exact:true}).count(),0);
  await dialog().getByRole('article',{name:'Publication target SYNTHETIC-BATCH-BAD',exact:true}).getByText('SYNTHETIC-BATCH-BAD · image_url:',{exact:false}).waitFor();
  await fillReview();assert.equal(await dialog().getByRole('button',{name:/^Publish \d+ problems$/}).isEnabled(),false);
  check('A selected content blocker disables publication even with confirmation; users can exclude it');
  for(const target of await dialog().getByRole('article').all()){
    const label=await target.getAttribute('aria-label');if(!['Publication target SYNTHETIC-BATCH-A','Publication target SYNTHETIC-BATCH-B'].includes(label))await target.getByRole('checkbox').first().uncheck();
  }
  await fillReview();
  await dialog().evaluate(el=>{el.scrollTop=0;});await shot('04-batch-review');
  await db.query(`CREATE FUNCTION public.local_4d_fail_second() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF EXISTS(SELECT 1 FROM public.question_publication_events e JOIN public.questions q ON q.id=e.question_id WHERE q.external_id IN ('SYNTHETIC-BATCH-A','SYNTHETIC-BATCH-B')) THEN RAISE EXCEPTION 'Synthetic injected event failure'; END IF; RETURN NEW; END$$;
    CREATE TRIGGER local_4d_batch_failure BEFORE INSERT ON public.question_publication_events FOR EACH ROW EXECUTE FUNCTION public.local_4d_fail_second();`);
  await dialog().getByRole('button',{name:'Publish 2 problems',exact:true}).click();await dialog().getByText('Publication could not be confirmed.',{exact:false}).waitFor();
  for(const id of ['SYNTHETIC-BATCH-A','SYNTHETIC-BATCH-B']){assert.equal((await questionState(id)).status,'draft');assert.equal((await questionState(id)).current_version_id,null);}check('Publish all exact selection: real database failure rolls back both publication targets');
  await db.query('DROP TRIGGER local_4d_batch_failure ON public.question_publication_events; DROP FUNCTION public.local_4d_fail_second();');
  await dialog().getByRole('button',{name:'Reload checks',exact:true}).click();await dialog().getByText('Loading the complete publication scope…',{exact:true}).waitFor({state:'hidden'});await fillReview();await finishPublish(2);for(const id of ['SYNTHETIC-BATCH-A','SYNTHETIC-BATCH-B'])assert.equal((await questionVersions(id))[0].calculator_policy,null);check('Batch retry reads actual saved reviews and atomically publishes both explicit targets with optional calculator NULL retained');
  await openBank();await card('SYNTHETIC-STALE').getByRole('button',{name:/^Edit /}).click();await dialog().getByLabel('SYNTHETIC-STALE Difficulty',{exact:true}).selectOption('hard');before=await state();
  const offline=route=>route.abort();await page.route(api+'/rest/v1/rpc/update_question_bank_draft_metadata',offline);
  await dialog().getByRole('button',{name:'Save changes',exact:true}).click();await dialog().getByRole('alert').waitFor();assert.equal(await dialog().getByLabel('SYNTHETIC-STALE Difficulty',{exact:true}).inputValue(),'hard');assert.deepEqual(await state(),before);
  await page.unroute(api+'/rest/v1/rpc/update_question_bank_draft_metadata',offline);await closeEditor();check('Disconnected save reports failure, retains local edits and writes nothing');
  await card('SYNTHETIC-STALE').getByRole('button',{name:'Publish',exact:true}).click();await fillReview();before=await state();
  await db.query("DELETE FROM public.user_roles WHERE user_id=$1 AND role='admin'",[accounts[0].id]);
  await dialog().getByRole('button',{name:'Publish 1 problems',exact:true}).click();await dialog().getByText('Administrator permission was denied.',{exact:false}).waitFor();assert.deepEqual(await state(),before);
  await db.query("INSERT INTO public.user_roles(user_id,role) VALUES($1,'admin')",[accounts[0].id]);await closeEditor();check('Permission revoked before confirmation is rejected by actual server and shown clearly');
  await openBank();await card(synthId,'Published problems').getByRole('button',{name:'Unpublish',exact:true}).click();await dialog().getByRole('button',{name:'Confirm unpublish',exact:true}).click();await page.getByText('Problem unpublished.',{exact:false}).waitFor();
  await card(synthId).getByRole('button',{name:'Archive',exact:true}).click();before=await state();await closeEditor();assert.deepEqual(await state(),before);
  await card(synthId).getByRole('button',{name:'Archive',exact:true}).click();await dialog().getByRole('button',{name:'Confirm archive',exact:true}).click();await page.getByText('Problem archived.',{exact:false}).waitFor();assert.equal((await questionState(synthId)).status,'retired');assert.equal((await questionVersions(synthId)).length,2);check('Explicit Archive retains all versions; cancelling Archive writes nothing');
  const many=Array.from({length:21},(_,i)=>({...base,external_id:'SYNTHETIC-PAGE-'+String(i).padStart(2,'0')}));assert.ifError((await admin.rpc('save_question_bank_drafts',{_items:many})).error);await openBank();
  const savedArea=page.getByRole('region',{name:'Saved drafts',exact:true});const total=Number(await scalar("SELECT count(*)::int result FROM public.questions q WHERE status<>'retired' AND (status='unpublished' OR EXISTS(SELECT 1 FROM public.question_versions v WHERE v.question_id=q.id AND v.status IN ('draft','review')))"));
  assert.ok(total>20);assert.equal(await savedArea.getByRole('article').count(),20);await savedArea.getByRole('button',{name:'Next',exact:true}).click();await savedArea.getByText('Page 2 of',{exact:false}).waitFor();await page.getByText('Loading saved drafts…',{exact:true}).waitFor({state:'hidden'});assert.equal(await savedArea.getByRole('article').count(),total-20);
  before=await state();await page.getByRole('button',{name:'Publish all',exact:true}).click();await dialog().getByText(`${total} problems across all pages · 0 selected.`,{exact:false}).waitFor();assert.equal(await dialog().getByRole('article').count(),total);assert.equal(await dialog().getByRole('button',{name:'Publish 0 problems',exact:true}).isEnabled(),false);await shot('06-all-pages-scope');await closeEditor();assert.deepEqual(await state(),before);check('Actual two-page list and Publish all show full scope, enforce max-20 and cancel with zero writes');
  // No remote APIs, and ordinary/anonymous clients cannot read draft versions or raw answers.
  const student=createClient(api,anon,{auth:{persistSession:false,autoRefreshToken:false}});assert.ifError((await student.auth.signInWithPassword({email:accounts[1].email,password:testPassword})).error);
  const identities=await student.from('questions').select('id,status,external_id');assert.ifError(identities.error);assert.ok(identities.data.every(q=>q.status==='approved'));
  assert.ok(!identities.data.some(q=>q.external_id.startsWith('calc-ab-bc-unit1-source-')));
  assert.deepEqual((await student.from('question_versions').select('id,solution')).data,[]);assert.deepEqual((await student.from('question_options').select('id,is_correct')).data,[]);
  const visitor=createClient(api,anon,{auth:{persistSession:false,autoRefreshToken:false}});assert.ok((await visitor.from('questions').select('id')).error || !(await visitor.from('questions').select('id')).data.length);
  assert.ok((await student.rpc('precheck_question_publication',{_question_id:stale.question_id,_version_id:stale.id,_action:'publish'})).error);check('Actual REST student/anonymous draft and answer isolation; unauthorized management RPC rejected');
  await openBank();await page.setViewportSize({width:390,height:844});await card('SYNTHETIC-BATCH-A','Published problems').scrollIntoViewIfNeeded();await shot('05-narrow');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));check('Narrow layout has no horizontal page overflow');
  assert.deepEqual(remoteRequests,[]);assert.ok(writeRequests.includes('publish_question_versions'));check('All tested lifecycle buttons use real local RPCs, with no remote Supabase request');
  check('Repeated Publish clicks send only one publication RPC');
} catch(error) {
  if(page)await page.screenshot({path:resolve(output,'failure.png'),fullPage:false}).catch(()=>{});
  report.error=redact(error.stack??error);console.error(report.error);process.exitCode=1;
} finally {
  if(browser)await browser.close().catch(()=>{});
  if(vite&&vite.exitCode===null){vite.kill('SIGTERM');await new Promise(r=>vite.once('exit',r));}
  if(proxy){proxy.closeAllConnections();await new Promise(r=>proxy.close(r));}
  if(db)await db.end().catch(()=>{});
  for(const name of created.reverse()){const info=JSON.parse(docker(['inspect',name]))[0];assert.equal(info.Config.Labels['o2i.purpose'],'task4d-browser');docker(['rm','-f',name]);}
  if(networkCreated)docker(['network','rm',network]);
  report.cleanup=!docker(['ps','-a','--filter','label=o2i.purpose=task4d-browser','--format','{{.Names}}']).trim();
  assert.equal(report.cleanup,true);writeFileSync(resolve(output,'results.json'),JSON.stringify(report,null,2),{mode:0o600});
  console.log(`Completed ${report.checks.length} acceptance checks. Disposable containers removed: ${report.cleanup}.`);
}
