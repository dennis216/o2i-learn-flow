import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const game = readFileSync(new URL('../../public/games/limit-arena.html', import.meta.url), 'utf8');
const firingSource = game.slice(game.indexOf('function ai('), game.indexOf('const ve='));

function fixture(automatic = true, guns = ['rifle']) {
  const shots = [];
  const a = { t: 0, weapons: guns.map(id => ({ id, lv: 1, t: 0, n: 0 })), echo: [], ambush: false };
  const Tt = { fire: 0 }, tt = { d: { autoAttack: automatic } };
  const O = Object.fromEntries(guns.map(id => [id, { main: id !== 'bomb', cd: () => 1 }]));
  const bo = Object.fromEntries(guns.map(id => [id, () => { shots.push(id); return true; }]));
  const context = vm.createContext({ a, Tt, tt, O, bo, Qo: {}, H: () => 0, Ja: () => false, za: () => 1, oi: () => 1, ht: () => false });
  vm.runInContext(firingSource, context);
  return { a, Tt, tt, shots, tick: context.ai };
}

test('all four main guns keep automatic firing as the default', () => {
  for (const gun of ['sniper', 'rifle', 'shotgun', 'darts']) {
    const f = fixture(true, [gun]); f.tick(.1); assert.deepEqual(f.shots, [gun]);
  }
});

test('manual mode requires a held attack for every main gun', () => {
  for (const gun of ['sniper', 'rifle', 'shotgun', 'darts']) {
    const f = fixture(false, [gun]); f.tick(2); assert.deepEqual(f.shots, []);
    f.Tt.fire = 1; f.tick(.01); assert.deepEqual(f.shots, [gun]);
  }
});

test('release stops new shots while cooldown continues to recover', () => {
  const f = fixture(false); f.Tt.fire = 1; f.tick(.1); assert.equal(f.shots.length, 1);
  f.Tt.fire = 0; f.tick(2); assert.equal(f.shots.length, 1);
  f.Tt.fire = 1; f.tick(.01); assert.equal(f.shots.length, 2);
});

test('companion weapons continue independently of manual main-weapon input', () => {
  const f = fixture(false, ['rifle', 'bomb']); f.tick(.1); assert.deepEqual(f.shots, ['bomb']);
});

test('switching back to automatic firing takes effect without a new run', () => {
  const f = fixture(false); f.tick(2); assert.equal(f.shots.length, 0);
  f.tt.d.autoAttack = true; f.tick(.01); assert.equal(f.shots.length, 1);
});
