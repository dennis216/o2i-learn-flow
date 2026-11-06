// Full frozen-source coverage and prepared-content checks. No database mutations.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { privateDirectory, sha256, verifySnapshot } from './snapshot.mjs';
import { batchPlan } from './import-batch.mjs';

export function reconcileContent({snapshot,manifest,conversion,batches}) {
 assert.equal(conversion.snapshot_sha256,manifest.snapshot_sha256);
 assert.equal(batches.length,manifest.inventory.batches.length,'Missing reviewed batch');
 assert.equal(new Set(batches.map(b=>b.batch_id)).size,batches.length,'Duplicate batch');
 const accepted=new Map(),excluded=new Map(),summaries=[];
 for(const q of conversion.items)if(q.status==='excluded')excluded.set(q.source_id,[q.reason]);
 for(const batch of batches) {
  assert.equal(batch.snapshot_sha256,manifest.snapshot_sha256);
  const expected=manifest.inventory.batches.find(b=>b.id===batch.batch_id);assert.ok(expected,'Unknown batch');
  if(batch.questions.length)batchPlan(batch,{topics:snapshot.topics,skills:snapshot.skills});
  for(const skipped of batch.excluded) {
   assert.ok(expected.source_ids.includes(skipped.source_id),'Excluded question belongs to another batch');
   assert.ok(skipped.reasons.length);excluded.set(skipped.source_id,[...new Set([...(excluded.get(skipped.source_id)??[]),...skipped.reasons])]);
  }
  assert.equal(batch.sources.length,batch.questions.length);
  for(const q of batch.questions) {
   const evidence=batch.sources.find(s=>'arena_legacy_'+s.source_id===q.external_id);assert.ok(evidence);
   const id=evidence.source_id,original=snapshot.rows.find(r=>r.source.id===id),converted=conversion.items.find(q=>q.source_id===id);
   assert.ok(expected.source_ids.includes(id)&&original&&converted,'Candidate belongs to another source/batch');
   assert.equal(evidence.source_sha256,original.source_sha256);assert.equal(evidence.batch_id,batch.batch_id);
   assert.equal(converted.status,'converted_unreviewed','A newly rejected conversion cannot enter intake');
   assert.equal(q.stem,converted.stem,'Reviewed stem changed');
   assert.deepEqual(batch.options.filter(o=>o.question_external_id===q.external_id).map(o=>o.option_text),converted.options,'Reviewed choices changed');
   assert.ok(!accepted.has(id)&&!excluded.has(id),'Question is accepted twice or also excluded');
   for(const asset of batch.assets)assert.equal(asset.path,`arena-legacy/${asset.sha256}.png`);
   accepted.set(id,{source_id:id,external_id:q.external_id,batch_id:batch.batch_id,status:'human_review_pending',primary_topic_code:q.primary_topic_code,
    practice_skill_codes:q.practice_skill_codes.split('|'),difficulty:q.difficulty,calculator_policy:q.calculator_policy,has_solution:!!q.solution});
  }
  summaries.push({batch_id:batch.batch_id,candidates:batch.questions.length,excluded:expected.source_ids.filter(id=>excluded.has(id)).length,
   prepared_sha256:sha256(JSON.stringify(batch,null,2)+'\n')});
 }
 for(const id of excluded.keys())assert.ok(!accepted.has(id),'Question is both accepted and excluded');
 const known=new Set(snapshot.rows.map(r=>r.source.id));
 assert.equal(known.size,snapshot.rows.length);assert.equal(conversion.items.length,known.size);
 for(const id of [...accepted.keys(),...excluded.keys()])assert.ok(known.has(id),'Unknown source');
 assert.equal(accepted.size+excluded.size,known.size,'Unreviewed or unaccounted source questions remain');
 const count=field=>Object.fromEntries([...accepted.values()].reduce((m,q)=>m.set(q[field],(m.get(q[field])??0)+1),new Map()));
 return {snapshot_sha256:manifest.snapshot_sha256,total:known.size,candidates:accepted.size,excluded:excluded.size,
  difficulty:count('difficulty'),calculator_policy:count('calculator_policy'),batches:summaries,
  items:snapshot.rows.map(r=>accepted.get(r.source.id)??{source_id:r.source.id,status:'excluded',reasons:excluded.get(r.source.id)})};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const [directory,conversionFile]=process.argv.slice(2);assert.ok(directory&&conversionFile,'Usage: reconcile-content.mjs <private-directory> <latest-conversion.json>');
 const base=privateDirectory(directory),manifest=verifySnapshot(base),read=file=>JSON.parse(readFileSync(resolve(base,file),'utf8'));
 const snapshot=read('snapshot.json'),conversion=read(conversionFile),batches=manifest.inventory.batches.map(batch=>read(`review-${batch.id}-svg-v1-0f2356a45d6a-37102041/prepared-batch.json`));
 for(const batch of batches)for(const asset of batch.assets)assert.equal(sha256(readFileSync(resolve(base,asset.file))),asset.sha256,'Image changed after review');
 const report=reconcileContent({snapshot,manifest,conversion,batches}),text=JSON.stringify(report,null,2)+'\n',output=resolve(base,'content-reconciliation-'+sha256(text).slice(0,12)+'.json');
 if(existsSync(output))assert.equal(readFileSync(output,'utf8'),text);else writeFileSync(output,text,{flag:'wx',mode:0o600});
 console.log(JSON.stringify({...report,items:undefined,output}));
}
