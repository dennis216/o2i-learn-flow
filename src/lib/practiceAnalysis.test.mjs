import assert from 'node:assert/strict';
import { test } from 'node:test';
import { practicePeriodBounds, loadPracticeAnalysis, loadAdminPracticeStatistics } from './practiceAnalysis.ts';
import { readPracticeSession, submitPractice, selectionRationale } from './studentPractice.ts';
const id='11111111-1111-4111-8111-111111111111',qid='22222222-2222-4222-8222-222222222222',oid='33333333-3333-4333-8333-333333333333';
const totals={attempt_count:0,distinct_count:0,correct_count:0,timing_count:0,average_seconds:null};
test('Period uses local inclusive calendar dates and exclusive next midnight, including DST',()=>{
  const original=process.env.TZ;process.env.TZ='America/Los_Angeles';
  try{
    assert.deepEqual(practicePeriodBounds('all','',''),{});
    assert.deepEqual(practicePeriodBounds('custom','2026-03-08','2026-03-08'),{_from:'2026-03-08T08:00:00.000Z',_to:'2026-03-09T07:00:00.000Z'});
    assert.deepEqual(practicePeriodBounds('7','','',new Date('2026-03-10T12:00:00Z')),{_from:'2026-03-04T08:00:00.000Z',_to:'2026-03-11T07:00:00.000Z'});
    for(const [from,to] of [['',''],['2026-02-30','2026-03-01'],['2026-03-10','2026-03-09']]) assert.throws(()=>practicePeriodBounds('custom',from,to));
  }finally{if(original===undefined)delete process.env.TZ;else process.env.TZ=original;}
});
test('Analysis fails closed on missing, inconsistent or invalid aggregate data',async()=>{
  const good={totals,units:[],topics:[],signals:[]};
  assert.deepEqual(await loadPracticeAnalysis({rpc:async()=>({data:good,error:null})},{}),good);
  for(const data of [null,{}, {...good,totals:{...totals,attempt_count:1}}, {...good,totals:{...totals,timing_count:1}},{...good,signals:[{kind:'invented'}]}]) await assert.rejects(loadPracticeAnalysis({rpc:async()=>({data,error:null})},{}),/verify/);
  await assert.rejects(loadAdminPracticeStatistics({rpc:async()=>({data:{attempt_count:0},error:null})},id,undefined,{}),/verify/);
  await assert.rejects(loadPracticeAnalysis({rpc:async()=>({data:null,error:{message:'Offline'}})},{}),/Offline/);
});
test('V2 submission sends trajectory but no correctness and validates frozen rationale and returned telemetry',async()=>{
  const a={id,selected_option_id:oid,is_correct:true,submitted_at:'2026-01-01',elapsed_seconds:60,correct_option_id:oid,solution:'Solution',selection_trajectory:[{option_id:qid,elapsed_seconds:18},{option_id:oid,elapsed_seconds:52}],timing_complete:true};
  const item={question_id:qid,kind:'error',topic_code:'1.1',representation_type:'analytical',skill_code:'1.A',skill_description:'Find derivatives',signal_count:1,target_difficulty:'medium'};
  const session={id,topic_id:id,questions:[{question_id:qid,version_id:id,stem:'Test',topic:{id},skills:[],options:[{id:oid,key:'A',text:'A'},{id:qid,key:'B',text:'B'}],attempt:a}],selection_summary:{rule_version:'practice-adaptation-v2',error_count:1,slow_count:0,fallback_count:0,items:[item]}};
  const calls=[];const client={rpc:async(name,args)=>{calls.push({name,args});return {data:session,error:null};}};
  await submitPractice(client,id,qid,oid,60,{trajectory:a.selection_trajectory,complete:true});
  assert.deepEqual(calls[0],{name:'submit_question_practice_v2',args:{_session_id:id,_question_id:qid,_option_id:oid,_elapsed_seconds:60,_selection_trajectory:a.selection_trajectory,_timing_complete:true}});
  assert.match(selectionRationale(session.selection_summary),/Find derivatives/);
  assert.equal(readPracticeSession({...session,selection_summary:null,adaptation_summary:session.selection_summary},id).selection_summary.rule_version,'practice-adaptation-v2');
  for(const change of [{items:[]},{error_count:0},{items:[{...item,question_id:id}]},{items:[{...item,signal_count:0}]}]) assert.throws(()=>readPracticeSession({...session,selection_summary:{...session.selection_summary,...change}},id),/summary/);
  assert.throws(()=>readPracticeSession({...session,questions:[{...session.questions[0],attempt:{...a,selection_trajectory:[{option_id:qid,elapsed_seconds:18}]}}]},id),/selection/);
});
