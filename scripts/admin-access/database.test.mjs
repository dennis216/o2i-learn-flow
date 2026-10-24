// Real PostgreSQL + actual migrations, disposable tmpfs container only; no production connections.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
const name='o2i-admin-access-'+process.pid;
const docker=(args,input)=>execFileSync('docker',args,{input,encoding:'utf8',stdio:['pipe','pipe','pipe']});
const sql=s=>docker(['exec','-i',name,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d','postgres'],s).trim();
const uid=n=>`a0000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const [superId,full,course,question,student,retired]=[1,2,3,4,5,6].map(uid);
const user=(id,s)=>sql(`BEGIN;SET LOCAL ROLE authenticated;SELECT set_config('request.jwt.claim.sub','${id}',true);SELECT set_config('request.jwt.claim.role','authenticated',true);${s};COMMIT;`).split('\n').slice(2).join('\n');
const fail=(f,pattern)=>assert.throws(f,e=>!pattern||pattern.test(String(e.stderr||e.message)));
const passed=[];const check=(name,run)=>{run();passed.push(name);console.log('PASS '+name);};
const migration=prefix=>{const path=execFileSync('rg',['--files','supabase/migrations'],{encoding:'utf8'}).split('\n').find(p=>p.split('/').at(-1).startsWith(prefix));assert.ok(path,prefix);return read(path);};
let created=false,authContainer;const liveAuth=!!process.env.O2I_ADMIN_LIVE_AUTH;const releasePackage=!!process.env.O2I_ADMIN_RELEASE_PACKAGE;
try {
 docker(['run','--pull','never','-d','--name',name,...(liveAuth?['-p','127.0.0.1:55997:9999','-p','127.0.0.1:55996:3000']:['--network','none']),'--tmpfs','/var/lib/postgresql/data:rw','-e','POSTGRES_HOST_AUTH_METHOD=trust','public.ecr.aws/supabase/postgres:17.11.0.002']);created=true;
 for(let n=0;;n++){try{if(docker(['logs',name]).includes('PostgreSQL init process complete') && sql("SELECT count(*) FROM pg_roles WHERE rolname='authenticated'")==='1')break;}catch{}if(n>600)throw Error('Postgres startup timed out');await new Promise(r=>setTimeout(r,250));}
 if(liveAuth)authContainer=name+'-auth';
 if(liveAuth)authContainer=await (await import('./live-auth.acceptance.mjs')).startLocalAuth({docker,sql,name});
 const applyAdmin=(prefix,file)=>{const source=migration(prefix);const packaged=read('docs/admin-access/production/'+file);assert.ok(packaged.includes(source),'Deployment source mismatch: '+prefix);sql(releasePackage?packaged:source);};
 const taxonomy=migration('20260920010000');
 sql(`DO $$ DECLARE r record;BEGIN FOR r IN SELECT evtname FROM pg_event_trigger LOOP EXECUTE format('ALTER EVENT TRIGGER %I DISABLE',r.evtname);END LOOP;END $$;
 CREATE SCHEMA IF NOT EXISTS storage;
 CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text REFERENCES storage.buckets(id),name text,owner uuid,metadata jsonb);
 ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
 CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
 ${migration('20250910020036')}
 CREATE TABLE public.ai_summaries(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),content text);
 CREATE TABLE public.chapters(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
 CREATE TABLE public.sub_chapters(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
 CREATE TABLE public.video_lessons(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
 CREATE TABLE public.practice_problems(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
 CREATE TABLE public.roadmaps(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
 ${migration('20251015053508')}
 ${migration('20251015055856')}
 ALTER TABLE public.courses ADD COLUMN category text DEFAULT 'High School';
 ALTER TABLE public.course_videos ADD COLUMN transcript jsonb,ADD COLUMN subtitle text,ADD COLUMN exam_tips text,ADD COLUMN notes_url text;
 ${migration('20260115201707')}
 ${migration('20260115210328')}
 ${migration('20260115232842')}
 ${migration('20260118030406')}
 ALTER TYPE public.app_role ADD VALUE 'super_admin';`);
 sql(migration('20260920000000'));
 sql(migration('20260116020640'));
 sql(`ALTER TABLE public.profiles ADD COLUMN is_zombie boolean DEFAULT false;
 ${taxonomy.slice(taxonomy.indexOf('CREATE TABLE public.curriculum_frameworks'),taxonomy.indexOf('ALTER TABLE public.course_videos'))}
 ALTER TABLE public.course_videos ADD COLUMN curriculum_topic_id uuid REFERENCES public.curriculum_topics(id);
 ${migration('20260920020000')}
 INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES ${[superId,full,course,question,student,retired].map((id,i)=>`('${id}','role${i}@example.test','{"full_name":"Synthetic account"}')`).join(',')};
 INSERT INTO public.user_roles(user_id,role) VALUES('${superId}','super_admin'),('${full}','admin'),('${student}','student'),('${retired}','instructor');
 UPDATE public.profiles SET role='instructor' WHERE user_id='${retired}';
 INSERT INTO public.curriculum_frameworks(code,title,version,source_title) VALUES('AP-CALCULUS-2026','Synthetic','test','Synthetic');
 INSERT INTO public.curriculum_units(framework_id,unit_number,title) SELECT id,1,'Synthetic unit' FROM public.curriculum_frameworks;
 INSERT INTO public.curriculum_topics(unit_id,topic_code,title,big_idea,order_index) SELECT id,'1.1','Synthetic topic','LIM',1 FROM public.curriculum_units;
 INSERT INTO public.curriculum_practices(code,name,description) VALUES(1,'Synthetic','Synthetic');
 INSERT INTO public.curriculum_practice_skills(practice_code,skill_code,description) VALUES(1,'1.A','Synthetic');
 INSERT INTO public.subjects(name,category) VALUES('AP Calc','High School');
 INSERT INTO public.courses(id,title,level,subject,category,instructor_id,is_published) VALUES('${uid(10)}','Synthetic draft','advanced','AP Calc','High School','${retired}',false);`);
 for(const prefix of ['20260926000000','20261004000000','20261018000000','20261019000000','20261019010000','20261020000000','20261021000000','20261023000000','20261024000000','20261025000000','20261026000000','20261027000000','20261028000000','20261029000000','20261030000000','20261031000000','20261101000000','20261101010000','20261101020000','20261101030000'])sql(migration(prefix));
 // Original production policy shapes plus broad grants make authorization failures observable.
 sql(`GRANT USAGE ON SCHEMA public,storage TO authenticated,anon;GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated;GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated;
 CREATE SCHEMA IF NOT EXISTS supabase_migrations;CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations(version text PRIMARY KEY,name text,statements text[]);
 CREATE VIEW public.public_profiles AS SELECT id,user_id,full_name,avatar_url,role FROM public.profiles;GRANT SELECT ON public.public_profiles TO anon,authenticated;`);
 applyAdmin('20261103000000','10_roles.sql');
 applyAdmin('20261103010000','20_permissions.sql');
 if(releasePackage)applyAdmin('20261103020000','30_deletion.sql');
 applyAdmin('20261103030000','40_account_data.sql');
 sql("CREATE POLICY own_roles_read ON public.user_roles FOR SELECT TO authenticated USING(user_id=auth.uid());");
 sql(`INSERT INTO public.user_roles(user_id,role) VALUES('${course}','course_admin'),('${question}','question_admin');`);
 check('module matrix for all 5 roles',()=>{
  const expected=[[true,true,true,true,true],[true,true,true,true,false],[true,false,true,false,false],[false,true,true,false,false],[false,false,false,false,false]];
  [superId,full,course,question,student].forEach((id,i)=>assert.deepEqual(JSON.parse(user(id,'SELECT public.get_admin_access()')),Object.fromEntries(['courses','questions','playground','team','users'].map((key,j)=>[key,expected[i][j]]))));
 });
 check('Instructor becomes student, cannot regain instructor or read owned draft',()=>{
  assert.equal(sql(`SELECT role FROM public.user_roles WHERE user_id='${retired}'`),'student');
  assert.equal(user(retired,`SELECT count(*) FROM public.courses WHERE id='${uid(10)}'`),'0');
  fail(()=>sql(`INSERT INTO public.user_roles(user_id,role) VALUES('${retired}','instructor')`),/retired/);
  assert.equal(user(retired,`UPDATE public.courses SET title='forbidden' WHERE id='${uid(10)}' RETURNING id`),'');
 });
 check('course writes allowed only to Course/Full/Super; course draft visibility isolated',()=>{
  [course,full,superId].forEach(id=>assert.equal(user(id,`UPDATE public.courses SET title='Allowed' WHERE id='${uid(10)}' RETURNING id`),uid(10)));
  [question,student].forEach(id=>assert.equal(user(id,`UPDATE public.courses SET title='Forbidden' WHERE id='${uid(10)}' RETURNING id`),''));
  assert.equal(user(question,`SELECT count(*) FROM public.courses WHERE id='${uid(10)}'`),'0');
 });
 check('Team writes denied to scoped admins, allowed to Full/Super',()=>{
  for(const id of [course,question,student])fail(()=>user(id,`INSERT INTO public.team_members(name,role) VALUES('Forbidden','Synthetic')`),/row-level security/);
  [full,superId].forEach(id=>user(id,`INSERT INTO public.team_members(name,role) VALUES('Allowed','Synthetic')`));
 });
 check('Playground writable by every admin, denied to student',()=>{
  for(const id of [superId,full,course,question])user(id,`INSERT INTO public.playground_links(title,geogebra_url,target_subject) VALUES('Synthetic','https://example.test','test')`);
  fail(()=>user(student,`INSERT INTO public.playground_links(title,geogebra_url,target_subject) VALUES('Forbidden','https://example.test','test')`),/row-level security/);
 });
 check('question import RPC works for Question Admin; Course Admin denied',()=>{
  const payload=[{external_id:'ADMIN-ROLE-TEST',stem:'Synthetic',solution:'Synthetic',difficulty:'easy',course_scope:'AB',primary_topic_code:'1.1',practice_skill_codes:['1.A'],representation_type:'analytical',source_document:'SYNTHETIC.pdf',source_page:'1',source_locator:'p001-item01',requires_figure:false,import_evidence:{human_review_status:'pending',ai_flags:[]},correct_option_key:'A',options:[{option_key:'A',option_text:'A',is_correct:true,import_evidence:{}},{option_key:'B',option_text:'B',is_correct:false,import_evidence:{}}]}];
  user(question,`SELECT public.save_question_bank_drafts('${JSON.stringify(payload)}')`);
  fail(()=>user(course,`SELECT public.save_question_bank_drafts('[]')`),/administrator|Admin/i);
  assert.equal(user(course,"SELECT count(*) FROM public.questions WHERE external_id='ADMIN-ROLE-TEST'"),'0');
  assert.equal(user(question,"SELECT count(*) FROM public.questions WHERE external_id='ADMIN-ROLE-TEST'"),'1');
 });
 check('course RPC denies Question Admin; allows Course Admin',()=>{
  assert.ok(user(course,"SELECT public.list_course_video_library(NULL,'all')").startsWith('['));
  fail(()=>user(question,"SELECT public.list_course_video_library(NULL,'all')"),/administrator/);
  user(course,"SELECT public.create_managed_course('{\"title\":\"Synthetic new\",\"subject\":\"AP Calc\",\"category\":\"High School\",\"level\":\"advanced\",\"price\":0}','AB')");
 });
 check('Storage module isolation, including legacy owner bypass',()=>{
  sql(`INSERT INTO storage.buckets(id,name,public) VALUES('course-images','course-images',true) ON CONFLICT DO NOTHING;CREATE POLICY old_owner_write ON storage.objects FOR INSERT TO authenticated WITH CHECK(owner=auth.uid());`);
  user(course,`INSERT INTO storage.objects(bucket_id,name,owner) VALUES('course-images','synthetic-course','${course}')`);
  fail(()=>user(question,`INSERT INTO storage.objects(bucket_id,name,owner) VALUES('course-images','forbidden','${question}')`),/row-level security/);
  fail(()=>user(course,`INSERT INTO storage.objects(bucket_id,name,owner) VALUES('team-photos','forbidden','${course}')`),/row-level security/);
  user(question,`INSERT INTO storage.objects(bucket_id,name,owner) VALUES('practice-images','synthetic-question','${question}')`);
 });
 check('atomic role change, self/protected guard, no browser role writes',()=>{
  [full,course,question,student].forEach(id=>fail(()=>user(id,`SELECT public.set_account_role('${student}','admin')`),/Super Admin/));
  user(superId,`SELECT public.set_account_role('${student}','question_admin')`);
  assert.equal(sql(`SELECT string_agg(role::text,',') FROM public.user_roles WHERE user_id='${student}'`),'question_admin');
  fail(()=>user(superId,`SELECT public.set_account_role('${superId}','student')`),/protected/);
  fail(()=>user(superId,`INSERT INTO public.user_roles(user_id,role) VALUES('${retired}','admin')`),/row-level security/);
  user(superId,`SELECT public.set_account_role('${student}','student')`);
  assert.equal(user(student,"SELECT public.has_admin_module('questions')"),'f');
 });
 check('private account profiles and roles are inaccessible to all ordinary admins',()=>{for(const id of [full,course,question,student])assert.equal(user(id,`SELECT count(*) FROM public.profiles WHERE user_id<>'${id}'`),'0');assert.ok(Number(user(superId,'SELECT count(*) FROM public.profiles'))>=6);});
 check('installed module RPCs contain no old admin gate',()=>{
  const residual=sql("SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f' AND (proname ~ '(course|question)' OR proname='assert_question_bank_admin') AND prosrc ~ 'has_role\\([^;]*''admin''' ");
  assert.equal(residual,'',residual);
 });
 if(process.env.O2I_ADMIN_DELETION_DB) (await import('./deletion-db.acceptance.mjs')).verifyUserDeletion({sql,user,uid,superId,full,course,question,student});
 if(releasePackage){assert.equal(sql("SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version BETWEEN '20261103000000' AND '20261103030000'"),'4');assert.throws(()=>sql(read('docs/admin-access/production/20_permissions.sql')));assert.ok(sql(read('docs/admin-access/production/50_verify_readonly.sql')).includes('t|t|t|t|t|t|t|t'));console.log('PASS exact deployment package, four registrations, repeat deployment refused and read-only verification');}
 if(liveAuth)await (await import('./live-auth.acceptance.mjs')).verifyLiveAuth({docker,sql,name,superId});
 writeFileSync('docs/admin-access/task2-database-results.txt',`Local disposable PostgreSQL; synthetic accounts; no production connection.\n${passed.map(s=>'PASS '+s).join('\n')}\n${passed.length} checks passed.\n`);
} catch(e){console.error(String(e.stderr||e.stack));try{console.error(sql("SELECT policyname,cmd,qual,with_check FROM pg_policies WHERE tablename='courses'"));}catch{}process.exitCode=1;}
finally {if(authContainer)docker(['rm','-f',authContainer]);if(created)docker(['rm','-f',name]);}
