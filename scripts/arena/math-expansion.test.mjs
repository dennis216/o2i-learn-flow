import { arenaContext } from "./test-runtime.mjs";
import assert from "node:assert/strict";

import { test } from "node:test";

function fixture(chinese = false) {
  const calls = [],
    shots = [],
    enemies = Array.from({ length: 6 }, (_, id) => ({
      id,
      x: 130 + id * 3,
      y: 100,
      r: 5,
      hp: 100,
    }));
  const a = {
    t: 10,
    p: { x: 100, y: 107, hp: 20, maxHp: 100, dx: 1, dy: 0 },
    st: { area: 1 },
    enemies,
    proj: [],
    pfx: [],
    mathPulses: [],
    cam: { x: 0, y: 0 },
    gems: [],
    passives: {},
    thm: {},
  };
  const colors = new Proxy({}, { get: (_, key) => String(key) });
  const ctx = arenaContext({
    a,
    i: chinese,
    wa: {},
    s: colors,
    Math,
    j: Math.PI * 2,
    F: (v, min, max) => Math.max(min, Math.min(max, v)),
    H: (id) => a.passives[id] || 0,
    ht: (id) => !!a.thm[id],
    gt: () => 1,
    X: () => a.p.x,
    _: () => a.p.y - 7,
    me: () => enemies[0],
    at: (x, y, xx, yy) => Math.atan2(yy - y, xx - x),
    ie: (shot) => shots.push(shot),
    Rt: (x, y, r, callback) => {
      for (const e of enemies) if (callback(e) === true) break;
    },
    At: (enemy, damage, options) => calls.push({ enemy, damage, options }),
    os: () => 0,
  });

  const skills = ctx.mathArsenal(),
    theorems = ctx.mathTheorems();
  return { a, ctx, calls, shots, skills, theorems };
}
test("10 companions, 5 passives and 5 theorem recipes have bilingual names and distinct pixel icons", () => {
  for (const chinese of [false, true]) {
    const f = fixture(chinese),
      all = Object.values(f.skills);
    assert.equal(all.filter((x) => x.kind === "weapon").length, 10);
    assert.equal(all.filter((x) => x.kind === "passive").length, 5);
    assert.equal(Object.keys(f.theorems).length, 5);
    const patterns = new Set();
    for (const skill of [...all, ...Object.values(f.theorems)]) {
      assert(skill.name);
      const pattern = f.ctx.wa[skill.icon];
      assert.equal(pattern.length, 12);
      assert(pattern.every((row) => row.length === 12));
      patterns.add(pattern.join(""));
    }
    assert.equal(patterns.size, 20);
    for (const recipe of Object.values(f.theorems)) {
      assert.equal(recipe.req.length, 2);
      assert(recipe.req.every((id) => f.skills[id] || id === "armor"));
    }
  }
});
test("all companions fire through the existing collision system; levels and bursts stay bounded", () => {
  for (const [id, spec] of Object.entries(fixture().skills).filter(
    ([, s]) => s.kind === "weapon",
  ))
    for (const level of [1, 5, 99]) {
      const f = fixture();
      assert.equal(f.ctx.fireMathWeapon(id, { lv: level }, spec, 1), true);
      assert(f.calls.length + f.shots.length + f.a.proj.length > 0);
      assert(f.shots.length <= 4);
      assert(f.calls.length <= 4);
      const expected = spec.dmg(Math.min(level, 5));
      assert(f.shots.every((shot) => shot.dmg === expected));
      assert(f.calls.every((call) => call.damage === expected));
      assert(spec.dmg(5) <= spec.dmg(1) * 1.73);
      assert(spec.cd(1) >= 2.4);
    }
});
test("vortex pulses run exactly three times, hit at most four targets each and never requeue themselves", () => {
  const f = fixture(),
    spec = f.skills.vortex;
  f.ctx.fireMathWeapon("vortex", { lv: 1 }, spec);
  assert.equal(f.calls.length, 4);
  f.a.t = 10.5;
  f.ctx.updateMathPulses();
  assert.equal(f.calls.length, 8);
  f.a.t = 11;
  f.ctx.updateMathPulses();
  assert.equal(f.calls.length, 12);
  f.ctx.updateMathPulses();
  assert.equal(f.calls.length, 12);
  assert.equal(f.a.mathPulses.length, 0);
});
test("theorem effects require ownership, and affect only their intended weapons", () => {
  const f = fixture();
  f.ctx.fireMathWeapon("vector", { lv: 1 }, f.skills.vector);
  assert.equal(f.shots.at(-1).dmg, 14);
  f.a.thm.pythagoras = true;
  f.ctx.fireMathWeapon("vector", { lv: 1 }, f.skills.vector);
  assert.equal(f.shots.at(-1).dmg, 14 * 1.15);
  f.ctx.fireMathWeapon("pascal", { lv: 1 }, f.skills.pascal);
  assert.equal(f.shots.at(-1).dmg, 12);
  f.shots.length = 0;
  f.ctx.fireMathWeapon("binomial", { lv: 1 }, f.skills.binomial);
  assert.equal(f.shots.length, 2);
  f.a.thm.pascalpair = true;
  f.shots.length = 0;
  f.ctx.fireMathWeapon("binomial", { lv: 1 }, f.skills.binomial);
  assert.equal(f.shots.length, 3);
  f.a.thm.harmonic = true;
  f.ctx.fireMathWeapon("spiral", { lv: 1 }, f.skills.spiral);
  assert.equal(f.shots.at(-1).home, 7);
  assert.equal(f.shots.at(-1).dmg, 13 * 1.15);
  f.a.thm.stokes = true;
  f.ctx.fireMathWeapon("curl", { lv: 1 }, f.skills.curl);
  assert.equal(f.a.pfx.at(-1).r, 38 * 1.15);
});
test("new passives compose without replacing existing armor or raising healing past 40 percent", () => {
  const f = fixture();
  f.a.passives = { norm: 3, conserve: 3, gradient: 3, squeeze: 3 };
  f.a.thm.noether = true;
  const stats = { dmg: 2, armor: 0.2, speed: 60, magnet: 26 };
  f.ctx.applyMathStats(stats);
  assert.equal(stats.dmg, 2 * 1.09);
  assert.equal(stats.armor, 1 - 0.8 * 0.91 * 0.95);
  assert.equal(stats.speed, 60 * 1.06);
  assert.equal(stats.magnet, 26 * 1.15);
  f.ctx.H = (id) => f.a.passives[id] || 0;
  f.a.p.hp = 39.9;
  f.ctx.skillRecoveryTick(1);
  assert.equal(f.a.p.hp, 40);
  f.a.p.hp = 60;
  f.ctx.skillRecoveryTick(1);
  assert.equal(f.a.p.hp, 60);
});
test("boss vacuum collects every gem once and queues all resulting levels without opening a quiz", () => {
  const f = fixture();
  Object.assign(f.a, {
    xp: 0,
    need: 10,
    lv: 1,
    pendingLv: 0,
    st: { xp: 1 },
    gems: [{ v: 7 }, { v: 12 }, { v: 11 }],
  });
  Object.assign(f.ctx, { Go: () => 10, Yn() {}, bt() {} });
  f.ctx.collectBossExperience();
  assert.equal(f.a.gems.length, 0);
  assert.equal(f.a.lv, 4);
  assert.equal(f.a.pendingLv, 3);
  assert.equal(f.a.xp, 0);
  f.ctx.collectBossExperience();
  assert.equal(f.a.pendingLv, 3);
});
test("region arrows persist only while the buff is offscreen and disappear as soon as it becomes visible", () => {
  const f = fixture();
  let pixels = 0;
  Object.assign(f.ctx, {
    A: 400,
    D: 225,
    ee: 2,
    R: {
      save() {},
      restore() {},
      scale() {},
      fillRect() {
        pixels++;
      },
    },
  });
  f.ctx.drawRegionArrow({ x: 800, y: 100, r: 25 });
  assert(pixels > 0);
  pixels = 0;
  f.ctx.drawRegionArrow({ x: 390, y: 100, r: 25 });
  assert.equal(pixels, 0);
});
