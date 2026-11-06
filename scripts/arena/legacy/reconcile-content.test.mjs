import assert from 'node:assert/strict';
import test from 'node:test';
import {reconcileContent}from'./reconcile-content.mjs';
const fixture=()=>({snapshot:{rows:[{source:{id:'bad'},source_sha256:'b'.repeat(64)}],topics:[],skills:[]},
 manifest:{snapshot_sha256:'a'.repeat(64),inventory:{batches:[{id:'synthetic',source_ids:['bad']}]}}
 ,conversion:{snapshot_sha256:'a'.repeat(64),items:[{source_id:'bad',status:'excluded',reason:'unrestorable_formula'}]},
 batches:[{batch_id:'synthetic',snapshot_sha256:'a'.repeat(64),questions:[],sources:[],options:[],assets:[],excluded:[]}]});
test('coverage counts each source once and combines exclusion evidence without importing anything',()=>{
 const f=fixture();f.batches[0].excluded=[{source_id:'bad',reasons:['visual_mismatch']}];const r=reconcileContent(f);
 assert.equal(r.total,1);assert.equal(r.candidates,0);assert.equal(r.excluded,1);assert.deepEqual(r.items[0].reasons,['unrestorable_formula','visual_mismatch']);
});
test('missing review, incomplete coverage, unknown IDs or mismatched frozen hash fail closed',()=>{
 for(const mutate of [f=>f.batches=[],f=>f.conversion.items[0].status='converted_unreviewed',f=>f.batches[0].excluded=[{source_id:'unknown',reasons:['bad']}],f=>f.conversion.snapshot_sha256='changed']){
  const f=fixture();mutate(f);assert.throws(()=>reconcileContent(f));
 }
});
