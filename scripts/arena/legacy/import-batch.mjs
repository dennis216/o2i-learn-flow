// Draft-only import through the existing permissioned RPC. No approval or publication calls.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { QUESTION_HEADERS, OPTION_HEADERS, validateQuestionBankSheets, legacyArenaSource } from '../../../src/lib/questionBankImport.ts';
import { buildQuestionBankDraftSavePlan } from '../../../src/lib/questionBankDraftSave.ts';
import { privateDirectory, sha256, verifySnapshot } from './snapshot.mjs';

export function batchPlan(batch, references) {
 assert.ok(batch.questions.length > 0 && batch.questions.length <= 50, 'Batch must contain 1–50 questions.');
 const sources=new Map(batch.sources.map(source=>['arena_legacy_'+source.source_id,source]));
 assert.equal(sources.size,batch.questions.length,'Every question needs one unique source.');
 for(const q of batch.questions) {
  assert.ok(legacyArenaSource(sources.get(q.external_id),q.external_id),'Invalid native source.');
  assert.equal(q.human_review_status,'pending','Import cannot claim human approval.');
  for(const field of ['math_review_status','source_rights_status','taxonomy_review_status','render_review_status']) assert.equal(q[field],'pending');
  assert.ok(!q.reviewed_by&&!q.reviewed_at,'Import cannot invent a human reviewer.');
 }
 const sheets=[{sheet:'Questions',data:[[...QUESTION_HEADERS],...batch.questions.map(q=>QUESTION_HEADERS.map(h=>q[h]??null))]},
  {sheet:'Options',data:[[...OPTION_HEADERS],...batch.options.map(o=>OPTION_HEADERS.map(h=>o[h]??null))]},
  {sheet:'Instructions',data:[['Private legacy Arena import; human review pending.']]}];
 const report=validateQuestionBankSheets(sheets,{topicCodes:new Set(references.topics.map(t=>t.topic_code)),practiceSkillCodes:new Set(references.skills.map(s=>s.skill_code))},sources);
 // Existing IDs are reconciled by exact content comparison below, never overwritten.
 const plan=buildQuestionBankDraftSavePlan(report,{...references,existingExternalIds:new Set()});
 assert.ok(plan.canSave,plan.batchReasons.join('\n'));
 return plan.payload;
}

const stable=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
export function verifyExisting(item, actual) {
 assert.equal(actual.versions.length,1,`${item.external_id}: multiple revisions require manual reconciliation`);
 const v=actual.versions[0];
 assert.ok(['draft','approved','unpublished'].includes(actual.question.status),'Unexpected question lifecycle');
 assert.ok(['draft','approved'].includes(v.status),'Unexpected version lifecycle');
 if(actual.question.status==='draft') assert.equal(actual.question.current_version_id,null);
 else assert.equal(actual.question.current_version_id,v.id);
 const fields=['stem','solution','difficulty','course_scope','representation_type','calculator_policy','source_document','source_page','source_question_number','source_locator','requires_figure','image_url','import_evidence'];
 for(const field of fields) assert.equal(stable(v[field]),stable(item[field]),`${item.external_id}: stored ${field} differs; stop without overwriting`);
 assert.equal(v.source_reference,'arena:'+item.import_evidence.legacy_arena.source_id);
 assert.equal(actual.topic_code,item.primary_topic_code);
 assert.deepEqual([...actual.skill_codes].sort(),[...item.practice_skill_codes].sort());
 const options=actual.options.sort((a,b)=>a.order_index-b.order_index);
 assert.equal(options.length,item.options.length);
 for(let i=0;i<options.length;i++) for(const field of ['option_key','option_text','is_correct','import_evidence']) assert.equal(stable(options[i][field]),stable(item.options[i][field]),`${item.external_id}: stored choice differs`);
 return {external_id:item.external_id,question_id:actual.question.id,version_id:v.id,status:actual.question.status};
}

const checked=async promise=>{const {data,error}=await promise;if(error)throw new Error(error.message);assert.ok(data,'Missing database response');return data;};
export async function runImport({client,batch,references,apply=false,assets=[]}) {
 const payload=batchPlan(batch,references);
 const reconcile=async()=>{
  const questions=await checked(client.from('questions').select('*').in('external_id',payload.map(q=>q.external_id)));
  const found=[];
  for(const question of questions) {
   const versions=await checked(client.from('question_versions').select('*').eq('question_id',question.id));
   assert.equal(versions.length,1,'Existing ID has multiple revisions; inspect manually.');
   const v=versions[0];
   const options=await checked(client.from('question_options').select('*').eq('question_version_id',v.id));
   const skills=await checked(client.from('question_practice_skills').select('practice_skill_id').eq('question_version_id',v.id));
   found.push(verifyExisting(payload.find(i=>i.external_id===question.external_id),{question,versions,options,
    topic_code:references.topics.find(t=>t.id===v.primary_topic_id)?.topic_code,
    skill_codes:skills.map(s=>references.skills.find(r=>r.id===s.practice_skill_id)?.skill_code)}));
  }
  return found;
 };
 let found=await reconcile();
 const pending=payload.filter(item=>!found.some(f=>f.external_id===item.external_id));
 if(!apply)return {dry_run:true,total:payload.length,existing:found.length,to_save:pending.length};
 for(const asset of assets) {
  assert.equal(sha256(asset.bytes),asset.sha256,'Asset hash mismatch');
  assert.equal(asset.path,`arena-legacy/${asset.sha256}.png`,'Unexpected asset path');
  assert.ok(asset.bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')),'Expected PNG');
  const bucket=client.storage.from('practice-images');
  const existing=await bucket.download(asset.path);
  if(existing.error) {
   const uploaded=await bucket.upload(asset.path,asset.bytes,{contentType:'image/png',upsert:false});
   if(uploaded.error) {
    // A concurrent identical upload is safe only after downloading and checking its bytes.
    const raced=await bucket.download(asset.path);
    if(raced.error||sha256(Buffer.from(await raced.data.arrayBuffer()))!==asset.sha256)throw new Error('Asset upload failed; no drafts saved.');
   }
  }
  const saved=await bucket.download(asset.path);
  if(saved.error)throw new Error('Asset readback failed; no drafts saved.');
  assert.equal(sha256(Buffer.from(await saved.data.arrayBuffer())),asset.sha256,'Stored asset differs');
 }
 let saveError;
 if(pending.length)try {await checked(client.rpc('save_question_bank_drafts',{_items:pending}));}catch(error){saveError=error;}
 // Even timeout/connection failures are reconciled by ID; no mutation is automatically retried.
 found=await reconcile();
 if(found.length!==payload.length)throw new Error(`Import incomplete (${found.length}/${payload.length}); rerun dry-run before retry. ${saveError?.message??''}`);
 return {dry_run:false,total:payload.length,existing:payload.length-pending.length,verified:found};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const [directory,batchFile,flag]=process.argv.slice(2);
 assert.ok(directory&&batchFile&&(!flag||flag==='--apply'),'Usage: import-batch.mjs <private-directory> <batch.json> [--apply]');
 const base=privateDirectory(directory),manifest=verifySnapshot(base);
 const batch=JSON.parse(readFileSync(resolve(base,batchFile),'utf8'));
 assert.equal(batch.snapshot_sha256,manifest.snapshot_sha256);
 for(const source of batch.sources)assert.equal(source.source_sha256,manifest.inventory.items.find(q=>q.source_id===source.source_id)?.source_sha256,'Source differs from frozen input');
 const url='https://lxoaeaewcrshjkigzyqe.supabase.co';
 const token=process.env.O2I_ADMIN_TOKEN_FILE?readFileSync(process.env.O2I_ADMIN_TOKEN_FILE,'utf8').trim():'';
 assert.ok(token,'Set O2I_ADMIN_TOKEN_FILE to a private file containing an authenticated question-bank administrator token.');
 assert.ok(process.env.O2I_SUPABASE_ANON_KEY,'Set the project public anon key. Never use a service-role key.');
 const claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());
 assert.equal(claims.role,'authenticated','A real signed-in account is required.');
 const client=createClient(url,process.env.O2I_SUPABASE_ANON_KEY,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false,autoRefreshToken:false}});
 const user=await checked(client.auth.getUser(token));assert.equal(user.user.id,claims.sub);
 assert.equal(await checked(client.rpc('has_admin_module',{_module:'questions'})),true,'Question-bank admin access required');
 const references={topics:await checked(client.from('curriculum_topics').select('id,topic_code,title')),
  skills:await checked(client.from('curriculum_practice_skills').select('id,skill_code,description')),existingExternalIds:new Set()};
 const assets=batch.assets.map(asset=>({...asset,bytes:readFileSync(resolve(base,asset.file))}));
 for(const q of batch.questions.filter(q=>q.requires_figure))assert.ok(assets.some(a=>q.image_url===url+'/storage/v1/object/public/practice-images/'+a.path),'Required image is not a checked batch asset');
 console.log(JSON.stringify(await runImport({client,batch,references,apply:flag==='--apply',assets})));
}
