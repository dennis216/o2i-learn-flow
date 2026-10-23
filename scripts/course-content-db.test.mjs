// Disposable PostgreSQL only. No production URL, credentials, migration replay or content seeds.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const name='o2i-course-test-'+process.pid;
const docker=(args,input)=>execFileSync('docker',args,{encoding:'utf8',input,stdio:['pipe','pipe','pipe']});
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sql=s=>docker(['exec','-i',name,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d','postgres'],s);
const admin='00000000-0000-4000-8000-000000000001',student='00000000-0000-4000-8000-000000000002';
const ab='93124428-92f4-48d2-a6dc-e5f9e010248b',bc='fccc7540-0c29-43be-8682-ae90ff2534cb';
const asUser=(id,s,role='authenticated')=>sql(`BEGIN; SET LOCAL ROLE ${role}; SELECT set_config('request.jwt.claims','${JSON.stringify({sub:id,role})}',true); SELECT set_config('request.jwt.claim.sub','${id}',true); SELECT set_config('request.jwt.claim.role','${role}',true); ${s}; COMMIT;`);
const expectFailure=fn=>assert.throws(fn);
let created=false;
try {
 docker(['run','--pull','never','-d','--name',name,'--network','none','--tmpfs','/var/lib/postgresql/data:rw','-e','POSTGRES_HOST_AUTH_METHOD=trust','public.ecr.aws/supabase/postgres:17.11.0.002']);created=true;
 for(let n=0;;n++){try{docker(['exec',name,'pg_isready','-h','127.0.0.1','-U','supabase_admin']);break;}catch{if(n>100)throw new Error('Local PostgreSQL did not start');await new Promise(r=>setTimeout(r,150));}}
 for(let n=0;;n++){try{if(sql("SELECT count(*) FROM pg_roles WHERE rolname IN ('anon','authenticated')").trim()==='2')break;}catch{}if(n>120)throw new Error('Local roles not initialized');await new Promise(r=>setTimeout(r,250));}
 const taxonomy=read('supabase/migrations/20260920010000_ap_calculus_ced_framework.sql');
 const bootstrap=`DO $disable$ DECLARE r record; BEGIN FOR r IN SELECT evtname FROM pg_event_trigger LOOP EXECUTE format('ALTER EVENT TRIGGER %I DISABLE',r.evtname); END LOOP; END $disable$;
 CREATE SCHEMA IF NOT EXISTS extensions; CREATE SCHEMA IF NOT EXISTS auth; CREATE SCHEMA IF NOT EXISTS storage;
 CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
 CREATE TYPE public.app_role AS ENUM('admin','super_admin','instructor','student');
 CREATE TYPE public.question_course_scope AS ENUM('AB','BC','BOTH');
 CREATE TABLE public.user_roles(user_id uuid,role public.app_role);
 INSERT INTO public.user_roles VALUES('${admin}','admin');
 CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid,_role public.app_role) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND (role=_role OR role='super_admin')) $$;
 CREATE TABLE public.courses(id uuid PRIMARY KEY,title text,is_published boolean DEFAULT true);
 CREATE TABLE public.course_videos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),course_id uuid REFERENCES public.courses(id),title text,description text,video_url text,duration integer,order_index integer,transcript jsonb);
 CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text);
 GRANT USAGE ON SCHEMA public,auth TO anon,authenticated;
 GRANT SELECT ON public.courses,public.course_videos TO anon,authenticated;
 ALTER TABLE public.course_videos ENABLE ROW LEVEL SECURITY;
 CREATE POLICY admin_video_write ON public.course_videos FOR ALL TO authenticated USING(public.has_role(auth.uid(),'admin'));
 ${taxonomy.slice(taxonomy.indexOf('CREATE TABLE public.curriculum_frameworks'),taxonomy.indexOf('ALTER TABLE public.course_videos'))}
 ALTER TABLE public.course_videos ADD COLUMN curriculum_topic_id uuid REFERENCES public.curriculum_topics(id);
 INSERT INTO public.curriculum_frameworks(code,title,version,source_title) VALUES('TEST','Synthetic test','test','test');
 INSERT INTO public.curriculum_units(framework_id,unit_number,title) SELECT id,1,'Synthetic Unit' FROM public.curriculum_frameworks;
 INSERT INTO public.curriculum_topics(unit_id,topic_code,title,big_idea,order_index,is_bc_only) SELECT id,'1.'||n,'Synthetic Topic '||n,'LIM',n,n=3 FROM public.curriculum_units CROSS JOIN generate_series(1,3) n;
 INSERT INTO public.courses VALUES('${ab}','Synthetic AB',true),('${bc}','Synthetic BC',true);
 INSERT INTO public.course_curriculum_units SELECT c.id,u.id,1 FROM public.courses c CROSS JOIN public.curriculum_units u;
 ${read('supabase/migrations/20261027000000_course_topic_content.sql')}`;
 sql(bootstrap);
 const tids=sql('SELECT id FROM public.curriculum_topics ORDER BY order_index').trim().split('\n'),[t1,t2,t3]=tids;
 const save=(course,topic,published,videos,id=admin)=>asUser(id,`SELECT public.save_course_topic('${course}','${topic}',${published},'${JSON.stringify(videos)}',NULL)`);
 const vid='00000000-0000-4000-8000-000000000010',video={id:vid,title:'Synthetic video',video_url:'https://youtu.be/abcdefghijk'};
 save(bc,t1,false,[video]);
 assert.equal(sql("SELECT public.course_youtube_id('https://www.youtube.com/watch?v=abcdefghijk&v=12345678901') IS NULL").trim(),'t');
 expectFailure(()=>asUser(student,`SELECT public.get_course_topic('${bc}','${t1}')`));
 assert.equal(asUser(student,'SELECT count(*) FROM public.course_videos').trim().split('\n').at(-1),'0');
 expectFailure(()=>save(bc,t1,true,[video],student));
 expectFailure(()=>save(ab,t3,false,[video]));
 expectFailure(()=>save(ab,t1,false,[video]));
 expectFailure(()=>save(bc,t1,true,[]));
 expectFailure(()=>save(bc,t1,true,[{...video,video_url:'https://evil.org/watch?v=abcdefghijk'}]));
 save(bc,t1,true,[video]);save(bc,t2,false,[video]);
 assert.equal(asUser(student,'SELECT count(*) FROM public.course_topic_videos').trim().split('\n').at(-1),'1');
 expectFailure(()=>asUser(student,`SELECT public.get_course_topic('${bc}','${t2}')`));
 const outline=JSON.parse(asUser(student,`SELECT public.get_course_outline('${bc}')`).trim().split('\n').at(-1));
 assert.equal(outline[0].topics.length,3);assert.equal(outline[0].topics[1].is_published,false);
 assert.ok(!JSON.stringify(outline).includes('abcdefghijk'));
 expectFailure(()=>asUser(student,`UPDATE public.course_topic_content SET is_published=true`));
 expectFailure(()=>sql(`DELETE FROM public.course_videos WHERE id='${vid}'`));
 expectFailure(()=>sql(`UPDATE public.course_videos SET video_url='invalid' WHERE id='${vid}'`));
 save(bc,t1,false,[video]);
 assert.equal(asUser(student,'SELECT count(*) FROM public.course_videos').trim().split('\n').at(-1),'0');
 console.log('PASS course database: canonical scope, cross-course FK, atomic save, publish validation, draft URL/mapping isolation, outline without assets, legacy write guards and unpublish');
 if(process.env.O2I_COURSE_GAME_DB){await (await import('./course-game-db.acceptance.mjs')).verifyCourseGameStorage({sql,asUser,admin,student,bc,t1,save,video});}
 if(process.env.O2I_COURSE_DB_EXTRA){await (await import('./course-practice-db.acceptance.mjs')).verifyCoursePractice({sql,asUser,admin,student,ab,bc,tids,save,video});}
 if(process.env.O2I_COURSE_RELEASE_DB){await (await import('./course-release-db.acceptance.mjs')).verifyCourseRelease({sql,bootstrap,admin,student});}
 if(process.env.O2I_COURSE_SHARED_DB){await (await import('./course-shared-db.acceptance.mjs')).verifySharedLessons({sql,asUser,admin,student,ab,bc,tids});}
 if(process.env.O2I_COURSE_OUTLINE_DB){await (await import('./course-outline-db.acceptance.mjs')).verifyCustomOutline({sql,asUser,admin,student,ab,bc,tids});}
 if(process.env.O2I_COURSE_CREATION_DB){(await import('./course-creation-db.acceptance.mjs')).verifyManagedCreation({sql,asUser,admin,student});}
 if(process.env.O2I_COURSE_VIDEO_LIBRARY_DB){(await import('./course-video-library-db.acceptance.mjs')).verifyCourseVideoLibrary({sql,asUser,admin,student,ab});}
} catch(error){console.error(error.stderr?.toString()||error);process.exitCode=1;}
finally {if(created)docker(['rm','-f',name]);}
