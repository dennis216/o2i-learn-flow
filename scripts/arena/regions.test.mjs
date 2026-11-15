import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';
const game=readFileSync(new URL('../../public/games/limit-arena.html',import.meta.url),'utf8');
function fixture(kind='desert',seen=true){
 const a={theme:4,worldStage:2,t:0,p:{x:200,y:207,hp:40,maxHp:100,inv:0,dashUntil:0},skillReady:30};
 const seenKeys={};if(seen)for(const k of ['desert','rainforest','snow','book']){seenKeys['buff:'+k]=true;seenKeys['terrain:'+k]=true;}
 const buttons={};const tt={d:{regionSeen:seenKeys},save(){}};
 const ctx=vm.createContext({a,tt,Tt:{fire:1},I:'play',i:false,Math:Object.assign(Object.create(Math),{random:()=>0}),Yt:{4:{worldKind:kind,zones:[{id:'terrain',role:'terrain',x:300,y:300,r:30},{id:'a',role:'buff',x:500,y:200,r:25},{id:'b',role:'buff',x:100,y:400,r:25}]}},X:()=>a.p.x,_:()=>a.p.y-7,N:id=>buttons[id]||(buttons[id]={}),z:String,Bt:{show(){},hide(){}},oe(){},$: {power(){}},s:{}});
 vm.runInContext(game.slice(game.indexOf('const REGION_RULES='),game.indexOf('function spawnWorldPortal()')),ctx);
 return{a,ctx,buttons};
}
test('first benefit explains itself before play resumes and records the type as read',()=>{
 const f=fixture('desert',false);f.ctx.updateSpecialRegions(0);f.a.t=9;f.ctx.updateSpecialRegions(0);assert.equal(f.ctx.I,'terrain');assert(f.ctx.tt.d.regionSeen['buff:desert']);assert.equal(f.ctx.Tt.fire,0);f.buttons.terrainGo.onclick();assert.equal(f.ctx.I,'play');
});
test('a benefit is consumed once, expires and cannot be extended by camping',()=>{
 const f=fixture();f.ctx.updateSpecialRegions(0);f.a.t=9;f.ctx.updateSpecialRegions(0);const first=f.a.regionState.active;f.a.p.x=first.x;f.a.p.y=first.y+7;f.ctx.updateSpecialRegions(0);const end=f.a.regionBuff.until;assert.equal(f.a.regionState.active,null);
 for(let n=0;n<4;n++){f.a.t++;f.ctx.updateSpecialRegions(1);}assert.equal(f.a.p.hp,56);assert.equal(f.a.regionBuff.until,end);
 f.a.t=end+2;f.ctx.updateSpecialRegions(1);assert.equal(f.a.p.hp,56);f.a.t=f.a.regionState.nextAt;f.ctx.updateSpecialRegions(0);assert.notEqual(f.a.regionState.active.id,first.id);
});
test('an unclaimed benefit disappears after sixteen seconds',()=>{
 const f=fixture();f.ctx.updateSpecialRegions(0);f.a.t=9;f.ctx.updateSpecialRegions(0);const expiry=f.a.regionState.active.expires;f.a.t=expiry;f.ctx.updateSpecialRegions(0);assert.equal(f.a.regionState.active,null);assert(f.a.regionState.nextAt>f.a.t);
});
test('terrain warns first, slows without HP damage, and can be bypassed with a dash',()=>{
 const f=fixture('snow',false);f.a.p={...f.a.p,x:300,y:307};f.ctx.updateSpecialRegions(0);assert.equal(f.ctx.I,'terrain');f.buttons.terrainGo.onclick();f.ctx.updateSpecialRegions(0);assert.equal(f.ctx.terrainMoveFactor(),.75);assert.equal(f.a.p.hp,40);f.a.p.dashUntil=1;f.ctx.updateSpecialRegions(0);assert.equal(f.ctx.terrainMoveFactor(),1);
});
test('grove recovery and snow speed have finite durations',()=>{
 const f=fixture('rainforest');f.a.regionBuff={kind:'rainforest',until:6};f.ctx.updateSpecialRegions(1);assert.equal(f.a.skillReady,29.5);f.a.t=7;f.ctx.updateSpecialRegions(1);assert.equal(f.a.skillReady,29.5);f.a.regionBuff={kind:'snow',until:10};assert.equal(f.ctx.terrainMoveFactor(),1.15);f.a.t=10;assert.equal(f.ctx.terrainMoveFactor(),1);
});

test('existing benefits keep working in a boss fight, but new regions do not spawn',()=>{const f=fixture();f.a.boss={};f.a.regionBuff={kind:'desert',until:5};f.ctx.updateSpecialRegions(1);assert.equal(f.a.p.hp,44);assert.equal(f.a.regionState,undefined);f.ctx.I='pause';f.ctx.updateSpecialRegions(1);assert.equal(f.a.p.hp,44)});
