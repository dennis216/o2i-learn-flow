import vm from 'node:vm';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const game = readFileSync(new URL('../../public/games/limit-arena.html', import.meta.url), 'utf8');

test('the public game holds no question data or test hooks', () => {
  for (const banned of ['QBANK', '"exp":', '"stem":', 'correctKey', '__dbg', 'render_game_to_text', 'advanceTime']) {
    assert.ok(!game.includes(banned), banned);
  }
  assert.ok(game.length < 800_000, 'the game grew enough to suggest question data came back');
});

test('the public game gets questions only through its host page', () => {
  assert.ok(game.includes('limit-arena-host'));
  assert.ok(!/fetch\(|supabase|XMLHttpRequest/i.test(game));
});

 test('every shipped inline game script parses before it reaches the browser', () => {
  const html=readFileSync(new URL('../../public/games/limit-arena.html',import.meta.url),'utf8');
  for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi))new vm.Script(match[1]);
 });


test('language changes work in menus and cannot silently discard an active run', () => {
  const prefix='N("lang").onclick=';
  const start=game.indexOf(prefix)+prefix.length;
  const handler=game.slice(start,game.indexOf(',ms(),',start));
  const make=(active,accepted)=>{
    const writes=[],calls=[];
    const ctx=vm.createContext({a:active?{p:{hp:100}}:{},I:active?'play':'title',i:false,Po:'lang',localStorage:{setItem:(...args)=>writes.push(args)},confirm:()=>accepted,cancelArenaPointers:()=>calls.push('cancel'),restoreArenaDisplay:()=>calls.push('restore'),location:{reload:()=>calls.push('reload')}});
    vm.runInContext('handler='+handler,ctx);ctx.handler();return{writes,calls,ctx};
  };
  const menu=make(false,false);assert.deepEqual(menu.writes,[['lang','zh']]);assert.deepEqual(menu.calls,['restore','reload']);
  const decline=make(true,false);assert.equal(decline.ctx.I,'play');assert.deepEqual(decline.writes,[]);assert.deepEqual(decline.calls,['cancel']);
  const accept=make(true,true);assert.deepEqual(accept.writes,[['lang','zh']]);assert.deepEqual(accept.calls,['cancel','restore','reload']);
});
