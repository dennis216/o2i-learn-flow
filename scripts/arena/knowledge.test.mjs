// Knowledge flow (#55): question tablets, chest meter, unit skills, rooms,
// mini-bosses and the weekly challenge. Synthetic data only, no database.
import assert from "node:assert/strict";
import { test } from "node:test";
import { arenaContext } from "./test-runtime.mjs";
import {
  BOSS_FOR_UNIT,
  DRILLS,
  EQUIPMENT,
  FOUNDATIONS,
  LAYOUT,
  MINI_BOSSES,
  ROOM_TOPICS,
  TABLETS,
  UNIT_SKILLS,
  WEEKLY_RULES,
  bossTypeFor,
  isoWeek,
  makeDrill,
  roomDrills,
  seededRandom,
  weeklyChallenge,
  worldLayout,
} from "../../public/games/arena-knowledge.js";

const TUTORIALS = ["tablet", "chest", "unit", "lair", "room", "gear"];

// A real run state from On(), with the new tutorials already read so no DOM is needed.
function run(overrides = {}) {
  const context = arenaContext({ i: false, ...overrides });
  context.tt.d.regionSeen = Object.fromEntries(
    TUTORIALS.map((key) => ["kf:" + key, true]),
  );
  context.On("rifle");
  context.I = "play";
  return context;
}

const fixed = (value) => () => value;

test("drills always offer four different options and mark the right one", () => {
  for (const topic of Object.keys(DRILLS))
    for (let seed = 0; seed < 150; seed++)
      for (const zh of [false, true]) {
        const drill = makeDrill(topic, seededRandom(seed), zh);
        assert.equal(drill.opts.length, 4, topic);
        assert.equal(new Set(drill.opts).size, 4, topic + " " + drill.stem);
        assert.ok(drill.ans >= 0 && drill.ans < 4, topic);
        assert.ok(drill.stem && drill.why, topic);
      }
});

test("drill answers are mathematically right", () => {
  const right = (maker, rnd = fixed(0)) => {
    const drill = maker(rnd, false);
    return drill.opts[drill.ans].replace(/<[^>]+>/g, " ").trim();
  };
  assert.equal(right(DRILLS.f_factor[0]), "4"); // (x²−4)/(x−2) → 4
  assert.equal(right(DRILLS.f_rationalize[1]), "1  4"); // 1/(2·2)
  assert.equal(right(DRILLS.f_rationalize[2]), "4"); // (x−4)/(√x−2) → 4
  assert.equal(right(DRILLS.f_slope[1]), "3"); // x² from 1 to 2
  assert.equal(right(DRILLS.f_area[0]), "55"); // 1+…+10
  assert.equal(right(DRILLS.f_area[1]), "5"); // (2+3)·2/2
  assert.equal(right(DRILLS.f_exponent[2]), "4"); // ln(e²·e²)
  assert.equal(right(DRILLS.f_compose[0]), "5"); // f(g(1)) = 2·2+1
  assert.equal(right(DRILLS.f_trig[1]), "4  5"); // cos θ when sin θ = 3/5
});

test("each unit's hidden room drills that unit's foundations", () => {
  for (let unit = 1; unit <= 10; unit++) {
    const drills = roomDrills(unit, seededRandom(unit));
    assert.equal(drills.length, 3);
    for (const drill of drills)
      assert.ok(ROOM_TOPICS[unit].includes(drill.topic));
    for (const topic of ROOM_TOPICS[unit]) assert.ok(FOUNDATIONS[topic], topic);
  }
});

test("every unit has its own skills, each with three levels and a spark partner", () => {
  const engines = Object.keys(run().knowledge._.ENGINES);
  for (let unit = 1; unit <= 10; unit++) {
    const own = Object.values(UNIT_SKILLS).filter((s) => s.unit === unit);
    assert.ok(own.length >= (unit === 1 ? 3 : 2), "unit " + unit);
  }
  for (const [id, skill] of Object.entries(UNIT_SKILLS)) {
    assert.ok(engines.includes(skill.engine), id);
    assert.equal(skill.up.length, 3, id);
    for (const pair of [
      skill.name,
      skill.info,
      skill.sparkName,
      skill.sparkInfo,
      skill.why,
      ...skill.up,
    ])
      assert.ok(pair[0] && pair[1] && pair[0] !== pair[1], id);
    assert.ok(FOUNDATIONS[skill.spark], id);
  }
  for (const boss of Object.values(MINI_BOSSES))
    assert.ok(EQUIPMENT[boss.gear]);
  for (const kind of ["base", "desert", "rainforest", "snow", "book"])
    assert.ok(
      Object.values(MINI_BOSSES).some((boss) => boss.world === kind),
      kind,
    );
});

test("the weekly challenge stays the same for the whole ISO week", () => {
  const monday = weeklyChallenge(new Date(2026, 10, 16, 9)),
    sunday = weeklyChallenge(new Date(2026, 10, 22, 23));
  assert.deepEqual(monday, sunday);
  assert.equal(monday.id, "2026-W47");
  assert.deepEqual(isoWeek(new Date(2026, 0, 1)), { year: 2026, week: 1 });
  const next = weeklyChallenge(new Date(2026, 10, 23, 9));
  assert.equal(next.id, "2026-W48");
  for (const week of [monday, next]) {
    assert.equal(new Set(week.rules).size, 2);
    for (const rule of week.rules) assert.ok(WEEKLY_RULES[rule]);
  }
  const limited = weeklyChallenge(new Date(2026, 10, 18), { units: [3, 7] });
  assert.ok([3, 7].includes(limited.unit));
});

test("world layout stays on the map and away from special regions", () => {
  const world = { w: 1152, h: 768, cx: 576, cy: 384 };
  const plain = worldLayout(world, [], 0, 2);
  for (const p of [...plain.tablets, ...plain.lairs, plain.door]) {
    assert.ok(p.x >= 40 && p.x <= world.w - 40, JSON.stringify(p));
    assert.ok(p.y >= 40 && p.y <= world.h - 40, JSON.stringify(p));
  }
  assert.equal(plain.tablets.length, LAYOUT.tablets.length);
  const blocked = [{ x: plain.tablets[0].x, y: plain.tablets[0].y, r: 30 }],
    moved = worldLayout(world, blocked, 0);
  assert.notEqual(moved.variant, 0);
  for (const p of [...moved.tablets, ...moved.lairs, moved.door])
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

test("correct tablet answers fill the chest and offer this unit's skills", () => {
  const context = run(),
    k = context.knowledge;
  const hard = k.answerCards(
    { kfSource: "tablet", kfTier: 3, tier: 3 },
    true,
    [],
  );
  assert.equal(context.a.kf.chest, TABLETS[2].chest);
  assert.ok(hard.noReroll);
  const units = hard.filter((card) => card.kf === "unit");
  assert.equal(units.length, 2);
  for (const card of units) assert.equal(UNIT_SKILLS[card.id].unit, 1);
  const easy = k.answerCards(
    { kfSource: "tablet", kfTier: 1, tier: 1 },
    true,
    [],
  );
  assert.ok(!easy.some((card) => card.kf === "unit"));
  const before = context.a.kf.chest,
    basic = [{ type: "heal" }];
  assert.equal(
    k.answerCards({ kfSource: "tablet", kfTier: 3 }, false, basic),
    basic,
  );
  assert.equal(context.a.kf.chest, before);
  // A level-up question still counts toward the chest.
  k.answerCards({ tier: 2 }, true, basic);
  assert.ok(context.a.kf.chest > before);
});

test("a full chest meter drops one knowledge chest next to the player", () => {
  const context = run(),
    k = context.knowledge;
  k._.addChest(1.1, true);
  const chests = context.a.picks.filter((p) => p.kind === "kfchest");
  assert.equal(chests.length, 1);
  assert.ok(chests[0].persist);
  assert.ok(
    Math.hypot(chests[0].x - context.a.p.x, chests[0].y - context.a.p.y) < 50,
  );
  assert.ok(Math.abs(context.a.kf.chest - 0.1) < 1e-9);
  k._.addChest(2, true);
  assert.equal(context.a.picks.filter((p) => p.kind === "kfchest").length, 1);
  assert.equal(context.a.kf.chest, 1);
});

test("unit skills fade with the next unit and mastered ones leave damage", () => {
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
  assert.equal(context.a.kf.residue, 0.03);
  assert.equal(k.damageMult({}), 1.03);
  // A single-unit run never changes unit, so its skills stay.
  const single = run();
  single.knowledge._.gainUnitSkill("u1_ivt");
  single.a.bossK = 1;
  single.Xn();
  assert.ok(single.a.kf.unit.u1_ivt);
});

test("a foundation and its matching unit skill spark", () => {
  const context = run(),
    k = context.knowledge;
  k._.gainUnitSkill("u1_squeeze");
  assert.equal(k._.sparkOn("u1_squeeze"), false);
  k.applyCard({ type: "kf", kf: "found", id: "f_rationalize" });
  assert.equal(k._.sparkOn("u1_squeeze"), true);
  assert.equal(context.a.kf.found.f_rationalize, 1);
  assert.ok(context.a.kf.sparks.u1_squeeze);
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
    ["equipSwap", "equipSwap", "salvage"],
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
  assert.equal(lair.state, "awake");
  const boss = lair.enemy;
  assert.equal(boss.type, "kfboss");
  context.At(boss, boss.hp + 1, { nocrit: true });
  assert.equal(lair.state, "done");
  const drop = context.a.picks.find((p) => p.kind === "kfgear");
  assert.equal(drop.gear, MINI_BOSSES.mech.gear);
  assert.ok(context.a.kf.chest >= 0.35);
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
  assert.equal(k.spawnFactor(), TABLETS[2].spawn);
});

test("every unit skill runs and hurts nearby enemies", () => {
  for (const [id, skill] of Object.entries(UNIT_SKILLS)) {
    if (["rate", "lhopital", "growth"].includes(skill.engine)) continue;
    const context = run(),
      k = context.knowledge,
      a = context.a;
    a.curUnit = skill.unit;
    for (const found of Object.keys(FOUNDATIONS)) a.kf.found[found] = 2;
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
