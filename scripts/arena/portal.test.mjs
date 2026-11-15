import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';
const game=readFileSync(new URL('../../public/games/limit-arena.html',import.meta.url),'utf8');
function fixture(){
 const a={t:10,theme:0,p:{x:300,y:300,hp:76,inv:0},curUnit:3,xp:7,weapons:[{id:'rifle',lv:3}],nextWave:10,nextElite:10,bossChestOrigin:{x:310,y:300}};
 const calls=[];const context=vm.createContext({a,I:'play',Math,Wn:()=>[10,24,1200,760],F:(n,lo,hi)=>Math.max(lo,Math.min(hi,n)),X:()=>a.p.x,_:()=>a.p.y-7,oe(){},s:{},i:false,Yt:Array.from({length:8},()=>({name:'WORLD',sub:'NEW'})),In:(target)=>{calls.push(target);a.themeTr={to:target}}});
 vm.runInContext(game.slice(game.indexOf('function spawnWorldPortal()'),game.indexOf('function wi(')),context);
 return{a,context,calls};
}
test('only a collected boss chest can create a world portal',()=>{
 const f=fixture();delete f.a.bossChestOrigin;assert.equal(f.context.spawnWorldPortal(),false);assert.equal(f.a.worldPortal,undefined);
 f.a.bossChestOrigin={x:310,y:300};assert.equal(f.context.spawnWorldPortal(),true);assert([4,5,6,7].includes(f.a.worldPortal.target));assert.equal(f.a.bossChestOrigin,undefined);assert.equal(f.context.spawnWorldPortal(),false);
});
test('portal requires contact after its spawn delay and preserves build, HP and question unit',()=>{
 const f=fixture();f.context.spawnWorldPortal();assert.equal(f.context.updateWorldPortal(),false);
 const portal=f.a.worldPortal;f.a.p.x=portal.x;f.a.p.y=portal.y+7;assert.equal(f.context.updateWorldPortal(),false);
 f.a.t=11;const before=JSON.stringify({hp:f.a.p.hp,unit:f.a.curUnit,xp:f.a.xp,weapons:f.a.weapons});
 assert.equal(f.context.updateWorldPortal(),true);assert.equal(f.a.worldPortal,null);assert.equal(f.a.worldStage,2);assert.deepEqual(f.calls,[portal.target]);
 assert.equal(JSON.stringify({hp:f.a.p.hp,unit:f.a.curUnit,xp:f.a.xp,weapons:f.a.weapons}),before);assert.equal(f.context.updateWorldPortal(),false);
 assert.deepEqual(Array.from(f.a.enemies),[]);assert.deepEqual(Array.from(f.a.ebul),[]);
});
test('random world bag visits all four destinations before repeating',()=>{
 const f=fixture();const targets=[];
 for(let n=0;n<4;n++){f.a.bossChestOrigin={x:310,y:300};f.a.p={x:300,y:300,inv:0};f.a.themeTr=null;f.context.spawnWorldPortal();const p=f.a.worldPortal;targets.push(p.target);f.a.t+=1;f.a.p.x=p.x;f.a.p.y=p.y+7;f.context.updateWorldPortal();f.a.theme=p.target;}
 assert.equal(new Set(targets).size,4);
 f.a.themeTr=null;f.a.bossChestOrigin={x:310,y:300};f.context.spawnWorldPortal();assert.notEqual(f.a.worldPortal.target,targets.at(-1));
});
test('a portal cannot interrupt a paused run or active boss',()=>{
 const f=fixture();f.context.spawnWorldPortal();f.a.t=12;f.a.p.x=f.a.worldPortal.x;f.a.p.y=f.a.worldPortal.y+7;f.context.I='pause';assert.equal(f.context.updateWorldPortal(),false);f.context.I='play';f.a.boss={};assert.equal(f.context.updateWorldPortal(),false);
});
