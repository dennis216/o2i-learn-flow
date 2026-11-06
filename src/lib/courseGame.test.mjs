import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateGameFile,gameDocument,MAX_GAME_BYTES } from './courseGame.ts';
test('Game file boundary rejects wrong types, empty and oversized uploads',()=>{
  validateGameFile({name:'lesson.html',size:MAX_GAME_BYTES});
  for(const file of [{name:'game.zip',size:10},{name:'game.html',size:0},{name:'game.html',size:MAX_GAME_BYTES+1}])assert.throws(()=>validateGameFile(file));
});
test('Game policy precedes untrusted content and blocks network, frames and forms',()=>{
  const html=gameDocument('<script>window.test=true</script>');
  assert.ok(html.indexOf('Content-Security-Policy')<html.indexOf('<script>'));
  for(const rule of ["connect-src 'none'","frame-src 'none'","form-action 'none'","base-uri 'none'"])assert.ok(html.includes(rule));
  assert.ok(html.includes('<script>window.test=true</script>'));
});
