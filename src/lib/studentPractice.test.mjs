import assert from 'node:assert/strict';
import { test } from 'node:test';
import { selectionRationale, parsePracticeRoute, readPracticeSession, startPractice, submitPractice, loadPracticeHome, loadPracticeHistory } from './studentPractice.ts';
const id='11111111-1111-4111-8111-111111111111', qid='22222222-2222-4222-8222-222222222222', oid='33333333-3333-4333-8333-333333333333';
const fixture=()=>({id,topic_id:id,created_at:'2026-01-01',questions:[{question_id:qid,version_id:id,stem:'Test',topic:{id},skills:['1.A'],options:[{id:oid,key:'A',text:'A'},{id:qid,key:'B',text:'B'}],attempt:null}]});
test('Legacy and unknown filters never fall back to all published questions',()=>{
  for(const query of ['subject=calculus&lesson=limits&source=lesson','skill=limits','subject=physics','topic=1.1','topic='+id+'&topic='+id,'session=bad','unit=1']) assert.ok(parsePracticeRoute(new URLSearchParams(query)).error,query);
  assert.deepEqual(parsePracticeRoute(new URLSearchParams('subject=calculus&source=quick&topic='+id)),{topicId:id,sessionId:undefined,questionId:undefined});
  assert.deepEqual(parsePracticeRoute(new URLSearchParams('session='+id)),{topicId:undefined,sessionId:id,questionId:undefined});
  assert.deepEqual(parsePracticeRoute(new URLSearchParams(`session=${id}&question=${qid}`)),{topicId:undefined,sessionId:id,questionId:qid});
  for(const query of [`question=${qid}`,`session=${id}&question=bad`,`session=${id}&question=${qid}&question=${qid}`]) assert.ok(parsePracticeRoute(new URLSearchParams(query)).error,query);
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

const historyAnswer=()=>({id,session_id:id,question_id:qid,version_id:id,selected_option_id:oid,is_correct:false,submitted_at:'2026-01-01T12:00:00Z',elapsed_seconds:7,topic_code:'1.1',topic_title:'Limits'});
test('History keeps no-argument callers compatible and requests full-history wrong answers from server',async()=>{
  const calls=[];const client={rpc:async(name,args)=>{calls.push({name,args});return {data:[historyAnswer()],error:null};}};
  assert.deepEqual(await loadPracticeHistory(client),[historyAnswer()]);assert.deepEqual(calls.pop(),{name:'list_question_practice_attempts',args:{}});
  await loadPracticeHistory(client,true);assert.deepEqual(calls.pop(),{name:'list_question_practice_attempts',args:{_incorrect_only:true}});
  client.rpc=async()=>({data:[],error:null});assert.deepEqual(await loadPracticeHistory(client),[]);
  client.rpc=async()=>({data:null,error:{message:'History unavailable'}});await assert.rejects(loadPracticeHistory(client),/History unavailable/);
});
test('Malformed history fails closed instead of displaying empty or unverifiable account records',async()=>{
  const invalid=[null,{},[null],[{}],[historyAnswer(),historyAnswer()],Array(11).fill(historyAnswer())];
  for(const change of [{id:'bad'},{session_id:'bad'},{question_id:null},{version_id:''},{selected_option_id:3},{is_correct:'false'},{submitted_at:'invalid'},{topic_code:''},{topic_title:null}]) invalid.push([{...historyAnswer(),...change}]);
  for(const data of invalid) await assert.rejects(loadPracticeHistory({rpc:async()=>({data,error:null})}),/Could not verify/);
  await assert.rejects(loadPracticeHistory({rpc:async()=>({data:[{...historyAnswer(),is_correct:true}],error:null})},true),/Could not verify/);
});

test('Selection summary is optional for old sessions and validates server counts',()=>{
  assert.equal(selectionRationale(),null); assert.equal(selectionRationale(null),null);
  const summary={rule_version:'topic-difficulty-v1',target_difficulty:'medium',sample_count:0,correct_count:0,fallback_count:0};
  const s={...fixture(),selection_summary:summary}; assert.equal(readPracticeSession(s,id).selection_summary,summary);
  assert.match(selectionRationale(summary),/Building your practice history/);
  assert.match(selectionRationale({...summary,target_difficulty:'hard',sample_count:10,correct_count:8,fallback_count:1}),/8\/10.*Other difficulties/);
  assert.match(selectionRationale({...summary,target_difficulty:null}),/Random practice/);
  for(const change of [{rule_version:'unknown'},{target_difficulty:'invalid'},{sample_count:11},{sample_count:1.5},{correct_count:1},{fallback_count:2},{fallback_count:-1},{target_difficulty:null,sample_count:1}])
    assert.throws(()=>readPracticeSession({...fixture(),selection_summary:{...summary,...change}},id),/summary could not be verified/);
});
