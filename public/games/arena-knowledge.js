// Knowledge flow for Limit Arena (#55), from Dennis's 2026-11-18 playtest notes.
//
// Growth comes mainly from questions and chests: small enemies drop less XP and
// correct answers fill a knowledge-chest meter. Question tablets sit in easy
// (★) and hard (★★★) areas of each world; hard ones offer skills that belong
// to the unit being studied and fade when the next unit begins. Hidden rooms
// drill the algebra a unit builds on and give permanent foundation skills that
// "spark" with matching unit skills. Each world has a themed mini-boss that
// drops its own equipment, and a weekly challenge fixes the rules for a week.
//
// Second round (Dennis: "plays very messy"): one new thing at a time. Tablets
// open one tier at a time and share one cooldown; the lair and the hidden room
// appear later in each world; first-time help is a short owl hint that never
// pauses; banners queue; at most one objective arrow plus one loot arrow;
// skill hits never crit, so passive skills add no big numbers or screen shake.
// See docs/arena/DENNIS_KNOWLEDGE_FLOW_55.md for the sources behind each rule.
//
// limit-arena.js passes live accessors to createKnowledgeFlow, so tests that
// patch runtime bindings also patch what this module sees. Outside a real run
// (no `a.kf`) every hook is a no-op.

const pick = (zh, pair) => (zh ? pair[1] : pair[0]);

// ---------------------------------------------------------------- math HTML
// Questions are plain HTML; the game stylesheet draws .kf-frac / .kf-rad.
export const frac = (n, d) =>
  `<span class="kf-frac"><span>${n}</span><span>${d}</span></span>`;
export const rad = (x) => `√<span class="kf-rad">${x}</span>`;
const sup = (b, e) => `${b}<sup>${e}</sup>`;
const lim = (x, a) => `lim<sub>${x}→${a}</sub>`;
const neg = (n) => (n < 0 ? `−${-n}` : String(n));
const signed = (n) => (n < 0 ? ` − ${-n}` : ` + ${n}`);

// ---------------------------------------------------------------- tuning
// `cd` is the shared cooldown: answering any tablet dims all of them for the
// cooldown of the tier you chose. Tier n opens after n − 1 tablets this run.
export const TABLETS = [
  { tier: 1, col: "#00E436", cd: 25, chest: 0.18, ring: 52, spawn: 1 },
  { tier: 2, col: "#FFEC27", cd: 35, chest: 0.28, ring: 56, spawn: 1.25 },
  { tier: 3, col: "#FF004D", cd: 45, chest: 0.4, ring: 62, spawn: 1.6 },
];
// Pacing, in game seconds. [first world, later worlds] where there are two.
export const PACE = {
  firstTablet: 2,
  restAfterModal: 8,
  lairAfter: [120, 45],
  secondLairAfter: 60,
  doorAfter: [200, 90],
  lairArrow: 15,
  bannerGap: 2,
  hintGap: 3,
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
  chest: [
    "Correct answers fill the chest bar (top right). Full bar = a knowledge chest.",
    "答对题会涨右上角的宝箱条，涨满掉一个知识宝箱。",
  ],
  unit: [
    "Unit skills work only in this unit and fade when the next unit begins.",
    "单元技能只在本单元有效，进入下一单元就会消失。",
  ],
  lair: [
    "A mini-boss lair appeared. Walk close to wake it; beat it for equipment.",
    "小首领巢穴出现了。走近会叫醒它，打败它掉装备。",
  ],
  room: [
    "A hidden computation room is somewhere {dir}. Walk near to find it.",
    "这个世界藏着一间算力房，{dir}。走近就能发现。",
  ],
  gear: [
    "Equipment fires on its own. Find the same one again to level it up.",
    "装备会自动开火，再捡到同一件就会升级。",
  ],
};
export const CHEST = {
  kill: 0.002,
  elite: 0.03,
  miniBoss: 0.35,
  levelQuestion: [0.12, 0.18, 0.26],
  perfectRoom: 0.2,
  salvage: 0.3,
};
export const SMALL_ENEMY_XP = 0.6;
export const RESIDUE_PER_MASTERED = 0.03;

// Offsets from the world centre; flipped per world so maps differ. They stay
// outside the ring where Brian's special regions and landmarks live.
export const LAYOUT = {
  tablets: [
    [-300, 60],
    [290, 200],
    [430, -270],
  ],
  lairs: [
    [-440, -250],
    [-20, 300],
  ],
  door: [70, -340],
};

// ---------------------------------------------------------------- unit skills
// Each unit owns 2–3 skills. `spark` names the foundation skill that, when also
// owned, adds the spark effect. Numbers are per level (Lv 1–3).
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
    spark: "f_rationalize",
    sparkName: ["Rationalized Squeeze", "有理化夹逼"],
    sparkInfo: [
      "The lines close a second time for 60% damage and mark what they catch.",
      "边界线再夹一次（60% 伤害），并标记被夹住的敌人。",
    ],
    why: [
      "Limits with radicals are often squeezed only after rationalizing.",
      "含根式的极限，常常要先有理化再夹逼。",
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
    spark: "f_factor",
    sparkName: ["Removable Discontinuity", "可去间断点"],
    sparkInfo: [
      "Enemies that die at the asymptote burst for 20 area damage.",
      "在渐近线上被消灭的敌人会爆开，造成 20 点范围伤害。",
    ],
    why: [
      "Factoring tells a removable hole from a true asymptote.",
      "因式分解能分清是可去间断点还是真正的渐近线。",
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
    spark: "f_factor",
    sparkName: ["Root Finder", "零点定理"],
    sparkInfo: [
      "The midpoint also explodes, like bisecting toward a root.",
      "曲线的中点再爆炸一次，就像用二分法逼近零点。",
    ],
    why: [
      "A factored form shows where a function crosses zero.",
      "因式分解后，函数在哪里过零一眼就能看出来。",
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
    spark: "f_slope",
    sparkName: ["Point–Slope", "点斜式"],
    sparkInfo: [
      "Also fires backward along the same line.",
      "沿同一条直线再向后射一条。",
    ],
    why: [
      "A tangent line is point–slope form with m = f′(a).",
      "切线就是斜率 m = f′(a) 的点斜式直线。",
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
    spark: "f_exponent",
    sparkName: ["Power Rule", "幂法则"],
    sparkInfo: [
      "After 2 s of nonstop movement the bonus doubles.",
      "连续移动 2 秒后，射速加成翻倍。",
    ],
    why: [
      "The power rule turns exponents into rates of change.",
      "幂法则把指数变成变化率。",
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
    spark: "f_compose",
    sparkName: ["Composition", "复合函数"],
    sparkInfo: [
      "+2 links, and the last link explodes.",
      "连锁 +2 环，最后一环会爆炸。",
    ],
    why: [
      "The chain rule needs you to see the inside and outside functions.",
      "看清内外层函数，链式法则才用得上。",
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
    spark: "f_trig",
    sparkName: ["Inverse Trig", "反三角函数"],
    sparkInfo: [
      "The pulse also freezes enemies for 1.5 s.",
      "脉冲还会冰冻敌人 1.5 秒。",
    ],
    why: [
      "Inverse trig functions undo sin, cos and tan.",
      "反三角函数把 sin、cos、tan 反过来。",
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
    spark: "f_factor",
    sparkName: ["Two Ways to 0/0", "0/0 的两种解法"],
    sparkInfo: [
      "+20% more, and your hits slow them briefly.",
      "再 +20%，并让被击中的它们短暂减速。",
    ],
    why: [
      "Factoring and L'Hôpital both resolve 0/0.",
      "因式分解和洛必达法则都能化解 0/0。",
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
    spark: "f_slope",
    sparkName: ["Velocity Vector", "速度方向"],
    sparkInfo: ["The trail also pushes enemies away.", "轨迹还会把敌人推开。"],
    why: ["Velocity is the slope of position.", "速度就是位移的斜率。"],
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
    spark: "f_factor",
    sparkName: ["Critical Points", "临界点"],
    sparkInfo: [
      "Also strikes the enemy with the least HP for half damage.",
      "同时打击生命最低的敌人，造成一半伤害。",
    ],
    why: [
      "Set f′(x) = 0 and factor to find critical points.",
      "令 f′(x) = 0 再因式分解，就能找到临界点。",
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
    spark: "f_slope",
    sparkName: ["Parallel Tangent", "平行切线"],
    sparkInfo: [
      "A second beam fires parallel to the first.",
      "旁边再发射一条平行的光束。",
    ],
    why: [
      "Somewhere the tangent has the same slope as the secant.",
      "总有一点的切线斜率等于割线斜率。",
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
    spark: "f_area",
    sparkName: ["Trapezoid Rule", "梯形法则"],
    sparkInfo: [
      "+2 rectangles, and they leave a damaging area for 1.2 s.",
      "矩形 +2，并留下持续 1.2 秒的伤害区域。",
    ],
    why: [
      "Area formulas turn rectangles and trapezoids into integrals.",
      "面积公式把矩形和梯形变成积分。",
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
    spark: "f_area",
    sparkName: ["Area Formula", "面积公式"],
    sparkInfo: ["The shockwave is 30% wider.", "冲击波范围 +30%。"],
    why: [
      "Accumulated change is the area under the rate.",
      "累积的变化量就是变化率曲线下的面积。",
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
    spark: "f_exponent",
    sparkName: ["Separation", "分离变量"],
    sparkInfo: [
      "Enemies in the field are also slowed.",
      "场内的敌人还会减速。",
    ],
    why: [
      "Separating variables leads to exponents and logs.",
      "分离变量最后要用指数和对数来解。",
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
    spark: "f_exponent",
    sparkName: ["Natural Growth", "自然增长"],
    sparkInfo: [
      "+6 more stacks, and it decays half as fast.",
      "叠加上限 +6 层，衰减速度减半。",
    ],
    why: [
      "y = Ce^(kt) is the exponent rules at work.",
      "y = Ce^(kt) 就是指数律的应用。",
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
    spark: "f_area",
    sparkName: ["Top Minus Bottom", "上减下"],
    sparkInfo: [
      "+25% damage and a wider gap between the curves.",
      "伤害 +25%，两条曲线之间更宽。",
    ],
    why: [
      "Area between curves is ∫(top − bottom).",
      "曲线间面积 = ∫(上 − 下)。",
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
    spark: "f_trig",
    sparkName: ["Washer Method", "圆环法"],
    sparkInfo: [
      "+1 disc, and the orbit swings in and out.",
      "圆盘 +1，轨道忽远忽近。",
    ],
    why: [
      "Revolving around an axis traces circles with cos and sin.",
      "绕轴旋转画出的圆，用 cos 和 sin 描述。",
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
    spark: "f_trig",
    sparkName: ["Double Angle", "倍角公式"],
    sparkInfo: [
      "A second blade traces the rose half a petal behind.",
      "第二片刀刃落后半片花瓣，一起画玫瑰线。",
    ],
    why: [
      "Polar curves are built from sin and cos.",
      "极坐标曲线由 sin 和 cos 组成。",
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
    spark: "f_trig",
    sparkName: ["Components", "分解分量"],
    sparkInfo: ["The u + v beam is 60% wider.", "u + v 光束宽度 +60%。"],
    why: [
      "Vectors split into components with sin and cos.",
      "向量要用 sin、cos 分解成分量。",
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
    spark: "f_exponent",
    sparkName: ["Ratio Test", "比值判别"],
    sparkInfo: ["The ratio becomes r = 0.9.", "公比变成 r = 0.9。"],
    why: ["Each term ar^n is an exponent rule.", "每一项 ar^n 都是指数律。"],
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
    spark: "f_trig",
    sparkName: ["Series for sin x", "sin x 的展开"],
    sparkInfo: [
      "The rings also freeze enemies for 1 s.",
      "波纹还会冰冻敌人 1 秒。",
    ],
    why: [
      "sin x expands to x − x³/3! + x⁵/5! − …",
      "sin x 展开成 x − x³/3! + x⁵/5! − …",
    ],
  },
};

// ---------------------------------------------------------------- foundations
export const FOUNDATIONS = {
  f_rationalize: {
    col: "#4fb4ff",
    name: ["Rationalizing", "根式有理化"],
    info: [
      "+8% damage to elites, mini-bosses and armored enemies per level.",
      "每级对精英、小首领和装甲敌人伤害 +8%。",
    ],
  },
  f_factor: {
    col: "#33d6a0",
    name: ["Factoring", "因式分解"],
    info: ["+4% damage per level.", "每级伤害 +4%。"],
  },
  f_slope: {
    col: "#ff9d81",
    name: ["Slope & Lines", "斜率与直线"],
    info: ["+5% move speed per level.", "每级移动速度 +5%。"],
  },
  f_exponent: {
    col: "#a8e72e",
    name: ["Exponent & Log Rules", "指数与对数律"],
    info: ["+6% XP per level.", "每级经验 +6%。"],
  },
  f_compose: {
    col: "#29adff",
    name: ["Composition", "复合与反函数"],
    info: [
      "Unit skills recharge 8% faster per level.",
      "每级单元技能冷却 −8%。",
    ],
  },
  f_trig: {
    col: "#ff77a8",
    name: ["Trig Values", "三角函数值"],
    info: [
      "Unit skills cover 10% more area per level.",
      "每级单元技能范围 +10%。",
    ],
  },
  f_area: {
    col: "#ffec27",
    name: ["Area & Sums", "面积与求和"],
    info: ["+8% chest progress per level.", "每级宝箱进度 +8%。"],
  },
};
export const FOUNDATION_MAX = 2;

// Prerequisite topics drilled in each unit's hidden room (first is drilled twice).
export const ROOM_TOPICS = {
  1: ["f_rationalize", "f_factor"],
  2: ["f_exponent", "f_slope"],
  3: ["f_compose", "f_trig"],
  4: ["f_slope", "f_factor"],
  5: ["f_factor", "f_slope"],
  6: ["f_area", "f_exponent"],
  7: ["f_exponent", "f_area"],
  8: ["f_area", "f_trig"],
  9: ["f_trig", "f_slope"],
  10: ["f_exponent", "f_area"],
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
};
export const WORLD_PREFIX = {
  desert: ["Dune ", "沙海·"],
  rainforest: ["Jungle ", "雨林·"],
  snow: ["Frost ", "冰原·"],
  book: ["Ink ", "书页·"],
};

// ---------------------------------------------------------------- weekly
export const WEEKLY_RULES = {
  chestRush: {
    name: ["Chest Rush", "宝箱加速"],
    info: ["Chest progress ×1.5.", "宝箱进度 ×1.5。"],
  },
  hardWeek: {
    name: ["Hard Questions", "难题周"],
    info: [
      "★★★ tablets recharge 40% faster and offer 1 of 4.",
      "★★★ 题碑冷却快 40%，奖励 4 选 1。",
    ],
  },
  bossHunt: {
    name: ["Boss Hunt", "小首领周"],
    info: [
      "Every world has a second mini-boss lair.",
      "每个世界多一个小首领巢穴。",
    ],
  },
  glass: {
    name: ["Glass Cannon", "玻璃大炮"],
    info: ["+30% damage, −30% max HP.", "伤害 +30%，生命上限 −30%。"],
  },
  swift: {
    name: ["Swift Feet", "疾风"],
    info: ["+15% move speed.", "移动速度 +15%。"],
  },
  roomWeek: {
    name: ["Computation Week", "算力周"],
    info: [
      "Hidden rooms show from farther away; 3/3 picks 2 foundations.",
      "隐藏房间更远就能看到；全对可以选 2 个算力技能。",
    ],
  },
};

export function isoWeek(date) {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const year = d.getUTCFullYear(),
    start = Date.UTC(year, 0, 1);
  return { year, week: Math.ceil(((d - start) / 86400000 + 1) / 7) };
}

export function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Same unit, hero, gun and two rules for everyone in an ISO week.
export function weeklyChallenge(
  date = new Date(),
  {
    heroes = ["redred", "blueblue", "goldgold", "greengreen"],
    guns = ["rifle", "sniper", "shotgun"],
    units = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  } = {},
) {
  const { year, week } = isoWeek(date),
    n = year * 53 + week,
    rnd = seededRandom(n * 2654435761),
    pool = units.length ? units : [1];
  const rules = Object.keys(WEEKLY_RULES),
    first = rules.splice(Math.floor(rnd() * rules.length), 1)[0],
    second = rules[Math.floor(rnd() * rules.length)];
  return {
    id: `${year}-W${String(week).padStart(2, "0")}`,
    unit: pool[n % pool.length],
    hero: heroes[Math.floor(rnd() * heroes.length)],
    cls: guns[Math.floor(rnd() * guns.length)],
    rules: [first, second],
  };
}

// ---------------------------------------------------------------- layout
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Positions for tablets, lairs and the hidden door in one world. The variant
// mirrors the layout; a variant whose objects overlap a special region is
// skipped.
export function worldLayout(world, zones = [], variant = 0, lairCount = 1) {
  const tryVariant = (v) => {
    const fx = v & 1 ? -1 : 1,
      fy = v & 2 ? -1 : 1;
    const at = ([dx, dy]) => ({
      x: Math.round(clamp(world.cx + dx * fx, 40, world.w - 40)),
      y: Math.round(clamp(world.cy + dy * fy, 40, world.h - 40)),
    });
    return {
      tablets: LAYOUT.tablets.map(at),
      lairs: LAYOUT.lairs.slice(0, lairCount).map(at),
      door: at(LAYOUT.door),
    };
  };
  const clear = (layout) =>
    [...layout.tablets, ...layout.lairs, layout.door].every((p) =>
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
  return mapped && mapped !== lastType ? mapped : null;
}

// ---------------------------------------------------------------- drills
// Quick multiple-choice questions on the algebra a unit builds on. Generated
// here (no question bank involved), never written to learning records.
const ri = (rnd, lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const choose = (rnd, list) => list[Math.floor(rnd() * list.length)];

function options(rnd, right, wrong) {
  const seen = new Set([right]),
    out = [right];
  for (const w of wrong) {
    if (out.length === 4) break;
    if (!seen.has(w)) {
      seen.add(w);
      out.push(w);
    }
  }
  let filler = 2;
  while (out.length < 4) {
    const f = String(Number.parseInt(right, 10) + filler || filler);
    filler += 3;
    if (!seen.has(f)) {
      seen.add(f);
      out.push(f);
    }
  }
  for (let n = out.length - 1; n > 0; n--) {
    const k = Math.floor(rnd() * (n + 1));
    [out[n], out[k]] = [out[k], out[n]];
  }
  return { opts: out, ans: out.indexOf(right) };
}

export const DRILLS = {
  f_rationalize: [
    (rnd, zh) => {
      const [m, n] = choose(rnd, [
        [5, 3],
        [7, 3],
        [7, 5],
        [6, 2],
        [7, 2],
        [5, 2],
      ]);
      const right = frac(`${rad(m)} − ${rad(n)}`, m - n);
      return {
        stem: zh
          ? `把分母有理化：${frac(1, `${rad(m)} + ${rad(n)}`)} = ?`
          : `Rationalize the denominator: ${frac(1, `${rad(m)} + ${rad(n)}`)} = ?`,
        ...options(rnd, right, [
          frac(`${rad(m)} + ${rad(n)}`, m - n),
          frac(`${rad(m)} − ${rad(n)}`, m + n),
          frac(`${rad(n)} − ${rad(m)}`, m - n),
        ]),
        why: zh
          ? `分子分母同乘 ${rad(m)} − ${rad(n)}：分母变成 ${m} − ${n} = ${m - n}。`
          : `Multiply top and bottom by the conjugate ${rad(m)} − ${rad(n)}: the bottom becomes ${m} − ${n} = ${m - n}.`,
      };
    },
    (rnd, zh) => {
      const k = ri(rnd, 2, 5);
      return {
        stem: `${lim("x", 0)} ${frac(`${rad(`x + ${k * k}`)} − ${k}`, "x")} = ?`,
        ...options(rnd, frac(1, 2 * k), [
          frac(1, k),
          String(2 * k),
          "0",
          frac(1, k * k),
        ]),
        why: zh
          ? `分子分母同乘 ${rad(`x + ${k * k}`)} + ${k}，约去 x 得 ${frac(1, `${rad(`x + ${k * k}`)} + ${k}`)} → ${frac(1, 2 * k)}。`
          : `Multiply by the conjugate ${rad(`x + ${k * k}`)} + ${k}; the x cancels, leaving ${frac(1, `${rad(`x + ${k * k}`)} + ${k}`)} → ${frac(1, 2 * k)}.`,
      };
    },
    (rnd, zh) => {
      const r = ri(rnd, 2, 5),
        b = r * r;
      return {
        stem: `${lim("x", b)} ${frac(`x − ${b}`, `${rad("x")} − ${r}`)} = ?`,
        ...options(rnd, String(2 * r), [String(r), String(b), frac(1, 2 * r)]),
        why: zh
          ? `x − ${b} = (${rad("x")} − ${r})(${rad("x")} + ${r})，约分后是 ${rad("x")} + ${r} → ${2 * r}。`
          : `x − ${b} = (${rad("x")} − ${r})(${rad("x")} + ${r}); after cancelling, ${rad("x")} + ${r} → ${2 * r}.`,
      };
    },
  ],
  f_factor: [
    (rnd, zh) => {
      const k = ri(rnd, 2, 6);
      return {
        stem: `${lim("x", k)} ${frac(`${sup("x", 2)} − ${k * k}`, `x − ${k}`)} = ?`,
        ...options(rnd, String(2 * k), [
          String(k),
          "0",
          String(k * k),
          zh ? "不存在" : "Does not exist",
        ]),
        why: zh
          ? `${sup("x", 2)} − ${k * k} = (x − ${k})(x + ${k})，约去 x − ${k} 后代入：${k} + ${k} = ${2 * k}。`
          : `${sup("x", 2)} − ${k * k} = (x − ${k})(x + ${k}); cancel x − ${k}, then substitute: ${k} + ${k} = ${2 * k}.`,
      };
    },
    (rnd, zh) => {
      const p = ri(rnd, 1, 6);
      let q = ri(rnd, 1, 6);
      if (q === p) q = (q % 6) + 1;
      const poly = `${sup("x", 2)} + ${p + q}x + ${p * q}`;
      return {
        stem: zh ? `因式分解：${poly} = ?` : `Factor: ${poly} = ?`,
        ...options(rnd, `(x + ${p})(x + ${q})`, [
          `(x − ${p})(x − ${q})`,
          `(x + ${p})(x − ${q})`,
          `(x + ${p * q})(x + 1)`,
        ]),
        why: zh
          ? `找两个数，和为 ${p + q}、积为 ${p * q}：${p} 和 ${q}。`
          : `Find two numbers with sum ${p + q} and product ${p * q}: ${p} and ${q}.`,
      };
    },
    (rnd, zh) => {
      const k = ri(rnd, 2, 6);
      let b = ri(rnd, 1, 5);
      if (b === k) b = k - 1;
      const poly = `${sup("x", 2)}${signed(-(k + b)).replace(" ", " ")}x${signed(k * b)}`;
      return {
        stem: `${lim("x", k)} ${frac(poly, `x − ${k}`)} = ?`,
        ...options(rnd, neg(k - b), [
          neg(k + b),
          neg(b - k),
          "0",
          String(k * b),
        ]),
        why: zh
          ? `分子 = (x − ${k})(x − ${b})，约分后代入 x = ${k}：${k} − ${b} = ${neg(k - b)}。`
          : `The top is (x − ${k})(x − ${b}); cancel and substitute x = ${k}: ${k} − ${b} = ${neg(k - b)}.`,
      };
    },
  ],
  f_slope: [
    (rnd, zh) => {
      const m = choose(rnd, [-3, -2, -1, 1, 2, 3]),
        dx = ri(rnd, 1, 3),
        x1 = ri(rnd, -3, 3),
        y1 = ri(rnd, -3, 3);
      const x2 = x1 + dx,
        y2 = y1 + m * dx;
      return {
        stem: zh
          ? `经过 (${neg(x1)}, ${neg(y1)}) 和 (${neg(x2)}, ${neg(y2)}) 的直线，斜率是？`
          : `What is the slope of the line through (${neg(x1)}, ${neg(y1)}) and (${neg(x2)}, ${neg(y2)})?`,
        ...options(rnd, neg(m), [
          neg(-m),
          frac(1, neg(m)),
          neg(m + 1),
          neg(m * dx),
        ]),
        why: zh
          ? `斜率 = Δy/Δx = (${neg(y2)} − ${neg(y1)})/(${neg(x2)} − ${neg(x1)}) = ${neg(m * dx)}/${dx} = ${neg(m)}。`
          : `Slope = Δy/Δx = (${neg(y2)} − ${neg(y1)})/(${neg(x2)} − ${neg(x1)}) = ${neg(m * dx)}/${dx} = ${neg(m)}.`,
      };
    },
    (rnd, zh) => {
      const a = ri(rnd, 1, 4),
        h = ri(rnd, 1, 2);
      return {
        stem: zh
          ? `f(x) = ${sup("x", 2)} 从 x = ${a} 到 x = ${a + h} 的平均变化率是？`
          : `The average rate of change of f(x) = ${sup("x", 2)} from x = ${a} to x = ${a + h} is?`,
        ...options(rnd, String(2 * a + h), [
          String(2 * a),
          String(a * a + h),
          String((a + h) * (a + h)),
        ]),
        why: zh
          ? `(f(${a + h}) − f(${a}))/${h} = (${(a + h) * (a + h)} − ${a * a})/${h} = ${2 * a + h}。`
          : `(f(${a + h}) − f(${a}))/${h} = (${(a + h) * (a + h)} − ${a * a})/${h} = ${2 * a + h}.`,
      };
    },
    (rnd, zh) => {
      const m = choose(rnd, [-2, -1, 2, 3]),
        x0 = ri(rnd, 1, 3),
        y0 = ri(rnd, -2, 4),
        d = ri(rnd, 1, 3);
      return {
        stem: zh
          ? `直线过点 (${x0}, ${neg(y0)})，斜率 ${neg(m)}。当 x = ${x0 + d} 时 y = ?`
          : `A line passes through (${x0}, ${neg(y0)}) with slope ${neg(m)}. What is y when x = ${x0 + d}?`,
        ...options(rnd, neg(y0 + m * d), [
          neg(y0 - m * d),
          neg(m * (x0 + d)),
          neg(y0 + m),
        ]),
        why: zh
          ? `点斜式：y = ${neg(y0)} + ${neg(m)}·(${x0 + d} − ${x0}) = ${neg(y0 + m * d)}。`
          : `Point–slope: y = ${neg(y0)} + ${neg(m)}·(${x0 + d} − ${x0}) = ${neg(y0 + m * d)}.`,
      };
    },
  ],
  f_exponent: [
    (rnd, zh) => {
      const p = ri(rnd, 2, 5),
        q = ri(rnd, 2, 5);
      return {
        stem: zh
          ? `化简：${sup("x", p)} · ${sup("x", q)} = ?`
          : `Simplify: ${sup("x", p)} · ${sup("x", q)} = ?`,
        ...options(rnd, sup("x", p + q), [
          sup("x", p * q),
          sup("x", Math.abs(p - q) || 1),
          sup(`(2x)`, p + q),
        ]),
        why: zh
          ? `同底相乘，指数相加：${p} + ${q} = ${p + q}。`
          : `Same base: add the exponents, ${p} + ${q} = ${p + q}.`,
      };
    },
    (rnd, zh) => {
      const n = ri(rnd, 1, 3);
      const right = sup("x", `−${frac(2 * n - 1, 2)}`);
      return {
        stem: zh
          ? `写成 x 的幂：${frac(rad("x"), sup("x", n))} = ?`
          : `Write as a power of x: ${frac(rad("x"), sup("x", n))} = ?`,
        ...options(rnd, right, [
          sup("x", frac(2 * n - 1, 2)),
          sup("x", `−${frac(1, 2 * n)}`),
          sup("x", `−${2 * n}`),
        ]),
        why: zh
          ? `${rad("x")} = ${sup("x", frac(1, 2))}，除以 ${sup("x", n)} 就是指数相减：${frac(1, 2)} − ${n} = −${frac(2 * n - 1, 2)}。`
          : `${rad("x")} = ${sup("x", frac(1, 2))}; dividing by ${sup("x", n)} subtracts exponents: ${frac(1, 2)} − ${n} = −${frac(2 * n - 1, 2)}.`,
      };
    },
    (rnd, zh) => {
      const k = ri(rnd, 2, 5),
        m = ri(rnd, 2, 5);
      return {
        stem: `ln(${sup("e", k)} · ${sup("e", m)}) = ?`,
        ...options(rnd, String(k + m), [
          String(k * m),
          sup("e", k + m),
          `ln ${k + m}`,
        ]),
        why: zh
          ? `${sup("e", k)} · ${sup("e", m)} = ${sup("e", k + m)}，而 ln(${sup("e", "u")}) = u。`
          : `${sup("e", k)} · ${sup("e", m)} = ${sup("e", k + m)}, and ln(${sup("e", "u")}) = u.`,
      };
    },
  ],
  f_compose: [
    (rnd, zh) => {
      const a = ri(rnd, 2, 4),
        b = ri(rnd, 1, 5),
        c = ri(rnd, 1, 3),
        k = ri(rnd, 1, 3);
      const g = k * k + c,
        right = a * g + b;
      return {
        stem: zh
          ? `f(x) = ${a}x + ${b}，g(x) = ${sup("x", 2)} + ${c}。f(g(${k})) = ?`
          : `f(x) = ${a}x + ${b} and g(x) = ${sup("x", 2)} + ${c}. f(g(${k})) = ?`,
        ...options(rnd, String(right), [
          String((a * k + b) ** 2 + c),
          String(a * k + b + g),
          String(a * k * k + c + b),
        ]),
        why: zh
          ? `先算里层 g(${k}) = ${g}，再算外层 f(${g}) = ${a}·${g} + ${b} = ${right}。`
          : `Inside first: g(${k}) = ${g}; then outside: f(${g}) = ${a}·${g} + ${b} = ${right}.`,
      };
    },
    (rnd, zh) => {
      const a = ri(rnd, 2, 5),
        b = ri(rnd, 1, 6);
      return {
        stem: zh
          ? `f(x) = ${a}x + ${b} 的反函数 f<sup>−1</sup>(x) = ?`
          : `The inverse of f(x) = ${a}x + ${b} is f<sup>−1</sup>(x) = ?`,
        ...options(rnd, frac(`x − ${b}`, a), [
          frac(`x + ${b}`, a),
          `${a}x − ${b}`,
          frac(1, `${a}x + ${b}`),
        ]),
        why: zh
          ? `由 y = ${a}x + ${b} 解出 x = (y − ${b})/${a}，再把 x、y 互换。`
          : `Solve y = ${a}x + ${b} for x = (y − ${b})/${a}, then swap x and y.`,
      };
    },
    (rnd, zh) => {
      const n = ri(rnd, 2, 4),
        c = ri(rnd, 1, 5);
      return {
        stem: zh
          ? `h(x) = (${sup("x", 2)} + ${c})${sup("", n)} = f(g(x))，g(x) = ${sup("x", 2)} + ${c}。外层 f(u) = ?`
          : `h(x) = (${sup("x", 2)} + ${c})${sup("", n)} = f(g(x)) with g(x) = ${sup("x", 2)} + ${c}. The outside function f(u) = ?`,
        ...options(rnd, sup("u", n), [
          `${sup("u", 2)} + ${c}`,
          `${n}u`,
          sup("u", n + 1),
        ]),
        why: zh
          ? `把 ${sup("x", 2)} + ${c} 看成 u，h 就是 ${sup("u", n)}。`
          : `Call ${sup("x", 2)} + ${c} “u”; then h is ${sup("u", n)}.`,
      };
    },
  ],
  f_trig: [
    (rnd, zh) => {
      const facts = [
        ["sin(π/6)", frac(1, 2)],
        ["cos(π/3)", frac(1, 2)],
        ["sin(π/4)", frac(rad(2), 2)],
        ["cos(π/6)", frac(rad(3), 2)],
        ["tan(π/4)", "1"],
        ["cos(π)", "−1"],
        ["tan(π/3)", rad(3)],
        ["sin(π/2)", "1"],
      ];
      const [q, right] = choose(rnd, facts);
      const pool = [
        frac(1, 2),
        frac(rad(2), 2),
        frac(rad(3), 2),
        "1",
        "−1",
        rad(3),
        "0",
      ].filter((v) => v !== right);
      const wrong = [];
      while (wrong.length < 3) {
        const v = choose(rnd, pool);
        if (!wrong.includes(v)) wrong.push(v);
      }
      return {
        stem: `${q} = ?`,
        ...options(rnd, right, wrong),
        why: zh
          ? `${q} = ${right}（单位圆上的特殊角）。`
          : `${q} = ${right} (a special angle on the unit circle).`,
      };
    },
    (rnd, zh) => {
      const [a, b, c] = choose(rnd, [
        [3, 4, 5],
        [5, 12, 13],
        [8, 15, 17],
      ]);
      return {
        stem: zh
          ? `θ 在第一象限，sin θ = ${frac(a, c)}。cos θ = ?`
          : `θ is in quadrant I and sin θ = ${frac(a, c)}. cos θ = ?`,
        ...options(rnd, frac(b, c), [frac(a, b), frac(c, b), `−${frac(b, c)}`]),
        why: zh
          ? `${sup("sin", 2)}θ + ${sup("cos", 2)}θ = 1，所以 cos θ = ${rad(`1 − ${a * a}/${c * c}`)} = ${frac(b, c)}。`
          : `sin²θ + cos²θ = 1, so cos θ = ${rad(`1 − ${a * a}/${c * c}`)} = ${frac(b, c)}.`,
      };
    },
    (rnd, zh) => {
      const [a, b, c] = choose(rnd, [
        [3, 4, 5],
        [5, 12, 13],
      ]);
      return {
        stem: zh
          ? `sin θ = ${frac(a, c)}，cos θ = ${frac(b, c)}。sin 2θ = ?`
          : `sin θ = ${frac(a, c)} and cos θ = ${frac(b, c)}. sin 2θ = ?`,
        ...options(rnd, frac(2 * a * b, c * c), [
          frac(2 * a, c),
          frac(a * b, c * c),
          frac(b * b - a * a, c * c),
        ]),
        why: zh
          ? `倍角公式 sin 2θ = 2 sin θ cos θ = 2·${a}·${b}/${c * c} = ${frac(2 * a * b, c * c)}。`
          : `Double angle: sin 2θ = 2 sin θ cos θ = 2·${a}·${b}/${c * c} = ${frac(2 * a * b, c * c)}.`,
      };
    },
  ],
  f_area: [
    (rnd, zh) => {
      const n = choose(rnd, [10, 20, 50, 100]);
      return {
        stem: `1 + 2 + 3 + … + ${n} = ?`,
        ...options(rnd, String((n * (n + 1)) / 2), [
          String(n * n),
          String((n * (n - 1)) / 2),
          String(n * (n + 1)),
        ]),
        why: zh
          ? `首尾配对：${frac(`${n}(${n} + 1)`, 2)} = ${(n * (n + 1)) / 2}。`
          : `Pair first with last: ${frac(`${n}(${n} + 1)`, 2)} = ${(n * (n + 1)) / 2}.`,
      };
    },
    (rnd, zh) => {
      const a = ri(rnd, 2, 6),
        b = ri(rnd, 3, 9),
        h = 2 * ri(rnd, 1, 4);
      return {
        stem: zh
          ? `梯形上底 ${a}、下底 ${b}、高 ${h}，面积 = ?`
          : `A trapezoid has parallel sides ${a} and ${b} and height ${h}. Its area is?`,
        ...options(rnd, String(((a + b) * h) / 2), [
          String((a + b) * h),
          String(a * b * h),
          String(((a + b) * h) / 4),
        ]),
        why: zh
          ? `面积 = (上底 + 下底) × 高 ÷ 2 = (${a} + ${b})·${h}/2 = ${((a + b) * h) / 2}。`
          : `Area = (a + b)·h/2 = (${a} + ${b})·${h}/2 = ${((a + b) * h) / 2}.`,
      };
    },
    (rnd, zh) => {
      const n = ri(rnd, 3, 6),
        right = (n * (n + 1)) / 2;
      return {
        stem: zh
          ? `用 ${n} 个宽 1 的矩形（取右端点）估计 f(x) = x 在 [0, ${n}] 上的面积 = ?`
          : `Estimate the area under f(x) = x on [0, ${n}] with ${n} rectangles of width 1, using right endpoints.`,
        ...options(rnd, String(right), [
          String((n * n) / 2),
          String((n * (n - 1)) / 2),
          String(n * n),
        ]),
        why: zh
          ? `右端点高度是 1, 2, …, ${n}，相加得 ${right}。`
          : `The right-endpoint heights are 1, 2, …, ${n}; they add to ${right}.`,
      };
    },
  ],
};

export function makeDrill(topic, rnd = Math.random, zh = false) {
  const makers = DRILLS[topic] || DRILLS.f_factor;
  return { topic, ...makers[Math.floor(rnd() * makers.length)](rnd, zh) };
}

// Three drills for a unit's room: two on the first topic, one on the second.
export function roomDrills(unit, rnd = Math.random, zh = false) {
  const [a, b] = ROOM_TOPICS[unit] || ROOM_TOPICS[1];
  const list = [
    makeDrill(a, rnd, zh),
    makeDrill(a, rnd, zh),
    makeDrill(b, rnd, zh),
  ];
  // Avoid the same stem twice in one room.
  if (list[1].stem === list[0].stem) list[1] = makeDrill(b, rnd, zh);
  return list;
}

// ---------------------------------------------------------------- runtime
export function createKnowledgeFlow(api) {
  let armedWeekly = null;
  const L = (pair) => pick(api.zh, pair);
  const kfOf = () => api.a?.kf;
  const sprites = new Map();

  // Card category labels get their own colours (see .c-unit etc. in the HTML).
  const CAT = {
    unit: ["Unit skill", "单元技能"],
    found: ["Foundation", "算力"],
    gear: ["Equipment", "装备"],
  };
  try {
    for (const [cls, pair] of Object.entries(CAT)) api.cardCats[L(pair)] = cls;
  } catch {}

  // ------------------------------------------------------------ state
  function freshState() {
    return {
      chest: 0,
      chestOut: false,
      unit: {},
      found: {},
      gear: [null, null],
      residue: 0,
      sparks: {},
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
      chestFlash: -9,
      weekly: null,
      lastBossType: null,
      bossPlan: null,
      stats: {
        tablets: 0,
        rooms: 0,
        miniBosses: 0,
        chests: 0,
        opened: 0,
        worlds: 0,
      },
    };
  }
  const weeklyHas = (rule) => !!kfOf()?.weekly?.rules?.includes(rule);
  const unitLv = (id) => kfOf()?.unit?.[id]?.lv || 0;
  const foundLv = (id) => kfOf()?.found?.[id] || 0;
  const sparkOn = (id) => unitLv(id) > 0 && foundLv(UNIT_SKILLS[id].spark) > 0;
  const now = () => api.a.t;
  const after = (delay, fn) => kfOf().later.push({ at: now() + delay, fn });
  const whenPlaying = (fn) => kfOf().queue.push(fn);

  // ------------------------------------------------------------ geometry helpers
  const area = () => 1 + 0.1 * foundLv("f_trig");
  const cdMul = () => 1 - 0.08 * foundLv("f_compose");
  const scale = () => api.dmgMul() * (1 + api.a.t / 300);
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
    s.cd = period * cdMul();
    return true;
  }
  const retry = (s) => (s.cd = 0.3);

  // ------------------------------------------------------------ unit-skill engines
  const ENGINES = {
    squeeze(s, def, lv, dt) {
      if (!ready(s, dt, def.cd[lv - 1])) return;
      const p = P(),
        target = nearestFoe(p.x, p.y, 170 * area());
      if (!target) return retry(s);
      const c = clusterAround(target),
        ang = Math.atan2(c.y - p.y, c.x - p.x) + Math.PI / 2,
        half = 46 * area(),
        gap = 30 * area(),
        dmg = def.dmg[lv - 1],
        spark = sparkOn("u1_squeeze");
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
              hit(e, dmg * mul, spark ? { st: { mark: 2 } } : {});
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
      if (spark) after(0.3, () => slam(0.6, 0.24));
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
      const target = p.x + (s.side || 1) * 44 * area();
      s.x =
        s.x === undefined ? target : s.x + (target - s.x) * Math.min(1, dt * 5);
      s.y = p.y;
      const reach = 110 * area();
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
        list = foes(p.x, p.y, 180 * area()).slice(0, 24);
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
      if (sparkOn("u1_ivt"))
        after(0.12, () =>
          blast(
            (a.x + b.x) / 2,
            (a.y + b.y) / 2,
            22 * area(),
            def.dmg[lv - 1] * 0.6,
            def.col,
          ),
        );
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
      const len = 220 * area(),
        dirs = sparkOn("u2_tangent") ? [1, -1] : [1];
      for (const k of dirs) {
        const x1 = p.x + dx * len * k,
          y1 = p.y + dy * len * k;
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
      }
    },
    rate() {},
    chain(s, def, lv, dt) {
      if (!ready(s, dt, def.cd[lv - 1])) return;
      const p = P();
      let cur = nearestFoe(p.x, p.y, 160);
      if (!cur) return retry(s);
      const spark = sparkOn("u3_chain"),
        hops = def.hops[lv - 1] + (spark ? 2 : 0),
        seen = new Set(),
        pts = [];
      let from = p,
        last = cur;
      for (let k = 0; k < hops && cur; k++) {
        seen.add(cur);
        pts.push([from.x, from.y, cur.x, cur.y]);
        hit(cur, def.dmg[lv - 1] * Math.pow(1.15, k), { st: { shock: 1 } });
        from = last = cur;
        cur = nearestFoe(from.x, from.y, 80, seen);
      }
      fx({ kind: "chain", pts, col: def.col, life: 0.22 });
      if (spark)
        blast(last.x, last.y, 26 * area(), def.dmg[lv - 1] * 1.5, def.col);
    },
    inverse(s, def, lv, dt) {
      if (!ready(s, dt, def.cd[lv - 1])) return;
      const p = P(),
        r = 60 * area(),
        st = sparkOn("u3_inverse") ? { chill: 1.5 } : undefined;
      let erased = 0;
      api.a.ebul = api.a.ebul.filter((b) => {
        if (Math.hypot(b.x - p.x, b.y - p.y) < r) {
          erased++;
          return false;
        }
        return true;
      });
      for (const e of foes(p.x, p.y, r))
        hit(e, def.dmg[lv - 1], st ? { st } : {});
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
      const push = sparkOn("u4_motion");
      for (const e of foes(p.x, p.y, 140)) {
        let best = 99,
          bp = null;
        for (let k = 1; k < s.pts.length; k++) {
          const a = s.pts[k - 1],
            b = s.pts[k],
            d = segDist(e.x, e.y, a.x, a.y, b.x, b.y);
          if (d < best) {
            best = d;
            bp = b;
          }
        }
        if (best > 8 + (e.r || 0)) continue;
        hit(e, def.dps[lv - 1] * 0.3, { quiet: true, nocrit: true });
        if (push && bp && !e.boss) {
          const ang = Math.atan2(e.y - bp.y, e.x - bp.x);
          e.kx = (e.kx || 0) + Math.cos(ang) * 60 * (e.kbr || 1);
          e.ky = (e.ky || 0) + Math.sin(ang) * 60 * (e.kbr || 1);
        }
      }
    },
    extreme(s, def, lv, dt) {
      if (!ready(s, dt, def.cd[lv - 1])) return;
      const p = P(),
        list = foes(p.x, p.y, 200);
      if (!list.length) return retry(s);
      let hi = list[0],
        lo = list[0];
      for (const e of list) {
        if (e.hp > hi.hp) hi = e;
        if (e.hp < lo.hp) lo = e;
      }
      hit(hi, def.dmg[lv - 1]);
      fx({ kind: "smite", x: hi.x, y: hi.y, col: def.col, life: 0.3 });
      if (sparkOn("u5_extreme") && lo !== hi) {
        hit(lo, def.dmg[lv - 1] * 0.5);
        fx({ kind: "smite", x: lo.x, y: lo.y, col: "#29ADFF", life: 0.3 });
      }
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
      const lines = [[0, 0]];
      if (sparkOn("u5_mvt")) {
        const ang = Math.atan2(far.y - p.y, far.x - p.x) + Math.PI / 2;
        lines.push([Math.cos(ang) * 18, Math.sin(ang) * 18]);
      }
      for (const [ox, oy] of lines) {
        hitLine(
          p.x + ox,
          p.y + oy,
          far.x + ox,
          far.y + oy,
          7,
          def.dmg[lv - 1],
          { st: { mark: 2 } },
        );
        fx({
          kind: "beam",
          x0: p.x + ox,
          y0: p.y + oy,
          x1: far.x + ox,
          y1: far.y + oy,
          w: 2,
          col: def.col,
          dots: true,
          life: 0.3,
        });
      }
    },
    riemann(s, def, lv, dt) {
      if (!ready(s, dt, def.cd[lv - 1])) return;
      const p = P(),
        t = nearestFoe(p.x, p.y, 180 * area());
      if (!t) return retry(s);
      const c = clusterAround(t),
        spark = sparkOn("u6_riemann"),
        n = def.n[lv - 1] + (spark ? 2 : 0),
        w = 12 * area(),
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
        if (spark)
          kfOf().zones.push({
            kind: "bars",
            x: x0,
            y: c.y - 14,
            w: n * w,
            h: 30,
            until: now() + 1.2,
            dps: def.dmg[lv - 1] * 0.5,
            col: def.col,
          });
      });
    },
    accum(s, def, lv) {
      if ((s.n || 0) < def.need[lv - 1]) return;
      s.n = 0;
      const p = P(),
        r = 70 * area() * (sparkOn("u6_accum") ? 1.3 : 1);
      blast(p.x, p.y, r, def.dmg[lv - 1], def.col);
      fx({ kind: "nova", x: p.x, y: p.y, r, col: def.col, life: 0.4 });
      api.sfx?.("boom");
    },
    field(s, def, lv, dt) {
      const p = P(),
        r = 70 * area(),
        slow = sparkOn("u7_field");
      s.tick = (s.tick ?? 0.5) - dt;
      const tick = s.tick <= 0;
      if (tick) s.tick = 0.5;
      for (const e of foes(p.x, p.y, r)) {
        if (!e.boss) {
          const ang = Math.atan2(e.y - p.y, e.x - p.x) + 1.15;
          e.kx = (e.kx || 0) + Math.cos(ang) * 150 * dt * (e.kbr || 1);
          e.ky = (e.ky || 0) + Math.sin(ang) * 150 * dt * (e.kbr || 1);
        }
        if (slow) e.slowUntil = Math.max(e.slowUntil || 0, now() + 0.3);
        if (tick) hit(e, def.dps[lv - 1] * 0.5, { quiet: true, nocrit: true });
      }
    },
    growth(s, def, lv, dt) {
      const kf = kfOf(),
        spark = sparkOn("u7_growth");
      if (kf.growth > 0 && now() - kf.growthT > 3) {
        s.decay = (s.decay ?? 0) - dt;
        if (s.decay <= 0) {
          s.decay = spark ? 1 : 0.5;
          kf.growth--;
        }
      }
    },
    area(s, def, lv, dt) {
      const p = P(),
        spark = sparkOn("u8_area");
      s.ph = (s.ph || 0) + dt * 1.6;
      s.tick = (s.tick ?? 0.35) - dt;
      if (s.tick > 0) return;
      s.tick = 0.35;
      const outer = (60 + (spark ? 8 : 0)) * area();
      for (const e of foes(p.x, p.y, outer + 6)) {
        const th = Math.atan2(e.y - p.y, e.x - p.x),
          d = Math.hypot(e.x - p.x, e.y - p.y),
          r1 = (28 + 5 * Math.sin(3 * th + s.ph)) * area(),
          r2 = (54 + 5 * Math.sin(3 * th - s.ph) + (spark ? 8 : 0)) * area();
        if (d >= r1 - (e.r || 0) && d <= r2 + (e.r || 0))
          hit(e, def.dps[lv - 1] * 0.35 * (spark ? 1.25 : 1), {
            quiet: true,
            nocrit: true,
          });
      }
    },
    disk(s, def, lv, dt) {
      const p = P(),
        spark = sparkOn("u8_disk"),
        n = def.n[lv - 1] + (spark ? 1 : 0),
        R = (spark ? 34 + 10 * Math.sin(now() * 2) : 34) * area();
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
        R = 58 * area(),
        blades = sparkOn("u9_rose") ? 2 : 1;
      s.th = (s.th || 0) + dt * 1.9;
      s.pos = [];
      s.k = k;
      for (let b = 0; b < blades; b++) {
        const th = s.th - (b * Math.PI) / (2 * k),
          r = R * Math.cos(k * th),
          x = p.x + r * Math.cos(th),
          y = p.y + r * Math.sin(th) * 0.8;
        s.pos.push([x, y]);
        for (const e of foes(x, y, 7)) {
          const hits = (e.kfHit ||= {});
          if ((hits.rose || 0) > now()) continue;
          hits.rose = now() + 0.35;
          hit(e, def.dmg[lv - 1]);
        }
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
      const len = 230 * area(),
        width = sparkOn("u9_vector") ? 10 : 6,
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
      const ratio = sparkOn("u10_geometric") ? 0.9 : 0.8,
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
          hit(e, ring.dmg, ring.chill ? { st: { chill: 1 } } : {});
        }
      }
      s.rings = (s.rings || []).filter((ring) => now() - ring.t0 < 0.4);
      if (!ready(s, dt, def.cd[lv - 1])) return;
      const chill = sparkOn("u10_taylor");
      for (let k = 0; k < def.terms[lv - 1]; k++)
        s.rings.push({
          t0: now() + 0.22 * k,
          R: (34 + 16 * k) * area(),
          dmg: def.dmg[lv - 1] / (k + 1),
          hit: new Set(),
          chill,
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

  // ------------------------------------------------------------ chest meter
  function addChest(amount, raw = false) {
    const kf = kfOf();
    if (!kf || !(amount > 0)) return 0;
    const gain = raw
      ? amount
      : amount *
        (1 + 0.08 * foundLv("f_area")) *
        (weeklyHas("chestRush") ? 1.5 : 1);
    kf.chest = Math.min(kf.chestOut ? 1 : 2, kf.chest + gain);
    if (gain >= 0.05) {
      kf.chestFlash = api.now;
      hint("chest");
    }
    if (kf.chest >= 1 && !kf.chestOut) dropChest();
    return gain;
  }
  function dropChest() {
    const kf = kfOf(),
      a = api.a,
      [left, top, right, bottom] = api.bounds();
    kf.chest = Math.max(0, kf.chest - 1);
    kf.chestOut = true;
    kf.stats.chests++;
    const x = clamp(a.p.x + (a.p.dx || 1) * 34, left + 10, right - 10),
      y = clamp(a.p.y + (a.p.dy || 0) * 34, top + 10, bottom - 10);
    a.picks.push({ kind: "kfchest", kf: true, persist: true, x, y, t0: a.t });
    whenPlaying(() => {
      say(
        L(["KNOWLEDGE CHEST!", "知识宝箱！"]),
        "#29ADFF",
        L(["Your answers filled the chest", "答题攒满了宝箱进度"]),
      );
      api.sfx?.("shard");
    });
  }

  // ------------------------------------------------------------ cards
  const unitName = (n) => api.units?.[n - 1]?.name || "";
  function unitCard(id) {
    const def = UNIT_SKILLS[id],
      lv = unitLv(id),
      spark = FOUNDATIONS[def.spark];
    return {
      type: "kf",
      kf: "unit",
      id,
      name: L(def.name),
      tag: lv
        ? `Lv ${lv} → ${lv + 1}`
        : api.zh
          ? `新 · 仅限第 ${def.unit} 单元`
          : `New · Unit ${def.unit} only`,
      cat: L(CAT.unit),
      desc: L(def.info),
      next: `Lv ${lv + 1}: ${L(def.up[lv])}`,
      icon: "kf_" + id,
      col: def.col,
      bg: "#111D35",
      rare: true,
      hint: api.zh
        ? `火花：配合算力「${L(spark.name)}」→ ${L(def.sparkName)}${foundLv(def.spark) ? "（已拥有）" : ""}`
        : `Spark: with ${L(spark.name)} → ${L(def.sparkName)}${foundLv(def.spark) ? " (owned)" : ""}`,
      recommend: foundLv(def.spark)
        ? {
            score: 96,
            reason:
              (api.zh ? "马上触发火花：" : "Sparks right away: ") +
              L(def.sparkName),
          }
        : {
            score: lv ? 64 : 70,
            reason: api.zh
              ? `第 ${def.unit} 单元专属，整个单元都有效`
              : `Built for Unit ${def.unit}; lasts the whole unit`,
          },
    };
  }
  function foundationCard(id) {
    const def = FOUNDATIONS[id],
      lv = foundLv(id),
      partners = Object.keys(UNIT_SKILLS).filter(
        (u) => UNIT_SKILLS[u].spark === id,
      );
    const live = partners.filter((u) => unitLv(u));
    return {
      type: "kf",
      kf: "found",
      id,
      name: L(def.name),
      tag: lv ? `Lv ${lv} → ${lv + 1}` : api.zh ? "永久" : "Permanent",
      cat: L(CAT.found),
      desc: L(def.info),
      next: "",
      icon: "kf_" + id,
      col: def.col,
      bg: "#111D35",
      recommend: live.length
        ? {
            score: 94,
            reason:
              (api.zh ? "马上产生火花：" : "Sparks now: ") +
              live
                .map((u) => L(UNIT_SKILLS[u].sparkName))
                .join(api.zh ? "、" : ", "),
          }
        : {
            score: 40,
            reason: api.zh
              ? "永久提升，以后能和单元技能组合"
              : "Permanent, and combines with unit skills later",
          },
      hint: live.length
        ? (api.zh ? "马上产生火花：" : "Sparks now: ") +
          live
            .map((u) => L(UNIT_SKILLS[u].sparkName))
            .join(api.zh ? "、" : ", ")
        : (api.zh ? "火花：" : "Sparks with: ") +
          partners
            .map((u) => L(UNIT_SKILLS[u].name))
            .join(api.zh ? "、" : ", "),
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
  function tabletCards(tier) {
    const size = tier === 3 && weeklyHas("hardWeek") ? 4 : 3,
      out = [];
    for (const id of shuffle(unitChoices()).slice(
      0,
      tier === 3 ? 2 : tier === 2 ? 1 : 0,
    ))
      out.push(unitCard(id));
    if (tier === 3) {
      const rare = api.bossCards();
      fill(
        out,
        rare.filter((c) => c.type === "evo" || c.type === "thm"),
        out.length + 1,
      );
      if (out.length < 2) fill(out, rare, 2);
    }
    fill(out, api.cards(size), size);
    if (out.length < size) fill(out, api.bossCards(), size);
    out.noReroll = tier >= 2;
    return out;
  }
  function chestCards() {
    const out = [];
    const units = shuffle(unitChoices());
    if (units.length) out.push(unitCard(units[0]));
    const rare = api.bossCards();
    fill(
      out,
      rare.filter((c) => c.type === "evo" || c.type === "thm"),
      out.length + 1,
    );
    fill(out, api.cards(3), 3);
    fill(out, rare, 3);
    out.noReroll = true;
    return out;
  }

  // ------------------------------------------------------------ gaining things
  function gainUnitSkill(id) {
    const kf = kfOf(),
      def = UNIT_SKILLS[id];
    if (kf.unit[id]) kf.unit[id].lv = Math.min(3, kf.unit[id].lv + 1);
    else kf.unit[id] = { lv: 1, cd: 1, n: 0 };
    hint("unit");
    checkSparks();
    return def;
  }
  function gainFoundation(id) {
    const kf = kfOf();
    kf.found[id] = Math.min(FOUNDATION_MAX, (kf.found[id] || 0) + 1);
    checkSparks();
  }
  function checkSparks() {
    const kf = kfOf();
    for (const id of Object.keys(kf.unit)) {
      if (!sparkOn(id) || kf.sparks[id]) continue;
      kf.sparks[id] = true;
      const def = UNIT_SKILLS[id];
      whenPlaying(() => {
        say(
          (api.zh ? "火花！" : "SPARK! ") + L(def.sparkName),
          "#FFEC27",
          L(def.sparkInfo),
        );
        api.sfx?.("power");
      });
    }
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
        const gain = addChest(CHEST.salvage, true);
        say(
          L(def.name) + " MAX",
          def.col,
          (api.zh ? "宝箱进度 +" : "Chest +") + Math.round(gain * 100) + "%",
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
    // Both slots taken: swap one out or salvage it for chest progress.
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
      kf: "salvage",
      id: "salvage",
      name: api.zh ? `分解 ${L(def.name)}` : `Salvage ${L(def.name)}`,
      tag: api.zh ? "宝箱进度" : "Chest",
      cat: L(CAT.gear),
      desc: api.zh
        ? "不换装备，宝箱进度 +30%。"
        : "Keep your gear and gain 30% chest progress.",
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
        ? "换下一件，或者分解成宝箱进度"
        : "Swap one out, or salvage it for chest progress",
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
      lairs = weeklyHas("bossHunt") ? 2 : 1,
      layout = worldLayout(
        api.world,
        api.themes?.[theme]?.zones || [],
        Math.floor(api.Math.random() * 4),
        lairs,
      ),
      hard = weeklyHas("hardWeek") ? 0.6 : 1;
    const others = Object.keys(MINI_BOSSES).filter(
      (id) => id !== bossForWorld(kind),
    );
    kf.tabletAt = Math.max(kf.tabletAt, a.t + PACE.firstTablet);
    kf.world = {
      stage,
      theme,
      kind,
      t0: a.t,
      first: kf.stats.worlds++ === 0,
      tablets: layout.tablets.map((p, n) => ({
        ...p,
        tier: n + 1,
        cdMul: n === 2 ? hard : 1,
      })),
      // Lairs start hidden and appear one at a time (see unlockLairs).
      lairs: layout.lairs.map((p, n) => ({
        ...p,
        boss:
          n === 0
            ? bossForWorld(kind)
            : others[Math.floor(api.Math.random() * others.length)],
        state: "hidden",
        shownAt: -99,
        enemy: null,
        nextAtk: 0,
        atk: 0,
      })),
      door: { ...layout.door, locked: true, revealed: false, used: false },
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

  // Tier n opens after n − 1 tablets this run, so a new run starts with ★ only.
  const tabletOpen = (tab) => tab.tier <= 1 + (kfOf().stats.tablets || 0);
  // All open tablets share one cooldown, and none lights up right after a
  // question or a panel closes.
  const tabletsReady = () => {
    const kf = kfOf(),
      t = api.a.t;
    return t >= kf.tabletAt && t >= kf.restUntil;
  };

  function askTablet(tab) {
    const a = api.a,
      kf = a.kf,
      rule = TABLETS[tab.tier - 1];
    kf.tabletWait = rule.cd * tab.cdMul;
    kf.tabletAt = a.t + kf.tabletWait;
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

  // The hidden room can be found only after the world's first mini-boss falls
  // (or after a while), so it never stacks on the first minutes.
  function tickDoor() {
    const a = api.a,
      kf = kfOf(),
      world = kf.world,
      door = world.door;
    if (!door || door.used) return false;
    const p = P(),
      d = Math.hypot(p.x - door.x, p.y - door.y);
    if (door.locked) {
      const wait = PACE.doorAfter[world.first ? 0 : 1];
      if (!world.lairs.some((l) => l.state === "done") && a.t - world.t0 < wait)
        return false;
      door.locked = false;
      hint("room", direction(door.x, door.y));
    }
    if (!door.revealed && d < (weeklyHas("roomWeek") ? 220 : 70)) {
      door.revealed = true;
      api.sfx?.("shard");
      api.float(door.x, door.y - 20, "?", "#FFEC27", true);
    }
    if (door.revealed && d < 11) {
      openRoom(door);
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------ mini-bosses
  const enemyHp = (base) => {
    const m = api.a.t / 60;
    return base * (1 + 0.12 * m + 0.042 * m * m) * (api.enemyHpMul?.() || 1);
  };
  function wake(lair) {
    const def = MINI_BOSSES[lair.boss],
      hp = enemyHp(def.hp);
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
  // Lairs appear one at a time: the first after the first chest is opened or
  // after PACE.lairAfter, the next once that one is beaten or a minute later.
  function unlockLairs() {
    const a = api.a,
      kf = kfOf(),
      world = kf.world,
      hidden = world.lairs.find((l) => l.state === "hidden");
    if (!hidden || !calm()) return;
    const shown = world.lairs.filter((l) => l.state !== "hidden"),
      age = a.t - world.t0,
      due = shown.length
        ? shown.every((l) => l.state === "done") ||
          a.t - Math.max(...shown.map((l) => l.shownAt)) >= PACE.secondLairAfter
        : age >= PACE.lairAfter[world.first ? 0 : 1] ||
          (world.first && kf.stats.opened > 0 && age >= 30);
    if (!due) return;
    hidden.state = "sleep";
    hidden.shownAt = a.t;
    const def = MINI_BOSSES[hidden.boss];
    say(
      api.zh ? "小首领出现了" : "A MINI-BOSS APPEARED",
      def.col,
      `${L(def.name)} · ${direction(hidden.x, hidden.y)}`,
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
        if (calm() && d < 105) wake(lair);
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

  // ------------------------------------------------------------ hidden room
  let room = null;
  function openRoom(door) {
    const a = api.a,
      kf = a.kf;
    door.used = true;
    kf.stats.rooms++;
    api.clearInput();
    api.mode = "quiz";
    api.sfx?.("quest");
    room = {
      drills: roomDrills(a.curUnit, api.Math.random, api.zh),
      index: 0,
      score: 0,
      answered: false,
    };
    renderDrill();
  }
  function renderDrill() {
    const d = room.drills[room.index],
      topic = FOUNDATIONS[d.topic],
      unit = api.a.curUnit;
    api.overlay.show(
      `<div class="panel qz pix kf-room">
      <div class="qhd"><b>${api.zh ? "算力房" : "COMPUTATION ROOM"}</b><span>${api.zh ? `第 ${unit} 单元的基础 · 第 ${room.index + 1}/3 题` : `Unit ${unit} foundations · ${room.index + 1}/3`}</span><span class="qm">${api.esc(L(topic.name))}</span></div>
      <div class="qbody"><div class="qstem">${d.stem}</div></div>
      <div class="qopts">${d.opts.map((o, n) => `<button type="button" class="qo" data-k="${n}"><kbd>${"ABCD"[n]}</kbd><span>${o}</span></button>`).join("")}</div>
      <div class="qfb" id="qfb" hidden></div>
      <div class="cards" id="cards" hidden></div>
      <div class="qfoot" id="qfoot">${api.zh ? "按 <kbd>A</kbd>–<kbd>D</kbd> 作答 · 游戏已暂停 · 不计入练习记录" : "Press <kbd>A</kbd>–<kbd>D</kbd> to answer · Game paused · Not saved to your practice record"}</div>
    </div>`,
      "kfdrill",
    );
    room.answered = false;
    room.lock = performance.now() + 250;
    api.overlay.el.querySelectorAll(".qo").forEach((b) => {
      b.onclick = () => answerDrill(+b.dataset.k);
    });
  }
  function answerDrill(k) {
    if (!room || room.answered || performance.now() < room.lock) return;
    room.answered = true;
    const d = room.drills[room.index],
      right = k === d.ans,
      root = api.overlay.el;
    if (right) room.score++;
    right ? api.sfx?.("correct") : api.sfx?.("wrong");
    root.querySelector(".qz")?.classList.add("answered");
    root.querySelectorAll(".qo").forEach((b, n) => {
      b.disabled = true;
      if (n === d.ans) b.classList.add("right");
      else if (n === k) b.classList.add("wrong");
    });
    const last = room.index === room.drills.length - 1,
      fb = root.querySelector("#qfb");
    fb.hidden = false;
    fb.className = "qfb " + (right ? "ok" : "no");
    fb.innerHTML = `<b>${right ? (api.zh ? "✓ 算对了！" : "✓ Correct!") : api.zh ? "再想想" : "Not quite"}</b><p>${d.why}</p><button type="button" class="go kf-next" id="kfNext">${last ? (api.zh ? "看结果" : "See result") : api.zh ? "下一题" : "Next"} <kbd>Enter</kbd></button>`;
    root.querySelector("#kfNext").onclick = () => nextDrill();
    // Small screens: bring the explanation and the Next button into view.
    try {
      fb.scrollIntoView({ block: "nearest", behavior: "smooth" });
    } catch {}
  }
  function nextDrill() {
    if (!room?.answered) return;
    if (room.index < room.drills.length - 1) {
      room.index++;
      renderDrill();
      return;
    }
    finishRoom();
  }
  function finishRoom() {
    const score = room.score,
      unit = api.a.curUnit,
      root = api.overlay.el,
      fb = root.querySelector("#qfb");
    room = null;
    let cards, title;
    if (score >= 2) {
      const [a, b] = ROOM_TOPICS[unit] || ROOM_TOPICS[1];
      cards = [a, b]
        .filter((id) => foundLv(id) < FOUNDATION_MAX)
        .map(foundationCard);
      if (score === 3) addChest(CHEST.perfectRoom);
      if (!cards.length) cards = api.cards(3);
      title =
        score === 3 && weeklyHas("roomWeek") && cards.length > 1
          ? api.zh
            ? "全对！两个都拿走"
            : "Perfect! Take both"
          : api.zh
            ? `算力 ${score}/3：选一个算力技能`
            : `Computation ${score}/3: pick a foundation`;
      if (
        score === 3 &&
        weeklyHas("roomWeek") &&
        cards.length > 1 &&
        cards.every((c) => c.kf === "found")
      ) {
        // Computation Week: a perfect room gives both foundations.
        const both = {
          ...cards[0],
          kf: "foundBoth",
          ids: cards.map((c) => c.id),
          name: cards.map((c) => c.name).join(" + "),
          desc: cards.map((c) => c.desc).join(" "),
        };
        cards = [both];
      }
    } else {
      cards = api.basicCards();
      title = api.zh
        ? `算力 ${score}/3：还要多练，先领基础奖励`
        : `Computation ${score}/3: keep practising — take a basic reward`;
    }
    if (fb) {
      fb.className = "qfb " + (score >= 2 ? "ok" : "no");
      fb.innerHTML = `<b>${api.zh ? `算力 ${score}/3` : `Computation ${score}/3`}</b><p>${score === 3 ? (api.zh ? "全对！宝箱进度也涨了。" : "Perfect — the chest meter grew too.") : score === 2 ? (api.zh ? "基础扎实。" : "Solid foundations.") : api.zh ? "这些是本单元常用的基础计算，回头可以在练习里多做几道。" : "These are skills this unit leans on; try a few more in Practice."}</p>`;
    }
    cards.noReroll = true;
    api.overlay.mode = "quizfb";
    api.overlay.cardsFor(cards, title, true);
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
  const doorSprite = () =>
    sprite("door", 14, 18, (d) => {
      d.r(0, 4, 14, 14, "#6b7489");
      d.r(2, 1, 10, 3, "#6b7489");
      d.r(3, 0, 8, 1, "#9aa3b5");
      d.r(2, 5, 10, 13, "#5a3524");
      d.r(3, 3, 8, 2, "#5a3524");
      d.r(3, 6, 1, 12, "#7a4a2a");
      d.r(7, 4, 1, 14, "#7a4a2a");
      d.r(10, 6, 1, 12, "#7a4a2a");
      d.r(9, 10, 2, 2, "#FFEC27");
      d.p(9, 12, "#FFEC27");
    });
  const chestSprite = () =>
    sprite("kfchest", 16, 13, (d) => {
      d.r(1, 5, 14, 8, "#2d7fa8");
      d.r(1, 1, 14, 5, "#1d5a7c");
      d.r(2, 0, 12, 1, "#1d5a7c");
      d.r(1, 5, 14, 1, "#FFCC4D");
      d.r(1, 12, 14, 1, "#155072");
      d.r(7, 4, 2, 4, "#FFCC4D");
      d.r(4, 2, 3, 2, "#FFF1E8");
      d.r(9, 2, 3, 2, "#FFF1E8");
      d.p(7, 2, "#c2c3c7");
      d.p(8, 2, "#c2c3c7");
      d.r(2, 7, 1, 4, "#5fb4dc");
    });

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
    f_rationalize: (d, c, w) => {
      d.line(3, 13, 6, 12, c, 2);
      d.line(6, 12, 9, 19, c, 2);
      d.line(9, 19, 12, 5, c, 2);
      d.line(12, 5, 21, 5, c, 2);
      d.r(14, 9, 2, 6, w);
      d.r(18, 9, 2, 6, w);
    },
    f_factor: (d, c, w) => {
      for (const x of [3, 13]) {
        d.line(x + 2, 6, x, 12, c);
        d.line(x, 12, x + 2, 18, c);
        d.line(x + 6, 6, x + 8, 12, c);
        d.line(x + 8, 12, x + 6, 18, c);
        d.r(x + 3, 11, 3, 2, w);
      }
    },
    f_slope: (d, c, w) => {
      d.line(3, 19, 20, 5, c, 2);
      d.line(6, 17, 16, 17, w);
      d.line(16, 17, 16, 9, w);
    },
    f_exponent: (d, c, w) => {
      d.line(3, 9, 12, 20, c, 2);
      d.line(12, 9, 3, 20, c, 2);
      d.r(15, 3, 5, 2, w);
      d.r(18, 5, 2, 2, w);
      d.r(15, 7, 5, 2, w);
    },
    f_compose: (d, c, w) => {
      for (let k = 0; k < 48; k++) {
        const t = (k / 48) * Math.PI * 2;
        d.p(
          9 + Math.round(Math.cos(t) * 6),
          12 + Math.round(Math.sin(t) * 6),
          c,
        );
        d.p(
          15 + Math.round(Math.cos(t) * 6),
          12 + Math.round(Math.sin(t) * 6),
          w,
        );
      }
    },
    f_trig: (d, c, w) => {
      for (let x = 2; x < 22; x++)
        d.r(x, 12 - Math.round(Math.sin((x - 2) / 3.2) * 7), 1, 2, c);
      d.line(2, 12, 21, 12, w);
    },
    f_area: (d, c, w) => {
      for (let y = 6; y < 20; y++) d.r(4 + (19 - y) / 2, y, 1 + (y - 6), 1, c);
      d.line(4, 19, 19, 19, w);
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
    const def = UNIT_SKILLS[id] || FOUNDATIONS[id] || EQUIPMENT[id],
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
      if (!tabletOpen(tab)) continue;
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
    const door = kf.world.door;
    if (door && !door.used && !door.locked) {
      const x = Math.round(door.x - camX),
        y = Math.round(door.y - camY),
        dist = Math.hypot(api.px() - door.x, api.py() - door.y);
      if (on(x, y)) {
        if (door.revealed) {
          api.drawShadow(ctx, x, y + 2, 16);
          blit(ctx, doorSprite(), x, y + 3);
          if (Math.floor(t * 3) % 2)
            api.drawRect(ctx, x - 1, y - 24, 3, 3, "#FFEC27");
        } else if (dist < 140) {
          ctx.globalAlpha = 0.25 + 0.2 * Math.sin(t * 5);
          api.drawLine(ctx, x - 5, y - 10, x - 1, y - 4, "#c2c3c7");
          api.drawLine(ctx, x - 1, y - 4, x + 3, y - 8, "#c2c3c7");
          api.drawLine(ctx, x + 3, y - 8, x + 6, y - 2, "#c2c3c7");
          ctx.globalAlpha = 1;
        }
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
    if (item.kind === "kfchest") {
      api.drawShadow(ctx, x, y + 6, 16);
      blit(ctx, chestSprite(), x, y + 6);
      if (Math.floor(api.now * 6) % 2)
        api.drawRect(
          ctx,
          x + Math.round(Math.sin(api.now * 7) * 7),
          y - 9,
          2,
          2,
          "#c8ecff",
        );
    } else if (item.kind === "kfgear") {
      const img = icon("kf_" + item.gear);
      api.drawShadow(ctx, x, y + 6, 14);
      api.drawRect(ctx, x - 8, y - 9, 16, 16, "#FFEC27");
      if (img) ctx.drawImage(img, x - 7, y - 8, 14, 14);
      if (Math.floor(api.now * 5) % 2)
        api.drawRing(ctx, x, y - 1, 12, "#FFEC27", 2, 1);
    }
  }

  function drawEffects(ctx, camX, camY) {
    const a = api.a,
      kf = a?.kf;
    if (!kf) return;
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
        const reach = 110 * area();
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
          r = 70 * area();
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
        const p = P(),
          spark = sparkOn("u8_area");
        ctx.globalAlpha = FX * 0.7;
        for (let k = 0; k < 64; k++) {
          const th = (k / 64) * Math.PI * 2,
            r1 = (28 + 5 * Math.sin(3 * th + (s.ph || 0))) * area(),
            r2 =
              (54 + 5 * Math.sin(3 * th - (s.ph || 0)) + (spark ? 8 : 0)) *
              area();
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
              r = 58 * area() * Math.cos(s.k * th);
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

  // Right-hand HUD column: a small chest bar, then unit skills and equipment.
  function drawHud(ctx, right, y) {
    const a = api.a,
      kf = a?.kf;
    if (!kf) return y;
    const pal = api.pal;
    y += 3;
    // Chest bar: a small chest and a thin bar, no text. Bright for a moment
    // after it grows, dim in calm moments; it blinks while a chest waits.
    const lit = kf.chestOut || api.now - kf.chestFlash < 2.5,
      blink = kf.chestOut && Math.floor(api.now * 3) % 2 === 0,
      cx = right - 52;
    ctx.globalAlpha = lit ? 1 : 0.6;
    api.drawRect(ctx, cx - 1, y - 1, 9, 8, pal.black);
    api.drawRect(ctx, cx, y + 1, 7, 5, blink ? pal.yellow : "#2d7fa8");
    api.drawRect(ctx, cx + 1, y, 5, 1, "#1d5a7c");
    api.drawRect(ctx, cx, y + 2, 7, 1, "#FFCC4D");
    api.drawRect(ctx, cx + 3, y + 2, 1, 2, "#FFCC4D");
    api.drawRect(ctx, right - 42, y + 1, 42, 5, pal.black);
    api.drawRect(
      ctx,
      right - 41,
      y + 2,
      Math.round(40 * clamp(kf.chest, 0, 1)),
      3,
      kf.chestOut ? pal.yellow : "#29ADFF",
    );
    ctx.globalAlpha = 1;
    y += 11;
    const row = [];
    for (const [id, s] of Object.entries(kf.unit))
      row.push({
        icon: "kf_" + id,
        col: UNIT_SKILLS[id].col,
        lv: s.lv,
        max: 3,
        spark: sparkOn(id),
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
        api.drawRect(
          ctx,
          x - 1,
          y - 1,
          size + 2,
          size + 2,
          it.spark ? pal.yellow : it.col,
        );
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
    // Foundations and the weekly rules live on the pause screen; a spark
    // shows as a yellow frame on its unit skill.
    return y;
  }

  // At most two edge arrows, and never for something already on screen: one
  // objective (the nearest ready tablet you cannot see, so standing at the ★
  // tablet points you to the ★★ one; else a lair that just appeared or is
  // fighting; else a found room door) and the nearest dropped chest or gear.
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
      ),
      door = kf.world.door;
    if (tab)
      marks.push({
        x: tab.x,
        y: tab.y,
        col: TABLETS[tab.tier - 1].col,
        label: "*".repeat(tab.tier),
      });
    else if (lair)
      marks.push({ x: lair.x, y: lair.y, col: "#FF004D", label: "!" });
    else if (door && door.revealed && !door.used && away(door))
      marks.push({ x: door.x, y: door.y, col: "#FFEC27", label: "?" });
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
      if (!armedWeekly) return;
      const w = armedWeekly;
      armedWeekly = null;
      a.kf.weekly = w;
      a.units = [w.unit];
      a.curUnit = w.unit;
      a.diff = "normal";
      a.qdiff = "mixed";
      a.hero = w.hero;
      api.recompute();
      a.p.hp = a.p.maxHp;
    },
    update(dt) {
      const a = api.a,
        kf = a?.kf;
      if (!kf || !a.p || api.mode !== "play") return;
      // Real time jumped: a question or panel just closed. Rest before any
      // tablet lights up again, so questions never come back to back.
      if (kf.lastNow && api.now - kf.lastNow > 0.5)
        kf.restUntil = Math.max(kf.restUntil, a.t + PACE.restAfterModal);
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
      if (a.themeTr) return;
      ensureWorld();
      if (tickLairs(dt)) return;
      if (!calm()) return;
      if (tickTablets()) return;
      tickDoor();
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
        a.picks.push({
          kind: "kfgear",
          kf: true,
          persist: true,
          gear: def.gear,
          x: e.x,
          y: e.y,
          t0: a.t,
        });
        say(
          api.zh ? "小首领被击败！" : "MINI-BOSS DOWN!",
          def.col,
          (api.zh ? "掉落：" : "Dropped: ") + L(EQUIPMENT[def.gear].name),
        );
        addChest(CHEST.miniBoss);
        return;
      }
      addChest(e.elite ? CHEST.elite : CHEST.kill);
      const growth = kf.unit.u7_growth;
      if (growth) {
        const cap =
          UNIT_SKILLS.u7_growth.cap[growth.lv - 1] +
          (sparkOn("u7_growth") ? 6 : 0);
        kf.growth = Math.min(cap, kf.growth + 1);
        kf.growthT = a.t;
      }
      if (kf.unit.u6_accum) kf.unit.u6_accum.n = (kf.unit.u6_accum.n || 0) + 1;
      if (e.kfBand > a.t && sparkOn("u1_asymptote"))
        blast(e.x, e.y, 24, 20, UNIT_SKILLS.u1_asymptote.col);
    },
    onUnitChange(prev, next) {
      const kf = kfOf();
      if (!kf) return;
      const faded = Object.keys(kf.unit).filter(
        (id) => UNIT_SKILLS[id].unit !== next,
      );
      if (!faded.length) return;
      let mastered = 0;
      for (const id of faded) {
        if (kf.unit[id].lv >= 3) mastered++;
        delete kf.unit[id];
        delete kf.sparks[id];
      }
      kf.residue += mastered * RESIDUE_PER_MASTERED;
      if (!kf.unit.u7_growth) kf.growth = 0;
      const names = faded
        .map((id) => L(UNIT_SKILLS[id].name))
        .join(api.zh ? "、" : ", ");
      after(3, () =>
        say(
          api.zh ? `第 ${prev} 单元技能结束` : `UNIT ${prev} SKILLS FADE`,
          "#83769C",
          names +
            (mastered
              ? api.zh
                ? ` · 知识沉淀 +${mastered * 3}% 伤害`
                : ` · knowledge kept: +${mastered * 3}% damage`
              : ""),
        ),
      );
    },
    answerCards(q, correct, cards) {
      const kf = kfOf();
      if (!kf || !q) return cards;
      const tier = q.kfTier || clamp(Math.round(q.tier || 1), 1, 3);
      if (correct)
        q.kfGain = addChest(
          q.kfSource === "tablet"
            ? TABLETS[tier - 1].chest
            : CHEST.levelQuestion[tier - 1],
        );
      if (q.kfSource !== "tablet" || !correct) return cards;
      return tabletCards(tier);
    },
    afterReveal(root, q, correct) {
      if (!kfOf() || !q || !root) return;
      const fb = root.querySelector("#qfb");
      if (!fb) return;
      const notes = [];
      if (correct && q.kfGain)
        notes.push(
          (api.zh ? "宝箱进度 +" : "Chest +") +
            Math.round(q.kfGain * 100) +
            "%",
        );
      if (!notes.length) return;
      const p = (api.doc() || document).createElement("p");
      p.className = "kf-note";
      p.textContent = notes.join(" · ");
      fb.appendChild(p);
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
      if (card.kf === "unit") gainUnitSkill(card.id);
      else if (card.kf === "found") gainFoundation(card.id);
      else if (card.kf === "foundBoth") card.ids.forEach(gainFoundation);
      else if (card.kf === "equipSwap") equipGear(card.gear, card.slot);
      else if (card.kf === "salvage") addChest(CHEST.salvage, true);
      return true;
    },
    pickup(item) {
      const kf = kfOf();
      if (!kf || !item?.kf) return;
      if (item.kind === "kfchest") {
        kf.chestOut = false;
        kf.stats.opened++;
        if (kf.chest >= 1) dropChest();
        openCardPanel(
          chestCards(),
          api.zh ? "知识宝箱" : "KNOWLEDGE CHEST",
          api.zh ? "答题攒出来的奖励" : "Earned by your answers",
          api.zh
            ? "3 选 1：本单元技能、进化或升级"
            : "Pick 1 of 3: a unit skill, an evolution or an upgrade",
        );
      } else if (item.kind === "kfgear") offerGear(item.gear);
    },
    damageMult(e) {
      const kf = kfOf();
      if (!kf || !e) return 1;
      let m = 1 + kf.residue + 0.04 * foundLv("f_factor");
      if (kf.growth && kf.unit.u7_growth) m *= Math.pow(1.03, kf.growth);
      const tough = e.elite || e.kf?.boss || e.role === "armor";
      if (tough && foundLv("f_rationalize"))
        m *= 1 + 0.08 * foundLv("f_rationalize");
      const lh = kf.unit.u4_lhopital;
      if (lh && (e.elite || e.kf?.boss)) {
        const spark = sparkOn("u4_lhopital");
        m *= 1 + UNIT_SKILLS.u4_lhopital.bonus[lh.lv - 1] + (spark ? 0.2 : 0);
        if (spark) e.slowUntil = Math.max(e.slowUntil || 0, api.a.t + 0.4);
      }
      if (weeklyHas("glass")) m *= 1.3;
      return m;
    },
    cooldownFactor() {
      const kf = kfOf(),
        rate = kf?.unit?.u2_rate;
      if (!rate || !api.a.p?.moving) return 1;
      let bonus = UNIT_SKILLS.u2_rate.bonus[rate.lv - 1];
      if (sparkOn("u2_rate") && kf.moveT >= 2) bonus *= 2;
      return 1 / (1 + bonus);
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
    applyStats(st) {
      const kf = kfOf();
      if (!kf) return;
      st.speed *=
        (1 + 0.05 * foundLv("f_slope")) * (weeklyHas("swift") ? 1.15 : 1);
      st.xp += 0.06 * foundLv("f_exponent");
    },
    afterStats() {
      const a = api.a;
      if (!weeklyHas("glass") || !a.p) return;
      a.p.maxHp = Math.round(a.p.maxHp * 0.7);
      a.p.hp = Math.min(a.p.hp, a.p.maxHp);
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
    key(event) {
      if (api.overlay.mode !== "kfdrill" || !room) return false;
      const keys = {
        KeyA: 0,
        KeyB: 1,
        KeyC: 2,
        KeyD: 3,
        Digit1: 0,
        Digit2: 1,
        Digit3: 2,
        Digit4: 3,
        Numpad1: 0,
        Numpad2: 1,
        Numpad3: 2,
        Numpad4: 3,
      };
      if (!room.answered && event.code in keys && !event.repeat)
        answerDrill(keys[event.code]);
      else if (
        room.answered &&
        ["Enter", "Space", "NumpadEnter"].includes(event.code) &&
        !event.repeat
      ) {
        event.preventDefault?.();
        nextDrill();
      }
      return true;
    },
    weekly() {
      const counts = api.bridge?.counts || {},
        units = Object.keys(counts)
          .map(Number)
          .filter((n) => n >= 1 && n <= 10 && counts[n] > 0)
          .sort((x, y) => x - y);
      return weeklyChallenge(new Date(), {
        heroes: api.heroIds(),
        guns: api.gunIds(),
        units: units.length ? units : undefined,
      });
    },
    decorateMenu(root) {
      const row = root?.querySelector(".mrow");
      if (!row || root.querySelector(".kf-week")) return;
      const w = this.weekly(),
        best = api.save.d.kfWeekly?.[w.id] || 0,
        rules = w.rules
          .map((r) => L(WEEKLY_RULES[r].name))
          .join(api.zh ? "、" : ", ");
      const box = (api.doc() || document).createElement("div");
      box.className = "kf-week";
      box.innerHTML = `<button type="button" id="mWeek">${api.zh ? "本周挑战" : "Weekly challenge"} <s>${api.esc(w.id)}</s></button><span>${api.esc(
        api.zh
          ? `第 ${w.unit} 单元 · ${api.heroName(w.hero)} + ${api.gunName(w.cls)} · ${rules}${best ? ` · 本周最佳 ${best}` : ""}`
          : `Unit ${w.unit} · ${api.heroName(w.hero)} + ${api.gunName(w.cls)} · ${rules}${best ? ` · best this week ${best}` : ""}`,
      )}</span>`;
      row.after(box);
      box.querySelector("#mWeek").onclick = () => {
        armedWeekly = w;
        api.startRun(w.cls);
      };
    },
    onResults(result) {
      const kf = kfOf(),
        w = kf?.weekly;
      if (!w) return;
      const store = (api.save.d.kfWeekly ||= {}),
        prev = store[w.id] || 0,
        better = result.total > prev;
      if (better) store[w.id] = result.total;
      for (const id of Object.keys(store).sort().slice(0, -4)) delete store[id];
      api.save.save();
      const panel = api.overlay.el?.querySelector(".panel");
      if (!panel) return;
      const p = (api.doc() || document).createElement("p");
      p.className = "kf-week-result";
      p.textContent = api.zh
        ? `本周挑战 ${w.id}：${result.total}${better ? " · 本周新纪录！" : ` · 本周最佳 ${prev}`}`
        : `Weekly ${w.id}: ${result.total}${better ? " · new best this week!" : ` · best this week ${prev}`}`;
      panel.prepend(p);
    },
    // Extra rows for the pause screen's build list.
    buildItems() {
      const kf = kfOf();
      if (!kf) return "";
      // Same tile shape as weapons and passives; the title carries the category.
      const row = (id, name, tag, title, cls = "") =>
        `<li${cls ? ` class="${cls}"` : ""} title="${api.esc(title)}"><span data-bi="k:kf_${id}"></span><b>${api.esc(name)}</b><em>${api.esc(tag)}</em></li>`;
      const out = [];
      for (const [id, s] of Object.entries(kf.unit))
        out.push(
          row(
            id,
            L(UNIT_SKILLS[id].name),
            `Lv ${s.lv}`,
            L(CAT.unit) +
              (sparkOn(id)
                ? " · " +
                  (api.zh ? "火花：" : "Spark: ") +
                  L(UNIT_SKILLS[id].sparkName)
                : ""),
            sparkOn(id) ? "evo" : "",
          ),
        );
      for (const [id, lv] of Object.entries(kf.found))
        out.push(row(id, L(FOUNDATIONS[id].name), `Lv ${lv}`, L(CAT.found)));
      for (const g of kf.gear)
        if (g)
          out.push(
            row(g.id, L(EQUIPMENT[g.id].name), `Lv ${g.lv}`, L(CAT.gear)),
          );
      if (kf.residue > 0)
        out.push(
          `<li><span></span><b>${api.zh ? "知识沉淀" : "Knowledge kept"}</b><em>+${Math.round(kf.residue * 100)}%</em></li>`,
        );
      if (kf.weekly?.rules?.length)
        out.push(
          `<li title="${api.esc(kf.weekly.rules.map((r) => L(WEEKLY_RULES[r].info)).join(" "))}"><span></span><b>${api.zh ? "本周挑战" : "Weekly"}</b><em>${api.esc(kf.weekly.rules.map((r) => L(WEEKLY_RULES[r].name)).join(" · "))}</em></li>`,
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
      addChest,
      tabletCards,
      chestCards,
      gainUnitSkill,
      gainFoundation,
      ensureWorld,
      markerTargets,
      tabletOpen,
      tabletsReady,
      hint,
      hit,
      offerGear,
      unitCard,
      sparkOn,
      ENGINES,
      GEAR,
    },
  };
}
