import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const game = readFileSync(new URL('../../public/games/limit-arena.html', import.meta.url), 'utf8');
// Execute the actual pickup functions from the shipped game with isolated world state.
const pickupSource = game.slice(game.indexOf('function magnetBacklogReady()'), game.indexOf('function _t('));

function fixture() {
  const collected = [];
  const a = { t: 0, p: { x: 100, y: 107, hp: 80, maxHp: 100 }, st: { magnet: 26 }, gems: [], picks: [], magnetUntil: 0, nextMagnetAt: 25, tips: {} };
  const context = vm.createContext({ a, i: false, s: {}, X: () => a.p.x, _: () => a.p.y - 7,
    it: (x, y, px, py) => Math.hypot(px - x, py - y), at: (x, y, px, py) => Math.atan2(py - y, px - x),
    Kn: value => collected.push(value), Yn() {}, bt() {}, yt() {}, ls() {}, $: { coin() {}, shard() {} },
    j: Math.PI * 2, q: () => 0, F: (value, low, high) => Math.max(low, Math.min(high, value)), Wn: () => [0, 0, 1000, 1000] });
  vm.runInContext(pickupSource, context);
  const gem = (distance, value = 1) => ({ x: 100 + distance, y: 100, v: value, mag: false, tier: 0 });
  const pickup = kind => a.picks.push({ kind, x: 100, y: 100, t0: a.t });
  return { a, collected, gem, pickup, collect: context.mi, spawn: context.spawnFieldMagnet };
}

test('magnet pickup grants eight seconds and does not heal', () => {
  const f = fixture(); f.pickup('magnet'); f.collect(0);
  assert.equal(f.a.magnetUntil, 8); assert.equal(f.a.p.hp, 80); assert.equal(f.a.picks.length, 0);
});

test('temporary attraction is three times the normal range and includes new XP', () => {
  const f = fixture(); f.a.gems = [f.gem(40), f.gem(80)]; f.collect(0);
  assert.equal(f.a.gems[0].mag, false);
  f.pickup('magnet'); f.collect(0); f.collect(0);
  assert.equal(f.a.gems[0].mag, true); assert.equal(f.a.gems[1].mag, false);
  f.a.t = 4; f.a.gems.push(f.gem(50)); f.collect(0); assert.equal(f.a.gems.at(-1).mag, true);
});

test('new distant XP stops attracting when the magnet expires', () => {
  const f = fixture(); f.a.magnetUntil = 8; f.a.t = 8; f.a.gems = [f.gem(50)]; f.collect(0);
  assert.equal(f.a.gems[0].mag, false);
});

test('magnet range composes with existing pickup upgrades', () => {
  const f = fixture(); f.a.st.magnet = 40; f.a.magnetUntil = 8; f.a.gems = [f.gem(100)]; f.collect(0);
  assert.equal(f.a.gems[0].mag, true);
});

test('fast attraction cannot overshoot or duplicate XP', () => {
  const f = fixture(); f.a.magnetUntil = 8; f.a.gems = [f.gem(20, 4)]; f.collect(.5); f.collect(.5);
  assert.deepEqual(f.collected, [4]); assert.equal(f.a.gems.length, 0);
});

test('heart pickup keeps its healing behavior and maximum HP limit', () => {
  const f = fixture(); f.pickup('heart'); f.collect(0); assert.equal(f.a.p.hp, 100);
});

test('field magnets appear without kills and do not accumulate duplicates', () => {
  const f = fixture(); f.a.t = 24; f.spawn(); assert.equal(f.a.picks.length, 0);
  f.a.gems = Array.from({ length: 20 }, () => f.gem(100, 2));
  f.a.t = 25; f.spawn(); assert.equal(f.a.picks.length, 1); assert.equal(f.a.picks[0].kind, 'magnet');
  f.a.t = 100; f.spawn(); assert.equal(f.a.picks.length, 1);
});

test('no magnet appears when little XP is waiting on the ground', () => {
  const f = fixture(); f.a.t = 30; f.spawn(); assert.equal(f.a.picks.length, 0);
  f.a.gems = [f.gem(100, 100)]; f.a.t = 40; f.spawn(); assert.equal(f.a.picks.length, 0);
  f.a.gems = Array.from({ length: 20 }, () => f.gem(100)); f.a.t = 50; f.spawn(); assert.equal(f.a.picks.length, 0);
});

test('active magnet and spawn cooldown suppress new magnets even with an XP backlog', () => {
  const f = fixture(); f.a.gems = Array.from({ length: 20 }, () => f.gem(100, 3));
  f.a.t = 30; f.a.magnetUntil = 38; f.spawn(); assert.equal(f.a.picks.length, 0);
  f.a.t = 40; f.spawn(); assert.equal(f.a.picks.length, 1);
  f.a.picks = []; f.a.t = 60; f.spawn(); assert.equal(f.a.picks.length, 0);
  f.a.t = 115; f.spawn(); assert.equal(f.a.picks.length, 1);
});
