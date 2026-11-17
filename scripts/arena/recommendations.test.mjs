import { arenaContext } from "./test-runtime.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";

function fixture() {
  const a = {
    p: { hp: 80, maxHp: 100 },
    weapons: [{ id: "gun", lv: 3 }],
    passives: {},
    thm: {},
  };
  const O = {
    gun: { main: true, evoNeed: "crit" },
    crit: {},
    armor: {},
    recovery: {},
    burn: { pays: "burn" },
  };
  const jt = { combo: { name: "Combo", req: ["gun", "crit"] } };
  const ctx = arenaContext({
    a,
    O,
    jt,
    I: "play",
    i: false,
    z: String,
    zt: (id) => a.weapons.find((w) => w.id === id),
    H: (id) => a.passives[id] || 0,
    de: (id) => !!a.weapons.find((w) => w.id === id) || !!a.passives[id],
    Mt: (id) => id,
  });
  return { a, ctx };
}
test("recipe ownership distinguishes missing components and evolution level requirements", () => {
  const f = fixture();
  let html = f.ctx.recipeHTML(["gun", "crit"], { weapon: "gun" });
  assert(html.includes("gun — OWNED Lv 3 / 5"));
  assert(html.includes("crit — MISSING"));
  assert(!html.includes("READY:"));
  f.a.weapons[0].lv = 5;
  f.a.passives.crit = 1;
  html = f.ctx.recipeHTML(["gun", "crit"], { weapon: "gun" });
  assert(html.includes("READY: evolution"));
});
test("recommendation explains a missing combo ingredient instead of pretending it is owned", () => {
  const f = fixture();
  const result = f.ctx.recommendUpgrade([
    { id: "armor", type: "passive" },
    { id: "crit", type: "passive" },
  ]);
  assert.equal(result.index, 1);
  assert(result.reason.includes("missing ingredient"));
  assert.equal(f.a.passives.crit, undefined);
});
test("low HP prioritizes available healing, and inactive status boosts do not win", () => {
  const f = fixture();
  f.a.p.hp = 20;
  assert.equal(
    f.ctx.recommendUpgrade([
      { id: "crit", type: "passive" },
      { id: "heal", type: "heal" },
    ]).index,
    1,
  );
  assert.equal(
    f.ctx.recommendUpgrade([
      { id: "burn", type: "passive" },
      { id: "armor", type: "passive" },
    ]).index,
    1,
  );
});
test("the title-screen guide does not mistake the previous run for a live build", () => {
  const f = fixture();
  f.ctx.I = "title";
  assert(!f.ctx.ownsIngredient("gun"));
  assert(f.ctx.recipeHTML(["gun", "crit"]).includes("START A RUN"));
});
