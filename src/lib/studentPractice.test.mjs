import assert from 'node:assert/strict';
import { test } from 'node:test';
import { selectionRationale, parsePracticeRoute, readPracticeSession, startPractice, submitPractice, loadPracticeHome, loadPracticeHistory, loadPracticeStatistics } from './studentPractice.ts';
const id='11111111-1111-4111-8111-111111111111', qid='22222222-2222-4222-8222-222222222222', oid='33333333-3333-4333-8333-333333333333';
const fixture=()=>({id,topic_id:id,created_at:'2026-01-01',questions:[{question_id:qid,version_id:id,stem:'Test',topic:{id},skills:['1.A'],options:[{id:oid,key:'A',text:'A'},{id:qid,key:'B',text:'B'}],attempt:null}]});
function countClient(results, calls = []) {
  return { from(table) {
    const result = results[calls.length];
    const call = { table, filters: [] }; calls.push(call);
    return { select(column, options) {
      Object.assign(call, { column, options });
      return { eq(key, value) { call.filters.push([key, value]); return this; }, then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); } };
    } };
  } };
}
test('Statistics use exact server counts for all own history, including beyond ten answers', async () => {
  const calls = [];
  assert.deepEqual(await loadPracticeStatistics(countClient([8, 24, 12].map(count => ({ count, error: null })), calls), id), { sessionCount: 8, attemptCount: 24, correctCount: 12 });
  assert.deepEqual(calls.map(c => c.table), ['question_practice_sessions', 'question_practice_attempts', 'question_practice_attempts']);
  for (const c of calls) { assert.equal(c.column, 'id'); assert.deepEqual(c.options, { count: 'exact', head: true }); assert.deepEqual(c.filters[0], ['user_id', id]); }
  assert.deepEqual(calls[2].filters[1], ['is_correct', true]);
  for (const counts of [[0,0,0], [3,0,0], [3,11,0], [3,11,11]]) {
    assert.deepEqual(await loadPracticeStatistics(countClient(counts.map(count => ({ count, error: null }))), id), { sessionCount: counts[0], attemptCount: counts[1], correctCount: counts[2] });
  }
});
test('Statistics reject failed, missing, malformed or inconsistent counts rather than inventing zero', async () => {
  for (let i = 0; i < 3; i++) {
    for (const bad of [{ count: null, error: { message: 'Count unavailable' } }, ...[null, undefined, -1, 1.5, '4', Infinity, Number.MAX_SAFE_INTEGER + 1].map(count => ({ count, error: null }))]) {
      const results = [2,5,3].map(count => ({ count, error: null })); results[i] = bad;
      await assert.rejects(loadPracticeStatistics(countClient(results), id));
    }
  }
  for (const counts of [[1,2,3], [0,1,0]]) await assert.rejects(loadPracticeStatistics(countClient(counts.map(count => ({ count, error: null }))), id), /Retry/);
  await assert.rejects(loadPracticeStatistics({ from() { assert.fail('Invalid account must not query'); } }, ''), /Sign in/);
});
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

test('New client submits through the server-graded legacy RPC only when the exact v2 endpoint is missing',async()=>{
  const calls=[];
  const saved=fixture();saved.questions[0].attempt={id,selected_option_id:oid,is_correct:true,submitted_at:'2026-10-21T00:00:00Z',elapsed_seconds:12,correct_option_id:oid,solution:'Server solution'};
  const client={rpc:async(name,args)=>{
    calls.push({name,args});
    return name==='submit_question_practice_v2'
      ? {data:null,error:{code:'PGRST202',message:'Could not find the function public.submit_question_practice_v2(_elapsed_seconds, _option_id, _question_id, _selection_trajectory, _session_id, _timing_complete) in the schema cache'}}
      : {data:saved,error:null};
  }};
  const result=await submitPractice(client,id,qid,oid,12,{trajectory:[{option_id:oid,elapsed_seconds:10}],complete:true});
  assert.deepEqual(calls.map(call=>call.name),['submit_question_practice_v2','submit_question_practice']);
  assert.deepEqual(calls[1].args,{_session_id:id,_question_id:qid,_option_id:oid,_elapsed_seconds:12});
  assert.equal(result.questions[0].attempt.is_correct,true);
  assert.equal(result.questions[0].attempt.timing_complete,undefined,'Do not invent reliable telemetry for an old backend');
  assert.equal(result.questions[0].attempt.selection_trajectory,undefined);
});

test('Permission, SQL, transport, other missing RPCs, and unverified saves never trigger another write path',async()=>{
  for(const error of [
    {code:'42501',message:'Permission denied'},
    {code:'22023',message:'Invalid trajectory'},
    {code:'PGRST301',message:'JWT expired'},
    {code:'PGRST202',message:'Could not find the function public.some_other_rpc() in the schema cache'},
    {code:'',message:'Failed to fetch'},
    {code:'PGRST000',message:'Database unavailable'},
  ]) {
    const calls=[];const client={rpc:async name=>{calls.push(name);return {data:null,error};}};
    await assert.rejects(submitPractice(client,id,qid,oid,12,{trajectory:null,complete:false}));
    assert.deepEqual(calls,['submit_question_practice_v2'],JSON.stringify(error));
  }
  let calls=0;
  await assert.rejects(submitPractice({rpc:async()=>{calls++;throw new Error('Lost response');}},id,qid,oid,12,{trajectory:null,complete:false}),/Lost response/);
  assert.equal(calls,1);
  calls=0;
  await assert.rejects(submitPractice({rpc:async()=>{calls++;return {data:fixture(),error:null};}},id,qid,oid,12,{trajectory:null,complete:false}),/save could not be verified/);
  assert.equal(calls,1);
});

test('A refused or unverifiable legacy fallback remains an error, with no recursive retries',async()=>{
  for(const legacy of [{data:null,error:{code:'42501',message:'Session not available'}},{data:fixture(),error:null}]) {
    const calls=[];
    const client={rpc:async name=>{calls.push(name);return name==='submit_question_practice_v2'
      ? {data:null,error:{code:'PGRST202',message:'Could not find the function public.submit_question_practice_v2() in the schema cache'}} : legacy;}};
    await assert.rejects(submitPractice(client,id,qid,oid,12,{trajectory:null,complete:false}));
    assert.deepEqual(calls,['submit_question_practice_v2','submit_question_practice']);
  }
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
test('Course routes validate UUID context and issue through the scoped RPC', async () => {
  assert.ok(parsePracticeRoute(new URLSearchParams('course=wrong&topic='+id)).error);
  assert.ok(parsePracticeRoute(new URLSearchParams('course='+id)).error);
  assert.ok(parsePracticeRoute(new URLSearchParams('course='+id+'&session='+qid)).error);
  assert.equal(parsePracticeRoute(new URLSearchParams('course='+id+'&topic='+qid)).courseId,id);
  let call;
  const session={...fixture(),course_id:id,topic_id:qid};
  const client={rpc:async(name,args)=>{call={name,args};return {data:session,error:null};}};
  assert.equal((await startPractice(client,id,qid,id)).course_id,id);
  assert.equal(call.name,'start_course_question_practice');assert.equal(call.args._course_id,id);
  await assert.rejects(startPractice(client,id,id,qid),/different course or Topic/);
});


test('Lesson identity is navigation context only and requires a canonical course/Topic scope',()=>{
  const scope=parsePracticeRoute(new URLSearchParams(`course=${id}&topic=${qid}&lesson=${id}`));assert.equal(scope.entryId,id);assert.equal(scope.topicId,qid);
  for(const query of [`lesson=${id}`,`topic=${qid}&lesson=${id}`,`course=${id}&topic=${qid}&lesson=bad`,`course=${id}&topic=${qid}&lesson=${id}&lesson=${qid}`]) assert.ok(parsePracticeRoute(new URLSearchParams(query)).error,query);
});
