import assert from 'node:assert/strict';
import { test } from 'node:test';
import { selectionRationale, parsePracticeRoute, readPracticeSession, startPractice, submitPractice, loadPracticeHome, loadPracticeHistory, loadPracticeStatistics, startContinuousPractice, endContinuousPractice, loadOpenContinuousPractice, continuousPracticePath, continuousReasonText, topicStatusBasis } from './studentPractice.ts';
const id='11111111-1111-4111-8111-111111111111', qid='22222222-2222-4222-8222-222222222222', oid='33333333-3333-4333-8333-333333333333';
const fixture=()=>({id,topic_id:id,created_at:'2026-01-01',questions:[{question_id:qid,version_id:id,stem:'Test',topic:{id},skills:['1.A'],options:[{id:oid,key:'A',text:'A'},{id:qid,key:'B',text:'B'}],attempt:null}]});
const statistics = (sessions, attempts, correct) => ({ sessionCount: sessions, attemptCount: attempts, correctCount: correct,
  sources: [{ source: 'arena', sessionCount: 0, attemptCount: 0, correctCount: 0 }, { source: 'practice', sessionCount: sessions, attemptCount: attempts, correctCount: correct }] });
test('Statistics use one account-scoped snapshot with source totals', async () => {
  const expected = statistics(8, 24, 12), calls = [];
  const client = { rpc: async (name, args) => { calls.push({ name, args }); return { data: expected, error: null }; } };
  assert.deepEqual(await loadPracticeStatistics(client, id), expected);
  assert.deepEqual(calls, [{ name: 'get_question_practice_statistics', args: { _user_id: id } }]);
  const mixed = { ...statistics(9, 27, 14), sources: [{ source: 'arena', sessionCount: 1, attemptCount: 3, correctCount: 2 }, expected.sources[1]] };
  assert.deepEqual(await loadPracticeStatistics({ rpc: async () => ({ data: mixed }) }, id), mixed);
});
test('Statistics reject failed, malformed or inconsistent totals and sources', async () => {
  const good = statistics(2, 5, 3);
  await assert.rejects(loadPracticeStatistics({ rpc: async () => ({ error: { message: 'Unavailable' } }) }, id), /Unavailable/);
  for (const data of [null, {}, { ...good, sources: [] }, { ...good, attemptCount: 6 }, { ...good, sources: [good.sources[1], good.sources[1]] },
    { ...good, sources: [good.sources[0], { ...good.sources[1], source: 'unknown' }] },
    ...[null, undefined, -1, 1.5, '4', Infinity, Number.MAX_SAFE_INTEGER + 1].map(sessionCount => ({ ...good, sessionCount })),
    statistics(0, 1, 0), statistics(1, 2, 3)]) {
    await assert.rejects(loadPracticeStatistics({ rpc: async () => ({ data }) }, id), /verify/);
  }
  await assert.rejects(loadPracticeStatistics({ rpc() { assert.fail('Invalid account must not query'); } }, ''), /Sign in/);
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

const reason=(kind,extra={})=>({rule_version:'continuous-v1',kind,topic_code:'1.2',target_difficulty:'easy',topic_status:'needs_practice',...extra});
const recap=()=>({answered_count:0,new_count:0,new_correct_count:0,timed_seconds:null,topics:[],suggestion:null});
const continuous=(questions,extra={})=>({...fixture(),mode:'continuous',ended_at:null,questions,continuous:{rule_version:'continuous-v1',stuck:false,items:questions.map(q=>({question_id:q.question_id,reason:reason('start')})),recap:recap()},...extra});
const many=n=>Array.from({length:n},(_,i)=>({...fixture().questions[0],question_id:`22222222-2222-4222-8222-${String(i).padStart(12,'0')}`}));
test('Continuous sessions allow up to 100 issued questions; sets stay capped at five', () => {
  assert.equal(readPracticeSession(continuous(many(100)),id).questions.length,100);
  assert.throws(()=>readPracticeSession(continuous(many(101)),id));
  assert.throws(()=>readPracticeSession({...fixture(),questions:many(6)},id));
  assert.throws(()=>readPracticeSession({...fixture(),ended_at:'2026-01-02'},id),'Only continuous sessions can end');
});
test('Continuous records reject mismatched reasons, unknown kinds and impossible recap counts', () => {
  const ok=continuous(many(2));
  assert.equal(readPracticeSession(structuredClone(ok),id).continuous.items.length,2);
  const bad=[
    s=>{s.continuous.items.reverse();},
    s=>{s.continuous.items[0].reason.kind='mastered';},
    s=>{s.continuous.items[0].reason.topic_status='mastery_72';},
    s=>{s.continuous.recap.new_count=1;},
    s=>{s.continuous.recap.topics=[{topic_id:id,topic_code:'1.2',topic_title:'T',status:'stable',sample_count:7,correct_count:7}];},
    s=>{s.next_result='random';},
    s=>{delete s.continuous;},
  ];
  for(const change of bad){const s=structuredClone(ok);change(s);assert.throws(()=>readPracticeSession(s,id));}
  const legacy=structuredClone(ok);legacy.continuous.items[0].reason=null;assert.ok(readPracticeSession(legacy,id));
});
test('Continuous route, links and plain-language reasons', () => {
  assert.equal(parsePracticeRoute(new URLSearchParams(`subject=calculus&mode=continuous&topic=${id}`)).continuous,true);
  assert.ok(parsePracticeRoute(new URLSearchParams('mode=endless')).error);
  const path=new URLSearchParams(continuousPracticePath({topicId:id,courseId:qid,sessionId:oid}).split('?')[1]);
  assert.deepEqual(Object.fromEntries(path),{subject:'calculus',mode:'continuous',course:qid,topic:id,session:oid});
  assert.equal(continuousPracticePath({}),'/quiz?subject=calculus&mode=continuous');
  assert.match(continuousReasonText(reason('easier_after_error')),/incorrect.*easy question on Topic 1\.2/);
  assert.match(continuousReasonText(reason('review')),/still sticks/);
  assert.equal(continuousReasonText(null),null);
  assert.equal(topicStatusBasis({sample_count:4,correct_count:1}),'1 of your last 4 new questions correct on the first try.');
  assert.doesNotMatch(Object.values({a:topicStatusBasis({sample_count:6,correct_count:6})}).join(),/%|mastery/i);
});
test('Continuous RPC helpers bind scope, confirm the end and verify the open-session reminder', async () => {
  const calls=[];const client=data=>({rpc:async(name,args)=>{calls.push([name,args]);return {data,error:null};}});
  const s=continuous(many(1),{topic_id:id,next_result:'issued'});
  assert.equal((await startContinuousPractice(client(s),id,id)).next_result,'issued');
  assert.deepEqual(calls.at(-1),['start_continuous_question_practice',{_session_id:id,_topic_id:id,_course_id:undefined}]);
  await assert.rejects(startContinuousPractice(client(s),id,qid),/different practice scope/);
  await assert.rejects(startContinuousPractice(client({...s,mode:'set'}),id,id));
  await assert.rejects(endContinuousPractice(client(s),id),/could not be confirmed/);
  assert.ok((await endContinuousPractice(client({...s,ended_at:'2026-01-02T00:00:00Z'}),id)).ended_at);
  assert.equal(await loadOpenContinuousPractice(client(null)),null);
  const open={id,topic_id:null,course_id:null,created_at:'2026-01-01',topic_code:null,topic_title:null,answered_count:3};
  assert.deepEqual(await loadOpenContinuousPractice(client(open)),open);
  await assert.rejects(loadOpenContinuousPractice(client({...open,answered_count:0})));
});

test('Arena history accepts frozen runs up to 100 questions, rejects unknown sources and keeps set limit', async () => {
  const value = fixture(); value.source = 'arena';
  value.questions = Array.from({ length: 6 }, (_, i) => ({ ...fixture().questions[0], question_id: `22222222-2222-4222-8222-${String(i).padStart(12, '0')}` }));
  assert.equal(readPracticeSession(value, id).questions.length, 6);
  assert.throws(() => readPracticeSession({ ...value, source: 'practice' }, id));
  assert.throws(() => readPracticeSession({ ...fixture(), source: 'invented' }, id));
  for (const source of ['arena', 'practice']) assert.equal((await loadPracticeHistory({ rpc: async () => ({ data: [{ ...historyAnswer(), source }] }) }))[0].source, source);
  await assert.rejects(loadPracticeHistory({ rpc: async () => ({ data: [{ ...historyAnswer(), source: 'invented' }] }) }));
});
