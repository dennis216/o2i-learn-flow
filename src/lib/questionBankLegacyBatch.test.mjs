import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { parseLegacyArenaBatch, uploadLegacyArenaAssets } from './questionBankLegacyBatch.ts';
import { validateQuestionBankSheets } from './questionBankImport.ts';
import { buildQuestionBankDraftSavePlan } from './questionBankDraftSave.ts';
const base='https://synthetic.example/storage/v1/object/public/practice-images/';
const refs={topics:[{id:'t',topic_code:'1.1',title:'Synthetic'}],skills:[{id:'s',skill_code:'1.A',description:'Synthetic'}],existingExternalIds:new Set()};
const fixture=()=>({batch_id:'test',conversion_version:'v1',sources:[{source_id:'synthetic',source_sha256:'a'.repeat(64),batch_id:'test',conversion_version:'v1'}],
 questions:[{external_id:'arena_legacy_synthetic',stem:'Synthetic $x$',solution:'Synthetic solution',source_document:'Legacy Arena bank',source_page:null,
 correct_option_key:'A',difficulty:'easy',course_scope:'BOTH',primary_topic_code:'1.1',practice_skill_codes:'1.A',representation_type:'analytical',
 calculator_policy:'no_calculator',requires_figure:false,human_review_status:'pending',math_review_status:'pending',source_rights_status:'pending',taxonomy_review_status:'pending',render_review_status:'pending'}],
 options:['A','B','C','D'].map(k=>({question_external_id:'arena_legacy_synthetic',option_key:k,option_text:'Synthetic '+k,is_correct:k==='A'})),assets:[]});
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jQ0sAAAAASUVORK5CYII=','base64');
const withImage=()=>{const b=fixture(),hash=createHash('sha256').update(png).digest('hex');b.assets=[{path:`arena-legacy/${hash}.png`,sha256:hash,base64:png.toString('base64')}];b.questions[0].requires_figure=true;b.questions[0].image_url=base+b.assets[0].path;b.questions[0].figure_reference='arena:synthetic';return b;};
test('explicit native batch reuses the common validator and produces pending draft payload without fake pages',async()=>{
 const parsed=await parseLegacyArenaBatch(fixture(),base);
 assert.equal(validateQuestionBankSheets(parsed.sheets).questions[0].readiness,'blocked');
 const report=validateQuestionBankSheets(parsed.sheets,{topicCodes:new Set(['1.1']),practiceSkillCodes:new Set(['1.A'])},parsed.legacySources);
 const plan=buildQuestionBankDraftSavePlan(report,refs);assert.equal(plan.canSave,true,plan.batchReasons.join('\n'));
 assert.equal(plan.payload[0].source_page,null);assert.equal(plan.payload[0].import_evidence.human_review_status,'pending');
 assert.equal(plan.payload[0].import_evidence.legacy_arena.source_id,'synthetic');
});
test('forged approval, provenance, duplicate identities and non-calculator policy violations fail before upload',async()=>{
 for(const change of [b=>b.questions[0].human_review_status='approved',b=>b.sources[0].source_sha256='bad',b=>b.questions.push({...b.questions[0]}),b=>b.questions[0].reviewed_by='Invented',b=>b.questions[0].calculator_policy='calculator_required',b=>b.sources[0].batch_id='other']){
  const b=fixture();change(b);await assert.rejects(parseLegacyArenaBatch(b,base));
 }
});
test('PNG bytes, hash, exact project URL and references are checked; preview uses local data and creates no uploads',async()=>{
 const parsed=await parseLegacyArenaBatch(withImage(),base);assert.ok(parsed.assets[0].previewUrl.startsWith('data:image/png;base64,'));assert.deepEqual(Buffer.from(parsed.assets[0].bytes),png);
 for(const change of [b=>b.assets[0].base64='SGVsbG8=',b=>b.questions[0].image_url='https://other.example/image.png',b=>b.assets=[],b=>b.assets.push({...b.assets[0]})]){
  const b=withImage();change(b);await assert.rejects(parseLegacyArenaBatch(b,base));
 }
});
test('Save uploads without overwrite and checks readback; existing or raced identical assets are safe, altered bytes fail',async()=>{
 const {assets}=await parseLegacyArenaBatch(withImage(),base);let stored=null,uploads=0;
 const bucket={async download(){return stored?{data:new Blob([stored]),error:null}:{data:null,error:{message:'not found'}};},async upload(path,blob,options){assert.equal(options.upsert,false);assert.equal(options.contentType,'image/png');uploads++;stored=Buffer.from(await blob.arrayBuffer());return {error:null};}};
 const client={storage:{from(name){assert.equal(name,'practice-images');return bucket;}}};
 await uploadLegacyArenaAssets(client,assets);assert.equal(uploads,1);await uploadLegacyArenaAssets(client,assets);assert.equal(uploads,1);
 stored=Buffer.from('altered');await assert.rejects(uploadLegacyArenaAssets(client,assets),/readback failed/);assert.equal(uploads,1);
 stored=null;bucket.upload=async()=>{uploads++;stored=png;return {error:{message:'raced'}};};await uploadLegacyArenaAssets(client,assets);assert.equal(uploads,2);
});
