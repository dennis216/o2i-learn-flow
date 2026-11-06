import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { shuffledChoices, mathDefinitions } from './review-pack.mjs';
test('choice shuffle is reproducible, preserves all choices and keeps answer mapping separate',()=>{
 const orders=new Set();
 for(let i=0;i<30;i++){
  const a=shuffledChoices(['synthetic-right','b','c','d'],'seed','synthetic-'+i);
  assert.deepEqual(a,shuffledChoices(['synthetic-right','b','c','d'],'seed','synthetic-'+i));
  assert.deepEqual([...a.choices.map(c=>c.text)].sort(),['synthetic-right','b','c','d'].sort());
  assert.equal(a.choices.find(c=>c.label===a.correctLabel).text,'synthetic-right');
  assert.ok(a.choices.every(c=>Object.keys(c).sort().join(',')==='label,text'));
  orders.add(a.correctLabel);
 }
 assert.equal(orders.size,4);
});
test('MathJax glyph definitions are extracted as inert data without executing game code',()=>{
 const defs=mathDefinitions(readFileSync(new URL('../../../public/games/limit-arena.html',import.meta.url),'utf8'));
 assert.ok(defs.includes('MJX-TEX-N-32'));
 assert.ok(defs.startsWith('<svg xmlns='));
 assert.throws(()=>mathDefinitions('<script>throw new Error("must not execute");</script>'));
});
