// Knowledge flow (#55): question tablets, unit skills and mini-bosses.
// Synthetic data only, no database.
import assert from "node:assert/strict";
import { test } from "node:test";
import { arenaContext } from "./test-runtime.mjs";
import {
  BOSS_FOR_UNIT,
  EQUIPMENT,
  HINTS,
  LAYOUT,
  MINI_BOSSES,
  PACE,
  TABLETS,
  TEST_SPEEDS,
  UNIT_SKILLS,
  testSpeedFor,
  bossTypeFor,
  worldLayout,
} from "../../public/games/arena-knowledge.js";

// A real run state from On(), with every first-time hint already read and a
// bridge that answers at once (no window in Node).
function run(overrides = {}) {
  const context = arenaContext({ i: false, ...overrides });
  context.tt.d.regionSeen = Object.fromEntries(
    Object.keys(HINTS).map((key) => ["kfh:" + key, true]),
  );
  context.Ce = { call: () => Promise.resolve({ status: "error" }) };
  context.On("rifle");
  context.I = "play";
  return context;
}

const fixed = (value) => () => value;

test("every unit has its own skills, each with three levels", () => {
  const engines = Object.keys(run().knowledge._.ENGINES);
  for (let unit = 1; unit <= 10; unit++) {
    const own = Object.values(UNIT_SKILLS).filter((s) => s.unit === unit);
    assert.ok(own.length >= (unit === 1 ? 3 : 2), "unit " + unit);
  }
  for (const [id, skill] of Object.entries(UNIT_SKILLS)) {
    assert.ok(engines.includes(skill.engine), id);
    assert.equal(skill.up.length, 3, id);
    for (const pair of [skill.name, skill.info, ...skill.up])
      assert.ok(pair[0] && pair[1] && pair[0] !== pair[1], id);
  }
  for (const boss of Object.values(MINI_BOSSES))
    assert.ok(EQUIPMENT[boss.gear]);
  for (const kind of ["base", "desert", "rainforest", "snow", "book"])
    assert.ok(
      Object.values(MINI_BOSSES).some((boss) => boss.world === kind),
      kind,
    );
});

test("world layout stays on the map and away from special regions", () => {
  const world = { w: 1152, h: 768, cx: 576, cy: 384 };
  const plain = worldLayout(world, [], 0);
  assert.equal(plain.lairs.length, 1);
  for (const p of [...plain.tablets, ...plain.lairs]) {
    assert.ok(p.x >= 40 && p.x <= world.w - 40, JSON.stringify(p));
    assert.ok(p.y >= 40 && p.y <= world.h - 40, JSON.stringify(p));
  }
  assert.equal(plain.tablets.length, LAYOUT.tablets.length);
  const blocked = [{ x: plain.tablets[0].x, y: plain.tablets[0].y, r: 30 }],
    moved = worldLayout(world, blocked, 0);
  assert.notEqual(moved.variant, 0);
  for (const p of [...moved.tablets, ...moved.lairs])
    assert.ok(Math.hypot(p.x - blocked[0].x, p.y - blocked[0].y) > 100);
});

test("big bosses follow the unit being studied", () => {
  assert.equal(bossTypeFor(1, null), "dne");
  assert.equal(bossTypeFor(6, null), "riemann");
  assert.equal(bossTypeFor(6, "riemann"), null);
  assert.equal(bossTypeFor(10, null), null);
  const context = run();
  context.a.curUnit = 3;
  assert.equal(context.cs(), BOSS_FOR_UNIT[3]);
  context.knowledge.bossDef({ name: "Sir Tangent" }, "knight");
  context.a.bossK = 1;
  assert.equal(context.cs(), "knight"); // repeat in the same unit: original order
  assert.equal(context.a.kf.bossPlan.type, null);
});

test("small enemies give less XP while elites keep theirs", () => {
  const context = run();
  const enemy = (elite) => ({
    x: 300,
    y: 300,
    r: 5,
    xp: 2,
    hp: 0,
    maxHp: 10,
    elite,
    pal: ["#fff"],
  });
  context.Jn(enemy(false));
  assert.equal(context.a.gems[0].v, 2 * 0.6);
  context.a.gems = [];
  context.Jn(enemy(true));
  assert.equal(context.a.gems[0].v, 2);
});

test("every tablet offers this unit's skills; harder ones offer more and stronger", () => {
  const context = run(),
    k = context.knowledge,
    offer = (tier) =>
      k.answerCards({ kfSource: "tablet", kfTier: tier, tier }, true, []);
  const units = (cards) => cards.filter((card) => card.kf === "unit");
  const easy = offer(1),
    medium = offer(2),
    hard = offer(3);
  assert.equal(units(easy).length, 1);
  assert.equal(units(medium).length, 2);
  assert.equal(units(hard).length, 2);
  for (const card of [...units(easy), ...units(hard)])
    assert.equal(UNIT_SKILLS[card.id].unit, 1);
  assert.ok(units(easy).every((card) => card.step === 1));
  assert.ok(units(hard).every((card) => card.step === 2));
  assert.ok(hard.noReroll && !easy.noReroll);
  // A ★★★ skill starts at Lv 2.
  k.applyCard(units(hard)[0]);
  assert.equal(context.a.kf.unit[units(hard)[0].id].lv, 2);
  // Wrong answers and level-up questions keep their usual cards.
  const basic = [{ type: "heal" }];
  assert.equal(
    k.answerCards({ kfSource: "tablet", kfTier: 3 }, false, basic),
    basic,
  );
  assert.equal(k.answerCards({ tier: 2 }, true, basic), basic);
});
test("unit skills fade with the next unit", () => {
  const context = run(),
    k = context.knowledge;
  context.a.units = [1, 2];
  for (let n = 0; n < 3; n++) k._.gainUnitSkill("u1_squeeze");
  k._.gainUnitSkill("u1_ivt");
  assert.deepEqual(Object.keys(context.a.kf.unit), ["u1_squeeze", "u1_ivt"]);
  context.a.bossK = 1;
  context.Xn();
  assert.equal(context.a.curUnit, 2);
  assert.deepEqual(context.a.kf.unit, {});
  assert.equal(k.damageMult({}), 1);
  // A single-unit run never changes unit, so its skills stay.
  const single = run();
  single.knowledge._.gainUnitSkill("u1_ivt");
  single.a.bossK = 1;
  single.Xn();
  assert.ok(single.a.kf.unit.u1_ivt);
});

test("equipment levels up when found again and asks before replacing", () => {
  let offered = null;
  const context = run({
      Bt: {
        el: null,
        chest(cards) {
          offered = cards;
        },
      },
    }),
    k = context.knowledge;
  k._.offerGear("laser");
  k._.offerGear("laser");
  k._.offerGear("rockets");
  assert.deepEqual(
    context.a.kf.gear.map((g) => [g.id, g.lv]),
    [
      ["laser", 2],
      ["rockets", 1],
    ],
  );
  k._.offerGear("frost");
  assert.equal(context.I, "chest");
  assert.deepEqual(
    offered.map((card) => card.kf),
    ["equipSwap", "equipSwap", "keep"],
  );
  k.applyCard(offered[1]);
  assert.equal(context.a.kf.gear[1].id, "frost");
});

test("a defeated mini-boss leaves its equipment and its lair stays cleared", () => {
  const context = run(),
    k = context.knowledge,
    world = k._.ensureWorld(),
    lair = world.lairs[0];
  assert.equal(lair.boss, "mech");
  context.a.p.x = lair.x + 80;
  context.a.p.y = lair.y + 7;
  k.update(1 / 60);
  assert.equal(lair.state, "hidden");
  context.a.t = world.t0 + PACE.lairAfter[0];
  k.update(1 / 60);
  assert.equal(lair.state, "awake");
  const boss = lair.enemy;
  assert.equal(boss.type, "kfboss");
  context.At(boss, boss.hp + 1, { nocrit: true });
  assert.equal(lair.state, "done");
  const drop = context.a.picks.find((p) => p.kind === "kfgear");
  assert.equal(drop.gear, MINI_BOSSES.mech.gear);
  assert.ok(!context.a.picks.some((p) => p.kind === "kfchest"));
});

test("moving with Instantaneous Rate fires faster", () => {
  const context = run(),
    k = context.knowledge;
  assert.equal(k.cooldownFactor(), 1);
  context.a.curUnit = 2;
  k._.gainUnitSkill("u2_rate");
  context.a.p.moving = true;
  assert.ok(k.cooldownFactor() < 1);
  context.a.p.moving = false;
  assert.equal(k.cooldownFactor(), 1);
});

test("hard tablets bring more enemies only near them", () => {
  const context = run(),
    k = context.knowledge,
    world = k._.ensureWorld();
  assert.equal(k.spawnFactor(), 1);
  context.a.p.x = world.tablets[2].x;
  context.a.p.y = world.tablets[2].y + 30;
  // Not open yet in a new run, so it changes nothing.
  assert.equal(k.spawnFactor(), 1);
  context.a.kf.stats.tablets = 2;
  assert.equal(k.spawnFactor(), TABLETS[2].spawn);
});

test("every unit skill runs and hurts nearby enemies", () => {
  for (const [id, skill] of Object.entries(UNIT_SKILLS)) {
    if (["rate", "lhopital", "growth"].includes(skill.engine)) continue;
    const context = run(),
      k = context.knowledge,
      a = context.a;
    a.curUnit = skill.unit;
    for (let n = 0; n < 3; n++) k._.gainUnitSkill(id);
    if (skill.engine === "accum") a.kf.unit[id].n = 99;
    const foes = [];
    for (let n = 0; n < 10; n++) {
      const angle = (n / 10) * Math.PI * 2,
        r = 30 + (n % 3) * 15;
      foes.push(
        context.ye(
          "golem",
          a.p.x + Math.cos(angle) * r,
          a.p.y + Math.sin(angle) * r,
        ),
      );
    }
    // Walk a small circle through the group, as a player would.
    const home = { x: a.p.x, y: a.p.y };
    a.p.moving = true;
    for (let frame = 0; frame < 360; frame++) {
      const angle = frame / 30;
      a.t += 1 / 60;
      a.p.x = home.x + Math.cos(angle) * 40;
      a.p.y = home.y + Math.sin(angle) * 40;
      a.p.dx = -Math.sin(angle);
      a.p.dy = Math.cos(angle);
      context.go();
      k.update(1 / 60);
    }
    assert.ok(
      foes.some((foe) => foe.hp < foe.maxHp),
      `${id} should damage something`,
    );
  }
});

test("level-up questions keep their usual cards; tablet text only on tablets", () => {
  const context = run(),
    k = context.knowledge,
    cards = [{ type: "weapon", id: "x" }];
  assert.equal(k.answerCards({ tier: 1 }, true, cards), cards);
  context.a.lvT = 5;
  context.a.lvBanner = { t: 4, title: "TABLET!" };
  assert.equal(k.levelText(), null);
  context.a.lvBanner.t = 5;
  assert.equal(k.levelText().title, "TABLET!");
});

test("tablets open one tier at a time and share one cooldown", () => {
  const context = run(),
    k = context.knowledge,
    a = context.a,
    world = k._.ensureWorld(),
    [easy, medium] = world.tablets;
  assert.deepEqual(world.tablets.map(k._.tabletOpen), [true, false, false]);
  assert.ok(!k._.tabletsReady());
  a.t = PACE.firstTablet;
  assert.ok(k._.tabletsReady());
  // A closed tablet does nothing.
  a.p.x = medium.x;
  a.p.y = medium.y;
  k.update(1 / 60);
  assert.equal(context.I, "play");
  a.p.x = easy.x;
  a.p.y = easy.y;
  k.update(1 / 60);
  assert.equal(context.I, "lvup");
  assert.equal(a.kf.stats.tablets, 1);
  assert.deepEqual(world.tablets.map(k._.tabletOpen), [true, true, false]);
  // Every tablet dims for the cooldown of the tier that was answered.
  assert.ok(!k._.tabletsReady());
  a.t += TABLETS[0].cd - 0.1;
  assert.ok(!k._.tabletsReady());
  a.t += 0.1;
  assert.ok(k._.tabletsReady());
});

test("no tablet lights up right after a question or panel closes", () => {
  const context = run(),
    k = context.knowledge,
    a = context.a;
  k._.ensureWorld();
  a.t = 20;
  context.E = 100;
  k.update(1 / 60);
  assert.ok(k._.tabletsReady());
  // Thirty real seconds pass in a quiz while game time stands still.
  context.E = 130;
  k.update(1 / 60);
  assert.ok(!k._.tabletsReady());
  a.t += PACE.restAfterModal;
  assert.ok(k._.tabletsReady());
});

test("the mini-boss lair waits its turn", () => {
  const context = run(),
    k = context.knowledge,
    a = context.a,
    world = k._.ensureWorld(),
    [lair] = world.lairs;
  assert.equal(world.lairs.length, 1);
  assert.equal(lair.state, "hidden");
  k.update(1 / 60);
  assert.equal(lair.state, "hidden");
  // Two tablets answered bring it forward (but not before 30 s).
  a.kf.stats.tablets = 2;
  a.t = world.t0 + 29;
  k.update(1 / 60);
  assert.equal(lair.state, "hidden");
  a.t = world.t0 + 30;
  k.update(1 / 60);
  assert.equal(lair.state, "sleep");
  // A later world waits less.
  const next = run(),
    w2 = next.knowledge._.ensureWorld();
  w2.first = false;
  next.a.t = w2.t0 + PACE.lairAfter[1];
  next.knowledge.update(1 / 60);
  assert.equal(w2.lairs[0].state, "sleep");
});
test("at most one objective arrow and one loot arrow", () => {
  const context = run(),
    k = context.knowledge,
    a = context.a,
    world = k._.ensureWorld();
  a.t = PACE.firstTablet;
  a.kf.stats.tablets = 2;
  // Camera far away: everything is off screen.
  a.cam = { x: -5000, y: -5000 };
  let marks = k._.markerTargets();
  assert.equal(marks.length, 1);
  assert.match(marks[0].label, /^\*+$/);
  // Standing at a tablet, the arrow points to the next one you cannot see.
  const [first] = world.tablets;
  a.p.x = first.x;
  a.p.y = first.y;
  a.cam = { x: first.x - 200, y: first.y - 120 };
  marks = k._.markerTargets();
  assert.equal(marks.length, 1);
  assert.notEqual(marks[0].x, first.x);
  a.cam = { x: -5000, y: -5000 };
  for (let n = 0; n < 3; n++)
    a.picks.push({ kind: "kfgear", kf: true, x: 100 + n * 50, y: 100 });
  marks = k._.markerTargets();
  assert.equal(marks.length, 2);
  // While tablets cool down, a lair that just appeared takes the arrow, then
  // the arrow goes away so it does not nag.
  a.picks.length = 0;
  a.t = world.t0 + PACE.lairAfter[0];
  a.kf.tabletAt = a.t + 30;
  k.update(1 / 60);
  marks = k._.markerTargets();
  assert.deepEqual(
    marks.map((m) => m.label),
    ["!"],
  );
  a.t += PACE.lairArrow + 1;
  assert.deepEqual(k._.markerTargets(), []);
  // A short reminder once a minute (tablets still cooling down).
  a.t += 60 - PACE.lairArrow - 1 + 2;
  a.kf.tabletAt = a.t + 30;
  assert.deepEqual(
    k._.markerTargets().map((m) => m.label),
    ["!"],
  );
});

test("first-time help is a short hint that never pauses", () => {
  const context = run();
  context.tt.d.regionSeen = {};
  const k = context.knowledge;
  k._.ensureWorld();
  assert.ok(k._.hint("unit"));
  k.update(1 / 60);
  assert.equal(context.I, "play");
  assert.equal(context.a.owl.s, HINTS.unit[0]);
  assert.ok(context.tt.d.regionSeen["kfh:unit"]);
  // Once per device.
  assert.ok(!k._.hint("unit"));
  for (const [key, [en, zh]] of Object.entries(HINTS)) {
    assert.ok((en.match(/[.!?](\s|$)/g) || []).length <= 2, key);
    assert.ok((zh.match(/[。！？]/g) || []).length <= 2, key);
    assert.ok(en.length <= 90 && zh.length <= 32, key);
  }
});

test("skill hits stay quiet: no crits, same average damage", () => {
  const context = run(),
    k = context.knowledge,
    a = context.a;
  a.st.critC = 1;
  a.st.critM = 3;
  const foe = context.ye("golem", a.p.x + 20, a.p.y),
    hp = foe.hp,
    crits = a.crits;
  k._.hit(foe, 10);
  assert.equal(a.crits, crits);
  assert.ok(!a.floats.some((f) => f.crit));
  // The average crit (chance capped at 85%, ×3) is folded in: 10 × 2.7.
  assert.ok(Math.abs(hp - foe.hp - 27 * context.gt()) < 1e-6);
});

test("the HUD shows only unit skills and equipment; the pause list names them", () => {
  const context = run(),
    k = context.knowledge;
  const ctx = new Proxy(
    { globalAlpha: 1 },
    {
      get: (target, key) =>
        key in target
          ? target[key]
          : key === "measureText"
            ? () => ({ width: 4 })
            : () => {},
      set: (target, key, value) => ((target[key] = value), true),
    },
  );
  const bare = k.drawHud(ctx, 400, 50);
  assert.equal(bare, 53);
  k._.gainUnitSkill("u1_ivt");
  assert.ok(k.drawHud(ctx, 400, 50) > bare);
  assert.match(k.buildItems(), /kf_u1_ivt/);
  assert.equal(ctx.globalAlpha, 1);
});

test("admin test speed: only admins, only listed speeds, everything runs faster", (t) => {
  assert.equal(testSpeedFor({ test: 4 }, true), 4);
  assert.equal(testSpeedFor({ test: 4 }, false), 1);
  assert.equal(testSpeedFor({ test: 3 }, true), 1);
  assert.equal(testSpeedFor({}, true), 1);
  const store = new Map([["cq-arena-admin", "1"]]),
    previous = globalThis.localStorage;
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null };
  t.after(() => (globalThis.localStorage = previous));
  const fast = (speed) => {
    const context = arenaContext({ i: false });
    context.tt.d.setup = {
      units: [1],
      diff: "normal",
      qdiff: "mixed",
      test: speed,
    };
    context.Ce = { call: () => Promise.resolve({ status: "error" }) };
    context.On("rifle");
    context.I = "play";
    return context;
  };
  for (const speed of TEST_SPEEDS) {
    const context = fast(speed),
      a = context.a;
    assert.equal(a.testSpeed, speed);
    assert.equal(a.nextBossT, 240 / speed, "bosses come sooner");
    // Tablets light up sooner too.
    context.knowledge._.ensureWorld();
    assert.ok(a.kf.tabletAt <= a.t + PACE.firstTablet / speed + 1e-9);
    const xp = a.xp;
    context.Kn(5);
    assert.ok(Math.abs(a.xp - xp - 5 * a.st.xp * speed) < 1e-9 || a.lv > 1);
    // Enemies spawned at 30 s are as strong as at 30 × speed seconds.
    a.t = 30;
    const foe = context.ye("slime", a.p.x + 90, a.p.y);
    const normal = fast(1);
    normal.a.t = 30 * speed;
    const ref = normal.ye("slime", normal.a.p.x + 90, normal.a.p.y);
    assert.ok(Math.abs(foe.hp - ref.hp) < 1e-9, "enemy growth keeps up");
  }
  // A student who is not an admin gets normal speed even with a saved choice.
  store.delete("cq-arena-admin");
  assert.equal(fast(4).a.testSpeed, 1);
});
