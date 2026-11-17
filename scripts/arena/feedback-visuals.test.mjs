import { arenaContext, originalArenaBinding } from "./test-runtime.mjs";
import assert from "node:assert/strict";

import { test } from "node:test";

function fixture() {
  const a = {
    cls: "rifle",
    t: 10,
    p: { x: 100, y: 107, dx: 1, dy: 0 },
    proj: [],
    fx: [],
  };
  const ctx = arenaContext({
    a,
    Math,
    X: () => a.p.x,
    _: () => a.p.y - 7,
    s: {},
    Yt: [{}],
  });
  return { a, ctx };
}
test("compact weapon sprites distinguish sniper, rifle, shotgun and boomerang", () => {
  const f = fixture();
  const art = new Set();
  for (const id of [
    "sniper",
    "rifle",
    "shotgun",
    "darts",
    "vectorbow",
    "integral",
  ]) {
    const spec = f.ctx.heldWeaponSpec(id);
    assert(spec.width <= 9);
    assert.equal(spec.pixels.length, 5);
    assert(spec.pixels.every((row) => row.length === spec.width));
    art.add(spec.pixels.join(""));
  }
  assert.equal(art.size, 6);
  assert(
    f.ctx.heldWeaponSpec("sniper").width > f.ctx.heldWeaponSpec("rifle").width,
  );
});
test("main projectile origins and muzzle positions agree at every aim angle without moving companions", () => {
  for (const id of [
    "sniper",
    "rifle",
    "shotgun",
    "darts",
    "vectorbow",
    "integral",
  ])
    for (let step = 0; step < 16; step++) {
      const f = fixture(),
        angle = (step * Math.PI) / 8;
      f.a.cls = id;
      const tip = f.ctx.weaponMuzzle(angle);
      f.ctx.ie({
        main: true,
        vx: Math.cos(angle) * 100,
        vy: Math.sin(angle) * 100,
      });
      assert.equal(f.a.proj[0].x, tip.x);
      assert.equal(f.a.proj[0].y, tip.y);
      f.ctx.ie({ vx: 100, vy: 0 });
      assert.equal(f.a.proj[1].x, 100);
      assert.equal(f.a.proj[1].y, 100);
      f.a.p.x += 5;
      assert.equal(f.ctx.weaponMuzzle(angle).x, tip.x + 5);
    }
});
test("the four world elites use distinct coherent pixel sprites and keep the crown layer", () => {
  const f = fixture(),
    bodies = new Set();
  f.ctx.Ct = (ctx, key, body) => {
    assert(body.every((row) => row.length === 12));
    bodies.add(body.join(""));
  };
  for (const kind of ["snow", "rainforest", "desert", "book"]) {
    assert(f.ctx.drawWorldElite({}, kind, 0, 0, { scale: 2 }));
  }
  assert.equal(bodies.size, 4);
  f.ctx.Yt[0] = { worldKind: "snow" };
  assert.equal(
    f.ctx.drawWorldEnemy({}, { elite: true }, 0, 0, { layer: "crown" }),
    false,
  );
});
test("magnet is one pixel larger than the heart in each dimension, with no oversized halo", () => {
  const f = fixture();
  let image;
  f.ctx.re = (ctx, sprite, palette, x, y, options) =>
    (image = { sprite, x, y, options });
  f.ctx.drawCenteredMagnet({});
  assert.equal(image.sprite[0].length, 10);
  assert.equal(image.sprite.length, 9);
  assert.equal(image.options.scale, 1);
  let halos = 0;
  f.ctx.Ht = () => halos++;
  f.ctx.drawMagnetPickup(
    { save() {}, translate() {}, restore() {} },
    9.5,
    10.5,
  );
  assert.equal(halos, 0);
});
test("exhausted question pools stop issuing requests but network and rate limits remain distinct", () => {
  const f = fixture();
  let calls = 0;
  Object.assign(f.ctx, {
    I: "play",
    Ce: {
      call() {
        calls++;
        return Promise.resolve({ status: "empty" });
      },
    },
    fe: () => ({ tier: 0 }),
    E: 10,
  });
  f.a.questionPoolExhausted = true;
  f.ctx.vi();
  assert.equal(calls, 0);
  assert.equal(f.a.lvQ.status, "exhausted");
  const fresh = arenaContext();
  fresh.tt.load();
  fresh.On("rifle");
  assert.equal(fresh.a.questionPoolExhausted, false);
  const ui = {
    ...originalArenaBinding(f.ctx, "Bt"),
    show(html) {
      this.html = html;
    },
    cardsFor() {},
    quizExhausted() {
      this.exhausted = true;
    },
  };
  f.ctx.fa = () => [];
  for (const status of ["empty", "exhausted"]) {
    ui.exhausted = false;
    ui.quizUnavailable(status);
    assert(ui.exhausted);
  }
  for (const status of ["rate_limited", "unavailable"]) {
    f.a.questionPoolExhausted = false;
    ui.quizUnavailable(status);
    assert.equal(f.a.questionPoolExhausted, false);
    assert(
      ui.html.includes(
        status === "rate_limited" ? "question limit" : "did not respond",
      ),
    );
  }
});
test("exhaustion reward UI offers normal upgrades without modifying quiz statistics", () => {
  const f = fixture();
  const cards = [];
  Object.assign(f.ctx, {
    i: false,
    I: "quiz",
    rs: (n) => Array(n).fill({ id: "skill" }),
    a: { answered: 13, correct: 9 },
  });
  const ui = { quizExhausted: originalArenaBinding(f.ctx, "Bt").quizExhausted };
  ui.show = (html) => {
    assert(!html.includes("qfb no"));
    assert(html.includes("NO NEW QUESTIONS"));
  };
  ui.cardsFor = (options, title, basic) => cards.push({ options, basic });
  ui.quizExhausted();
  assert.equal(cards[0].options.length, 3);
  assert.equal(cards[0].basic, false);
  assert.deepEqual(f.ctx.a, { answered: 13, correct: 9 });
});

test("hint glyphs are cropped to their visible pixels before they are aligned", () => {
  const ctx = arenaContext({ Math });
  const image = { width: 8, height: 7, data: new Uint8ClampedArray(8 * 7 * 4) };
  assert.equal(ctx.inkBounds(image), null);
  for (const [x, y] of [
    [2, 3],
    [5, 3],
    [4, 5],
  ])
    image.data[(y * 8 + x) * 4 + 3] = 255;
  const bounds = ctx.inkBounds(image);
  assert.equal(bounds.x, 2);
  assert.equal(bounds.y, 3);
  assert.equal(bounds.w, 4);
  assert.equal(bounds.h, 3);
  image.data[(6 * 8 + 7) * 4 + 3] = 1;
  const edge = ctx.inkBounds(image);
  assert.equal(edge.w, 6);
  assert.equal(edge.h, 4);
});
