import { arenaContext } from "./test-runtime.mjs";
import assert from "node:assert/strict";

import { test } from "node:test";

test("ordinary monster magnet drops have 81.225% of the heart probability without XP/cooldown gating", () => {
  let roll = 0;
  const a = {
    t: 10,
    kills: 0,
    ls: {},
    p: { hp: 100, maxHp: 100 },
    picks: [],
    gems: [],
    fx: [],
    magnetUntil: 100,
    lastMagnetSpawn: 10,
  };
  const context = arenaContext({
    a,
    Math: Object.assign(Object.create(Math), { random: () => roll }),
    H: () => 0,
    ht: () => false,
    s: {},
    ua() {},
    _t() {},
    K() {},
    q: () => 0,
    $: { boom() {} },
    yt() {},
  });

  for (let n = 0; n < 20000; n++) {
    roll = (n + 0.5) / 20000;
    context.Jn({
      dead: false,
      x: 100,
      y: 100,
      xp: 1,
      r: 3,
      mark: 0,
      burn: 0,
      shock: 0,
    });
  }
  assert.equal(a.picks.filter((p) => p.kind === "heart").length, 180);
  assert.equal(a.picks.filter((p) => p.kind === "magnet").length, 146);
});
