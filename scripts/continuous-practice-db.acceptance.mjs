import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
// Runs after course practice acceptance in the same disposable database (O2I_COURSE_DB_EXTRA=1 O2I_COURSE_CONTINUOUS_DB=1).
export function verifyContinuousPractice({sql,asUser,admin,bc,tids}) {
 sql(readFileSync(new URL('../supabase/migrations/20261104000000_question_practice_continuous.sql',import.meta.url),'utf8'));
 const [t1,t2,t3]=tids,learner=randomUUID(),skill=randomUUID(),options=new Map(),difficulty=new Map();
 sql(`INSERT INTO auth.users(id) VALUES('${learner}')`);
 const add=(topic,level)=>{const q=randomUUID(),v=randomUUID(),right=randomUUID(),wrong=randomUUID();
   sql(`INSERT INTO public.questions VALUES('${q}','${v}','approved');
     INSERT INTO public.question_versions(id,question_id,primary_topic_id,stem,solution,difficulty,course_scope,representation_type,status,question_type) VALUES('${v}','${q}','${topic}','Synthetic ${level}','Synthetic solution','${level}','BOTH','analytical','approved','mcq_single');
     INSERT INTO public.question_options VALUES('${right}','${v}','A','Synthetic correct',0,true),('${wrong}','${v}','B','Synthetic incorrect',1,false);
     INSERT INTO public.question_practice_skills VALUES('${v}','${skill}');`);
   options.set(q,{right,wrong});difficulty.set(q,level);};
 for(const level of ['easy','easy','easy','medium','medium','medium','hard','hard'])add(t2,level);
 for(let n=0;n<5;n++)add(t3,'medium');
 // Malformed published questions (two correct answers; a single option) must never be issued.
 const broken=[randomUUID(),randomUUID()];
 broken.forEach((q,n)=>{const v=randomUUID();sql(`INSERT INTO public.questions VALUES('${q}','${v}','approved');
   INSERT INTO public.question_versions(id,question_id,primary_topic_id,stem,solution,difficulty,course_scope,representation_type,status,question_type) VALUES('${v}','${q}','${t3}','Broken','S','easy','BOTH','analytical','approved','mcq_single');
   INSERT INTO public.question_options VALUES('${randomUUID()}','${v}','A','One',0,true)${n===0?`,('${randomUUID()}','${v}','B','Two',1,true)`:''};`);});
 const rpc=(uid,name,args='')=>JSON.parse(asUser(uid,`SELECT coalesce(public.${name}(${args})::text,'null')`).trim().split('\n').at(-1));
 const start=(id,topic,course)=>rpc(learner,'start_continuous_question_practice',`'${id}',${topic?`'${topic}'`:'NULL'},${course?`'${course}'`:'NULL'}`);
 const next=id=>rpc(learner,'next_continuous_question_practice',`'${id}'`);
 const pending=s=>s.questions.filter(q=>!q.attempt);
 const reason=(s,q)=>s.continuous.items.find(i=>i.question_id===q.question_id).reason;
 const answer=(s,correct)=>{const [q]=pending(s);assert.ok(q,'Expected a waiting question');
   // Questions created by the course acceptance are not in the local map; read their options from the database.
   const option=options.get(q.question_id)?.[correct?'right':'wrong']??sql(`SELECT id FROM public.question_options WHERE question_version_id='${q.version_id}' AND is_correct=${correct} LIMIT 1`).trim();
   return rpc(learner,'submit_question_practice',`'${s.id}','${q.question_id}','${option}',30`);};

 // Topic mode: medium start, easier after an error, step up after three correct, idempotent issue.
 const topicId=randomUUID();let s=start(topicId,t2);
 assert.equal(s.mode,'continuous');assert.equal(s.next_result,'issued');assert.equal(s.questions.length,1);
 assert.equal(s.questions[0].difficulty,'medium');assert.equal(reason(s,s.questions[0]).kind,'start');assert.equal(reason(s,s.questions[0]).rule_version,'continuous-v1');
 assert.equal(s.questions[0].attempt,null);assert.equal(s.questions[0].solution,undefined);
 assert.deepEqual(start(topicId,t2).questions,s.questions);assert.equal(next(topicId).questions.length,1);
 s=next(answer(s,false).id);assert.equal(s.questions[1].difficulty,'easy');assert.equal(reason(s,s.questions[1]).kind,'easier_after_error');
 for(let n=0;n<3;n++){s=next(answer(s,true).id);}
 assert.equal(s.questions[4].difficulty,'medium');assert.equal(reason(s,s.questions[4]).kind,'step_up');
 // No easier new question left: same difficulty, no message beyond the reason.
 s=next(answer(s,false).id);assert.equal(s.questions[5].difficulty,'medium');assert.equal(reason(s,s.questions[5]).kind,'easier_after_error');
 while(pending(s).length){s=next(answer(s,true).id);}
 assert.equal(s.next_result,'topic_exhausted');assert.equal(s.questions.length,8);assert.equal(new Set(s.questions.map(q=>q.question_id)).size,8);
 assert.equal(next(topicId).questions.length,8);

 // Four wrong in a row prompts; continuing resets until the next four. Ending keeps the waiting question unanswered.
 const stuckId=randomUUID();s=start(stuckId,t3);
 for(let n=0;n<3;n++){s=next(answer(s,false).id);assert.equal(s.continuous.stuck,false);}
 s=answer(s,false);assert.equal(s.continuous.stuck,true);
 s=next(stuckId);assert.equal(pending(s).length,1);
 const waiting=pending(s)[0];
 const ended=rpc(learner,'end_continuous_question_practice',`'${stuckId}'`);
 assert.ok(ended.ended_at);assert.equal(ended.continuous.recap.answered_count,4);assert.equal(ended.continuous.recap.new_count,4);assert.equal(ended.continuous.recap.new_correct_count,0);
 assert.equal(ended.continuous.recap.timed_seconds,null);
 assert.deepEqual(ended.continuous.recap.topics.map(t=>[t.topic_id,t.status,t.sample_count,t.correct_count]),[[t3,'needs_practice',4,0]]);
 assert.equal(ended.continuous.recap.suggestion.topic_id,t3);
 assert.throws(()=>rpc(learner,'submit_question_practice',`'${stuckId}','${waiting.question_id}','${options.get(waiting.question_id).right}',5`));
 assert.equal(next(stuckId).next_result,'ended');assert.equal(rpc(learner,'end_continuous_question_practice',`'${stuckId}'`).ended_at,ended.ended_at);

 // Free practice: needs_practice Topic first, then insufficient; every fifth question reviews a correct answer from 3+ days ago.
 sql(`UPDATE public.question_practice_attempts SET submitted_at=submitted_at-interval '4 days' WHERE user_id='${learner}' AND session_id='${topicId}'`);
 const freeId=randomUUID();s=start(freeId,null);
 assert.equal(s.questions[0].topic.id,t3);assert.equal(reason(s,s.questions[0]).topic_status,'needs_practice');
 for(let n=0;n<4;n++)s=next(answer(s,true).id);
 assert.deepEqual(s.questions.slice(1,4).map(q=>q.topic.id),[t1,t1,t1]);assert.equal(reason(s,s.questions[1]).kind,'new_topic');
 const review=s.questions[4];assert.equal(reason(s,review).kind,'review');assert.equal(review.topic.id,t2);
 assert.ok(['easy','medium','hard'].includes(difficulty.get(review.question_id)));
 assert.deepEqual(rpc(learner,'get_open_continuous_question_practice').id,freeId);
 s=answer(s,false);
 const recap=rpc(learner,'end_continuous_question_practice',`'${freeId}'`).continuous.recap;
 assert.equal(recap.answered_count,5);assert.equal(recap.new_count,4);
 assert.equal(recap.topics.find(t=>t.topic_id===t2).status,'needs_practice');
 // The Topic-mode session was never ended, so it is the remaining unfinished one.
 assert.equal(rpc(learner,'get_open_continuous_question_practice').id,topicId);
 rpc(learner,'end_continuous_question_practice',`'${topicId}'`);assert.equal(rpc(learner,'get_open_continuous_question_practice'),null);
 assert.equal(sql(`SELECT count(*) FROM public.question_practice_items WHERE question_id IN ('${broken.join("','")}')`).trim(),'0');

 // Course scope, session-kind and account isolation; private helpers stay private; five-question sets are unchanged.
 const courseId=randomUUID();const course=start(courseId,t1,bc);assert.equal(course.course_id,bc);assert.equal(course.mode,'continuous');
 assert.throws(()=>start(courseId,t1,null));assert.throws(()=>start(courseId,t2,bc));
 assert.throws(()=>rpc(admin,'next_continuous_question_practice',`'${courseId}'`));assert.throws(()=>rpc(admin,'end_continuous_question_practice',`'${courseId}'`));
 assert.throws(()=>rpc(learner,'question_practice_topic_status',`'${learner}'`));assert.throws(()=>rpc(learner,'question_practice_issue_next',`'${courseId}'`));
 const setId=randomUUID();const set=rpc(learner,'start_question_practice',`'${setId}','${t3}'`);
 assert.equal(set.mode,'set');assert.ok(set.questions.length<=5);assert.equal(set.continuous,undefined);
 assert.throws(()=>start(setId,t3));assert.throws(()=>next(setId));
 console.log('PASS continuous practice database: first-attempt status, easier-after-error, step-up, same-difficulty fallback, exhaustion, four-wrong prompt, review slot, free Topic order, end/recap, open session, course scope and isolation');
}
