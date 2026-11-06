import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initializePracticeCaptureTab, emptyCapture, advanceCapture, selectCapture, readCapture, clearPracticeCaptures, PRACTICE_CAPTURE_PREFIX } from './practiceCapture.ts';
test('Capture preserves monotonic active time and complete B/C/A selection history through refresh',()=>{
  let c=emptyCapture(true);c=selectCapture(advanceCapture(c,18000),'B');c=selectCapture(advanceCapture(c,17000),'C');c=selectCapture(advanceCapture(c,17000),'A');
  assert.deepEqual(c.trajectory,[{option_id:'B',elapsed_seconds:18},{option_id:'C',elapsed_seconds:35},{option_id:'A',elapsed_seconds:52}]);
  assert.equal(selectCapture(c,'A'),c);c=advanceCapture(c,8000);c.frozen=true;
  assert.equal(selectCapture(c,'B'),c);assert.deepEqual(readCapture(JSON.stringify(c),['A','B','C']),c);
  assert.equal(advanceCapture(c,-100).milliseconds,60000);
  assert.equal(advanceCapture(c,1e10).milliseconds,86400000);
});
test('Malformed, foreign or lost draft capture cannot become complete telemetry',()=>{
  const c=selectCapture(advanceCapture(emptyCapture(true),10000),'A');
  for(const change of [{milliseconds:-1},{milliseconds:Infinity},{selected:'B'},{trajectory:[{option_id:'B',elapsed_seconds:1}]},{trajectory:[{option_id:'A',elapsed_seconds:11}]},{trajectory:[{option_id:'A',elapsed_seconds:2},{option_id:'A',elapsed_seconds:3}]},{complete:true,trajectory:null},{paused:'false'}]) assert.equal(readCapture(JSON.stringify({...c,...change}),['A']),null);
  assert.equal(readCapture(null,['A']),null);assert.equal(emptyCapture(false).complete,false);
  let bounded=emptyCapture(true);for(let i=0;i<257;i++) bounded=selectCapture(bounded,i%2?'A':'B');
  assert.equal(bounded.complete,false);assert.equal(bounded.trajectory,null);
});
test('Logout clears only practice drafts; initial auth restoration preserves this account and removes other accounts',()=>{
  const entries=new Map([[PRACTICE_CAPTURE_PREFIX+'A:session','a'],[PRACTICE_CAPTURE_PREFIX+'B:session','b'],['auth','keep']]);
  const storage={get length(){return entries.size;},key:i=>[...entries.keys()][i],removeItem:k=>entries.delete(k)};
  clearPracticeCaptures(storage,'A');assert.equal(entries.has(PRACTICE_CAPTURE_PREFIX+'A:session'),true);assert.equal(entries.has(PRACTICE_CAPTURE_PREFIX+'B:session'),false);
  clearPracticeCaptures(storage);assert.deepEqual([...entries],[['auth','keep']]);
});

test('A cloned new-tab storage loses reliable capture, while same-tab reload preserves it',()=>{
  const map=new Map([['o2i-practice-tab','o2i-practice-tab:original'],[PRACTICE_CAPTURE_PREFIX+'A:s','draft']]);
  const storage={get length(){return map.size;},key:i=>[...map.keys()][i],getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
  assert.equal(initializePracticeCaptureTab(storage,'o2i-practice-tab:original','new'),'o2i-practice-tab:original');
  assert.equal(map.has(PRACTICE_CAPTURE_PREFIX+'A:s'),true);
  assert.equal(initializePracticeCaptureTab(storage,'','new'),'o2i-practice-tab:new');assert.equal(map.has(PRACTICE_CAPTURE_PREFIX+'A:s'),false);
});
