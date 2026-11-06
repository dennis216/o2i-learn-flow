import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { inventory, privateDirectory, sha256, verifySnapshot, exportQuery } from './snapshot.mjs';
const row = (id, unit = 1, fields = {}) => ({ source: { id, unit, tier: 1, stem: 'Synthetic '+id, explanation: 'Synthetic', topic: 'Synthetic', options: ['A','B','C','D'], active: true, ...fields }, source_sha256: 'a'.repeat(64) });
test('deterministic, complete, non-overlapping pilot and bounded remainder batches', () => {
 const rows = [...Array.from({length:10},(_,i)=>row('q'+(i+1),i+1)),...Array.from({length:60},(_,i)=>row('q'+(i+11))),...Array.from({length:5},(_,i)=>row('q'+(i+71),1,{graph:{}})),...Array.from({length:5},(_,i)=>row('q'+(i+76),1,{table_html:'<table></table>'}))];
 const result=inventory(rows);
 assert.equal(result.batches[0].source_ids.length,20);
 assert.ok(result.batches.every(b=>b.source_ids.length<=50));
 assert.deepEqual(result.batches,inventory([...rows].reverse()).batches);
 assert.throws(()=>inventory([...rows,rows[0]]));
 assert.throws(()=>inventory([row('q1',1,{options:['A']})]));
});
test('same stems remain separate and are flagged, including distinct graphs',()=>{
 const result=inventory([row('q1',1,{stem:'Same',graph:{x:1}}),row('q2',1,{stem:' SAME ',graph:{x:2}})]);
 assert.deepEqual(result.same_stem_groups,[['q1','q2']]);
 assert.equal(result.total,2);
 assert.equal(inventory([row('u2_1',2)]).items[0].external_id,'arena_legacy_u2_1');
});
test('rejects repository and symlink exports; detects frozen-input tampering',()=>{
 const base=mkdtempSync(resolve(tmpdir(),'o2i-legacy-snapshot-'));
 try {
  const repo=resolve(base,'repo'),output=resolve(base,'private');mkdirSync(repo);mkdirSync(output);
  symlinkSync(repo,resolve(base,'link'));
  assert.throws(()=>privateDirectory(resolve(repo,'export'),repo));
  assert.throws(()=>privateDirectory(resolve(base,'link/export'),repo));
  assert.equal(privateDirectory(output,repo),realpathSync(output));
  const raw=JSON.stringify({rows:[row('q1')]});
  writeFileSync(resolve(output,'snapshot.json'),raw);
  writeFileSync(resolve(output,'manifest.json'),JSON.stringify({snapshot_sha256:sha256(raw),inventory:inventory([row('q1')])}));
  verifySnapshot(output);
  writeFileSync(resolve(output,'snapshot.json'),raw+' ');
  assert.throws(()=>verifySnapshot(output));
 } finally {rmSync(base,{recursive:true,force:true});}
 assert.match(exportQuery,/REPEATABLE READ READ ONLY/);
 assert.ok(!/INSERT|UPDATE|DELETE|TRUNCATE/.test(exportQuery));
});
