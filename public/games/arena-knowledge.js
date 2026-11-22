export const ARENA_STAGE_SECONDS = 210;
// Knowledge flow for Limit Arena (#55), from Dennis's 2026-11-18 playtest notes.
//
// One idea: fight → answer → get stronger, and harder questions give stronger
// skills. Small enemies drop less XP. Question tablets sit in easy (★) and hard
// (★★★) areas of each world and offer skills that belong to the unit being
// studied; they fade when the next unit begins. Each world has a themed
// mini-boss that drops its own equipment.
//
// Kept calm on purpose (Dennis: "plays very messy"): tablets open one tier at a
// time and share one cooldown; the lair appears later; first-time help is a
// short owl hint that never pauses; banners queue; at most one objective arrow
// plus one loot arrow; skill hits never crit. Third round cut the chest meter,
// hidden rooms with their foundations and sparks, knowledge residue and the
// weekly challenge so the core loop stands out.
// See docs/arena/DENNIS_KNOWLEDGE_FLOW_55.md for the sources behind each rule.
//
// limit-arena.js passes live accessors to createKnowledgeFlow, so tests that
// patch runtime bindings also patch what this module sees. Outside a real run
// (no `a.kf`) every hook is a no-op.

const pick = (zh, pair) => (zh ? pair[1] : pair[0]);

// ---------------------------------------------------------------- tuning
// `cd` is the shared cooldown: answering any tablet dims all of them for the
// cooldown of the tier you chose. Tier n opens after n − 1 tablets this run.
export const TABLETS = [
  { tier: 1, col: "#00E436", cd: 25, ring: 52, spawn: 1 },
  { tier: 2, col: "#FFEC27", cd: 35, ring: 56, spawn: 1.25 },
  { tier: 3, col: "#FF004D", cd: 45, ring: 62, spawn: 1.6 },
];
// Pacing, in game seconds. [first world, later worlds] where there are two.
export const PACE = {
  firstTablet: 2,
  restAfterModal: 8,
  lairAfter: [120, 45],
  lairArrow: 15,
  bannerGap: 2,
  hintGap: 3,
};

// Admin test speeds (setup screen, admins only). The run clock, XP, bosses
// and the timings above all run this many times faster; runs are not recorded.
export const TEST_SPEEDS = [1, 2, 4];
export const ADMIN_KEY = "cq-arena-admin";
// The site (src/pages/Arena.tsx) sets ADMIN_KEY for admins. A student who sets
// it by hand only speeds up their own local run, which is never recorded.
export function isArenaAdmin() {
  try {
    return globalThis.localStorage?.getItem(ADMIN_KEY) === "1";
  } catch {
    return false;
  }
}
export function testSpeedFor(setup, admin = isArenaAdmin()) {
  const value = Number(setup?.test);
  return admin && TEST_SPEEDS.includes(value) ? value : 1;
}
const TEST_INFO = {
  1: ["Normal speed.", "正常速度。"],
  2: [
    "XP ×2; enemy growth, spawns, bosses and tablets ×2. Not recorded.",
    "经验 ×2；敌人成长、刷怪、首领、题碑都 ×2。不计入记录。",
  ],
  4: [
    "XP ×4; enemy growth, spawns, bosses and tablets ×4. Not recorded.",
    "经验 ×4；敌人成长、刷怪、首领、题碑都 ×4。不计入记录。",
  ],
};

// First-time help, shown once per device as a short owl hint that never
// pauses the game. Two sentences at most; {dir} is filled with a direction.
export const HINTS = {
  tablet: [
    "Question tablet: step on it to answer a question from this unit.",
    "题碑：走上去，答一道本单元的题。",
  ],
  tablet2: [
    "A 2-star tablet opened: harder, and its rewards include unit skills.",
    "两星题碑开了：更难，奖励里有本单元技能。",
  ],
  tablet3: [
    "A 3-star tablet opened far out: hardest, more enemies, best rewards.",
    "三星题碑在远处开了：最难，怪更多，奖励最强。",
  ],
  unit: [
    "Unit skills work only in this unit and fade when the next unit begins.",
    "单元技能只在本单元有效，进入下一单元就会消失。",
  ],
  lair: [
    "A mini-boss lair appeared. Walk close to wake it; beat it for equipment.",
    "小首领巢穴出现了。走近会叫醒它，打败它掉装备。",
  ],
  gear: [
    "Equipment fires on its own. Find the same one again to level it up.",
    "装备会自动开火，再捡到同一件就会升级。",
  ],
};
export const SMALL_ENEMY_XP = 0.6;

// Offsets from the world centre; flipped per world so maps differ. They stay
// outside the ring where Brian's special regions and landmarks live.
export const LAYOUT = {
  tablets: [
    [-300, 60],
    [290, 200],
    [430, -270],
  ],
  lair: [-440, -250],
};

// ---------------------------------------------------------------- unit skills
// Each unit owns 2–3 skills. Numbers are per level (Lv 1–3).
export const UNIT_SKILLS = {
  u1_squeeze: {
    unit: 1,
    engine: "squeeze",
    col: "#4fb4ff",
    name: ["Squeeze Theorem", "夹逼定理"],
    info: [
      "Every few seconds two bounding lines g ≤ f ≤ h close on the nearest group and crush every enemy caught between them.",
      "每隔几秒，两条边界线 g ≤ f ≤ h 向最近的一群敌人收拢，夹在中间的敌人都会受到伤害。",
    ],
    cd: [5, 4.5, 4],
    dmg: [26, 38, 52],
    up: [
      ["26 damage · every 5 s", "26 伤害 · 每 5 秒"],
      ["38 damage · every 4.5 s", "38 伤害 · 每 4.5 秒"],
      ["52 damage · every 4 s", "52 伤害 · 每 4 秒"],
    ],
  },
  u1_asymptote: {
    unit: 1,
    engine: "asymptote",
    col: "#a68ae0",
    name: ["Asymptote", "渐近线"],
    info: [
      "A vertical asymptote x = a follows you on the busier side. Enemies near it slow down 40% and keep taking damage: they get closer, but never through.",
      "一条竖直渐近线 x = a 跟在你身边敌人更多的一侧。靠近它的敌人减速 40% 并持续受伤：越靠越近，却过不去。",
    ],
    dps: [8, 12, 16],
    up: [
      ["8 damage per second", "每秒 8 伤害"],
      ["12 damage per second", "每秒 12 伤害"],
      ["16 damage per second", "每秒 16 伤害"],
    ],
  },
  u1_ivt: {
    unit: 1,
    engine: "ivt",
    col: "#33d6a0",
    name: ["Intermediate Value", "介值定理"],
    info: [
      "Joins the two farthest enemies near you with a continuous curve. Every enemy in between is hit.",
      "用一条连续曲线连接你附近相距最远的两个敌人，中间经过的敌人都会受到伤害。",
    ],
    cd: [4.5, 4, 3.5],
    dmg: [24, 34, 46],
    up: [
      ["24 damage · every 4.5 s", "24 伤害 · 每 4.5 秒"],
      ["34 damage · every 4 s", "34 伤害 · 每 4 秒"],
      ["46 damage · every 3.5 s", "46 伤害 · 每 3.5 秒"],
    ],
  },
  u2_tangent: {
    unit: 2,
    engine: "tangent",
    col: "#ff9d81",
    name: ["Tangent Ray", "切线射线"],
    info: [
      "Fires a piercing tangent ray the way you are moving, or at the nearest enemy while you stand still.",
      "沿你移动的方向射出一条穿透的切线；站着不动时射向最近的敌人。",
    ],
    cd: [3.5, 3, 2.5],
    dmg: [30, 42, 56],
    up: [
      ["30 damage · every 3.5 s", "30 伤害 · 每 3.5 秒"],
      ["42 damage · every 3 s", "42 伤害 · 每 3 秒"],
      ["56 damage · every 2.5 s", "56 伤害 · 每 2.5 秒"],
    ],
  },
  u2_rate: {
    unit: 2,
    engine: "rate",
    col: "#ffa300",
    name: ["Instantaneous Rate", "瞬时变化率"],
    info: [
      "While you keep moving, every weapon fires faster.",
      "只要你在移动，所有武器射速都会提高。",
    ],
    bonus: [0.1, 0.16, 0.22],
    up: [
      ["+10% fire rate while moving", "移动时射速 +10%"],
      ["+16% fire rate while moving", "移动时射速 +16%"],
      ["+22% fire rate while moving", "移动时射速 +22%"],
    ],
  },
  u3_chain: {
    unit: 3,
    engine: "chain",
    col: "#29adff",
    name: ["Chain Rule", "链式法则"],
    info: [
      "Lightning chains through nearby enemies. Each link hits 15% harder than the one before.",
      "闪电在附近的敌人之间连锁，每一环都比上一环伤害高 15%。",
    ],
    cd: [3.5, 3.2, 2.9],
    dmg: [16, 20, 25],
    hops: [4, 5, 6],
    up: [
      ["4 links · 16 damage", "连锁 4 环 · 16 伤害"],
      ["5 links · 20 damage", "连锁 5 环 · 20 伤害"],
      ["6 links · 25 damage", "连锁 6 环 · 25 伤害"],
    ],
  },
  u3_inverse: {
    unit: 3,
    engine: "inverse",
    col: "#c2c3c7",
    name: ["Inverse Function", "反函数"],
    info: [
      "A mirror pulse wipes out nearby enemy bullets and reflects them back as damage.",
      "镜像脉冲清除身边的敌方子弹，并把它们反射回去伤害敌人。",
    ],
    cd: [6, 5, 4],
    dmg: [12, 12, 12],
    up: [
      ["Pulse every 6 s", "每 6 秒一次脉冲"],
      ["Pulse every 5 s", "每 5 秒一次脉冲"],
      ["Pulse every 4 s", "每 4 秒一次脉冲"],
    ],
  },
  u4_lhopital: {
    unit: 4,
    engine: "lhopital",
    col: "#ff77a8",
    name: ["L'Hôpital's Rule", "洛必达法则"],
    info: [
      'Extra damage to elites (the "0/0 indeterminate" ones) and mini-bosses.',
      "对精英（“0/0 未定式”）和小首领造成额外伤害。",
    ],
    bonus: [0.4, 0.6, 0.8],
    up: [
      ["+40% damage to elites and mini-bosses", "对精英和小首领伤害 +40%"],
      ["+60% damage to elites and mini-bosses", "对精英和小首领伤害 +60%"],
      ["+80% damage to elites and mini-bosses", "对精英和小首领伤害 +80%"],
    ],
  },
  u4_motion: {
    unit: 4,
    engine: "motion",
    col: "#00e436",
    name: ["Position Trail", "位移轨迹"],
    info: [
      "Your path s(t) stays behind you for a moment and damages enemies that cross it.",
      "你走过的路线 s(t) 会短暂留下轨迹，伤害穿过它的敌人。",
    ],
    dps: [10, 14, 18],
    up: [
      ["10 damage per second", "每秒 10 伤害"],
      ["14 damage per second", "每秒 14 伤害"],
      ["18 damage per second", "每秒 18 伤害"],
    ],
  },
  u5_extreme: {
    unit: 5,
    engine: "extreme",
    col: "#ffec27",
    name: ["Extreme Value", "极值定理"],
    info: [
      "Strikes the enemy with the most HP nearby: a continuous function on a closed interval always has a maximum.",
      "打击附近生命最高的敌人：闭区间上的连续函数一定有最大值。",
    ],
    cd: [5, 4.5, 4],
    dmg: [50, 70, 95],
    up: [
      ["50 damage · every 5 s", "50 伤害 · 每 5 秒"],
      ["70 damage · every 4.5 s", "70 伤害 · 每 4.5 秒"],
      ["95 damage · every 4 s", "95 伤害 · 每 4 秒"],
    ],
  },
  u5_mvt: {
    unit: 5,
    engine: "mvt",
    col: "#ffa300",
    name: ["Mean Value Theorem", "中值定理"],
    info: [
      "Fires a secant beam to the farthest nearby enemy, hitting and marking everything on it.",
      "向附近最远的敌人发射一条割线光束，击中并标记线上所有敌人。",
    ],
    cd: [4.5, 4, 3.5],
    dmg: [26, 36, 48],
    up: [
      ["26 damage · every 4.5 s", "26 伤害 · 每 4.5 秒"],
      ["36 damage · every 4 s", "36 伤害 · 每 4 秒"],
      ["48 damage · every 3.5 s", "48 伤害 · 每 3.5 秒"],
    ],
  },
  u6_riemann: {
    unit: 6,
    engine: "riemann",
    col: "#ffec27",
    name: ["Riemann Sum", "黎曼和"],
    info: [
      "A row of rectangles slams down over the nearest group.",
      "一排矩形砸向最近的一群敌人。",
    ],
    cd: [5, 4.5, 4],
    dmg: [22, 30, 40],
    n: [4, 5, 6],
    up: [
      ["4 rectangles · 22 damage", "4 个矩形 · 22 伤害"],
      ["5 rectangles · 30 damage", "5 个矩形 · 30 伤害"],
      ["6 rectangles · 40 damage", "6 个矩形 · 40 伤害"],
    ],
  },
  u6_accum: {
    unit: 6,
    engine: "accum",
    col: "#83769c",
    name: ["Accumulation", "累积函数"],
    info: [
      "Every kill adds to the integral. When it fills, a big shockwave bursts out around you.",
      "每次击杀都累积进积分；攒满后在你周围释放一圈强力冲击波。",
    ],
    need: [20, 18, 16],
    dmg: [60, 80, 110],
    up: [
      ["20 kills → 60 damage", "20 次击杀 → 60 伤害"],
      ["18 kills → 80 damage", "18 次击杀 → 80 伤害"],
      ["16 kills → 110 damage", "16 次击杀 → 110 伤害"],
    ],
  },
  u7_field: {
    unit: 7,
    engine: "field",
    col: "#33d6a0",
    name: ["Slope Field", "斜率场"],
    info: [
      "A slope field around you steers enemies sideways and damages them over time.",
      "你周围的斜率场把敌人推偏方向，并持续造成伤害。",
    ],
    dps: [6, 9, 12],
    up: [
      ["6 damage per second", "每秒 6 伤害"],
      ["9 damage per second", "每秒 9 伤害"],
      ["12 damage per second", "每秒 12 伤害"],
    ],
  },
  u7_growth: {
    unit: 7,
    engine: "growth",
    col: "#00e436",
    name: ["Exponential Growth", "指数增长"],
    info: [
      "Quick kills raise your damage by 3% each, compounding like dy/dt = ky. It decays when you stop.",
      "连续击杀每次伤害 +3%，像 dy/dt = ky 一样复利增长；停下来会衰减。",
    ],
    cap: [10, 13, 16],
    up: [
      ["Up to +34% damage", "最多 +34% 伤害"],
      ["Up to +47% damage", "最多 +47% 伤害"],
      ["Up to +60% damage", "最多 +60% 伤害"],
    ],
  },
  u8_area: {
    unit: 8,
    engine: "area",
    col: "#ff77a8",
    name: ["Area Between Curves", "曲线间面积"],
    info: [
      "Two curves circle you. Enemies between them keep taking damage.",
      "两条曲线绕着你转，夹在两条曲线之间的敌人持续受伤。",
    ],
    dps: [10, 14, 18],
    up: [
      ["10 damage per second", "每秒 10 伤害"],
      ["14 damage per second", "每秒 14 伤害"],
      ["18 damage per second", "每秒 18 伤害"],
    ],
  },
  u8_disk: {
    unit: 8,
    engine: "disk",
    col: "#29adff",
    name: ["Disk Method", "圆盘法"],
    info: [
      "Discs orbit you like a solid of revolution, hitting and knocking back enemies.",
      "圆盘像旋转体一样绕你旋转，击中并击退敌人。",
    ],
    n: [2, 3, 4],
    dmg: [14, 18, 24],
    up: [
      ["2 discs · 14 damage", "2 个圆盘 · 14 伤害"],
      ["3 discs · 18 damage", "3 个圆盘 · 18 伤害"],
      ["4 discs · 24 damage", "4 个圆盘 · 24 伤害"],
    ],
  },
  u9_rose: {
    unit: 9,
    engine: "rose",
    col: "#ff77a8",
    name: ["Polar Rose", "极坐标玫瑰"],
    info: [
      "A blade traces r = R·cos(kθ) around you. More petals at higher levels.",
      "一片刀刃沿 r = R·cos(kθ) 绕你画出玫瑰线，等级越高花瓣越多。",
    ],
    k: [3, 2, 5],
    dmg: [12, 16, 22],
    up: [
      ["3 petals · 12 damage", "3 片花瓣 · 12 伤害"],
      ["4 petals · 16 damage", "4 片花瓣 · 16 伤害"],
      ["5 petals · 22 damage", "5 片花瓣 · 22 伤害"],
    ],
  },
  u9_vector: {
    unit: 9,
    engine: "vector",
    col: "#ffec27",
    name: ["Vector Sum", "向量合成"],
    info: [
      "Shoots vectors u and v at the two nearest enemies, then a strong beam along u + v.",
      "向最近的两个敌人射出向量 u 和 v，再沿 u + v 方向射出一道强力光束。",
    ],
    cd: [4, 3.6, 3.2],
    dmg: [18, 24, 30],
    res: [40, 55, 70],
    up: [
      ["18 + 40 damage", "18 + 40 伤害"],
      ["24 + 55 damage", "24 + 55 伤害"],
      ["30 + 70 damage", "30 + 70 伤害"],
    ],
  },
  u10_geometric: {
    unit: 10,
    engine: "geometric",
    col: "#a8e72e",
    name: ["Geometric Series", "几何级数"],
    info: [
      "A bolt bounces between enemies dealing a, ar, ar², … with r = 0.8. The total converges to a/(1 − r).",
      "一道闪光在敌人之间弹跳，伤害依次是 a, ar, ar², …（r = 0.8），总和收敛到 a/(1 − r)。",
    ],
    cd: [4, 4, 4],
    n: [6, 8, 10],
    dmg: [40, 52, 66],
    up: [
      ["6 bounces · a = 40", "弹跳 6 次 · a = 40"],
      ["8 bounces · a = 52", "弹跳 8 次 · a = 52"],
      ["10 bounces · a = 66", "弹跳 10 次 · a = 66"],
    ],
  },
  u10_taylor: {
    unit: 10,
    engine: "taylor",
    col: "#29adff",
    name: ["Taylor Polynomial", "泰勒多项式"],
    info: [
      "Rings expand from you one term at a time; each later term is smaller.",
      "一圈圈波纹逐项向外扩散，后面的项越来越小。",
    ],
    cd: [6, 5.5, 5],
    terms: [3, 4, 5],
    dmg: [36, 44, 54],
    up: [
      ["3 terms · 36 damage", "3 项 · 36 伤害"],
      ["4 terms · 44 damage", "4 项 · 44 伤害"],
      ["5 terms · 54 damage", "5 项 · 54 伤害"],
    ],
  },
};

// ---------------------------------------------------------------- equipment
export const EQUIPMENT = {
  laser: {
    col: "#FF004D",
    name: ["Laser Cannon", "激光炮"],
    info: [
      "Charges, then fires a piercing laser at the toughest enemy in range.",
      "蓄力后向范围内最强的敌人发射穿透激光。",
    ],
    cd: [4, 3.5, 3],
    dmg: [60, 80, 105],
  },
  rockets: {
    col: "#FFA300",
    name: ["Rocket Launcher", "火箭炮"],
    info: [
      "Fires homing rockets that explode on impact.",
      "发射会追踪的火箭，命中后爆炸。",
    ],
    cd: [3.5, 3.2, 2.9],
    n: [2, 3, 4],
    dmg: [26, 32, 40],
  },
  bubbles: {
    col: "#29ADFF",
    name: ["Bubble Cannon", "泡泡炮"],
    info: [
      "Sprays a fan of bubbles that slow the enemies they hit.",
      "喷出一扇泡泡，被击中的敌人会减速。",
    ],
    cd: [3, 2.7, 2.4],
    n: [5, 6, 7],
    dmg: [12, 15, 19],
  },
  frost: {
    col: "#B5DFED",
    name: ["Frost Nova", "霜冻冲击"],
    info: [
      "A ring of frost bursts from you and freezes nearby enemies.",
      "以你为中心爆发一圈霜冻，冰冻附近的敌人。",
    ],
    cd: [6, 5.4, 4.8],
    r: [70, 80, 90],
    dmg: [22, 28, 36],
  },
  ink: {
    col: "#83769C",
    name: ["Ink Bomb", "墨水炸弹"],
    info: [
      "Lobs an ink bomb into a group; the puddle keeps damaging.",
      "向敌群投出墨水炸弹，墨水滩会持续造成伤害。",
    ],
    cd: [5, 4.5, 4],
    dps: [10, 14, 18],
    r: [26, 30, 34],
  },
};
export const GEAR_MAX = 3;
export const GEAR_SLOTS = 2;

// ---------------------------------------------------------------- mini-bosses
// One per world, drawn from that world's look (Dennis: "机械风就是机器人boss").
export const MINI_BOSSES = {
  mech: {
    world: "base",
    gear: "laser",
    col: "#9daec4",
    name: ["Axis Mech", "坐标机械兵"],
    hp: 650,
    r: 12,
    speed: 16,
    attacks: ["laser", "volley"],
  },
  scorpion: {
    world: "desert",
    gear: "rockets",
    col: "#d9a066",
    name: ["Rocket Scorpion", "火箭蝎"],
    hp: 650,
    r: 12,
    speed: 18,
    attacks: ["rocketRain", "sandFan"],
  },
  crab: {
    world: "rainforest",
    gear: "bubbles",
    col: "#e8503a",
    name: ["Crab General", "蟹将军"],
    minion: ["Shrimp Soldier", "虾兵"],
    hp: 600,
    r: 13,
    speed: 14,
    attacks: ["clawQuake", "bubbleRing"],
  },
  yeti: {
    world: "snow",
    gear: "frost",
    col: "#e8f4ff",
    name: ["Yeti", "雪怪"],
    hp: 700,
    r: 13,
    speed: 15,
    attacks: ["slam", "iceRing"],
  },
  octopus: {
    world: "book",
    gear: "ink",
    col: "#7e57c2",
    name: ["Ink Octopus", "墨水章鱼"],
    hp: 620,
    r: 12,
    speed: 13,
    attacks: ["inkPools", "tentacles"],
  },
};
export const bossForWorld = (kind) =>
  Object.keys(MINI_BOSSES).find((id) => MINI_BOSSES[id].world === kind) ||
  "mech";

// Big bosses match the unit being studied and carry the world's name.
export const BOSS_FOR_UNIT = {
  1: "dne",
  2: "knight",
  3: "knight",
  4: "knight",
  5: "knight",
  6: "riemann",
  7: "riemann",
  8: "riemann",
  9: "prism",
  10: "orbit",
};
export const WORLD_PREFIX = {
  desert: ["Dune ", "沙海·"],
  rainforest: ["Jungle ", "雨林·"],
  snow: ["Frost ", "冰原·"],
  book: ["Ink ", "书页·"],
};

// ---------------------------------------------------------------- layout
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Positions for tablets and lairs in one world. The variant
// mirrors the layout; a variant whose objects overlap a special region is
// skipped.
export function worldLayout(world, zones = [], variant = 0) {
  const tryVariant = (v) => {
    const fx = v & 1 ? -1 : 1,
      fy = v & 2 ? -1 : 1;
    const at = ([dx, dy]) => ({
      x: Math.round(clamp(world.cx + dx * fx, 40, world.w - 40)),
      y: Math.round(clamp(world.cy + dy * fy, 40, world.h - 40)),
    });
    return {
      tablets: LAYOUT.tablets.map(at),
      lairs: [at(LAYOUT.lair)],
    };
  };
  const clear = (layout) =>
    [...layout.tablets, ...layout.lairs].every((p) =>
      zones.every((z) => Math.hypot(p.x - z.x, p.y - z.y) > (z.r || 30) + 70),
    );
  for (let n = 0; n < 4; n++) {
    const layout = tryVariant((variant + n) & 3);
    if (clear(layout)) return { ...layout, variant: (variant + n) & 3 };
  }
  return { ...tryVariant(variant & 3), variant: variant & 3 };
}

export function bossTypeFor(unit, lastType) {
  const mapped = BOSS_FOR_UNIT[unit] || null;
  const alternates = {
    dne: "mirror",
    knight: "prism",
    riemann: "orbit",
    prism: "knight",
    orbit: "riemann",
  };
  return mapped === lastType ? alternates[mapped] || null : mapped;
}

// ---------------------------------------------------------------- runtime
export function createKnowledgeFlow(api) {
  const L = (pair) => pick(api.zh, pair);
  const kfOf = () => api.a?.kf;
  const sprites = new Map();

  // Card category labels get their own colours (see .c-unit etc. in the HTML).
  const CAT = {
    unit: ["Unit skill", "单元技能"],
    gear: ["Equipment", "装备"],
  };
  try {
    for (const [cls, pair] of Object.entries(CAT)) api.cardCats[L(pair)] = cls;
  } catch {}

  // ------------------------------------------------------------ state
  function freshState() {
    return {
      unit: {},
      gear: [null, null],
      growth: 0,
      growthT: -9,
      moveT: 0,
      world: null,
      fx: [],
      shots: [],
      zones: [],
      later: [],
      queue: [],
      hints: [],
      banners: [],
      lastNow: 0,
      restUntil: 0,
      tabletAt: PACE.firstTablet,
      tabletWait: PACE.firstTablet,
      lastBossType: null,
      bossPlan: null,
      stats: { tablets: 0, miniBosses: 0, worlds: 0 },
    };
  }
  const unitLv = (id) => kfOf()?.unit?.[id]?.lv || 0;
  const now = () => api.a.t;
  const after = (delay, fn) => kfOf().later.push({ at: now() + delay, fn });
  const whenPlaying = (fn) => kfOf().queue.push(fn);

  // ------------------------------------------------------------ geometry helpers
  // Test speed of this run (1 unless an admin chose a faster one) and a
  // helper that shortens a waiting time to match.
  const speed = () => api.a?.testSpeed || 1;
  const fast = (seconds) => seconds / speed();
  const scale = () => api.dmgMul() * (1 + (api.a.t * speed()) / 300);
  function segDist(px, py, x0, y0, x1, y1) {
    const dx = x1 - x0,
      dy = y1 - y0,
      len = dx * dx + dy * dy || 1,
      t = clamp(((px - x0) * dx + (py - y0) * dy) / len, 0, 1);
    return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
  }
  function foes(x, y, r) {
    const out = [];
    for (const e of api.a.enemies)
      if (api.targetable(e) && Math.hypot(e.x - x, e.y - y) <= r + (e.r || 0))
        out.push(e);
    return out;
  }
  function nearestFoe(x, y, r, skip) {
    let best = null,
      bd = r;
    for (const e of api.a.enemies) {
      if (!api.targetable(e) || (skip && skip.has(e))) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }
  // Skills and equipment fire on their own, so their hits stay quiet: no crits
  // (no big "90!" numbers, crit sparks or screen shake) and pale numbers. The
  // average crit is folded into the damage, so their strength is unchanged.
  function critAverage() {
    const st = api.a.st || {};
    return 1 + Math.min(0.85, st.critC || 0) * (Math.min(4, st.critM || 1) - 1);
  }
  function hit(e, base, opts = {}) {
    if (!e || e.dead) return 0;
    return api.damage(e, base * scale() * critAverage(), {
      ...opts,
      nocrit: true,
      quiet: true,
    });
  }
  function hitLine(x0, y0, x1, y1, width, base, opts = {}) {
    const cx = (x0 + x1) / 2,
      cy = (y0 + y1) / 2,
      reach = Math.hypot(x1 - x0, y1 - y0) / 2 + 20;
    const list = foes(cx, cy, reach).filter(
      (e) => segDist(e.x, e.y, x0, y0, x1, y1) <= width + (e.r || 0),
    );
    for (const e of list) hit(e, base, opts);
    return list;
  }
  function blast(x, y, r, base, col, opts = {}) {
    for (const e of foes(x, y, r)) hit(e, base, opts);
    fx({ kind: "ring", x, y, r, col, life: 0.3 });
  }
  function fx(item) {
    kfOf().fx.push({ t0: now(), life: 0.3, ...item });
  }
  const P = () => ({ x: api.px(), y: api.py() });
  function clusterAround(e) {
    const near = foes(e.x, e.y, 40);
    let x = 0,
      y = 0;
    for (const n of near) {
      x += n.x;
      y += n.y;
    }
    return near.length ? { x: x / near.length, y: y / near.length } : e;
  }
  function ready(s, dt, period) {
    s.cd = (s.cd ?? 1) - dt;
    if (s.cd > 0) return false;
    s.cd = period;
    return true;
  }
  const retry = (s) => (s.cd = 0.3);

  // ------------------------------------------------------------ unit-skill engines
  const ENGINES = {
    squeeze(s, def, lv, dt) {
      if (!ready(s, dt, def.cd[lv - 1])) return;
      const p = P(),
        target = nearestFoe(p.x, p.y, 170);
      if (!target) return retry(s);
      const c = clusterAround(target),
        ang = Math.atan2(c.y - p.y, c.x - p.x) + Math.PI / 2,
        half = 46,
        gap = 30,
        dmg = def.dmg[lv - 1];
      const slam = (mul, delay) => {
        fx({
          kind: "squeeze",
          x: c.x,
          y: c.y,
          ang,
          half,
          gap,
          col: def.col,
          life: delay + 0.12,
        });
        after(delay, () => {
          const cos = Math.cos(ang),
            sin = Math.sin(ang);
          for (const e of foes(c.x, c.y, half + gap)) {
            const dx = e.x - c.x,
              dy = e.y - c.y;
            if (
              Math.abs(dx * cos + dy * sin) <= half &&
              Math.abs(-dx * sin + dy * cos) <= gap + (e.r || 0)
            )
              hit(e, dmg * mul);
          }
          fx({
            kind: "flash",
            x: c.x,
            y: c.y,
            ang,
            half,
            col: "#FFF1E8",
            life: 0.12,
          });
        });
      };
      slam(1, 0.28);
    },
    asymptote(s, def, lv, dt) {
      const p = P();
      s.pickT = (s.pickT ?? 0) - dt;
      if (s.pickT <= 0) {
        s.pickT = 2.5;
        let left = 0,
          right = 0;
        for (const e of foes(p.x, p.y, 170)) e.x < p.x ? left++ : right++;
        s.side = right >= left ? 1 : -1;
      }
      const target = p.x + (s.side || 1) * 44;
      s.x =
        s.x === undefined ? target : s.x + (target - s.x) * Math.min(1, dt * 5);
      s.y = p.y;
      const reach = 110;
      s.tick = (s.tick ?? 0.5) - dt;
      const tick = s.tick <= 0;
      if (tick) s.tick = 0.5;
      for (const e of foes(s.x, p.y, reach)) {
        if (
          Math.abs(e.x - s.x) > 12 + (e.r || 0) ||
          Math.abs(e.y - p.y) > reach
        )
          continue;
        e.slowUntil = Math.max(e.slowUntil || 0, now() + 0.3);
        e.kfBand = now() + 0.4;
        if (tick) hit(e, def.dps[lv - 1] * 0.5, { quiet: true, nocrit: true });
      }
    },
    ivt(s, def, lv, dt) {
      if (!ready(s, dt, def.cd[lv - 1])) return;
      const p = P(),
        list = foes(p.x, p.y, 180).slice(0, 24);
      if (!list.length) return retry(s);
      let a = p,
        b = list[0],
        best = -1;
      for (let i = 0; i < list.length; i++)
        for (let j = i + 1; j < list.length; j++) {
          const d = Math.hypot(list[i].x - list[j].x, list[i].y - list[j].y);
          if (d > best) {
            best = d;
            a = list[i];
            b = list[j];
          }
        }
      hitLine(a.x, a.y, b.x, b.y, 7, def.dmg[lv - 1]);
      fx({
        kind: "ivt",
        x0: a.x,
        y0: a.y,
        x1: b.x,
        y1: b.y,
        col: def.col,
        life: 0.32,
      });
    },
    tangent(s, def, lv, dt) {
      if (!ready(s, dt, def.cd[lv - 1])) return;
      const p = P();
      let dx = api.a.p.dx || 1,
        dy = api.a.p.dy || 0;
      if (!api.a.p.moving) {
        const t = nearestFoe(p.x, p.y, 220);
        if (!t) return retry(s);
        const d = Math.hypot(t.x - p.x, t.y - p.y) || 1;
        dx = (t.x - p.x) / d;
        dy = (t.y - p.y) / d;
      }
      const x1 = p.x + dx * 220,
        y1 = p.y + dy * 220;
      hitLine(p.x, p.y, x1, y1, 6, def.dmg[lv - 1]);
      fx({
        kind: "beam",
        x0: p.x,
        y0: p.y,
        x1,
        y1,
        w: 3,
        col: def.col,
        life: 0.25,
      });
    },
    rate() {},
    chain(s, def, lv, dt) {
      if (!ready(s, dt, def.cd[lv - 1])) return;
      const p = P();
      let cur = nearestFoe(p.x, p.y, 160);
      if (!cur) return retry(s);
      const hops = def.hops[lv - 1],
        seen = new Set(),
        pts = [];
      let from = p;
      for (let k = 0; k < hops && cur; k++) {
        seen.add(cur);
        pts.push([from.x, from.y, cur.x, cur.y]);
        hit(cur, def.dmg[lv - 1] * Math.pow(1.15, k), { st: { shock: 1 } });
        from = cur;
        cur = nearestFoe(from.x, from.y, 80, seen);
      }
      fx({ kind: "chain", pts, col: def.col, life: 0.22 });
    },
    inverse(s, def, lv, dt) {
      if (!ready(s, dt, def.cd[lv - 1])) return;
      const p = P(),
        r = 60;
      let erased = 0;
      api.a.ebul = api.a.ebul.filter((b) => {
        if (Math.hypot(b.x - p.x, b.y - p.y) < r) {
          erased++;
          return false;
        }
        return true;
      });
      for (const e of foes(p.x, p.y, r)) hit(e, def.dmg[lv - 1]);
      const bolts = [];
      for (let k = 0; k < Math.min(erased, 12); k++) {
        const list = foes(p.x, p.y, 170);
        if (!list.length) break;
        const t = list[Math.floor(api.Math.random() * list.length)];
        hit(t, 8, { quiet: true });
        bolts.push([p.x, p.y, t.x, t.y]);
      }
      fx({
        kind: "mirror",
        x: p.x,
        y: p.y,
        r,
        bolts,
        col: def.col,
        life: 0.35,
      });
    },
    lhopital() {},
    motion(s, def, lv, dt) {
      const p = P();
      s.pts = (s.pts || []).filter((q) => now() - q.t < 1.4);
      s.drop = (s.drop ?? 0) - dt;
      if (api.a.p.moving && s.drop <= 0) {
        s.drop = 0.07;
        s.pts.push({ x: api.a.p.x, y: api.a.p.y - 3, t: now() });
      }
      s.tick = (s.tick ?? 0.3) - dt;
      if (s.tick > 0 || s.pts.length < 2) return;
      s.tick = 0.3;
      for (const e of foes(p.x, p.y, 140)) {
        let best = 99;
        for (let k = 1; k < s.pts.length; k++) {
          const a = s.pts[k - 1],
            b = s.pts[k];
          best = Math.min(best, segDist(e.x, e.y, a.x, a.y, b.x, b.y));
        }
        if (best > 8 + (e.r || 0)) continue;
        hit(e, def.dps[lv - 1] * 0.3, { quiet: true, nocrit: true });
      }
    },
    extreme(s, def, lv, dt) {
      if (!ready(s, dt, def.cd[lv - 1])) return;
      const p = P(),
        list = foes(p.x, p.y, 200);
      if (!list.length) return retry(s);
      let hi = list[0];
      for (const e of list) if (e.hp > hi.hp) hi = e;
      hit(hi, def.dmg[lv - 1]);
      fx({ kind: "smite", x: hi.x, y: hi.y, col: def.col, life: 0.3 });
    },
    mvt(s, def, lv, dt) {
      if (!ready(s, dt, def.cd[lv - 1])) return;
      const p = P();
      let far = null,
        fd = 0;
      for (const e of foes(p.x, p.y, 200)) {
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d > fd) {
          fd = d;
          far = e;
        }
      }
      if (!far) return retry(s);
      hitLine(p.x, p.y, far.x, far.y, 7, def.dmg[lv - 1], { st: { mark: 2 } });
      fx({
        kind: "beam",
        x0: p.x,
        y0: p.y,
        x1: far.x,
        y1: far.y,
        w: 2,
        col: def.col,
        dots: true,
        life: 0.3,
      });
    },
    riemann(s, def, lv, dt) {
      if (!ready(s, dt, def.cd[lv - 1])) return;
      const p = P(),
        t = nearestFoe(p.x, p.y, 180);
      if (!t) return retry(s);
      const c = clusterAround(t),
        n = def.n[lv - 1],
        w = 12,
        x0 = c.x - (n * w) / 2,
        rects = [];
      for (let k = 0; k < n; k++) {
        const h = Math.round(16 + 9 * Math.sin(k * 0.9 + now() * 2));
        rects.push({ x: x0 + k * w, y: c.y + 10 - h, w, h: h + 6 });
      }
      fx({ kind: "bars", rects, col: def.col, life: 0.5 });
      after(0.22, () => {
        const done = new Set();
        for (const r of rects)
          for (const e of foes(r.x + r.w / 2, r.y + r.h / 2, r.w + r.h))
            if (
              !done.has(e) &&
              e.x >= r.x - (e.r || 0) &&
              e.x <= r.x + r.w + (e.r || 0) &&
              e.y >= r.y - (e.r || 0) &&
              e.y <= r.y + r.h + (e.r || 0)
            ) {
              done.add(e);
              hit(e, def.dmg[lv - 1]);
            }
      });
    },
    accum(s, def, lv) {
      if ((s.n || 0) < def.need[lv - 1]) return;
      s.n = 0;
      const p = P(),
        r = 70;
      blast(p.x, p.y, r, def.dmg[lv - 1], def.col);
      fx({ kind: "nova", x: p.x, y: p.y, r, col: def.col, life: 0.4 });
      api.sfx?.("boom");
    },
    field(s, def, lv, dt) {
      const p = P(),
        r = 70;
      s.tick = (s.tick ?? 0.5) - dt;
      const tick = s.tick <= 0;
      if (tick) s.tick = 0.5;
      for (const e of foes(p.x, p.y, r)) {
        if (!e.boss) {
          const ang = Math.atan2(e.y - p.y, e.x - p.x) + 1.15;
          e.kx = (e.kx || 0) + Math.cos(ang) * 150 * dt * (e.kbr || 1);
          e.ky = (e.ky || 0) + Math.sin(ang) * 150 * dt * (e.kbr || 1);
        }
        if (tick) hit(e, def.dps[lv - 1] * 0.5, { quiet: true, nocrit: true });
      }
    },
    growth(s, def, lv, dt) {
      const kf = kfOf();
      if (kf.growth > 0 && now() - kf.growthT > 3) {
        s.decay = (s.decay ?? 0) - dt;
        if (s.decay <= 0) {
          s.decay = 0.5;
          kf.growth--;
        }
      }
    },
    area(s, def, lv, dt) {
      const p = P();
      s.ph = (s.ph || 0) + dt * 1.6;
      s.tick = (s.tick ?? 0.35) - dt;
      if (s.tick > 0) return;
      s.tick = 0.35;
      const outer = 60;
      for (const e of foes(p.x, p.y, outer + 6)) {
        const th = Math.atan2(e.y - p.y, e.x - p.x),
          d = Math.hypot(e.x - p.x, e.y - p.y),
          r1 = 28 + 5 * Math.sin(3 * th + s.ph),
          r2 = 54 + 5 * Math.sin(3 * th - s.ph);
        if (d >= r1 - (e.r || 0) && d <= r2 + (e.r || 0))
          hit(e, def.dps[lv - 1] * 0.35, {
            quiet: true,
            nocrit: true,
          });
      }
    },
    disk(s, def, lv, dt) {
      const p = P(),
        n = def.n[lv - 1],
        R = 34;
      s.ph = (s.ph || 0) + dt * 2.4;
      s.pos = [];
      for (let k = 0; k < n; k++) {
        const ang = s.ph + (k * Math.PI * 2) / n,
          x = p.x + Math.cos(ang) * R,
          y = p.y + Math.sin(ang) * R * 0.75;
        s.pos.push([x, y]);
        for (const e of foes(x, y, 7)) {
          const hits = (e.kfHit ||= {});
          if ((hits.disk || 0) > now()) continue;
          hits.disk = now() + 0.5;
          hit(e, def.dmg[lv - 1], { kb: 70, a: ang + Math.PI / 2 });
        }
      }
    },
    rose(s, def, lv, dt) {
      const p = P(),
        k = def.k[lv - 1],
        R = 58;
      s.th = (s.th || 0) + dt * 1.9;
      s.k = k;
      const th = s.th,
        r = R * Math.cos(k * th),
        x = p.x + r * Math.cos(th),
        y = p.y + r * Math.sin(th) * 0.8;
      s.pos = [[x, y]];
      for (const e of foes(x, y, 7)) {
        const hits = (e.kfHit ||= {});
        if ((hits.rose || 0) > now()) continue;
        hits.rose = now() + 0.35;
        hit(e, def.dmg[lv - 1]);
      }
    },
    vector(s, def, lv, dt) {
      if (!ready(s, dt, def.cd[lv - 1])) return;
      const p = P(),
        e1 = nearestFoe(p.x, p.y, 180);
      if (!e1) return retry(s);
      const e2 = nearestFoe(p.x, p.y, 180, new Set([e1])) || e1;
      hit(e1, def.dmg[lv - 1]);
      if (e2 !== e1) hit(e2, def.dmg[lv - 1]);
      const ux = e1.x - p.x,
        uy = e1.y - p.y,
        vx = e2.x - p.x,
        vy = e2.y - p.y;
      let sx = ux + vx,
        sy = uy + vy;
      const sl = Math.hypot(sx, sy) || 1;
      sx /= sl;
      sy /= sl;
      const len = 230,
        width = 6,
        x1 = p.x + sx * len,
        y1 = p.y + sy * len;
      fx({
        kind: "vectors",
        x: p.x,
        y: p.y,
        u: [ux, uy],
        v: [vx, vy],
        col: def.col,
        life: 0.45,
      });
      after(0.18, () => {
        hitLine(p.x, p.y, x1, y1, width, def.res[lv - 1]);
        fx({
          kind: "beam",
          x0: p.x,
          y0: p.y,
          x1,
          y1,
          w: width / 2,
          col: def.col,
          life: 0.28,
        });
      });
    },
    geometric(s, def, lv, dt) {
      if (!ready(s, dt, def.cd[lv - 1])) return;
      const p = P();
      let cur = nearestFoe(p.x, p.y, 160);
      if (!cur) return retry(s);
      const ratio = 0.8,
        seq = [cur];
      let prev = null;
      for (let k = 1; k < def.n[lv - 1]; k++) {
        const skip = new Set([cur]);
        if (prev) skip.add(prev);
        const next = nearestFoe(cur.x, cur.y, 110, skip) || prev;
        if (!next) break;
        prev = cur;
        cur = next;
        seq.push(cur);
      }
      const segs = [];
      let from = p;
      seq.forEach((e, k) => {
        segs.push([from.x, from.y, e.x, e.y, k]);
        from = e;
        after(0.07 * k, () => hit(e, def.dmg[lv - 1] * Math.pow(ratio, k)));
      });
      fx({ kind: "bounce", segs, col: def.col, life: 0.07 * seq.length + 0.2 });
    },
    taylor(s, def, lv, dt) {
      const p = P();
      for (const ring of s.rings || []) {
        const t = (now() - ring.t0) / 0.35;
        if (t < 0 || t > 1) continue;
        const front = ring.R * t;
        for (const e of foes(p.x, p.y, front + 8)) {
          if (ring.hit.has(e)) continue;
          if (
            Math.abs(Math.hypot(e.x - p.x, e.y - p.y) - front) >
            8 + (e.r || 0)
          )
            continue;
          ring.hit.add(e);
          hit(e, ring.dmg);
        }
      }
      s.rings = (s.rings || []).filter((ring) => now() - ring.t0 < 0.4);
      if (!ready(s, dt, def.cd[lv - 1])) return;
      for (let k = 0; k < def.terms[lv - 1]; k++)
        s.rings.push({
          t0: now() + 0.22 * k,
          R: 34 + 16 * k,
          dmg: def.dmg[lv - 1] / (k + 1),
          hit: new Set(),
        });
    },
  };

  // ------------------------------------------------------------ equipment
  const GEAR = {
    laser(g, def) {
      const p = P(),
        t = api.target(260, true);
      if (!t) return false;
      const ang = Math.atan2(t.y - p.y, t.x - p.x),
        x1 = p.x + Math.cos(ang) * 260,
        y1 = p.y + Math.sin(ang) * 260;
      fx({
        kind: "charge",
        x0: p.x,
        y0: p.y,
        x1,
        y1,
        col: def.col,
        life: 0.35,
      });
      after(0.35, () => {
        const q = P(),
          ex = q.x + Math.cos(ang) * 260,
          ey = q.y + Math.sin(ang) * 260;
        hitLine(q.x, q.y, ex, ey, 7, def.dmg[g.lv - 1]);
        fx({
          kind: "beam",
          x0: q.x,
          y0: q.y,
          x1: ex,
          y1: ey,
          w: 5,
          col: def.col,
          life: 0.28,
        });
        api.sfx?.("shot");
      });
      return true;
    },
    rockets(g, def) {
      const p = P(),
        list = foes(p.x, p.y, 240);
      if (!list.length) return false;
      for (let k = 0; k < def.n[g.lv - 1]; k++) {
        const target = list[k % list.length],
          ang =
            Math.atan2(target.y - p.y, target.x - p.x) +
            (k - (def.n[g.lv - 1] - 1) / 2) * 0.6;
        kfOf().shots.push({
          kind: "rocket",
          x: p.x,
          y: p.y,
          vx: Math.cos(ang) * 90,
          vy: Math.sin(ang) * 90,
          target,
          t0: now(),
          life: 1.8,
          dmg: def.dmg[g.lv - 1],
          col: def.col,
        });
      }
      api.sfx?.("shot");
      return true;
    },
    bubbles(g, def) {
      const p = P(),
        t = nearestFoe(p.x, p.y, 200);
      if (!t) return false;
      const base = Math.atan2(t.y - p.y, t.x - p.x),
        n = def.n[g.lv - 1];
      for (let k = 0; k < n; k++) {
        const ang = base + (k - (n - 1) / 2) * (0.9 / Math.max(1, n - 1));
        kfOf().shots.push({
          kind: "bubble",
          x: p.x,
          y: p.y,
          vx: Math.cos(ang) * 120,
          vy: Math.sin(ang) * 120,
          t0: now(),
          life: 1.3,
          dmg: def.dmg[g.lv - 1],
          col: def.col,
        });
      }
      return true;
    },
    frost(g, def) {
      const p = P(),
        r = def.r[g.lv - 1];
      if (!foes(p.x, p.y, r).length) return false;
      blast(p.x, p.y, r, def.dmg[g.lv - 1], def.col, { st: { chill: 2 } });
      fx({ kind: "nova", x: p.x, y: p.y, r, col: def.col, life: 0.4 });
      return true;
    },
    ink(g, def) {
      const p = P(),
        t = nearestFoe(p.x, p.y, 200);
      if (!t) return false;
      const c = clusterAround(t);
      kfOf().shots.push({
        kind: "ink",
        x: p.x,
        y: p.y,
        x0: p.x,
        y0: p.y,
        x1: c.x,
        y1: c.y,
        t0: now(),
        life: 0.5,
        r: def.r[g.lv - 1],
        dps: def.dps[g.lv - 1],
        col: def.col,
      });
      return true;
    },
  };

  function tickShots(dt) {
    const kf = kfOf();
    kf.shots = kf.shots.filter((s) => {
      const age = now() - s.t0;
      if (s.kind === "ink") {
        if (age < s.life) return true;
        kf.zones.push({
          kind: "ink",
          x: s.x1,
          y: s.y1,
          r: s.r,
          until: now() + 3,
          dps: s.dps,
          col: s.col,
        });
        return false;
      }
      if (s.kind === "rocket") {
        if (s.target?.dead) s.target = nearestFoe(s.x, s.y, 200);
        if (s.target) {
          const want = Math.atan2(s.target.y - s.y, s.target.x - s.x),
            speed = Math.min(220, Math.hypot(s.vx, s.vy) + 300 * dt);
          let cur = Math.atan2(s.vy, s.vx),
            diff = ((want - cur + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
          cur += clamp(diff, -6 * dt, 6 * dt);
          s.vx = Math.cos(cur) * speed;
          s.vy = Math.sin(cur) * speed;
        }
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      const struck = foes(s.x, s.y, 5)[0];
      if (struck || age > s.life) {
        if (s.kind === "rocket") {
          blast(s.x, s.y, 26, s.dmg, s.col);
          api.sound?.("hitTick", 0.08);
        } else if (struck) {
          hit(struck, s.dmg);
          struck.slowUntil = Math.max(struck.slowUntil || 0, now() + 1.5);
          fx({ kind: "pop", x: s.x, y: s.y, col: s.col, life: 0.2 });
        }
        return false;
      }
      return true;
    });
    kf.zones = kf.zones.filter((z) => {
      z.tick = (z.tick ?? 0) - dt;
      if (z.tick <= 0) {
        z.tick = 0.4;
        const list =
          z.kind === "bars"
            ? foes(z.x + z.w / 2, z.y + z.h / 2, z.w).filter(
                (e) =>
                  e.x >= z.x &&
                  e.x <= z.x + z.w &&
                  e.y >= z.y &&
                  e.y <= z.y + z.h,
              )
            : foes(z.x, z.y, z.r);
        for (const e of list)
          hit(e, z.dps * 0.4, { quiet: true, nocrit: true });
      }
      return now() < z.until;
    });
  }

  function tickGear(dt) {
    for (const g of kfOf().gear) {
      if (!g) continue;
      g.cd -= dt;
      if (g.cd > 0) continue;
      const def = EQUIPMENT[g.id];
      g.cd = GEAR[g.id](g, def) ? def.cd[g.lv - 1] : 0.4;
    }
  }

  // ------------------------------------------------------------ cards
  // `step` levels at once: ★★★ tablets give two (harder question, stronger skill).
  function unitCard(id, step = 1) {
    const def = UNIT_SKILLS[id],
      lv = unitLv(id),
      to = Math.min(3, lv + step);
    return {
      type: "kf",
      kf: "unit",
      id,
      step: to - lv,
      name: L(def.name),
      tag: lv
        ? `Lv ${lv} → ${to}`
        : to > 1
          ? api.zh
            ? `新 · 直接 Lv ${to}`
            : `New · straight to Lv ${to}`
          : api.zh
            ? `新 · 仅限第 ${def.unit} 单元`
            : `New · Unit ${def.unit} only`,
      cat: L(CAT.unit),
      desc: L(def.info),
      next: `Lv ${to}: ${L(def.up[to - 1])}`,
      icon: "kf_" + id,
      col: def.col,
      bg: "#111D35",
      rare: true,
      recommend: {
        score: (lv ? 64 : 70) + (to - lv - 1) * 20,
        reason: api.zh
          ? `第 ${def.unit} 单元专属，整个单元都有效`
          : `Built for Unit ${def.unit}; lasts the whole unit`,
      },
    };
  }
  function unitChoices() {
    const unit = api.a.curUnit;
    return Object.keys(UNIT_SKILLS).filter(
      (id) => UNIT_SKILLS[id].unit === unit && unitLv(id) < 3,
    );
  }
  function shuffle(list) {
    for (let n = list.length - 1; n > 0; n--) {
      const k = Math.floor(api.Math.random() * (n + 1));
      [list[n], list[k]] = [list[k], list[n]];
    }
    return list;
  }
  const sameCard = (x, y) =>
    x.id === y.id && (x.kf || x.type) === (y.kf || y.type);
  function fill(out, source, size) {
    for (const c of source)
      if (out.length < size && !out.some((o) => sameCard(o, c))) out.push(c);
  }
  // Every tablet offers at most one unit skill, and ★★★
  // skills jump two levels. ★★★ also adds one rare card.
  function tabletCards(tier) {
    const out = [];
    for (const id of shuffle(unitChoices()).slice(0, 1))
      out.push(unitCard(id, tier === 3 ? 2 : 1));
    if (tier === 3) {
      const rare = api.bossCards();
      fill(
        out,
        rare.filter((c) => c.type === "evo" || c.type === "thm"),
        out.length + 1,
      );
      if (out.length < 3) fill(out, rare, 3);
    }
    fill(out, api.cards(3), 3);
    if (out.length < 3) fill(out, api.bossCards(), 3);
    out.noReroll = tier >= 2;
    return out;
  }

  // ------------------------------------------------------------ gaining things
  function gainUnitSkill(id, step = 1) {
    const kf = kfOf(),
      def = UNIT_SKILLS[id];
    if (kf.unit[id]) kf.unit[id].lv = Math.min(3, kf.unit[id].lv + step);
    else kf.unit[id] = { lv: Math.min(3, step), cd: 1, n: 0 };
    hint("unit");
    return def;
  }
  function equipGear(id, slot) {
    const kf = kfOf(),
      def = EQUIPMENT[id];
    kf.gear[slot] = { id, lv: 1, cd: 0.5 };
    whenPlaying(() =>
      say(
        (api.zh ? "装备：" : "EQUIPPED: ") + L(def.name),
        def.col,
        L(def.info),
      ),
    );
    hint("gear");
  }
  function offerGear(id) {
    const kf = kfOf(),
      def = EQUIPMENT[id],
      owned = kf.gear.find((g) => g?.id === id);
    if (owned) {
      if (owned.lv < GEAR_MAX) {
        owned.lv++;
        say(`${L(def.name)} Lv ${owned.lv}`, def.col, L(def.info));
      } else {
        api.a.p.hp = api.a.p.maxHp;
        say(
          L(def.name) + " MAX",
          def.col,
          api.zh ? "已满级：生命回满" : "Already maxed: health restored",
        );
      }
      api.sfx?.("power");
      return;
    }
    const free = kf.gear.findIndex((g) => !g);
    if (free >= 0) {
      equipGear(id, free);
      api.sfx?.("power");
      return;
    }
    // Both slots taken: swap one out or keep what you have.
    const cards = kf.gear.map((g, slot) => ({
      type: "kf",
      kf: "equipSwap",
      id: "swap" + slot,
      gear: id,
      slot,
      name:
        (api.zh
          ? `换下 ${L(EQUIPMENT[g.id].name)}`
          : `Replace ${L(EQUIPMENT[g.id].name)}`) + ` (Lv ${g.lv})`,
      tag: api.zh ? `装备槽 ${slot + 1}` : `Slot ${slot + 1}`,
      cat: L(CAT.gear),
      desc: L(def.info),
      next: "",
      icon: "kf_" + id,
      col: def.col,
      bg: "#111D35",
    }));
    cards.push({
      type: "kf",
      kf: "keep",
      id: "keep",
      name: api.zh ? "保留现有装备" : "Keep my gear",
      tag: api.zh ? "生命回满" : "Full health",
      cat: L(CAT.gear),
      desc: api.zh
        ? "不换装备，生命回满。"
        : "Keep both items and restore your health.",
      next: "",
      icon: "kf_" + id,
      col: "#29ADFF",
      bg: "#111D35",
    });
    cards.noReroll = true;
    openCardPanel(
      cards,
      (api.zh ? "新装备：" : "NEW EQUIPMENT: ") + L(def.name),
      api.zh ? "两个装备槽都满了" : "Both slots are full",
      api.zh
        ? "换下一件，或者保留现有装备"
        : "Swap one out, or keep what you have",
    );
  }
  function openCardPanel(cards, title, sub, label) {
    api.clearInput();
    api.mode = "chest";
    api.sfx?.("chest");
    api.overlay.chest(cards);
    const root = api.overlay.el,
      head = root?.querySelector(".qhd");
    if (head)
      head.innerHTML = `<b>${api.esc(title)}</b><span>${api.esc(sub)}</span>`;
    const labelText = label,
      labelEl = root?.querySelector("#cards .ch span");
    if (labelEl && labelText) labelEl.textContent = labelText;
  }

  // ------------------------------------------------------------ hints and banners
  // Hints (see HINTS) and banners queue so two never land on top of each other.
  function hint(key, fill = "") {
    const kf = kfOf(),
      seen = api.save?.d?.regionSeen || {};
    if (!kf || seen["kfh:" + key] || kf.hints.some((h) => h.key === key))
      return false;
    kf.hints.push({ key, s: L(HINTS[key]).replace("{dir}", fill) });
    return true;
  }
  function pumpHints() {
    const kf = kfOf(),
      a = api.a;
    if (!kf.hints.length) return;
    const owl = a.owl;
    if (owl && api.now - owl.t0 < (owl.dur || 0) + PACE.hintGap) return;
    const h = kf.hints.shift(),
      save = api.save;
    try {
      (save.d.regionSeen || (save.d.regionSeen = {}))["kfh:" + h.key] = true;
      save.save();
    } catch {}
    a.owl = { s: h.s, t0: api.now, dur: 6 };
  }
  function say(title, col, sub) {
    const kf = kfOf(),
      b = api.a.banner;
    if (kf && b && api.now - b.t0 < PACE.bannerGap) {
      kf.banners.push([title, col, sub]);
      if (kf.banners.length > 3) kf.banners.shift();
      return;
    }
    api.banner(title, col, sub);
  }
  function pumpBanners() {
    const kf = kfOf(),
      b = api.a.banner;
    if (kf.banners.length && !(b && api.now - b.t0 < PACE.bannerGap))
      api.banner(...kf.banners.shift());
  }
  // "north-east" style direction from the player, for hints.
  function direction(x, y) {
    const dx = x - api.px(),
      dy = y - api.py();
    if (api.zh) {
      const d =
        (dx < -60 ? "西" : dx > 60 ? "东" : "") +
        (dy < -60 ? "北" : dy > 60 ? "南" : "");
      return d ? `就在${d}边` : "就在附近";
    }
    const d =
      (dy < -60 ? "north" : dy > 60 ? "south" : "") +
      (dx < -60 ? "west" : dx > 60 ? "east" : "");
    return d ? "to the " + d : "nearby";
  }

  // ------------------------------------------------------------ world objects
  function worldKind() {
    const a = api.a;
    return api.themes?.[a.theme || 0]?.worldKind || "base";
  }
  function ensureWorld() {
    const a = api.a,
      kf = a.kf,
      stage = a.worldStage || 1,
      theme = a.theme || 0;
    if (kf.world && kf.world.stage === stage && kf.world.theme === theme)
      return kf.world;
    const kind = worldKind(),
      layout = worldLayout(
        api.world,
        api.themes?.[theme]?.zones || [],
        Math.floor(api.Math.random() * 4),
      );
    kf.tabletAt = Math.max(kf.tabletAt, a.t + fast(PACE.firstTablet));
    kf.world = {
      stage,
      theme,
      kind,
      t0: a.t,
      first: kf.stats.worlds++ === 0,
      tablets: layout.tablets.map((p, n) => ({
        ...p,
        tier:
          n === 0 ? 1 + Math.floor(api.Math.random() * TABLETS.length) : null,
      })),
      // The lair starts hidden (see unlockLairs).
      lairs: layout.lairs.map((p) => ({
        ...p,
        boss: bossForWorld(kind),
        state: "hidden",
        shownAt: -99,
        enemy: null,
        nextAtk: 0,
        atk: 0,
      })),
    };
    return kf.world;
  }
  const calm = () => {
    const a = api.a;
    return (
      !a.boss &&
      !a.arena &&
      !a.worldPortal &&
      !a.pendingBossReward &&
      !a.transitionReward &&
      !a.themeTr
    );
  };

  // Each authored location is used once. Only the current site has a tier.
  const tabletOpen = (tab) => tab.tier != null && !tab.used;
  const tabletsReady = () => {
    const kf = kfOf(),
      t = api.a.t;
    return t >= kf.tabletAt && t >= kf.restUntil;
  };

  function askTablet(tab) {
    const a = api.a,
      kf = a.kf,
      rule = TABLETS[tab.tier - 1];
    kf.tabletWait = fast(rule.cd);
    kf.tabletAt = a.t + kf.tabletWait;
    tab.used = true;
    const next = kf.world.tablets.find((site) => !site.used);
    if (next) next.tier = 1 + Math.floor(api.Math.random() * TABLETS.length);
    kf.stats.tablets++;
    api.clearInput();
    api.mode = "lvup";
    a.lvT = api.now;
    a.lvDur = 0.55;
    a.lvBanner = {
      t: a.lvT,
      title: api.zh ? "题碑！" : "TABLET!",
      sub: api.zh
        ? `${["简单", "中等", "困难"][tab.tier - 1]} · 第 ${a.curUnit} 单元 · Dr. Owler 正在挑题……`
        : `${["Easy", "Medium", "Hard"][tab.tier - 1]} · Unit ${a.curUnit} · Dr. Owler is picking a question...`,
    };
    const token = (a.lvRequest = {});
    a.lvQ = null;
    api.sfx?.("quest");
    if (a.questionPoolExhausted) {
      a.lvQ = { status: "exhausted", kfSource: "tablet", kfTier: tab.tier };
      return;
    }
    api.bridge
      .call("next", {
        runId: a.runId,
        units: a.units,
        currentUnit: a.curUnit,
        tier: tab.tier,
        preferCurrent: true,
      })
      .then(
        (h) => h || { status: "error" },
        () => ({ status: "error" }),
      )
      .then((h) => {
        if (a.lvRequest === token)
          a.lvQ = { ...h, kfSource: "tablet", kfTier: tab.tier };
      });
  }

  function tickTablets() {
    if (!tabletsReady()) return false;
    const p = P();
    for (const tab of kfOf().world.tablets) {
      if (!tabletOpen(tab)) continue;
      // Explain each tier when it first lights up.
      hint(tab.tier === 1 ? "tablet" : "tablet" + tab.tier);
      if (Math.hypot(p.x - tab.x, p.y - tab.y) > 11) continue;
      askTablet(tab);
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------ mini-bosses
  const enemyHp = (base) => {
    const m = (api.a.t * speed()) / 60;
    return base * (1 + 0.12 * m + 0.042 * m * m) * (api.enemyHpMul?.() || 1);
  };
  function wake(lair) {
    const def = MINI_BOSSES[lair.boss],
      hp = enemyHp(def.hp) * 0.9;
    const e = api.spawnEnemy("elite", lair.x, lair.y, {
      type: "kfboss",
      kf: { boss: lair.boss },
      hp,
      r: def.r,
      sp: 0,
      xp: 30,
      elite: true,
      kbr: 0.06,
      fireT: Infinity,
      pal: [def.col, "#FFF1E8", "#FFEC27"],
    });
    e.hp = e.maxHp = hp;
    e.kfLair = lair;
    lair.enemy = e;
    lair.state = "awake";
    lair.nextAtk = api.a.t + 1.4;
    if (lair.boss === "crab")
      for (let k = 0; k < 4; k++) {
        const ang = (k / 4) * Math.PI * 2,
          m = api.spawnEnemy(
            "charger",
            lair.x + Math.cos(ang) * 26,
            lair.y + Math.sin(ang) * 20,
            {
              kf: { minion: "shrimp" },
              xp: 2,
            },
          );
        m.role = undefined;
        m.hp = m.maxHp = enemyHp(26);
        m.sp = 24;
      }
    say(
      (api.zh ? "小首领：" : "MINI-BOSS: ") + L(def.name),
      def.col,
      L(
        def.minion
          ? [`with ${def.minion[0]}s`, `带着${def.minion[1]}`]
          : ["It woke up!", "它醒了！"],
      ),
    );
    api.sfx?.("roar");
  }
  function miniAttack(lair) {
    const a = api.a,
      e = lair.enemy,
      def = MINI_BOSSES[lair.boss],
      kind = def.attacks[lair.atk++ % def.attacks.length],
      p = P(),
      aim = Math.atan2(p.y - e.y, p.x - e.x),
      t = a.t;
    if (kind === "laser") {
      const x1 = e.x + Math.cos(aim) * 320,
        y1 = e.y + Math.sin(aim) * 320;
      api.hazard({
        kind: "line",
        x0: e.x,
        y0: e.y,
        x1,
        y1,
        w: 10,
        warnFrom: t,
        fire: t + 0.85,
        end: t + 1.1,
        dmg: 16,
      });
    } else if (kind === "volley") {
      for (let k = 0; k < 3; k++)
        after(k * 0.35, () => {
          if (e.dead) return;
          const q = P(),
            ang = Math.atan2(q.y - e.y, q.x - e.x);
          for (let j = -2; j <= 2; j++)
            api.bullet(e.x, e.y, ang + j * 0.16, 70, {
              dmg: 9,
              kind: "small",
              r: 2.5,
            });
        });
    } else if (kind === "rocketRain") {
      for (let k = 0; k < 3; k++) {
        const ox = k ? (api.Math.random() - 0.5) * 70 : 0,
          oy = k ? (api.Math.random() - 0.5) * 50 : 0;
        api.hazard({
          kind: "blast",
          x: p.x + ox,
          y: p.y + oy,
          r: 24,
          warnFrom: t + k * 0.2,
          fire: t + 0.95 + k * 0.2,
          end: t + 1.1 + k * 0.2,
          dmg: 14,
        });
      }
    } else if (kind === "sandFan") {
      for (let j = -3; j <= 3; j++)
        api.bullet(e.x, e.y, aim + j * 0.14, 64, { dmg: 9 });
    } else if (kind === "clawQuake") {
      api.hazard({
        kind: "blast",
        x: e.x,
        y: e.y,
        r: 48,
        warnFrom: t,
        fire: t + 0.75,
        end: t + 0.92,
        dmg: 16,
      });
    } else if (kind === "bubbleRing") {
      for (let j = 0; j < 12; j++)
        api.bullet(e.x, e.y, (j / 12) * Math.PI * 2, 42, {
          dmg: 8,
          kind: "small",
          r: 3,
        });
    } else if (kind === "slam") {
      for (let k = 0; k < 2; k++)
        after(k * 0.55, () => {
          const q = P();
          api.hazard({
            kind: "blast",
            x: q.x,
            y: q.y,
            r: 32,
            warnFrom: api.a.t,
            fire: api.a.t + 0.75,
            end: api.a.t + 0.9,
            dmg: 16,
          });
        });
    } else if (kind === "iceRing") {
      for (let j = 0; j < 14; j++)
        api.bullet(e.x, e.y, (j / 14) * Math.PI * 2 + 0.1, 52, { dmg: 9 });
    } else if (kind === "inkPools") {
      for (let k = 0; k < 3; k++) {
        const ang = (k / 3) * Math.PI * 2 + api.Math.random(),
          rr = k ? 26 : 0;
        api.hazard({
          kind: "pool",
          x: p.x + Math.cos(ang) * rr,
          y: p.y + Math.sin(ang) * rr,
          r: 18,
          dmg: 5,
          once: false,
          warnFrom: t,
          fire: t + 0.8,
          end: t + 3.8,
        });
      }
    } else if (kind === "tentacles") {
      for (const off of [-0.6, 0.6]) {
        const ang = aim + off,
          x0 = p.x - Math.cos(ang) * 120,
          y0 = p.y - Math.sin(ang) * 120;
        api.hazard({
          kind: "line",
          x0,
          y0,
          x1: p.x + Math.cos(ang) * 120,
          y1: p.y + Math.sin(ang) * 120,
          w: 9,
          warnFrom: t,
          fire: t + 0.8,
          end: t + 1.05,
          dmg: 14,
        });
      }
    }
  }
  // The lair appears after two tablets (and at least 30 s) in the first world,
  // or after PACE.lairAfter, so it never lands on top of the first minute.
  function unlockLairs() {
    const a = api.a,
      kf = kfOf(),
      world = kf.world,
      lair = world.lairs.find((l) => l.state === "hidden");
    if (!lair || !calm()) return;
    const age = a.t - world.t0;
    if (
      age < fast(PACE.lairAfter[world.first ? 0 : 1]) &&
      !(world.first && kf.stats.tablets >= 2 && age >= fast(30))
    )
      return;
    lair.state = "sleep";
    lair.shownAt = a.t;
    const def = MINI_BOSSES[lair.boss];
    say(
      api.zh ? "小首领出现了" : "A MINI-BOSS APPEARED",
      def.col,
      `${L(def.name)} · ${direction(lair.x, lair.y)}`,
    );
    hint("lair");
  }
  function tickLairs(dt) {
    const a = api.a,
      p = P();
    unlockLairs();
    for (const lair of kfOf().world.lairs) {
      if (lair.state === "done" || lair.state === "hidden") continue;
      const d = Math.hypot(p.x - lair.x, p.y - lair.y);
      if (lair.state === "sleep") {
        if (d >= 105) lair.approachHelp = false;
        if (calm() && d < 105) {
          if (!lair.approachHelp) {
            lair.approachHelp = true;
            const def = MINI_BOSSES[lair.boss];
            if (
              api.encounterHelp?.(
                "mini:" + lair.boss,
                L(def.name),
                api.zh
                  ? "小首领就在附近。留意弹幕预警，击败后可获得奖励。"
                  : "A mini-boss is nearby. Watch its attack warnings and defeat it for a reward.",
              )
            )
              return true;
          }
          wake(lair);
        }
        continue;
      }
      const e = lair.enemy;
      if (!e || e.dead) {
        // Removed without a kill (a boss arena clears the field): sleep again.
        if (lair.state !== "done") {
          lair.state = "sleep";
          lair.enemy = null;
        }
        continue;
      }
      const def = MINI_BOSSES[lair.boss],
        home = Math.hypot(e.x - lair.x, e.y - lair.y);
      if (d > 320) {
        e.sp = 0;
        if (home > 2) {
          e.x += ((lair.x - e.x) / home) * Math.min(home, 50 * dt);
          e.y += ((lair.y - e.y) / home) * Math.min(home, 50 * dt);
        }
        e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.2 * dt);
        if (home < 4 && e.hp >= e.maxHp) {
          e.dead = true;
          lair.state = "sleep";
          lair.enemy = null;
        }
        continue;
      }
      if (home > 150) {
        e.sp = 0;
        e.x += ((lair.x - e.x) / home) * 30 * dt;
        e.y += ((lair.y - e.y) / home) * 30 * dt;
      } else e.sp = def.speed;
      e.charge = a.t > lair.nextAtk - 0.5;
      if (a.t >= lair.nextAtk) {
        lair.nextAtk = a.t + 2.6 + api.Math.random() * 0.8;
        miniAttack(lair);
      }
    }
    return false;
  }

  // ------------------------------------------------------------ drawing
  function canvasOf(w, h) {
    const doc = api.doc();
    if (!doc) return null;
    const c = doc.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d");
    g.imageSmoothingEnabled = false;
    return [c, g];
  }
  function painter(g) {
    const r = (x, y, w, h, col) => {
      g.fillStyle = col;
      g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    };
    return {
      r,
      p: (x, y, col) => r(x, y, 1, 1, col),
      disc(cx, cy, rad, col, sy = 1) {
        for (let y = -rad; y <= rad; y++) {
          const hw = Math.floor(Math.sqrt(Math.max(0, rad * rad - y * y)));
          r(
            cx - hw,
            cy + Math.round(y * sy),
            hw * 2 + 1,
            Math.max(1, Math.ceil(sy)),
            col,
          );
        }
      },
      line(x0, y0, x1, y1, col, w = 1) {
        const n = Math.max(
          1,
          Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))),
        );
        for (let k = 0; k <= n; k++)
          r(
            x0 + ((x1 - x0) * k) / n - (w - 1) / 2,
            y0 + ((y1 - y0) * k) / n - (w - 1) / 2,
            w,
            w,
            col,
          );
      },
    };
  }
  function outlined(c) {
    const made = canvasOf(c.width + 2, c.height + 2),
      sil = canvasOf(c.width, c.height);
    if (!made || !sil) return c;
    sil[1].drawImage(c, 0, 0);
    sil[1].globalCompositeOperation = "source-in";
    sil[1].fillStyle = "#0b0a16";
    sil[1].fillRect(0, 0, c.width, c.height);
    for (const [x, y] of [
      [0, 1],
      [2, 1],
      [1, 0],
      [1, 2],
    ])
      made[1].drawImage(sil[0], x, y);
    made[1].drawImage(c, 1, 1);
    return made[0];
  }
  function whiteOf(c) {
    const made = canvasOf(c.width, c.height);
    if (!made) return c;
    made[1].drawImage(c, 0, 0);
    made[1].globalCompositeOperation = "source-in";
    made[1].fillStyle = "#FFF1E8";
    made[1].fillRect(0, 0, c.width, c.height);
    return made[0];
  }
  function sprite(key, w, h, draw, outline = true) {
    if (sprites.has(key)) return sprites.get(key);
    const made = canvasOf(w, h);
    if (!made) return null;
    draw(painter(made[1]), made[1]);
    const out = outline ? outlined(made[0]) : made[0];
    sprites.set(key, out);
    return out;
  }
  function blit(ctx, img, x, y, opts = {}) {
    if (!img) return;
    const w = img.width,
      h = img.height;
    if (opts.flip) {
      ctx.save();
      ctx.translate(Math.round(x), Math.round(y));
      ctx.scale(-1, 1);
      ctx.drawImage(img, -Math.round(w / 2), -h);
      ctx.restore();
    } else ctx.drawImage(img, Math.round(x - w / 2), Math.round(y - h));
  }

  const BOSS_ART = {
    mech: [
      26,
      24,
      (d, bob) => {
        d.r(8, 20, 4, 4, "#454c5e");
        d.r(15, 20, 4, 4, "#454c5e");
        d.r(5, 9, 17, 12, "#9daec4");
        d.r(5, 17, 17, 4, "#5b6b85");
        d.r(13, 10, 1, 9, "#29ADFF");
        d.r(8, 14, 11, 1, "#29ADFF");
        d.p(13, 9, "#c8ecff");
        d.p(19, 14, "#c8ecff");
        d.r(8, 2 + bob, 11, 7, "#c2c3c7");
        d.r(9, 4 + bob, 9, 3, "#111d35");
        d.p(11, 5 + bob, "#FF004D");
        d.p(15, 5 + bob, "#FF004D");
        d.r(13, 0 + bob, 1, 2, "#5b6b85");
        d.p(13, 0 + bob, "#FFEC27");
        d.r(1, 11, 4, 6, "#5b6b85");
        d.r(21, 11, 5, 4, "#454c5e");
        d.r(24, 12, 2, 2, "#FF004D");
      },
    ],
    scorpion: [
      30,
      22,
      (d, bob) => {
        for (let k = 0; k < 3; k++) {
          d.line(9 + k * 4, 17, 6 + k * 4, 21, "#7b4a2a");
          d.line(11 + k * 4, 17, 14 + k * 4, 21, "#7b4a2a");
        }
        d.disc(14, 15, 7, "#d9a066", 0.7);
        d.disc(14, 13, 5, "#efc477", 0.6);
        d.r(1, 11, 5, 4, "#a8693b");
        d.r(0, 9, 3, 2, "#d9a066");
        d.r(0, 15, 3, 2, "#d9a066");
        d.p(9, 13, "#111d35");
        d.p(11, 12, "#111d35");
        d.line(20, 13, 24, 8, "#a8693b", 2);
        d.line(24, 8, 24, 3 + bob, "#a8693b", 2);
        d.r(21, 0 + bob, 7, 3, "#c2c3c7");
        d.r(27, 0 + bob, 2, 3, "#FF004D");
        d.p(20, 1 + bob, "#FFA300");
      },
    ],
    crab: [
      32,
      22,
      (d, bob) => {
        for (let k = 0; k < 3; k++) {
          d.line(9 - k * 2, 16, 4 - k * 2, 21, "#a8322a");
          d.line(22 + k * 2, 16, 27 + k * 2, 21, "#a8322a");
        }
        d.disc(16, 13, 10, "#e8503a", 0.62);
        d.disc(16, 11, 7, "#ff7a5a", 0.45);
        d.r(11, 6, 10, 2, "#FFCC4D");
        d.r(15, 4, 2, 2, "#FFEC27");
        d.r(11, 2 + bob, 1, 5, "#a8322a");
        d.r(20, 2 + bob, 1, 5, "#a8322a");
        d.r(10, 1 + bob, 3, 3, "#FFF1E8");
        d.r(19, 1 + bob, 3, 3, "#FFF1E8");
        d.p(11, 2 + bob, "#111d35");
        d.p(20, 2 + bob, "#111d35");
        d.disc(3, 9, 3, "#e8503a");
        d.r(0, 5, 3, 3, "#e8503a");
        d.disc(28, 9, 3, "#e8503a");
        d.r(29, 5, 3, 3, "#e8503a");
        d.line(6, 11, 9, 13, "#a8322a", 2);
        d.line(25, 11, 22, 13, "#a8322a", 2);
      },
    ],
    yeti: [
      26,
      26,
      (d, bob) => {
        d.r(6, 22, 5, 4, "#a9c4d8");
        d.r(15, 22, 5, 4, "#a9c4d8");
        d.disc(13, 15, 9, "#e8f4ff");
        d.disc(13, 18, 6, "#cfe3f2", 0.6);
        d.disc(3, 15, 3, "#e8f4ff");
        d.disc(23, 15, 3, "#e8f4ff");
        d.disc(13, 7 + bob, 6, "#e8f4ff");
        d.r(9, 6 + bob, 9, 5, "#5b7a99");
        d.r(10, 7 + bob, 2, 2, "#FFF1E8");
        d.r(15, 7 + bob, 2, 2, "#FFF1E8");
        d.p(11, 8 + bob, "#111d35");
        d.p(15, 8 + bob, "#111d35");
        d.r(12, 10 + bob, 3, 1, "#111d35");
        d.p(12, 11 + bob, "#FFF1E8");
        d.r(7, 1 + bob, 2, 3, "#b5dfed");
        d.r(18, 1 + bob, 2, 3, "#b5dfed");
      },
    ],
    octopus: [
      26,
      24,
      (d, bob) => {
        for (let k = 0; k < 6; k++) {
          const x = 4 + k * 3.6;
          for (let y = 14; y < 23; y++)
            d.r(
              x + Math.round(Math.sin((y + k * 2 + bob * 3) * 0.7)),
              y,
              2,
              1,
              k % 2 ? "#5e3d9e" : "#7e57c2",
            );
        }
        d.disc(13, 9, 8, "#7e57c2");
        d.disc(11, 6, 3, "#9b7bd6");
        d.r(8, 8, 4, 4, "#FFF1E8");
        d.r(15, 8, 4, 4, "#FFF1E8");
        d.r(9 + bob, 9, 2, 2, "#111d35");
        d.r(16 + bob, 9, 2, 2, "#111d35");
        d.line(14, 7, 20, 7, "#FFCC4D");
        d.line(19, 8, 19, 13, "#FFCC4D");
        d.r(4, 0, 2, 3, "#111d35");
        d.r(4, 3, 2, 1, "#29ADFF");
      },
    ],
    shrimp: [
      16,
      11,
      (d, bob) => {
        d.r(3, 4, 9, 4, "#ff8f5a");
        d.r(4, 5, 7, 1, "#ffc29e");
        for (let k = 0; k < 3; k++) d.r(5 + k * 2, 4, 1, 4, "#d9603a");
        d.r(11, 3, 3, 4, "#ff8f5a");
        d.p(12, 4, "#111d35");
        d.line(13, 3, 16, 0 + bob, "#ffc29e");
        d.r(0, 3, 3, 2, "#d9603a");
        d.r(0, 6, 3, 2, "#d9603a");
        d.line(6, 8, 5, 10, "#d9603a");
        d.line(9, 8, 10, 10, "#d9603a");
        d.r(13, 7, 1, 3, "#c2c3c7");
        d.p(13, 6, "#FFF1E8");
      },
    ],
  };
  function bossSprite(kind, frame, flash) {
    const [w, h, draw] = BOSS_ART[kind] || BOSS_ART.mech,
      base = sprite(`boss:${kind}:${frame}`, w, h, (d) => draw(d, frame));
    if (!flash || !base) return base;
    const key = `boss:${kind}:${frame}:w`;
    if (!sprites.has(key)) sprites.set(key, whiteOf(base));
    return sprites.get(key);
  }

  function tabletSprite(tier, ready) {
    const col = TABLETS[tier - 1].col;
    return sprite(`tablet:${tier}:${ready ? 1 : 0}`, 14, 17, (d) => {
      d.r(2, 0, 10, 2, "#9aa3b5");
      d.r(1, 1, 12, 12, "#9aa3b5");
      d.r(1, 10, 12, 3, "#6b7489");
      d.r(12, 2, 1, 11, "#6b7489");
      d.r(2, 1, 10, 1, "#c2c9d6");
      const ink = ready ? col : "#454c5e";
      d.r(5, 3, 4, 1, ink);
      d.r(8, 4, 1, 2, ink);
      d.r(6, 6, 2, 1, ink);
      d.r(6, 7, 1, 1, ink);
      d.r(6, 9, 1, 1, ink);
      d.r(0, 13, 14, 4, "#454c5e");
      d.r(1, 13, 12, 1, "#6b7489");
    });
  }
  // 24×24 icons for cards and the HUD (plugged in through illustratedIcon).
  const ICONS = {
    u1_squeeze: (d, c, w) => {
      d.line(4, 5, 19, 11, c, 2);
      d.line(4, 18, 19, 12, c, 2);
      d.line(4, 12, 9, 10, w);
      d.line(9, 10, 14, 13, w);
      d.line(14, 13, 19, 12, w);
    },
    u1_asymptote: (d, c, w) => {
      for (let y = 3; y < 21; y += 3) d.r(12, y, 2, 2, c);
      d.line(3, 13, 7, 11, w);
      d.line(7, 11, 9, 8, w);
      d.line(9, 8, 10, 4, w);
      d.line(15, 20, 16, 16, w);
      d.line(16, 16, 18, 13, w);
      d.line(18, 13, 21, 11, w);
    },
    u1_ivt: (d, c, w) => {
      d.line(3, 19, 8, 15, w);
      d.line(8, 15, 12, 13, w);
      d.line(12, 13, 16, 8, w);
      d.line(16, 8, 20, 5, w);
      for (let x = 3; x < 21; x += 3) d.r(x, 12, 2, 1, c);
      d.r(11, 11, 3, 3, c);
    },
    u2_tangent: (d, c, w) => {
      d.line(3, 19, 8, 9, w);
      d.line(8, 9, 12, 6, w);
      d.line(12, 6, 16, 9, w);
      d.line(16, 9, 20, 19, w);
      d.line(3, 6, 21, 6, c, 2);
      d.r(11, 5, 3, 3, "#FFF1E8");
    },
    u2_rate: (d, c, w) => {
      d.line(4, 12, 17, 12, c, 2);
      d.line(13, 8, 18, 12, c, 2);
      d.line(13, 16, 18, 12, c, 2);
      d.line(3, 7, 8, 7, w);
      d.line(2, 17, 7, 17, w);
    },
    u3_chain: (d, c, w) => {
      for (const [x, y] of [
        [6, 14],
        [12, 10],
        [18, 6],
      ]) {
        d.r(x - 3, y - 2, 6, 1, c);
        d.r(x - 3, y + 2, 6, 1, c);
        d.r(x - 3, y - 2, 1, 5, c);
        d.r(x + 2, y - 2, 1, 5, c);
      }
      d.line(4, 20, 9, 15, w);
    },
    u3_inverse: (d, c, w) => {
      for (let k = 3; k < 21; k += 3) d.r(k, 23 - k, 2, 2, c);
      d.line(4, 18, 9, 16, w);
      d.line(9, 16, 13, 11, w);
      d.line(6, 20, 8, 15, w);
      d.line(8, 15, 13, 11, w);
    },
    u4_lhopital: (d, c, w) => {
      d.disc(8, 7, 3, c);
      d.disc(8, 7, 1, "#111D35");
      d.disc(16, 17, 3, c);
      d.disc(16, 17, 1, "#111D35");
      d.line(17, 4, 7, 20, w, 2);
    },
    u4_motion: (d, c, w) => {
      for (let k = 0; k < 8; k++)
        d.r(
          3 + k * 2,
          18 - Math.round(Math.sin(k * 0.8) * 5) - k,
          2,
          2,
          k % 2 ? c : w,
        );
      d.line(18, 6, 21, 4, c, 2);
      d.line(18, 4, 21, 4, c);
    },
    u5_extreme: (d, c, w) => {
      d.line(3, 19, 8, 11, w);
      d.line(8, 11, 12, 8, w);
      d.line(12, 8, 16, 11, w);
      d.line(16, 11, 21, 19, w);
      d.r(11, 3, 3, 3, c);
      d.p(12, 2, c);
      d.p(10, 4, c);
      d.p(14, 4, c);
      d.p(12, 6, c);
    },
    u5_mvt: (d, c, w) => {
      d.line(3, 18, 8, 9, w);
      d.line(8, 9, 14, 6, w);
      d.line(14, 6, 21, 12, w);
      d.line(3, 18, 21, 12, c);
      d.line(5, 11, 19, 6, c);
    },
    u6_riemann: (d, c, w) => {
      const hs = [6, 9, 11, 9];
      hs.forEach((h, k) => d.r(4 + k * 4, 20 - h, 3, h, c));
      d.line(3, 13, 10, 9, w);
      d.line(10, 9, 20, 10, w);
    },
    u6_accum: (d, c, w) => {
      for (let x = 4; x < 20; x++)
        d.r(
          x,
          20 - Math.round(4 + 6 * Math.sin((x - 4) / 5)),
          1,
          Math.round(4 + 6 * Math.sin((x - 4) / 5)),
          c,
        );
      d.line(3, 20, 21, 20, w);
      d.line(6, 4, 6, 9, w);
      d.line(4, 6, 8, 6, w);
    },
    u7_field: (d, c) => {
      for (let y = 4; y < 21; y += 6)
        for (let x = 4; x < 21; x += 6)
          d.line(x, y + 2, x + 3, y - 1 + ((x + y) % 4 ? 0 : 2), c);
    },
    u7_growth: (d, c, w) => {
      d.line(3, 20, 21, 20, w);
      d.line(3, 3, 3, 20, w);
      for (let x = 4; x < 21; x++)
        d.r(x, Math.round(19 - Math.pow(1.22, x - 4)), 1, 2, c);
    },
    u8_area: (d, c, w) => {
      for (let x = 4; x < 21; x++) {
        const t = Math.round(9 + 3 * Math.sin(x / 3)),
          b = Math.round(16 + 2 * Math.sin(x / 4));
        d.r(x, t, 1, b - t, c);
        d.p(x, t, w);
        d.p(x, b, w);
      }
    },
    u8_disk: (d, c, w) => {
      d.disc(12, 12, 8, c, 0.55);
      d.disc(12, 12, 3, "#111D35", 0.55);
      d.line(12, 3, 12, 21, w);
    },
    u9_rose: (d, c) => {
      for (let k = 0; k < 120; k++) {
        const th = (k / 120) * Math.PI,
          r = 9 * Math.cos(3 * th);
        d.p(
          12 + Math.round(r * Math.cos(th)),
          12 + Math.round(r * Math.sin(th)),
          c,
        );
      }
      d.r(11, 11, 3, 3, "#FFF1E8");
    },
    u9_vector: (d, c, w) => {
      d.line(4, 19, 18, 15, w);
      d.line(4, 19, 8, 6, w);
      d.line(4, 19, 20, 4, c, 2);
      d.line(17, 4, 20, 4, c);
      d.line(20, 4, 20, 7, c);
    },
    u10_geometric: (d, c) => {
      [14, 10, 7, 5, 3, 2].forEach((h, k) => d.r(3 + k * 3, 20 - h, 2, h, c));
    },
    u10_taylor: (d, c, w) => {
      for (const r of [3, 6, 9])
        for (let k = 0; k < 40; k++) {
          const t = (k / 40) * Math.PI * 2;
          d.p(
            12 + Math.round(Math.cos(t) * r),
            12 + Math.round(Math.sin(t) * r),
            r === 3 ? w : c,
          );
        }
    },
    laser: (d, c, w) => {
      d.r(3, 9, 9, 6, "#9daec4");
      d.r(3, 14, 4, 5, "#5b6b85");
      d.r(11, 10, 3, 4, "#454c5e");
      d.r(14, 11, 8, 2, c);
      d.r(14, 11, 8, 1, w);
    },
    rockets: (d, c, w) => {
      d.r(6, 9, 11, 6, "#c2c3c7");
      d.r(17, 10, 3, 4, c);
      d.r(20, 11, 1, 2, c);
      d.r(3, 7, 3, 3, "#5b6b85");
      d.r(3, 14, 3, 3, "#5b6b85");
      d.r(1, 10, 4, 4, "#FFA300");
      d.r(9, 10, 3, 2, w);
    },
    bubbles: (d, c, w) => {
      for (const [x, y, r] of [
        [8, 14, 5],
        [16, 8, 4],
        [17, 17, 3],
      ]) {
        d.disc(x, y, r, c);
        d.disc(x, y, r - 1, "#111D35");
        d.p(x - 1, y - r + 2, w);
      }
    },
    frost: (d, c, w) => {
      d.line(12, 3, 12, 21, c, 2);
      d.line(4, 7, 20, 17, c, 2);
      d.line(4, 17, 20, 7, c, 2);
      d.r(11, 11, 3, 3, w);
    },
    ink: (d, c, w) => {
      d.disc(12, 14, 6, c);
      d.line(12, 3, 7, 12, c, 2);
      d.line(12, 3, 17, 12, c, 2);
      d.r(9, 12, 2, 3, w);
    },
  };
  function icon(name) {
    if (!String(name).startsWith("kf_")) return null;
    const id = name.slice(3),
      draw = ICONS[id];
    if (!draw) return null;
    const def = UNIT_SKILLS[id] || EQUIPMENT[id],
      col = def?.col || "#29ADFF";
    return sprite(
      "icon:" + id,
      24,
      24,
      (d) => {
        d.r(0, 0, 24, 24, "#0b1021");
        d.r(1, 1, 22, 22, "#111D35");
        draw(d, col, "#FFF1E8");
      },
      false,
    );
  }

  function drawStar(ctx, x, y, col) {
    api.drawRect(ctx, x - 1, y - 3, 3, 7, "#0b0a16");
    api.drawRect(ctx, x - 3, y - 1, 7, 3, "#0b0a16");
    api.drawRect(ctx, x, y - 2, 1, 5, col);
    api.drawRect(ctx, x - 2, y, 5, 1, col);
    api.drawRect(ctx, x - 1, y - 1, 3, 3, col);
  }

  function drawGround(ctx, camX, camY) {
    const a = api.a,
      kf = a?.kf;
    if (!kf?.world || kf.world.theme !== (a.theme || 0)) return;
    const view = api.view,
      t = api.now,
      on = (x, y, m = 70) =>
        x > -m && y > -m && x < view.w + m && y < view.h + m;
    // Dim stones while the shared cooldown runs; rings and glow only when
    // ready. Cooldown dots show only up close.
    const ready = tabletsReady(),
      left = Math.max(kf.tabletAt, kf.restUntil) - a.t,
      wait = Math.max(kf.tabletWait || 1, left);
    for (const tab of kf.world.tablets) {
      if (!ready || !tabletOpen(tab)) continue;
      const x = Math.round(tab.x - camX),
        y = Math.round(tab.y - camY);
      if (!on(x, y)) continue;
      const rule = TABLETS[tab.tier - 1];
      if (ready) {
        ctx.globalAlpha = 0.35;
        api.drawRing(ctx, x, y + 2, rule.ring, rule.col, 3, 1);
        ctx.globalAlpha = 1;
        api.drawRing(ctx, x, y + 2, 13 + Math.sin(t * 4) * 1.5, rule.col, 2, 1);
      }
      api.drawShadow(ctx, x, y + 2, 16);
      blit(ctx, tabletSprite(tab.tier, ready), x, y + 3);
      for (let k = 0; k < tab.tier; k++)
        drawStar(
          ctx,
          x - (tab.tier - 1) * 4 + k * 8,
          y - 23 + (ready ? Math.round(Math.sin(t * 3 + k) * 1) : 0),
          ready ? rule.col : "#5F574F",
        );
      if (!ready && Math.hypot(api.px() - tab.x, api.py() - tab.y) < 90) {
        const frac = 1 - left / wait;
        for (let k = 0; k < 12; k++) {
          const ang = (k / 12) * Math.PI * 2 - Math.PI / 2;
          api.drawRect(
            ctx,
            Math.round(x + Math.cos(ang) * 9) - 1,
            Math.round(y - 9 + Math.sin(ang) * 9) - 1,
            2,
            2,
            k / 12 < frac ? rule.col : "#29243a",
          );
        }
      }
    }
    for (const lair of kf.world.lairs) {
      if (lair.state === "hidden") continue;
      const x = Math.round(lair.x - camX),
        y = Math.round(lair.y - camY);
      if (!on(x, y, 90)) continue;
      const def = MINI_BOSSES[lair.boss];
      for (let k = 0; k < 10; k++) {
        const ang = (k / 10) * Math.PI * 2,
          sx = Math.round(x + Math.cos(ang) * 36),
          sy = Math.round(y + 4 + Math.sin(ang) * 20);
        api.drawRect(ctx, sx - 3, sy - 2, 6, 4, "#0b0a16");
        api.drawRect(
          ctx,
          sx - 2,
          sy - 2,
          5,
          3,
          lair.state === "done" ? "#454c5e" : "#6b7489",
        );
        api.drawRect(ctx, sx - 2, sy - 2, 4, 1, "#9aa3b5");
      }
      api.drawRect(ctx, x + 30, y - 30, 2, 30, "#2a2236");
      if (lair.state !== "done") {
        const wave = Math.round(Math.sin(t * 4) * 1);
        api.drawRect(ctx, x + 32, y - 30 + wave, 12, 8, def.col);
        api.drawRect(ctx, x + 32, y - 22 + wave, 12, 1, "#0b0a16");
        api.drawRect(ctx, x + 36, y - 28 + wave, 4, 4, "#0b0a16");
        api.drawRect(ctx, x + 37, y - 27 + wave, 2, 1, "#FFF1E8");
      } else api.drawRect(ctx, x + 32, y - 14, 8, 3, "#454c5e");
      if (lair.state === "sleep") {
        api.drawShadow(ctx, x, y + 4, 26);
        blit(ctx, bossSprite(lair.boss, 0, false), x, y + 6);
        const z = (t * 0.8) % 1;
        api.text(ctx, "z", x + 12 + z * 6, y - 26 - z * 10, {
          pixel: true,
          size: 12,
          col: "#c8ecff",
          outline: "#0b0a16",
        });
      }
    }
    for (const z of kf.zones) {
      const left = z.until - a.t;
      ctx.globalAlpha = Math.min(0.5, left);
      if (z.kind === "ink")
        api.drawDisc(
          ctx,
          Math.round(z.x - camX),
          Math.round(z.y - camY),
          z.r,
          "#291814",
        );
      else api.drawRect(ctx, z.x - camX, z.y - camY, z.w, z.h, z.col);
      ctx.globalAlpha = 1;
      if (z.kind === "ink")
        api.drawRing(
          ctx,
          Math.round(z.x - camX),
          Math.round(z.y - camY),
          z.r,
          z.col,
          4,
          1,
        );
    }
  }

  function drawEnemy(ctx, e, x, y, flash) {
    if (e.kf?.minion) {
      blit(
        ctx,
        bossSprite("shrimp", Math.floor(api.now * 6) % 2, flash),
        x,
        y + 6,
        { flip: e.flip },
      );
      return;
    }
    const kind = e.kf?.boss;
    if (!kind) return;
    if (e.charge && Math.floor(api.now * 10) % 2)
      api.drawRing(ctx, x, y, 18, "#FF77A8", 1, 2);
    blit(ctx, bossSprite(kind, Math.floor(api.now * 3) % 2, flash), x, y + 12, {
      flip: e.flip,
    });
    api.drawRect(ctx, x - 16, y + 15, 32, 3, "#0b0a16");
    api.drawRect(
      ctx,
      x - 15,
      y + 16,
      Math.round(30 * clamp(e.hp / e.maxHp, 0, 1)),
      1,
      "#FF004D",
    );
  }

  function drawPick(ctx, item, x, y) {
    if (item.kind === "kfgear") {
      const img = icon("kf_" + item.gear);
      api.drawShadow(ctx, x, y + 6, 14);
      api.drawRect(ctx, x - 8, y - 9, 16, 16, "#FFEC27");
      if (img) ctx.drawImage(img, x - 7, y - 8, 14, 14);
      if (Math.floor(api.now * 5) % 2)
        api.drawRing(ctx, x, y - 1, 12, "#FFEC27", 2, 1);
    }
  }

  const followerRewards = {
    crab: {
      kinds: ["shrimp", "crab"],
      line: ["My little squad is yours.", "我的虾兵蟹将，就托付给你了。"],
    },
    yeti: {
      kinds: ["snowman"],
      line: ["Take my little snowman.", "带上我的小雪人吧。"],
    },
    octopus: {
      kinds: ["octopus"],
      line: [
        "My little octopus will slow them down.",
        "小章鱼会用墨水帮你拖住敌人。",
      ],
    },
    scorpion: {
      kinds: ["scorpion"],
      line: ["Take my little rocket scorpion.", "带上这只拿火箭筒的小蝎子吧。"],
    },
  };

  function tickBossFollowers(dt) {
    const a = api.a;
    const followers = a.kf.bossFollowers;
    if (!followers?.length) return;
    const p = P();
    a.kf.bossFollowers = followers.filter((follower, index) => {
      const tx = p.x + (index === 0 ? -17 : 17);
      const ty = p.y + 7;
      const distance = Math.hypot(tx - follower.x, ty - follower.y);
      const fraction =
        distance > 140 ? 1 : Math.min(1, (55 * dt) / Math.max(1, distance));
      follower.x += (tx - follower.x) * fraction;
      follower.y += (ty - follower.y) * fraction;
      let target;
      let range = 60;
      let touching = false;
      for (const enemy of a.enemies) {
        if (enemy.dead) continue;
        const gap = Math.hypot(enemy.x - follower.x, enemy.y - follower.y);
        if (gap < (enemy.r || 5) + 5) touching = true;
        if (gap < range) {
          target = enemy;
          range = gap;
        }
      }
      if (touching && a.t >= follower.hurtAt) {
        follower.hurtAt = a.t + 0.75;
        follower.hp -= 4;
        if (follower.hp <= 0) return false;
      }
      if (target && a.t >= follower.fireAt) {
        follower.fireAt = a.t + 1.7;
        follower.shot = { x: target.x, y: target.y, until: a.t + 0.28 };
        if (follower.kind === "octopus" && !target.boss && !target.kf?.boss)
          target.slowUntil = Math.max(target.slowUntil || 0, a.t + 1.15);
        const damage =
          follower.kind === "scorpion"
            ? 5
            : ["crab", "shrimp"].includes(follower.kind)
              ? 2
              : 3;
        api.damage(target, damage, { nocrit: true, quiet: true });
      }
      return true;
    });
  }

  function drawBossFollowers(ctx, cameraX, cameraY) {
    const a = api.a;
    for (const follower of a.kf.bossFollowers || []) {
      const x = Math.round(follower.x - cameraX);
      const y = Math.round(follower.y - cameraY);
      const kind = follower.kind;
      const rect = (dx, dy, w, h, color) =>
        api.drawRect(ctx, x + dx, y + dy, w, h, color);
      if (follower.shot?.until > a.t) {
        const sx = Math.round(follower.shot.x - cameraX),
          sy = Math.round(follower.shot.y - cameraY);
        const progress = clamp(1 - (follower.shot.until - a.t) / 0.28, 0, 1);
        const px = Math.round(x + (sx - x) * progress);
        const py = Math.round(y + (sy - y) * progress);
        const dot = (dx, dy, w, h, color) =>
          api.drawRect(ctx, px + dx, py + dy, w, h, color);
        if (kind === "octopus") {
          dot(-2, -2, 5, 4, "#492660");
          dot(-1, -3, 3, 5, "#8a50c5");
          dot(0, -2, 2, 2, "#db9fee");
          dot(-5, 2, 2, 2, "#66418b");
          if (progress > 0.8)
            api.drawRect(ctx, sx - 4, sy + 2, 9, 3, "#633482");
        } else if (kind === "scorpion") {
          dot(-2, -1, 5, 3, "#26273b");
          dot(-1, -1, 3, 2, "#e4b38a");
          dot(-3, 0, 2, 1, "#ff8d53");
        } else if (kind === "snowman") {
          dot(-2, -1, 5, 3, "#acdcef");
          dot(-1, -2, 3, 4, "#effcff");
        } else {
          dot(-2, -1, 5, 3, "#e18d82");
          dot(-1, -2, 3, 2, "#ffe0a6");
        }
      }
      if (kind === "snowman") {
        rect(-5, -3, 11, 9, "#accbdc");
        rect(-4, -4, 9, 9, "#ecf9ff");
        rect(-4, -10, 9, 7, "#ecf9ff");
        rect(-3, -8, 2, 2, "#23324d");
        rect(2, -8, 2, 2, "#23324d");
        rect(0, -6, 4, 1, "#f28a51");
        rect(-4, -3, 9, 2, "#4e8bba");
      } else {
        const sprite = bossSprite(kind, Math.floor(api.now * 5) % 2, false);
        const width = Math.max(1, Math.round(sprite.width * 0.57));
        const height = Math.max(1, Math.round(sprite.height * 0.57));
        ctx.drawImage(
          sprite,
          x - Math.floor(width / 2),
          y - Math.floor(height / 2),
          width,
          height,
        );
        if (kind === "scorpion") {
          rect(2, -6, 9, 4, "#392938");
          rect(3, -5, 7, 2, "#c1b3a4");
          rect(8, -5, 2, 2, "#f2884d");
        }
      }
      rect(-6, 8, 12, 3, "#24253c");
      rect(-5, 9, Math.ceil((10 * follower.hp) / 30), 1, "#7adba4");
    }
  }

  function drawEffects(ctx, camX, camY) {
    const a = api.a,
      kf = a?.kf;
    if (!kf) return;
    drawBossFollowers(ctx, camX, camY);
    // Player-side effects stay a step behind enemies and their bullets.
    const FX = 0.75;
    ctx.globalAlpha = FX;
    const t = a.t,
      sx = (v) => Math.round(v - camX),
      sy = (v) => Math.round(v - camY),
      line = (x0, y0, x1, y1, col, w = 1, dash = 0) =>
        api.drawLine(
          ctx,
          sx(x0),
          sy(y0),
          sx(x1),
          sy(y1),
          col,
          w,
          dash,
          Math.floor(api.now * 20),
        );
    // Persistent skills
    for (const [id, s] of Object.entries(kf.unit)) {
      const def = UNIT_SKILLS[id];
      if (def.engine === "asymptote" && s.x !== undefined) {
        const reach = 110;
        ctx.globalAlpha = FX * 0.6;
        line(s.x, s.y - reach, s.x, s.y + reach, def.col, 1, 4);
        ctx.globalAlpha = FX;
      } else if (def.engine === "motion" && s.pts?.length > 1) {
        for (let k = 1; k < s.pts.length; k++) {
          const q = s.pts[k];
          ctx.globalAlpha = FX * (clamp(1 - (t - q.t) / 1.4, 0, 1) * 0.8);
          line(s.pts[k - 1].x, s.pts[k - 1].y, q.x, q.y, def.col, 2);
        }
        ctx.globalAlpha = FX;
      } else if (def.engine === "field") {
        const p = P(),
          r = 70;
        ctx.globalAlpha = FX * 0.45;
        for (let gy = -r; gy <= r; gy += 16)
          for (let gx = -r; gx <= r; gx += 16) {
            if (gx * gx + gy * gy > r * r) continue;
            const ang = Math.atan2(gy, gx) + 1.15;
            line(
              p.x + gx,
              p.y + gy,
              p.x + gx + Math.cos(ang) * 5,
              p.y + gy + Math.sin(ang) * 5,
              def.col,
            );
          }
        ctx.globalAlpha = FX;
      } else if (def.engine === "area") {
        const p = P();
        ctx.globalAlpha = FX * 0.7;
        for (let k = 0; k < 64; k++) {
          const th = (k / 64) * Math.PI * 2,
            r1 = 28 + 5 * Math.sin(3 * th + (s.ph || 0)),
            r2 = 54 + 5 * Math.sin(3 * th - (s.ph || 0));
          api.drawRect(
            ctx,
            sx(p.x + Math.cos(th) * r1),
            sy(p.y + Math.sin(th) * r1 * 0.8),
            2,
            1,
            def.col,
          );
          api.drawRect(
            ctx,
            sx(p.x + Math.cos(th) * r2),
            sy(p.y + Math.sin(th) * r2 * 0.8),
            2,
            1,
            "#FFF1E8",
          );
        }
        ctx.globalAlpha = FX;
      } else if ((def.engine === "disk" || def.engine === "rose") && s.pos) {
        for (const [x, y] of s.pos) {
          if (def.engine === "disk") {
            api.drawDisc(ctx, sx(x), sy(y), 5, "#0b0a16");
            api.drawDisc(ctx, sx(x), sy(y), 4, def.col);
            api.drawRect(ctx, sx(x) - 1, sy(y) - 1, 2, 2, "#111D35");
          } else {
            api.drawRect(ctx, sx(x) - 3, sy(y) - 3, 7, 7, "#0b0a16");
            api.drawRect(ctx, sx(x) - 2, sy(y) - 2, 5, 5, def.col);
            api.drawRect(ctx, sx(x) - 1, sy(y) - 1, 2, 2, "#FFF1E8");
          }
        }
        if (def.engine === "rose" && s.k) {
          const p = P();
          ctx.globalAlpha = FX * 0.25;
          for (let k = 0; k < 90; k++) {
            const th = (k / 90) * Math.PI * 2,
              r = 58 * Math.cos(s.k * th);
            api.drawRect(
              ctx,
              sx(p.x + r * Math.cos(th)),
              sy(p.y + r * Math.sin(th) * 0.8),
              1,
              1,
              def.col,
            );
          }
          ctx.globalAlpha = FX;
        }
      } else if (def.engine === "taylor" && s.rings) {
        const p = P();
        for (const ring of s.rings) {
          const q = (t - ring.t0) / 0.35;
          if (q < 0 || q > 1) continue;
          ctx.globalAlpha = FX * (1 - q * 0.6);
          api.drawRing(ctx, sx(p.x), sy(p.y), ring.R * q, def.col, 3, 2);
          ctx.globalAlpha = FX;
        }
      }
    }
    // One-shot effects
    kf.fx = kf.fx.filter((f) => t - f.t0 < f.life);
    for (const f of kf.fx) {
      const q = clamp((t - f.t0) / f.life, 0, 1),
        fade = 1 - q;
      ctx.globalAlpha = FX * Math.max(0.15, fade);
      if (f.kind === "squeeze") {
        const close = clamp((t - f.t0) / Math.max(0.05, f.life - 0.12), 0, 1),
          gap = f.gap * (1 - close),
          cos = Math.cos(f.ang),
          sin = Math.sin(f.ang);
        for (const side of [-1, 1]) {
          const ox = -sin * gap * side,
            oy = cos * gap * side;
          line(
            f.x - cos * f.half + ox,
            f.y - sin * f.half + oy,
            f.x + cos * f.half + ox,
            f.y + sin * f.half + oy,
            f.col,
            2,
          );
        }
      } else if (f.kind === "flash") {
        const cos = Math.cos(f.ang),
          sin = Math.sin(f.ang);
        line(
          f.x - cos * f.half,
          f.y - sin * f.half,
          f.x + cos * f.half,
          f.y + sin * f.half,
          f.col,
          3,
        );
      } else if (f.kind === "ivt") {
        const steps = 14;
        let px = f.x0,
          py = f.y0;
        const len = Math.hypot(f.x1 - f.x0, f.y1 - f.y0) || 1,
          nx = -(f.y1 - f.y0) / len,
          ny = (f.x1 - f.x0) / len;
        for (let k = 1; k <= steps; k++) {
          const u = k / steps,
            wob = Math.sin(u * Math.PI * 2) * 8,
            x = f.x0 + (f.x1 - f.x0) * u + nx * wob,
            y = f.y0 + (f.y1 - f.y0) * u + ny * wob;
          line(px, py, x, y, f.col, 2);
          px = x;
          py = y;
        }
      } else if (f.kind === "beam" || f.kind === "charge") {
        if (f.kind === "charge") line(f.x0, f.y0, f.x1, f.y1, f.col, 1, 3);
        else {
          line(
            f.x0,
            f.y0,
            f.x1,
            f.y1,
            f.col,
            Math.max(1, Math.round(f.w * fade + 1)),
          );
          line(f.x0, f.y0, f.x1, f.y1, "#FFF1E8", 1);
        }
      } else if (f.kind === "chain" || f.kind === "bounce") {
        const segs = f.kind === "chain" ? f.pts : f.segs;
        segs.forEach(([x0, y0, x1, y1, k = 0]) => {
          if (f.kind === "bounce" && t - f.t0 < 0.07 * k) return;
          const mx = (x0 + x1) / 2 + Math.sin(t * 50 + x0) * 4,
            my = (y0 + y1) / 2 + Math.cos(t * 50 + y0) * 4;
          const w =
            f.kind === "bounce" ? Math.max(1, 3 - Math.floor(k / 3)) : 1;
          line(x0, y0, mx, my, f.col, w);
          line(mx, my, x1, y1, f.col, w);
        });
      } else if (f.kind === "mirror") {
        api.drawRing(ctx, sx(f.x), sy(f.y), f.r * (0.4 + 0.6 * q), f.col, 3, 1);
        line(
          f.x - f.r * 0.7,
          f.y + f.r * 0.7,
          f.x + f.r * 0.7,
          f.y - f.r * 0.7,
          f.col,
          1,
          3,
        );
        for (const [x0, y0, x1, y1] of f.bolts) line(x0, y0, x1, y1, "#FFF1E8");
      } else if (f.kind === "smite") {
        line(f.x, f.y - 60, f.x, f.y, f.col, 3);
        line(f.x, f.y - 60, f.x, f.y, "#FFF1E8", 1);
        api.drawRing(ctx, sx(f.x), sy(f.y), 6 + q * 10, f.col, 2, 1);
      } else if (f.kind === "bars") {
        const drop = clamp((t - f.t0) / 0.22, 0, 1);
        for (const r of f.rects) {
          const y = r.y - (1 - drop) * 30;
          api.drawRect(ctx, sx(r.x), sy(y), r.w - 1, r.h, "#0b0a16");
          api.drawRect(ctx, sx(r.x) + 1, sy(y) + 1, r.w - 3, r.h - 2, f.col);
          api.drawRect(ctx, sx(r.x) + 1, sy(y) + 1, r.w - 3, 1, "#FFF1E8");
        }
      } else if (f.kind === "nova" || f.kind === "ring") {
        api.drawRing(
          ctx,
          sx(f.x),
          sy(f.y),
          f.r * (0.3 + 0.7 * q),
          f.col,
          2,
          f.kind === "nova" ? 2 : 1,
        );
      } else if (f.kind === "vectors") {
        line(f.x, f.y, f.x + f.u[0], f.y + f.u[1], "#FFF1E8");
        line(f.x, f.y, f.x + f.v[0], f.y + f.v[1], "#FFF1E8");
        line(
          f.x + f.u[0],
          f.y + f.u[1],
          f.x + f.u[0] + f.v[0],
          f.y + f.u[1] + f.v[1],
          f.col,
          1,
          3,
        );
        line(
          f.x + f.v[0],
          f.y + f.v[1],
          f.x + f.u[0] + f.v[0],
          f.y + f.u[1] + f.v[1],
          f.col,
          1,
          3,
        );
      } else if (f.kind === "pop") {
        api.drawRing(ctx, sx(f.x), sy(f.y), 3 + q * 5, f.col, 1, 1);
      }
      ctx.globalAlpha = FX;
    }
    for (const s of kf.shots) {
      if (s.kind === "ink") {
        const q = clamp((t - s.t0) / s.life, 0, 1),
          x = s.x0 + (s.x1 - s.x0) * q,
          y = s.y0 + (s.y1 - s.y0) * q - Math.sin(q * Math.PI) * 30;
        api.drawDisc(ctx, sx(x), sy(y), 4, "#0b0a16");
        api.drawDisc(ctx, sx(x), sy(y), 3, s.col);
      } else if (s.kind === "rocket") {
        const ang = Math.atan2(s.vy, s.vx);
        line(
          s.x - Math.cos(ang) * 6,
          s.y - Math.sin(ang) * 6,
          s.x,
          s.y,
          "#c2c3c7",
          2,
        );
        api.drawRect(ctx, sx(s.x) - 1, sy(s.y) - 1, 3, 3, s.col);
        api.drawRect(
          ctx,
          sx(s.x - Math.cos(ang) * 8),
          sy(s.y - Math.sin(ang) * 8),
          2,
          2,
          "#FFA300",
        );
      } else {
        api.drawDisc(ctx, sx(s.x), sy(s.y), 3, s.col);
        api.drawRect(ctx, sx(s.x) - 1, sy(s.y) - 2, 1, 1, "#FFF1E8");
      }
    }
    ctx.globalAlpha = 1;
  }

  // Right-hand HUD column: unit skills and equipment.
  function drawHud(ctx, right, y) {
    const a = api.a,
      kf = a?.kf;
    if (!kf) return y;
    const pal = api.pal;
    y += 3;
    const row = [];
    for (const [id, s] of Object.entries(kf.unit))
      row.push({
        icon: "kf_" + id,
        col: UNIT_SKILLS[id].col,
        lv: s.lv,
        max: 3,
        count:
          UNIT_SKILLS[id].engine === "growth"
            ? kf.growth
            : UNIT_SKILLS[id].engine === "accum"
              ? s.n
              : 0,
      });
    for (const g of kf.gear)
      if (g)
        row.push({
          icon: "kf_" + g.id,
          col: EQUIPMENT[g.id].col,
          lv: g.lv,
          max: GEAR_MAX,
          cd: clamp(g.cd / EQUIPMENT[g.id].cd[g.lv - 1], 0, 1),
        });
    const drawRow = (items, size) => {
      let x = right - items.length * (size + 3) + 3;
      for (const it of items) {
        const img = icon(it.icon);
        api.drawRect(ctx, x - 1, y - 1, size + 2, size + 2, it.col);
        if (img) ctx.drawImage(img, x, y, size, size);
        if (it.cd > 0) {
          ctx.fillStyle = "rgba(0,0,0,0.55)";
          ctx.fillRect(x, y, size, Math.round(size * it.cd));
        }
        for (let k = 0; k < it.max && size >= 12; k++)
          api.drawRect(
            ctx,
            x + k * 3,
            y + size + 2,
            2,
            1,
            k < it.lv ? it.col : "#454c5e",
          );
        if (it.count)
          api.hudText(
            ctx,
            String(it.count),
            x + size,
            y + size - 5,
            pal.white,
            { outline: pal.black, align: "right" },
          );
        x += size + 3;
      }
    };
    if (row.length) {
      drawRow(row, 12);
      y += 18;
    }
    return y;
  }

  // At most two edge arrows, and never for something already on screen: one
  // objective (the nearest ready tablet you cannot see, so standing at the ★
  // tablet points you to the ★★ one; else a lair that just appeared or is
  // fighting) and the nearest dropped equipment.
  function markerTargets() {
    const a = api.a,
      kf = a?.kf;
    if (!kf?.world || a.boss) return [];
    const p = P(),
      view = api.view,
      cam = a.cam || { x: p.x - view.w / 2, y: p.y - view.h / 2 },
      away = (o) => {
        const x = o.x - cam.x,
          y = o.y - cam.y;
        return !(x > 0 && y > 0 && x < view.w && y < view.h);
      },
      dist = (o) => Math.hypot(o.x - p.x, o.y - p.y),
      nearest = (list) =>
        list
          .filter(away)
          .reduce(
            (best, o) => (!best || dist(o) < dist(best) ? o : best),
            null,
          ),
      marks = [];
    const tab = tabletsReady()
        ? nearest(kf.world.tablets.filter(tabletOpen))
        : null,
      // A sleeping lair gets the arrow when it appears, then a short reminder
      // once a minute instead of a permanent one.
      lair = nearest(
        kf.world.lairs.filter(
          (l) =>
            l.state === "awake" ||
            (l.state === "sleep" &&
              (a.t - l.shownAt < PACE.lairArrow || (a.t - l.shownAt) % 60 < 8)),
        ),
      );
    if (tab)
      marks.push({
        x: tab.x,
        y: tab.y,
        col: TABLETS[tab.tier - 1].col,
        label: "*".repeat(tab.tier),
      });
    else if (lair)
      marks.push({ x: lair.x, y: lair.y, col: "#FF004D", label: "!" });
    const loot = nearest(a.picks.filter((item) => item.kf));
    if (loot) marks.push({ x: loot.x, y: loot.y, col: "#FFEC27", label: "+" });
    return marks;
  }
  function drawMarkers(ctx) {
    const a = api.a;
    if (!a?.kf?.world || api.mode !== "play") return;
    const view = api.view,
      cam = a.cam,
      marks = markerTargets();
    for (const m of marks) {
      const x = m.x - cam.x,
        y = m.y - cam.y;
      if (x > 0 && y > 0 && x < view.w && y < view.h) continue;
      const ang = Math.atan2(y - view.h / 2, x - view.w / 2),
        ex = clamp(view.w / 2 + Math.cos(ang) * view.w, 12, view.w - 12),
        side = ex < 120 || ex > view.w - 110,
        ey = clamp(
          view.h / 2 + Math.sin(ang) * view.h,
          side ? 104 : 48,
          view.h - 26,
        );
      for (let k = 0; k < 4; k++) {
        const w = 4 - k;
        api.drawRect(
          ctx,
          Math.round(ex + Math.cos(ang) * k - w / 2),
          Math.round(ey + Math.sin(ang) * k - w / 2),
          w,
          w,
          m.col,
        );
      }
      api.hudText(
        ctx,
        m.label,
        Math.round(ex - Math.cos(ang) * 7),
        Math.round(ey - Math.sin(ang) * 7) - 2,
        m.col,
        { outline: "#000000", align: "center" },
      );
    }
  }

  // ------------------------------------------------------------ public hooks
  return {
    onRunStart() {
      const a = api.a;
      a.kf = freshState();
      a.testSpeed = testSpeedFor(api.save.d.setup);
      a.nextBossT = ARENA_STAGE_SECONDS / a.testSpeed;
      a.kf.tabletAt = fast(PACE.firstTablet);
    },
    update(dt) {
      const a = api.a,
        kf = a?.kf;
      if (!kf || !a.p || api.mode !== "play") return;
      // Real time jumped: a question or panel just closed. Rest before any
      // tablet lights up again, so questions never come back to back.
      if (kf.lastNow && api.now - kf.lastNow > 0.5)
        kf.restUntil = Math.max(kf.restUntil, a.t + fast(PACE.restAfterModal));
      kf.lastNow = api.now;
      if (kf.queue.length) {
        const list = kf.queue.splice(0);
        for (const fn of list) {
          fn();
          if (api.mode !== "play") {
            kf.queue.unshift(...list.slice(list.indexOf(fn) + 1));
            return;
          }
        }
      }
      const due = kf.later.filter((l) => l.at <= a.t);
      if (due.length) {
        kf.later = kf.later.filter((l) => l.at > a.t);
        for (const l of due) l.fn();
      }
      pumpBanners();
      pumpHints();
      kf.moveT = a.p.moving ? kf.moveT + dt : 0;
      for (const [id, s] of Object.entries(kf.unit)) {
        const def = UNIT_SKILLS[id];
        ENGINES[def.engine]?.(s, def, s.lv, dt);
      }
      tickGear(dt);
      tickShots(dt);
      tickBossFollowers(dt);
      if (a.themeTr) return;
      ensureWorld();
      if (tickLairs(dt)) return;
      if (!calm()) return;
      tickTablets();
    },
    onKill(e) {
      const a = api.a,
        kf = a?.kf;
      if (!kf) return;
      if (e.kf?.boss) {
        const lair = e.kfLair,
          def = MINI_BOSSES[e.kf.boss];
        if (lair) {
          lair.state = "done";
          lair.enemy = null;
        }
        kf.stats.miniBosses++;
        const reward = followerRewards[e.kf.boss];
        a.miniBossFarewell = {
          name: L(def.name),
          text: reward
            ? L(reward.line)
            : api.zh
              ? "收下我的激光炮吧。"
              : "Take my laser cannon.",
          until: a.t + 3.5,
        };
        if (reward) {
          const p = P();
          kf.bossFollowers = reward.kinds.map((kind, index) => ({
            kind,
            x: p.x + (index ? 17 : -17),
            y: p.y + 7,
            hp: 30,
            hurtAt: a.t,
            fireAt: a.t + 1,
          }));
        } else {
          a.picks.push({
            kind: "kfgear",
            kf: true,
            persist: true,
            gear: def.gear,
            x: e.x,
            y: e.y,
            t0: a.t,
          });
        }
        return;
      }
      const growth = kf.unit.u7_growth;
      if (growth) {
        kf.growth = Math.min(
          UNIT_SKILLS.u7_growth.cap[growth.lv - 1],
          kf.growth + 1,
        );
        kf.growthT = a.t;
      }
      if (kf.unit.u6_accum) kf.unit.u6_accum.n = (kf.unit.u6_accum.n || 0) + 1;
    },
    onUnitChange(prev, next) {
      const kf = kfOf();
      if (!kf) return;
      const faded = Object.keys(kf.unit).filter(
        (id) => UNIT_SKILLS[id].unit !== next,
      );
      if (!faded.length) return;
      for (const id of faded) delete kf.unit[id];
      if (!kf.unit.u7_growth) kf.growth = 0;
      const names = faded
        .map((id) => L(UNIT_SKILLS[id].name))
        .join(api.zh ? "、" : ", ");
      after(3, () =>
        say(
          api.zh ? `第 ${prev} 单元技能结束` : `UNIT ${prev} SKILLS FADE`,
          "#83769C",
          names,
        ),
      );
    },
    answerCards(q, correct, cards) {
      const kf = kfOf();
      if (!kf || !q) return cards;
      if (q.kfSource !== "tablet" || !correct) return cards;
      return tabletCards(q.kfTier || 1);
    },
    decorateQuiz(root, q) {
      if (!root || q?.kfSource !== "tablet") return;
      const head = root.querySelector(".qhd");
      if (!head) return;
      const b = head.querySelector("b"),
        span = head.querySelector("span");
      const tier = q.kfTier || 1;
      if (b)
        b.textContent =
          (api.zh ? "题碑 " : "TABLET ") +
          "★".repeat(tier) +
          "☆".repeat(3 - tier);
      if (span)
        span.textContent = api.zh
          ? `第 ${api.a.curUnit} 单元 · ${["简单", "中等", "困难"][tier - 1]}区`
          : `Unit ${api.a.curUnit} · ${["easy", "medium", "hard"][tier - 1]} area`;
    },
    levelText() {
      const a = api.a;
      return a?.lvBanner && a.lvBanner.t === a.lvT ? a.lvBanner : null;
    },
    applyCard(card) {
      const kf = kfOf();
      if (!kf || card?.type !== "kf") return false;
      if (card.kf === "unit") gainUnitSkill(card.id, card.step || 1);
      else if (card.kf === "equipSwap") equipGear(card.gear, card.slot);
      else if (card.kf === "keep") api.a.p.hp = api.a.p.maxHp;
      return true;
    },
    pickup(item) {
      if (kfOf() && item?.kind === "kfgear") offerGear(item.gear);
    },
    damageMult(e) {
      const kf = kfOf();
      if (!kf || !e) return 1;
      let m = 1;
      if (kf.growth && kf.unit.u7_growth) m *= Math.pow(1.03, kf.growth);
      const lh = kf.unit.u4_lhopital;
      if (lh && (e.elite || e.kf?.boss))
        m *= 1 + UNIT_SKILLS.u4_lhopital.bonus[lh.lv - 1];
      return m;
    },
    cooldownFactor() {
      const kf = kfOf(),
        rate = kf?.unit?.u2_rate;
      if (!rate || !api.a.p?.moving) return 1;
      return 1 / (1 + UNIT_SKILLS.u2_rate.bonus[rate.lv - 1]);
    },
    spawnFactor() {
      const kf = kfOf();
      if (!kf?.world) return 1;
      const p = P();
      let f = 1;
      for (const tab of kf.world.tablets)
        if (
          tabletOpen(tab) &&
          Math.hypot(p.x - tab.x, p.y - tab.y) < TABLETS[tab.tier - 1].ring + 20
        )
          f = Math.max(f, TABLETS[tab.tier - 1].spawn);
      return f;
    },
    xpScale(e) {
      return kfOf() && !e?.elite && !e?.boss ? SMALL_ENEMY_XP : 1;
    },
    bossType() {
      const a = api.a,
        kf = a?.kf;
      if (!kf) return null;
      if (kf.bossPlan?.k !== a.bossK)
        kf.bossPlan = {
          k: a.bossK,
          type: bossTypeFor(a.curUnit, kf.lastBossType),
        };
      return kf.bossPlan.type;
    },
    bossDef(def, spawnedType) {
      const kf = kfOf();
      if (!kf || !def) return def;
      if (spawnedType) kf.lastBossType = spawnedType;
      const prefix = WORLD_PREFIX[worldKind()];
      return prefix ? { ...def, name: L(prefix) + def.name } : def;
    },
    // Admin-only test speed row on the units & difficulty screen.
    decorateSetup(root, setup) {
      const panel = root?.querySelector(".panel"),
        row = panel?.querySelector(".urow");
      if (!row || !isArenaAdmin() || panel.querySelector(".kf-test")) return;
      const box = (api.doc() || document).createElement("div");
      box.className = "kf-test";
      box.innerHTML = `<b>${api.zh ? "测试速度" : "Test speed"}</b><small>${api.zh ? "仅管理员" : "admins only"}</small>${TEST_SPEEDS.map(
        (v, n) =>
          `<button type="button" class="dchip d-${["easy", "normal", "hard"][n]}" data-test="${v}" title="${api.esc(L(TEST_INFO[v]))}"><b>${v === 1 ? (api.zh ? "关闭" : "Off") : "×" + v}</b></button>`,
      ).join(
        "",
      )}<span>${api.zh ? "经验、敌人成长、刷怪、首领和题碑一起加速；测试局不计入记录。" : "XP, enemy growth, spawns, bosses and tablets all speed up; test runs are not recorded."}</span>`;
      row.before(box);
      const sync = () =>
        box.querySelectorAll("[data-test]").forEach((button) => {
          const on = testSpeedFor(setup) === Number(button.dataset.test);
          button.classList.toggle("on", on);
          button.setAttribute("aria-pressed", String(on));
        });
      box.querySelectorAll("[data-test]").forEach(
        (button) =>
          (button.onclick = () => {
            setup.test = Number(button.dataset.test);
            api.save.save();
            sync();
          }),
      );
      sync();
    },
    // Test runs say so on the results screen.
    onResults() {
      if (!kfOf() || speed() <= 1) return;
      const panel = api.overlay.el?.querySelector(".panel");
      if (!panel) return;
      const p = (api.doc() || document).createElement("p");
      p.className = "kf-test-result";
      p.textContent = api.zh
        ? `测试模式 ×${speed()}：这局不计入记录`
        : `Test mode ×${speed()}: this run is not recorded`;
      panel.prepend(p);
    },
    // Extra rows for the pause screen's build list.
    buildItems() {
      const kf = kfOf();
      if (!kf) return "";
      // Same tile shape as weapons and passives; the title carries the category.
      const row = (id, name, tag, title) =>
        `<li title="${api.esc(title)}"><span data-bi="k:kf_${id}"></span><b>${api.esc(name)}</b><em>${api.esc(tag)}</em></li>`;
      const out = [];
      for (const [id, s] of Object.entries(kf.unit))
        out.push(row(id, L(UNIT_SKILLS[id].name), `Lv ${s.lv}`, L(CAT.unit)));
      for (const g of kf.gear)
        if (g)
          out.push(
            row(g.id, L(EQUIPMENT[g.id].name), `Lv ${g.lv}`, L(CAT.gear)),
          );
      return out.join("");
    },
    icon,
    drawGround,
    drawEnemy,
    drawPick,
    drawEffects,
    drawHud,
    drawMarkers,
    // Exposed for tests.
    _: {
      tabletCards,
      gainUnitSkill,
      ensureWorld,
      markerTargets,
      tabletOpen,
      tabletsReady,
      hint,
      hit,
      offerGear,
      unitCard,
      ENGINES,
      GEAR,
    },
  };
}
