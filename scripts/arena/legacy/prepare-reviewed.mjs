// Merge independent blind results only after they have been written. Never grants human approval.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { privateDirectory, sha256, verifySnapshot } from './snapshot.mjs';
import { batchPlan } from './import-batch.mjs';

export function mergeReviews({input,key,reviews,conversion,snapshot,batchId,base,reviewDirectory}) {
 assert.equal(new Set(reviews.map(r=>r.review_id)).size,reviews.length,'Duplicate blind result');
 assert.deepEqual([...reviews.map(r=>r.review_id)].sort(),[...input.items.map(i=>i.review_id)].sort(),'Incomplete or unrelated blind review');
 const result={snapshot_sha256:conversion.snapshot_sha256,conversion_version:conversion.conversion_version,batch_id:batchId,questions:[],options:[],sources:[],assets:[],excluded:[]};
 for(const item of input.items) {
  const answer=key.items.find(k=>k.review_id===item.review_id),review=reviews.find(r=>r.review_id===item.review_id);
  assert.ok(answer&&review);
  const q=conversion.items.find(q=>q.source_id===answer.source_id),source=snapshot.rows.find(r=>r.source.id===answer.source_id);
  assert.ok(q&&source&&q.status==='converted_unreviewed');assert.equal(q.source_sha256,source.source_sha256);
  assert.equal(review.human_review_status,'pending');assert.ok(Array.isArray(review.issues));
  const reasons=[...review.issues,...(review.conversion_matches===true?[]:['conversion_not_confirmed']),
   ...(JSON.stringify(review.correct_labels)===JSON.stringify([answer.expected_correct_label])?[]:['independent_answer_mismatch_or_ambiguous']),
   ...(item.display_overflow.length?['display_overflow']:[]),
   ...(review.calculator_policy==='no_calculator'?[]:['non_calculator_suitability_not_confirmed']),
   // Reject known lossy layouts even when reading an older frozen conversion.
   ...(/#MJX-TEX-S[1-4]-(?:7B|7D)\b/i.test([source.source.stem,source.source.explanation,...source.source.options].join(''))?['unsupported_piecewise_or_multiline_brace']:[])];
  if(reasons.length){result.excluded.push({source_id:q.source_id,reasons});continue;}
  assert.ok(snapshot.topics.some(t=>t.topic_code===review.primary_topic_code));
  assert.ok(review.practice_skill_codes.length&&review.practice_skill_codes.every(code=>snapshot.skills.some(s=>s.skill_code===code)));
  const topic=snapshot.topics.find(t=>t.topic_code===review.primary_topic_code);
  assert.ok(!topic.is_bc_only||review.course_scope==='BC','BC-only topic cannot be offered as AB');
  let imageUrl='';
  if(q.graph_svg) {
   assert.ok(item.graph_image);const bytes=readFileSync(item.graph_image),hash=sha256(bytes),path=`arena-legacy/${hash}.png`;
   const file=relative(base,item.graph_image);assert.ok(!file.startsWith('..'),'Graph asset must be inside private snapshot directory');
   if(!result.assets.some(a=>a.sha256===hash))result.assets.push({file,sha256:hash,path});
   imageUrl='https://lxoaeaewcrshjkigzyqe.supabase.co/storage/v1/object/public/practice-images/'+path;
  }
  const id='arena_legacy_'+q.source_id;
  const solution=review.publication_solution??(batchId==='pilot'?q.solution:null);
  assert.ok(typeof solution==='string'&&solution.trim(),'A label-independent blind solution is required');
  result.sources.push({source_id:q.source_id,source_sha256:q.source_sha256,batch_id:batchId,conversion_version:conversion.conversion_version});
  result.questions.push({external_id:id,source_document:'Legacy Arena bank',source_page:null,source_question_number:null,source_locator:null,
   stem:q.stem,solution,correct_option_key:'A',difficulty:review.difficulty,course_scope:review.course_scope,
   primary_topic_code:review.primary_topic_code,practice_skill_codes:review.practice_skill_codes.join('|'),
   representation_type:q.graph_svg?'graphical':source.source.table_html?'numerical':'analytical',calculator_policy:'no_calculator',
   requires_figure:!!q.graph_svg,figure_reference:q.graph_svg?'arena:'+q.source_id:'',image_url:imageUrl,
   source_transcription_notes:'Converted from frozen legacy Arena HTML/SVG. Graphs reconstructed from original plot data.',
   ai_inference_notes:'Independent blind solution and conversion comparison completed; AI-authored origin reported by owner, not independently documented.',
   ai_flags:'LEGACY_AI_AUTHORED_UNVERIFIED',math_review_status:'pending',source_rights_status:'pending',taxonomy_review_status:'pending',render_review_status:'pending',
   human_review_status:'pending',human_review_notes:'',reviewed_by:'',reviewed_at:''});
  result.options.push(...q.options.map((text,index)=>({question_external_id:id,option_key:'ABCD'[index],option_text:text,is_correct:index===0,misconception_code:'',option_explanation:''})));
 }
 if(result.questions.length)batchPlan(result,{topics:snapshot.topics,skills:snapshot.skills});
 return result;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const [directory,conversionFile,reviewFolder,...reviewFiles]=process.argv.slice(2);
 assert.ok(directory&&conversionFile&&reviewFolder&&reviewFiles.length,'Usage: prepare-reviewed.mjs <private-directory> <conversion.json> <review-folder> <blind.json>...');
 const base=privateDirectory(directory),manifest=verifySnapshot(base),folder=resolve(base,reviewFolder);
 const read=file=>JSON.parse(readFileSync(file,'utf8'));
 const conversion=read(resolve(base,conversionFile)),snapshot=read(resolve(base,'snapshot.json'));
 assert.equal(conversion.snapshot_sha256,manifest.snapshot_sha256);
 const input=read(resolve(folder,'solver-input.json')),key=read(resolve(folder,'review-key.json'));
 const batchId=manifest.inventory.batches.find(b=>key.items.every(i=>b.source_ids.includes(i.source_id)))?.id;assert.ok(batchId);
 const batch=mergeReviews({input,key,reviews:reviewFiles.flatMap(f=>read(resolve(folder,f))),conversion,snapshot,batchId,base,reviewDirectory:folder});
 const text=JSON.stringify(batch,null,2)+'\n',file=resolve(folder,'prepared-batch.json');
 if(existsSync(file))assert.equal(readFileSync(file,'utf8'),text,'Prepared content changed; use a new review package.');
 else writeFileSync(file,text,{flag:'wx',mode:0o600});
 console.log(JSON.stringify({batch:batchId,candidates:batch.questions.length,excluded:batch.excluded.length,assets:batch.assets.length,sha256:sha256(text),human_review_status:'pending'}));
}
