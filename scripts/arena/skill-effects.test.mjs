import { arenaContext } from "./test-runtime.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";

function fixture() {
  const a = {
    t: 10,
    p: { x: 10, y: 10, hp: 30, maxHp: 100, inv: 0 },
    passives: { recovery: 1, study: 1, emergency: 1 },
    st: { armor: 0, dmg: 1 },
    haz: [],
    ebul: [],
    shake: 0,
  };
  const ctx = arenaContext({
    a,
    i: false,
    I: "play",
    H: (id) => a.passives[id] || 0,
    Jt: () => ({ dmg: 1 }),
    s: {},
    oe() {},
    bt() {},
    $: { hurt() {} },
    yt() {},
    Ae: () => false,
  });
  return { a, ctx };
}
test("Recovery Pulse heals only during its three-second window and respects maximum HP", () => {
  const f = fixture();
  f.a.recoveryUntil = 13;
  f.ctx.skillRecoveryTick(1);
  assert.equal(f.a.p.hp, 33);
  f.a.t = 13;
  f.ctx.skillRecoveryTick(1);
  assert.equal(f.a.p.hp, 33);
  f.a.t = 11;
  f.a.p.hp = 99;
  f.ctx.skillRecoveryTick(1);
  assert.equal(f.a.p.hp, 100);
});
test("Field Notes grants the documented timed damage multiplier", () => {
  const f = fixture();
  f.a.studyUntil = 18;
  assert.equal(f.ctx.gt(), 1.1);
  f.a.t = 18;
  assert.equal(f.ctx.gt(), 1);
  f.a.passives.study = 3;
  f.a.studyUntil = 20;
  assert(Math.abs(f.ctx.gt() - 1.2) < 1e-10);
});
test("Emergency Shell reduces low-HP hits and cannot retrigger before cooldown", () => {
  const f = fixture();
  f.ctx.ma(20);
  assert.equal(f.a.p.hp, 15);
  assert.equal(f.a.emergencyUntil, 13);
  assert.equal(f.a.emergencyReady, 40);
  f.a.t = 14;
  f.a.p.inv = 0;
  f.ctx.ma(4);
  assert.equal(f.a.p.hp, 11);
  assert.equal(f.a.emergencyUntil, 13);
});

test("easy and normal leave breathing room between hits without changing hard", () => {
  for (const [difficulty, grace] of [
    ["easy", 1.05],
    ["normal", 0.95],
    ["hard", 0.75],
  ]) {
    const { a, ctx } = fixture();
    a.diff = difficulty;
    a.p.hp = 100;
    ctx.ma(5);
    assert.equal(a.p.inv, a.t + grace);
    a.t += grace - 0.1;
    ctx.ma(5);
    assert.equal(a.p.hp, 95);
  }
});
