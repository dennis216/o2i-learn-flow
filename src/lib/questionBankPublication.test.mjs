import assert from 'node:assert/strict';
import test from 'node:test';
import { precheckQuestionPublication,loadQuestionPublicationState,recordQuestionVersionReview,saveQuestionBankRevision,
  publishQuestionVersions,publishQuestionVersion,republishQuestion,unpublishQuestion,archiveQuestion,QuestionPublicationError } from './questionBankPublication.ts';
const target=(q='q',v='v',action='publish')=>({question_id:q,version_id:v,expected_fingerprint:'expected-old-snapshot',action});
const precheck=(t=target())=>({question_id:t.question_id,version_id:t.version_id,action:t.action,question_status:'draft',version_status:'draft',
  current_version_id:null,working_version_id:t.version_id,fingerprint:t.expected_fingerprint,eligible:false,
  issues:[{code:'QB_REVIEW_REQUIRED',field:'review',message:'Explicit human confirmation is required.'}],review:null});
const result=(t=target(),status='approved')=>({question_id:t.question_id,version_id:t.version_id,action:t.action,status,
  current_version_id:status==='retired'?null:t.version_id,event_id:'server-event',fingerprint:'new-snapshot'});
const client=handler=>({calls:[],async rpc(name,args){this.calls.push([name,structuredClone(args)]);return handler(name,args);}});
const review={confirmed:true};
const metadata={difficulty:'hard',calculator_policy:null,course_scope:'AB',representation_type:'analytical',primary_topic_code:'1.1',
  practice_skill_codes:['1.A'],source_page:'12-13',source_locator:'p012-item01'};

test('precheck and state are read-only, including blocked drafts and withdrawn questions',async()=>{
  const c=client(name=>({data:name==='precheck_question_publication'?precheck():{question_id:'q',external_id:'SYNTHETIC',status:'unpublished',current_version_id:'v',versions:[],events:[]},error:null}));
  assert.equal((await precheckQuestionPublication(c,'q','v')).eligible,false);
  assert.equal((await loadQuestionPublicationState(c,'q')).status,'unpublished');
  assert.deepEqual(c.calls.map(x=>x[0]),['precheck_question_publication','get_question_publication_state']);
});
test('explicit review carries only manual input and expected snapshot; caller cannot supply server audit fields',async()=>{
  const c=client(()=>({data:{review_id:'server-review',precheck:{...precheck(),eligible:true,issues:[]}},error:null}));
  const r=await recordQuestionVersionReview(c,target(),review);assert.equal(r.reviewId,'server-review');
  assert.equal(c.calls[0][0],'record_question_version_review');assert.deepEqual(c.calls[0][1]._review,review);
  assert.equal(c.calls[0][1]._expected_fingerprint,'expected-old-snapshot');assert.equal(c.calls[0][1]._review.reviewed_by,undefined);
});
test('revision creation happens only through explicit save and uses the existing bounded metadata payload',async()=>{
  const c=client(()=>({data:{question_id:'q',version_id:'new-draft',status:'draft'},error:null}));
  assert.deepEqual(await saveQuestionBankRevision(c,target(),metadata),{questionId:'q',versionId:'new-draft'});
  assert.equal(c.calls[0][0],'save_question_bank_revision');assert.equal(c.calls[0][1]._source_version_id,'v');
  assert.deepEqual(c.calls[0][1]._metadata,metadata);assert.equal(c.calls[0][1]._metadata.stem,undefined);
});
test('single publication and restoration use the same explicit atomic batch endpoint, never legacy approval',async()=>{
  const c=client((name,args)=>{assert.equal(name,'publish_question_versions');return {data:args._items.map(t=>result(t)),error:null};});
  await publishQuestionVersion(c,target());await republishQuestion(c,target());
  assert.equal(c.calls[0][1]._items[0].action,'publish');assert.equal(c.calls[1][1]._items[0].action,'republish');
  assert.ok(c.calls.every(call=>!call[0].includes('approve_question')));
});
test('batch result order follows server IDs; duplicate IDs and batch limits cause zero requests',async()=>{
  const targets=[target('q1','v1'),target('q2','v2')],c=client(()=>({data:targets.toReversed().map(t=>result(t)),error:null}));
  assert.deepEqual((await publishQuestionVersions(c,targets)).map(r=>r.question_id),['q2','q1']);
  const empty=client(()=>assert.fail('Must not call database'));
  for(const values of [[],Array.from({length:21},()=>target())])await assert.rejects(publishQuestionVersions(empty,values),e=>e.code==='QB_BATCH_LIMIT');
  for(const values of [[target(),target()],[target('q1','v'),target('q2','v')]])await assert.rejects(publishQuestionVersions(empty,values),e=>e.code==='QB_DUPLICATE_TARGET');
  assert.equal(empty.calls.length,0);
});
test('withdraw/archive preserve exact target and expected old value; status is never inferred from the click',async()=>{
  const c=client(name=>({data:result(target(),name==='archive_question'?'retired':'unpublished'),error:null}));
  assert.equal((await unpublishQuestion(c,target())).current_version_id,'v');assert.equal((await archiveQuestion(c,target())).current_version_id,null);
  assert.ok(c.calls.every(([,args])=>args._version_id==='v'&&args._expected_fingerprint==='expected-old-snapshot'));
});
test('stable server issue codes survive translated messages and failed requests are never automatically retried',async()=>{
  const c=client(()=>({data:null,error:{code:'P0001',message:'Any translated message',details:JSON.stringify({code:'QB_TAXONOMY',flag:'ANSWER_AI_INFERRED'})}}));
  await assert.rejects(publishQuestionVersion(c,target()),e=>e instanceof QuestionPublicationError&&e.code==='QB_TAXONOMY'&&e.details.flag==='ANSWER_AI_INFERRED');
  assert.equal(c.calls.length,1);
  const permission=client(()=>({data:null,error:{code:'42501',message:'permission denied',details:''}}));
  await assert.rejects(loadQuestionPublicationState(permission,'q'),e=>e.code==='QB_FORBIDDEN');
});
test('incomplete or mismatched mutation results require state verification instead of fake success or blind retry',async()=>{
  for(const value of [[],[result(target('wrong','v'))],[result(),result()],[{...result(),current_version_id:'another-version'}]]){
    const c=client(()=>({data:value,error:null}));await assert.rejects(publishQuestionVersion(c,target()),e=>e.code==='QB_RESULT_UNVERIFIED');assert.equal(c.calls.length,1);
  }
  await assert.rejects(unpublishQuestion(client(()=>({data:{},error:null})),target()),e=>e.code==='QB_RESULT_UNVERIFIED');
  await assert.rejects(precheckQuestionPublication(client(()=>({data:{},error:null})),'q','v'),e=>e.code==='QB_RESULT_UNVERIFIED');
});
