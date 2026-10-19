import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsePracticeRoute, readPracticeSession, startPractice, submitPractice, loadPracticeHome } from './studentPractice.ts';
const id='11111111-1111-4111-8111-111111111111', qid='22222222-2222-4222-8222-222222222222', oid='33333333-3333-4333-8333-333333333333';
const fixture=()=>({id,topic_id:id,created_at:'2026-01-01',questions:[{question_id:qid,version_id:id,stem:'Test',topic:{id},skills:['1.A'],options:[{id:oid,key:'A',text:'A'},{id:qid,key:'B',text:'B'}],attempt:null}]});
test('Legacy and unknown filters never fall back to all published questions',()=>{
  for(const query of ['subject=calculus&lesson=limits&source=lesson','skill=limits','subject=physics','topic=1.1','topic='+id+'&topic='+id,'session=bad','unit=1']) assert.ok(parsePracticeRoute(new URLSearchParams(query)).error,query);
  assert.deepEqual(parsePracticeRoute(new URLSearchParams('subject=calculus&source=quick&topic='+id)),{topicId:id,sessionId:undefined});
  assert.deepEqual(parsePracticeRoute(new URLSearchParams('session='+id)),{topicId:undefined,sessionId:id});
});
test('Session identity, unique questions, options and saved grading are checked',()=>{
  assert.equal(readPracticeSession(fixture(),id).questions.length,1);
  for(const mutate of [s=>s.id=qid,s=>s.questions.push(s.questions[0]),s=>s.questions[0].options.pop(),s=>s.questions[0].attempt={id,is_correct:true},s=>s.questions[0].attempt=undefined]){
    const s=fixture();mutate(s);assert.throws(()=>readPracticeSession(s,id));
  }
});
test('RPC inputs never contain user identity, correct answer or score; unconfirmed saves fail',async()=>{
  const calls=[];const client={rpc:async(name,args)=>{calls.push({name,args});return {data:fixture(),error:null};}};
  await startPractice(client,id,qid);assert.deepEqual(calls.pop(),{name:'start_question_practice',args:{_session_id:id,_topic_id:qid}});
  await assert.rejects(submitPractice(client,id,qid,oid,12),/could not be verified/);
  assert.deepEqual(calls.pop(),{name:'submit_question_practice',args:{_session_id:id,_question_id:qid,_option_id:oid,_elapsed_seconds:12}});
  client.rpc=async()=>({data:null,error:{message:'Server unavailable'}});await assert.rejects(startPractice(client,id),/Server unavailable/);
});
test('Practice never treats a failed history or topics request as an empty account',async()=>{
  await assert.rejects(loadPracticeHome({rpc:async name=>name.includes('topics')?{data:[],error:null}:{data:null,error:{message:'History failed'}}}),/History failed/);
});
