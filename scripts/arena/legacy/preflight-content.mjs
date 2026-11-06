// Production read-only comparison. Does not invoke private RPC helpers or change their grants.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { privateDirectory, verifySnapshot } from './snapshot.mjs';
import { batchPlan } from './import-batch.mjs';

const [directory]=process.argv.slice(2);assert.ok(directory,'Usage: preflight-content.mjs <private-directory>');
const base=privateDirectory(directory),manifest=verifySnapshot(base),snapshot=JSON.parse(readFileSync(resolve(base,'snapshot.json'),'utf8'));
const project='lxoaeaewcrshjkigzyqe',token=process.env.SUPABASE_ACCESS_TOKEN??readFileSync(resolve(homedir(),'.supabase/access-token'),'utf8').trim();
const checks=[];
for(const batch of manifest.inventory.batches) {
 const prepared=JSON.parse(readFileSync(resolve(base,`review-${batch.id}-svg-v1-0f2356a45d6a-37102041/prepared-batch.json`),'utf8'));
 const payload=batchPlan(prepared,{topics:snapshot.topics,skills:snapshot.skills});
 const input=payload.map(q=>({external_id:q.external_id,...q.import_evidence.legacy_arena,topic:q.primary_topic_code,skills:q.practice_skill_codes,
  difficulty:q.difficulty,course_scope:q.course_scope,calculator_policy:q.calculator_policy,has_solution:!!q.solution?.trim()}));
 const literal="'"+JSON.stringify(input).replaceAll("'","''")+"'::jsonb";
 const query=`BEGIN READ ONLY; SET LOCAL timezone='UTC';
 WITH input AS (SELECT value q FROM jsonb_array_elements(${literal})) SELECT jsonb_build_object(
 'candidates',count(*),
 'native_sources_verified',count(*) FILTER(WHERE (q->>'external_id')='arena_legacy_'||(q->>'source_id') AND (q->>'source_sha256')=encode(extensions.digest(to_jsonb(a)::text,'sha256'),'hex')),
 'topics_and_scope_valid',count(*) FILTER(WHERE EXISTS(SELECT 1 FROM public.curriculum_topics t WHERE t.topic_code=(q->>'topic') AND (NOT t.is_bc_only OR q->>'course_scope'='BC'))),
 'skills_exist',count(*) FILTER(WHERE jsonb_array_length(q->'skills')>0 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(q->'skills') s(code) WHERE NOT EXISTS(SELECT 1 FROM public.curriculum_practice_skills p WHERE p.skill_code=s.code))),
 'non_calculator',count(*) FILTER(WHERE q->>'calculator_policy'='no_calculator'),
 'complete_difficulty_and_solution',count(*) FILTER(WHERE q->>'difficulty' IN ('easy','medium','hard') AND (q->>'has_solution')::boolean),
 'existing_id_collisions',count(*) FILTER(WHERE EXISTS(SELECT 1 FROM public.questions p WHERE p.external_id=(q->>'external_id')))) evidence
 FROM input LEFT JOIN public.arena_questions a ON a.id=(q->>'source_id'); COMMIT;`;
 const response=await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({query,read_only:true}),signal:AbortSignal.timeout(45000)});
 const result=await response.json();assert.ok(response.ok,'Read-only check failed: '+String(result.message??response.status).split('\n')[0]);
 const evidence=result[0]?.evidence;assert.ok(evidence);
 for(const [key,value]of Object.entries(evidence))assert.equal(value,key==='existing_id_collisions'?0:payload.length,batch.id+': '+key);
 checks.push({batch_id:batch.id,...evidence});console.log(JSON.stringify({batch_id:batch.id,candidates:payload.length,all_checks_pass:true}));
}
const report={at:new Date().toISOString(),project,snapshot_sha256:manifest.snapshot_sha256,read_only:true,checks,total:checks.reduce((n,c)=>n+c.candidates,0)};
writeFileSync(resolve(base,'production-content-preflight.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({total:report.total,all_checks_pass:true,read_only:true}));
