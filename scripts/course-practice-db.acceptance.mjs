import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
export async function verifyCoursePractice({sql,asUser,admin,student,ab,bc,tids,save,video}) {
 const read=n=>readFileSync(new URL('../supabase/migrations/'+n+'.sql',import.meta.url),'utf8');
 sql(`CREATE TABLE IF NOT EXISTS auth.users(id uuid PRIMARY KEY);
 INSERT INTO auth.users(id) VALUES('${admin}'),('${student}');
 CREATE TYPE public.question_difficulty AS ENUM('easy','medium','hard');
 CREATE TABLE public.questions(id uuid PRIMARY KEY,current_version_id uuid,status text);
 CREATE TABLE public.question_versions(id uuid PRIMARY KEY,question_id uuid REFERENCES public.questions(id),primary_topic_id uuid,stem text,solution text,image_url text,requires_figure boolean DEFAULT false,difficulty public.question_difficulty,calculator_policy text,course_scope public.question_course_scope,representation_type text,status text,question_type text,UNIQUE(id,question_id));
 CREATE TABLE public.question_options(id uuid PRIMARY KEY,question_version_id uuid REFERENCES public.question_versions(id),option_key text,option_text text,order_index integer,is_correct boolean);
 CREATE TABLE public.question_practice_skills(question_version_id uuid,practice_skill_id uuid);
 CREATE FUNCTION public.is_super_admin(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
 ${read('20261021000000_question_bank_student_practice')}
 ${read('20261026000000_question_practice_adaptation_v2')}
 ${read('20261028000000_course_topic_practice')}`);
 const t=tids[0];save(bc,t,true,[video]);save(ab,t,true,[{...video,id:randomUUID()}]);
 for(const scope of ['AB','BC','BOTH']){
   const q=randomUUID(),v=randomUUID();
   sql(`INSERT INTO public.questions VALUES('${q}','${v}','approved');
     INSERT INTO public.question_versions(id,question_id,primary_topic_id,stem,solution,difficulty,course_scope,representation_type,status,question_type) VALUES('${v}','${q}','${t}','Synthetic ${scope}','Synthetic solution','medium','${scope}','analytical','approved','mcq_single');
     INSERT INTO public.question_options VALUES('${randomUUID()}','${v}','A','Synthetic correct',0,true),('${randomUUID()}','${v}','B','Synthetic incorrect',1,false);`);
 }
 const rpc=(uid,name,args)=>JSON.parse(asUser(uid,`SELECT public.${name}(${args})`).trim().split('\n').at(-1));
 const start=(course,id=randomUUID())=>rpc(student,'start_course_question_practice',`'${id}','${course}','${t}'`);
 const a=start(ab),b=start(bc);
 assert.deepEqual(new Set(a.questions.map(q=>q.course_scope)),new Set(['AB','BOTH']));assert.equal(b.questions.length,3);
 assert.equal(a.course_id,ab);assert.equal(a.course_scope,'AB');
 for(const q of b.questions){assert.equal(q.attempt,null);assert.equal(q.solution,undefined);assert.ok(q.options.every(o=>!('is_correct' in o)));}
 assert.deepEqual(start(ab,a.id),a);
 assert.throws(()=>start(bc,a.id));
 assert.throws(()=>rpc(admin,'get_question_practice',`'${a.id}'`));
 const counts=rpc(student,'list_course_practice_topics',`'${ab}'`);assert.equal(counts[0].question_count,2);
 assert.equal(rpc(student,'list_course_practice_topics',`'${bc}'`)[0].question_count,3);
 const q=a.questions[0],o=q.options[0];
 const submitted=rpc(student,'submit_question_practice',`'${a.id}','${q.question_id}','${o.id}',12`);assert.equal(submitted.questions[0].attempt.is_correct,true);assert.equal(submitted.course_id,ab);
 assert.deepEqual(rpc(student,'get_question_practice',`'${a.id}'`),submitted);
 assert.deepEqual(rpc(student,'submit_question_practice',`'${a.id}','${q.question_id}','${o.id}',12`),submitted);
 assert.equal(rpc(student,'start_question_practice',`'${a.id}'`).course_id,ab);
 assert.equal(rpc(student,'start_question_practice',`'${randomUUID()}'`).questions.length,3);
 save(ab,t,false,[{...video,id:sql(`SELECT video_id FROM public.course_topic_videos WHERE course_id='${ab}' AND topic_id='${t}'`).trim()}]);
 assert.throws(()=>start(ab));assert.equal(start(ab,a.id).course_id,ab);
 assert.deepEqual(rpc(student,'list_course_practice_topics',`'${ab}'`),[]);
 assert.throws(()=>asUser(student,`SELECT public.start_question_practice_in_scope('${randomUUID()}','${t}','${ab}')`));
 sql(read('20261030000000_course_legacy_links'));
 const resolved=rpc(student,'resolve_course_video',`'${video.id}'`);assert.equal(resolved.course_id,bc);assert.equal(resolved.topic_id,t);
 console.log('PASS course practice database: AB/BC/BOTH scope and exact counts, unchanged global practice, safe snapshots, saved course scope, idempotent grading, account isolation and withdrawn-session recovery');
}
