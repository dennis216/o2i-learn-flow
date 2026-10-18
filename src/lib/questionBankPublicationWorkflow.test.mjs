import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { originalReviewFlags, emptyReviewWorkCopy, changeReviewFacts, buildHumanReview, loadPublicationPlan,
  validatePublicationSelection, confirmPublicationPlan } from './questionBankPublicationWorkflow.ts';

const plan = (id='q', ready=false) => ({item:{id,versionId:`${id}-v1`,externalId:`SYNTHETIC-${id}`,versionStatus:'draft',questionStatus:'draft'},
  check:{question_id:id,version_id:`${id}-v1`,action:'publish',fingerprint:`${id}-old`,eligible:ready,issues:[],review:ready?{current:true,id:'r'}:null},
  printedNumber:null,locator:'p012-item01',sourcePage:12,sourceDocument:'SYNTHETIC.pdf',flags:['ANSWER_AI_INFERRED'],
  calculator:null,sourceType:null,locatorVerified:false,evidence:{human_review_status:'approved',ai_flags:['ANSWER_AI_INFERRED']},form:emptyReviewWorkCopy()});
const manual = () => ({...emptyReviewWorkCopy('no_calculator','original'),locatorVerified:true,
  ...Object.fromEntries(['math','taxonomy','source','render'].map(key=>[key,{confirmed:true,notes:`Synthetic ${key} verification`} ])),
  resolutions:{ANSWER_AI_INFERRED:'Synthetic answer independently recomputed'}});
const selected = (...ids)=>new Set(ids);
const client = (handler) => ({calls:[],async rpc(name,args){this.calls.push([name,args]);return handler(name,args);}});
const result=t=>({question_id:t.question_id,version_id:t.version_id,action:t.action,status:'approved',current_version_id:t.version_id,event_id:'e'});

test('import claims never prefill human confirmations; original and current flags are retained',()=>{
  assert.deepEqual(originalReviewFlags({ai_flags:['B','A'],original_import_evidence:{ai_flags:['C','A']}}),['A','B','C']);
  for(const bad of [{ai_flags:null},{ai_flags:'A'},{ai_flags:['']},{original_import_evidence:{ai_flags:[null]}}])assert.throws(()=>originalReviewFlags(bad),/invalid/);
  const p=plan();for(const key of ['math','taxonomy','source','render'])assert.equal(p.form[key].confirmed,false);
  assert.throws(()=>buildHumanReview(p,p.form),/Confirm/);
});
test('all four explicit confirmations, rights basis, calculator, source location and flag explanations are required',()=>{
  const p=plan();assert.equal(buildHumanReview(p,manual()).source.locator_verified,true);
  for(const key of ['math','taxonomy','source','render']){
    const f=manual();f[key].confirmed=false;assert.throws(()=>buildHumanReview(p,f),/Confirm/);
    f[key]={confirmed:true,notes:' '};assert.throws(()=>buildHumanReview(p,f),/Confirm/);
  }
  for(const patch of [{calculator:''},{sourceType:''},{locatorVerified:false},{resolutions:{}}])assert.throws(()=>buildHumanReview(p,{...manual(),...patch}));
  p.printedNumber='7';assert.throws(()=>buildHumanReview(p,manual()),/printed/);
  assert.equal(buildHumanReview(p,{...manual(),printedNumberVerified:true}).source.printed_number_verified,true);
});
test('immutable review/publication facts cannot be silently changed by review fields',()=>{
  const p={...plan(),calculator:'no_calculator',sourceType:'original',locatorVerified:true};p.item.versionStatus='review';
  assert.doesNotThrow(()=>buildHumanReview(p,manual()));assert.throws(()=>buildHumanReview(p,{...manual(),sourceType:'licensed'}),/read-only/);
});

test('changing a calculator policy or source category clears all browser confirmations without erasing notes or flags',()=>{
  const original=manual();
  for(const patch of [{calculator:'calculator_allowed'},{sourceType:'licensed'}]){
    const changed=changeReviewFacts(original,patch);
    for(const key of ['math','taxonomy','source','render']){assert.equal(changed[key].confirmed,false);assert.equal(changed[key].notes,original[key].notes);}
    assert.deepEqual(changed.resolutions,original.resolutions);assert.equal(original.math.confirmed,true);
    assert.throws(()=>buildHumanReview(plan(),changed),/Confirm/);
  }
});
test('full explicit scope allows exclusions, rejects over-20/unknown IDs and never skips selected blockers',()=>{
  const plans=Array.from({length:21},(_,i)=>plan(`q${i}`,true));
  assert.throws(()=>validatePublicationSelection(plans,selected(...plans.map(p=>p.item.id)),selected()),/1–20/);
  assert.equal(validatePublicationSelection(plans,selected('q0','q20'),selected()).length,2);
  assert.throws(()=>validatePublicationSelection(plans,selected('unknown'),selected()),/1–20/);
  plans[0].check.issues=[{code:'QB_OPTION_COUNT',field:'options',message:'Translated message'}];
  assert.throws(()=>validatePublicationSelection(plans,selected('q0','q20'),selected()),/content/);
  assert.equal(validatePublicationSelection(plans,selected('q20'),selected()).length,1);
});
test('loading and cancelling a plan use only read requests, including a blocked pending draft',async()=>{
  const p=plan(),c=client(()=>({data:{...p.check,question_status:'draft'},error:null}));
  c.from=()=>{const builder={};for(const key of ['select','eq','single'])builder[key]=()=>builder;
    builder.then=resolve=>resolve({data:{id:p.item.versionId,status:'draft',calculator_policy:null,source_type:null,source_locator_verified:false,
      source_question_number:null,source_locator:p.locator,source_page:12,source_document:'SYNTHETIC.pdf',import_evidence:p.evidence},error:null});return builder;};
  const loaded=await loadPublicationPlan(c,p.item);assert.equal(loaded[0].form.math.confirmed,false);
  assert.deepEqual(c.calls.map(c=>c[0]),['precheck_question_publication']);
});
test('invalid manual form causes zero writes; valid final confirmation records review then one batch and readback',async()=>{
  const p=plan(),c=client((name,args)=>{
    if(name==='record_question_version_review')return {data:{review_id:'r',precheck:{...p.check,eligible:true,fingerprint:'new'}},error:null};
    if(name==='publish_question_versions')return {data:args._items.map(result),error:null};
    return {data:{question_id:'q',status:'approved',current_version_id:'q-v1',versions:[],events:[]},error:null};
  });
  await assert.rejects(confirmPublicationPlan(c,[p],selected('q'),selected()),/Confirm/);assert.equal(c.calls.length,0);
  p.form=manual();assert.equal(await confirmPublicationPlan(c,[p],selected('q'),selected()),1);
  assert.deepEqual(c.calls.map(c=>c[0]),['record_question_version_review','publish_question_versions','get_question_publication_state']);
  assert.equal(c.calls[1][1]._items[0].expected_fingerprint,'new');
});
test('valid version-bound confirmations are reused without another review write',async()=>{
  const p=plan('q',true),c=client((name,args)=>({data:name==='publish_question_versions'?args._items.map(result)
    :{question_id:'q',status:'approved',current_version_id:'q-v1',versions:[],events:[]},error:null}));
  await confirmPublicationPlan(c,[p],selected('q'),selected());assert.ok(!c.calls.some(c=>c[0]==='record_question_version_review'));
  assert.throws(()=>validatePublicationSelection([p],selected('q'),selected('q')),/Confirm/);
});
test('any selected invalid form blocks all writes; a rejected review never triggers publication',async()=>{
  const a=plan('a');a.form=manual();const b=plan('b');const c=client(()=>({data:null,error:{code:'42501',message:'permission denied'}}));
  await assert.rejects(confirmPublicationPlan(c,[a,b],selected('a','b'),selected()));assert.equal(c.calls.length,0);
  await assert.rejects(confirmPublicationPlan(c,[a],selected('a'),selected()),e=>e.code==='QB_FORBIDDEN');
  assert.deepEqual(c.calls.map(c=>c[0]),['record_question_version_review']);
});
test('batch failure and uncertain readback never report success or retry mutation',async()=>{
  const p=plan('q',true),c=client(()=>({data:null,error:{code:'P0001',message:'changed',details:'{"code":"QB_STALE"}'}}));
  await assert.rejects(confirmPublicationPlan(c,[p],selected('q'),selected()),e=>e.code==='QB_STALE');assert.equal(c.calls.length,1);
  const bad=client((name,args)=>({data:name==='publish_question_versions'?args._items.map(result):{question_id:'q',status:'unpublished',versions:[],events:[]},error:null}));
  await assert.rejects(confirmPublicationPlan(bad,[p],selected('q'),selected()),/readback/);assert.equal(bad.calls.length,2);
});
test('UI keeps confirmation writes separate from open/cancel, targets all pages and reuses shared metadata controls',()=>{
  const read=file=>readFileSync(new URL(`../components/admin/${file}`,import.meta.url),'utf8');
  const dialog=read('QuestionBankPublicationDialog.tsx');assert.match(dialog,/onClick=\{\(\) => void publish\(\)\}/);
  assert.match(dialog,/onClick=\{onClose\}>Cancel/);assert.match(dialog,/writing\.current/);assert.match(dialog,/Maximum 20/);
  for(const file of ['QuestionBankLibrary.tsx','QuestionBankPublicationDialog.tsx','QuestionBankLifecycleDialog.tsx'])assert.doesNotMatch(read(file),/\.from\([^)]*\)\s*\.(insert|update|upsert|delete)\(/);
  assert.match(read('QuestionBankDraftEditor.tsx'),/<QuestionBankMetadataFields/);
  assert.match(read('QuestionBankDraftEditor.tsx'),/saveQuestionBankRevision/);
});
