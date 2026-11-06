import assert from 'node:assert/strict';
import test from 'node:test';
import { batchPlan, runImport, verifyExisting } from './import-batch.mjs';

const references={topics:[{id:'t',topic_code:'1.1',title:'Synthetic'}],skills:[{id:'s',skill_code:'1.A',description:'Synthetic'}]};
const batch=()=>({sources:[{source_id:'synthetic',source_sha256:'a'.repeat(64),batch_id:'test',conversion_version:'v1'}],questions:[{
 external_id:'arena_legacy_synthetic',source_document:'Legacy Arena bank',stem:'Synthetic $x$',solution:'Synthetic solution',correct_option_key:'A',
 difficulty:'easy',course_scope:'BOTH',primary_topic_code:'1.1',practice_skill_codes:'1.A',representation_type:'analytical',calculator_policy:'no_calculator',requires_figure:false,
 human_review_status:'pending',math_review_status:'pending',source_rights_status:'pending',taxonomy_review_status:'pending',render_review_status:'pending'}],
 options:['A','B','C','D'].map(k=>({question_external_id:'arena_legacy_synthetic',option_key:k,option_text:'Synthetic '+k,is_correct:k==='A'}))});
function stored(item) {return {question:{id:'q',external_id:item.external_id,status:'draft',current_version_id:null},
 versions:[{id:'v',...structuredClone(item),status:'draft',question_id:'q',primary_topic_id:'t',source_reference:'arena:synthetic'}],
 options:item.options.map((o,i)=>({...structuredClone(o),order_index:i+1})),topic_code:'1.1',skill_codes:['1.A']};}
function mock({timeout=false,initial=null,fail=false}={}) {
 const client={actual:initial,writes:0,from(table){return {select(){return this;},in(){return this;},eq(){return this;},then(resolve){
  const a=client.actual;resolve({data:!a?[]:table==='questions'?[a.question]:table==='question_versions'?a.versions:table==='question_options'?a.options:[{practice_skill_id:'s'}],error:null});
 }};},async rpc(name,args){assert.equal(name,'save_question_bank_drafts');client.writes++;if(!fail)client.actual=stored(args._items[0]);return timeout||fail?{data:null,error:{message:'synthetic timeout'}}:{data:[{question_id:'q',version_id:'v'}],error:null};}};
 return client;
}
test('shared validator rejects invented approval, bad provenance, unknown taxonomy and malformed content',()=>{
 assert.equal(batchPlan(batch(),references).length,1);
 for(const mutate of [b=>b.questions[0].human_review_status='approved',b=>b.sources[0].source_sha256='bad',b=>b.questions[0].primary_topic_code='99.9',b=>b.questions[0].source_page='1',b=>b.options[1].is_correct=true]) {
  const b=batch();mutate(b);assert.throws(()=>batchPlan(b,references));
 }
});
test('dry run writes nothing; committed timeout reconciles and rerun does not create another draft',async()=>{
 const b=batch(),client=mock({timeout:true});
 assert.deepEqual(await runImport({client,batch:b,references}),{dry_run:true,total:1,existing:0,to_save:1});assert.equal(client.writes,0);
 assert.equal((await runImport({client,batch:b,references,apply:true})).verified.length,1);assert.equal(client.writes,1);
 assert.equal((await runImport({client,batch:b,references,apply:true})).existing,1);assert.equal(client.writes,1);
 const failed=mock({fail:true});await assert.rejects(runImport({client:failed,batch:b,references,apply:true}),/incomplete/);assert.equal(failed.writes,1);
});
test('same ID with divergent content or extra revision stops before any write; published exact content is retained',async()=>{
 const b=batch(),item=batchPlan(b,references)[0],a=stored(item);
 a.versions[0].stem='Changed';const c=mock({initial:a});
 await assert.rejects(runImport({client:c,batch:b,references,apply:true}),/differs/);assert.equal(c.writes,0);
 const published=stored(item);published.question.status='approved';published.question.current_version_id='v';published.versions[0].status='approved';
 assert.equal(verifyExisting(item,published).status,'approved');
 published.versions.push({...published.versions[0],id:'new'});assert.throws(()=>verifyExisting(item,published),/multiple revisions/);
});
