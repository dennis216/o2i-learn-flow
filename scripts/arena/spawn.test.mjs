import { arenaContext } from "./test-runtime.mjs";
import assert from "node:assert/strict";

import { test } from "node:test";

function fixture() {
  const a = {
    t: 1,
    p: { x: 1000, y: 800 },
    cam: { x: 680, y: 620 },
    enemies: [],
    spawnAcc: 0,
    nextBossT: 180,
    nextWave: 60,
    nextElite: 75,
    waveN: 0,
  };
  const spawned = [];
  const context = arenaContext({
    I: "play",
    a,
    A: 640,
    D: 360,
    et: 2400,
    dt: 1800,
    Math,
    q: (lo, hi) => (hi === undefined ? lo * 0.3 : (lo + hi) / 2),
    Jt: () => ({ spawn: 1 }),
    be: () => 2,
    ye: (type, x, y) => {
      a.enemies.push({ type, x, y });
      spawned.push({ type, x, y });
    },
    oe() {},
    Qe() {},
    i: false,
    s: {},
  });

  return { a, spawned, context };
}
test("spawns enter outside the viewport and away from the player, including world corners", () => {
  const f = fixture();
  for (const [x, y] of [
    [680, 620],
    [0, 0],
    [1760, 1440],
  ]) {
    f.a.cam = { x, y };
    f.a.p = { x: x + 320, y: y + 180 };
    for (let edge = 0; edge < 4; edge++) {
      f.a.spawnEdge = edge;
      f.a.nextSpawnEdge = 10;
      const [px, py] = f.context.ia();
      assert(px < x || px > x + 640 || py < y || py > y + 360);
      assert(Math.hypot(px - f.a.p.x, py - f.a.p.y) > 100);
      assert(px > 0 && py > 0 && px < 2400 && py < 1800);
    }
  }
});
test("opening enemies and waves arrive gradually rather than an instant ring", () => {
  const f = fixture();
  f.a.t = 0.34;
  f.context.fi(0.01);
  assert.equal(f.spawned.length, 0);
  f.a.t = 0.35;
  f.context.fi(0.01);
  assert.equal(f.a.spawnQueue.length, 5);
  f.a.t = 0.37;
  f.context.fi(0.01);
  assert.equal(f.spawned.length, 1);
  f.context.fi(0.01);
  assert.equal(f.spawned.length, 1);
  f.a.t = 61;
  f.a.spawnAcc = 0;
  f.a.spawnQueue = [];
  f.context.fi(0.01);
  assert.equal(f.a.waveN, 1);
  assert(f.a.spawnQueue.length >= 18);
  assert.equal(f.spawned.length, 1);
  f.a.boss = {};
  f.context.fi(1);
  assert.equal(f.a.spawnQueue.length, 0);
});
