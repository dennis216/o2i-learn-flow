import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { originalReviewFlags, loadPublicationPlan, validatePublicationSelection, confirmPublicationPlan } from './questionBankPublicationWorkflow.ts';
const plan=(id='q',ready=false)=>({item:{id,versionId:`${id}-v1`,externalId:`SYNTHETIC-${id}`,versionStatus:'draft',questionStatus:'draft'},
  check:{question_id:id,version_id:`${id}-v1`,action:'publish',fingerprint:`${id}-old`,eligible:ready,issues:[],review:ready?{current:true,id:'legacy'}:null},
  printedNumber:null,locator:'p012-item01',sourcePage:12,sourceDocument:'SYNTHETIC.pdf',flags:['ANSWER_AI_INFERRED'],
  calculator:null,sourceType:null,locatorVerified:false,evidence:{human_review_status:'approved',ai_flags:['ANSWER_AI_INFERRED']}});
const selected=(...ids)=>new Set(ids);
const client=handler=>({calls:[],async rpc(name,args){this.calls.push([name,args]);return handler(name,args);}});
const result=t=>({question_id:t.question_id,version_id:t.version_id,action:t.action,status:'approved',current_version_id:t.version_id,event_id:'e'});
const success=(p=plan())=>client((name,args)=>({data:name==='record_question_version_review'?{review_id:'r',precheck:{...p.check,eligible:true,fingerprint:'new'}}
  :name==='publish_question_versions'?args._items.map(result):{question_id:p.item.id,status:'approved',current_version_id:p.item.versionId,versions:[],events:[]},error:null}));

test('original flags are reference only; malformed evidence remains intact rather than blocking publication',()=>{
  assert.deepEqual(originalReviewFlags({ai_flags:['B','A'],original_import_evidence:{ai_flags:['C','A']}}),['A','B','C']);
  const raw={ai_flags:'legacy unsupported format',original_import_evidence:{ai_flags:['D',null]}};
  assert.deepEqual(originalReviewFlags(raw),['D']);assert.equal(raw.ai_flags,'legacy unsupported format');
});
test('one real confirmation suffices with null facts, unverified locator and unresolved original flags',()=>{
  const p=plan();assert.throws(()=>validatePublicationSelection([p],selected('q'),false),/Confirm/);
  const before=structuredClone(p),[chosen]=validatePublicationSelection([p],selected('q'),true);
  assert.deepEqual(chosen.review,{confirmed:true});assert.deepEqual(p,before);
});
test('old genuine reviews do not preconfirm the current selection in the browser',async()=>{
  const p=plan('q',true),c=success(p);
  await assert.rejects(confirmPublicationPlan(c,[p],selected('q'),false),/Confirm/);assert.equal(c.calls.length,0);
  await confirmPublicationPlan(c,[p],selected('q'),true);
  assert.deepEqual(c.calls[0][1]._review,{confirmed:true});
});
test('full explicit scope allows exclusions, rejects over-20/unknown IDs and never skips selected content blockers',()=>{
  const plans=Array.from({length:21},(_,i)=>plan(`q${i}`,true));
  assert.throws(()=>validatePublicationSelection(plans,selected(...plans.map(p=>p.item.id)),true),/1–20/);
  assert.equal(validatePublicationSelection(plans,selected('q0','q20'),true).length,2);
  assert.throws(()=>validatePublicationSelection(plans,selected('unknown'),true),/1–20/);
  plans[0].check.issues=[{code:'QB_OPTION_COUNT',field:'options',message:'Translated message'}];
  assert.throws(()=>validatePublicationSelection(plans,selected('q0','q20'),true),/content/);
  assert.equal(validatePublicationSelection(plans,selected('q20'),true).length,1);
});
test('loading and cancelling perform only reads and never infer confirmation from XLSX claims',async()=>{
  const p=plan(),c=client(()=>({data:{...p.check,question_status:'draft'},error:null}));
  c.from=()=>{const builder={};for(const key of ['select','eq','single'])builder[key]=()=>builder;
    builder.then=resolve=>resolve({data:{id:p.item.versionId,status:'draft',calculator_policy:null,source_type:null,source_locator_verified:false,
      source_question_number:null,source_locator:p.locator,source_page:12,source_document:'SYNTHETIC.pdf',import_evidence:p.evidence},error:null});return builder;};
  const loaded=await loadPublicationPlan(c,p.item);assert.equal(loaded[0].calculator,null);assert.deepEqual(loaded[0].evidence,p.evidence);
  assert.deepEqual(c.calls.map(c=>c[0]),['precheck_question_publication']);
});
test('final Publish records explicit review, uses refreshed fingerprint, publishes once and verifies readback',async()=>{
  const p=plan(),c=success();assert.equal(await confirmPublicationPlan(c,[p],selected('q'),true),1);
  assert.deepEqual(c.calls.map(c=>c[0]),['record_question_version_review','publish_question_versions','get_question_publication_state']);
  assert.deepEqual(c.calls[0][1]._review,{confirmed:true});assert.equal(c.calls[1][1]._items[0].expected_fingerprint,'new');
});
test('any selected content blocker stops all writes; a rejected review never triggers publication',async()=>{
  const a=plan('a'),b=plan('b');b.check.issues=[{code:'QB_FIGURE_REQUIRED',field:'image_url',message:'Missing'}];
  const c=client(()=>({data:null,error:{code:'42501',message:'permission denied'}}));
  await assert.rejects(confirmPublicationPlan(c,[a,b],selected('a','b'),true),/content/);assert.equal(c.calls.length,0);
  await assert.rejects(confirmPublicationPlan(c,[a],selected('a'),true),e=>e.code==='QB_FORBIDDEN');assert.equal(c.calls.length,1);
});
test('batch failure and uncertain readback never report success or retry mutations',async()=>{
  const p=plan(),c=client(name=>name==='record_question_version_review'?{data:{review_id:'r',precheck:{...p.check,eligible:true}},error:null}
    :{data:null,error:{code:'P0001',message:'changed',details:'{"code":"QB_STALE"}'}});
  await assert.rejects(confirmPublicationPlan(c,[p],selected('q'),true),e=>e.code==='QB_STALE');assert.equal(c.calls.length,2);
  const bad=success();const rpc=bad.rpc;bad.rpc=async function(name,args){return name==='get_question_publication_state'
    ?{data:{question_id:'q',status:'unpublished',versions:[],events:[]},error:null}:rpc.call(this,name,args);};
  await assert.rejects(confirmPublicationPlan(bad,[p],selected('q'),true),/readback/);
});
test('UI removes old inputs and second confirmation while retaining cancel, batch and write protection',()=>{
  const read=file=>readFileSync(new URL(`../components/admin/${file}`,import.meta.url),'utf8');
  const dialog=read('QuestionBankPublicationDialog.tsx');assert.match(dialog,/onClick=\{\(\) => void publish\(\)\}/);
  assert.match(dialog,/onClick=\{onClose\}>Cancel/);assert.match(dialog,/writing\.current/);assert.match(dialog,/Maximum 20/);
  assert.match(dialog,/useState\(false\)/);assert.match(dialog,/setConfirmed\(false\)/);
  assert.doesNotMatch(dialog,/alertdialog|ReviewFields|Resolution for|Verified calculator|Confirm and publish|textarea/);
  for(const file of ['QuestionBankLibrary.tsx','QuestionBankPublicationDialog.tsx','QuestionBankLifecycleDialog.tsx'])assert.doesNotMatch(read(file),/\.from\([^)]*\)\s*\.(insert|update|upsert|delete)\(/);
});
