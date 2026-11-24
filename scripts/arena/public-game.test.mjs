import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parse } from "acorn";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { arenaContext } from "./test-runtime.mjs";
import {
  normalizedPoint,
  paintSegment,
} from "../../public/games/arena-scratchpad.js";

const html = readFileSync(
  new URL("../../public/games/limit-arena.html", import.meta.url),
  "utf8",
);
const code = readFileSync(
  new URL("../../public/games/limit-arena.js", import.meta.url),
  "utf8",
);

test("the archived generator cannot overwrite maintained game or scratchpad files", () => {
  for (const filename of [
    "limit-arena.html",
    "limit-arena.js",
    "arena-scratchpad.js",
  ]) {
    const target = new URL(`../../public/games/${filename}`, import.meta.url);
    const before = readFileSync(target);
    const result = spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL("./prepare-game.mjs", import.meta.url)),
        "unused-archive.html",
        "--questions",
        "unused-questions.json",
        "--out",
        fileURLToPath(target),
      ],
      { encoding: "utf8" },
    );
    assert.ifError(result.error);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Refusing to overwrite/);
    assert.deepEqual(readFileSync(target), before);
  }
});

test("the public game holds no question data or global debug hooks", () => {
  for (const banned of [
    "QBANK",
    '"exp":',
    '"stem":',
    "correctKey",
    "__dbg",
    "render_game_to_text",
    "advanceTime",
  ]) {
    assert.ok(!(html + code).includes(banned), banned);
  }
  // Size guard against a bundled question bank or build output, not a budget for
  // features: raised from 1,000,000 when the iPad setup and accessory work landed.
  assert.ok(
    html.length + code.length < 1_100_000,
    "unexpected artifact growth",
  );
});

test("the game gets questions only through its same-origin host bridge", async () => {
  const sent = [];
  const host = { postMessage: (...args) => sent.push(args) };
  const context = arenaContext({
    window: { parent: host },
    location: { origin: "https://arena.test" },
    setTimeout: () => 1,
  });
  const answer = context.Ce.call("next", { unit: 1 });
  assert.equal(sent.length, 1);
  const [request, origin] = sent[0];
  assert.equal(request.source, "limit-arena");
  assert.equal(origin, "https://arena.test");
  context.Ce.receive({
    source: host,
    origin: "https://arena.test",
    data: {
      source: "limit-arena-host",
      id: request.id,
      ok: true,
      data: { status: "empty" },
    },
  });
  assert.deepEqual(await answer, { status: "empty" });
  assert.ok(!/\bfetch\s*\(|supabase|XMLHttpRequest/i.test(code));
});

test("the shipped module parses and the HTML loads that entry point", () => {
  assert.match(
    html,
    /<script\s+type="module"\s+src="\/games\/limit-arena\.js"\s*>\s*<\/script>/,
  );
  assert.doesNotThrow(() =>
    parse(code, { ecmaVersion: "latest", sourceType: "module" }),
  );
});

test("language changes work in menus and cannot silently discard an active run", () => {
  const make = (active, accepted) => {
    const writes = [],
      calls = [];
    const context = arenaContext({
      a: active ? { p: { hp: 100 } } : {},
      I: active ? "play" : "title",
      i: false,
      Po: "lang",
      localStorage: { setItem: (...args) => writes.push(args) },
      confirm: () => accepted,
      cancelArenaPointers: () => calls.push("cancel"),
      restoreArenaDisplay: () => calls.push("restore"),
      location: { reload: () => calls.push("reload") },
    });
    context.handleLanguageChange();
    return { context, writes, calls };
  };
  const menu = make(false, false);
  assert.deepEqual(menu.writes, [["lang", "zh"]]);
  assert.deepEqual(menu.calls, ["restore", "reload"]);
  const declined = make(true, false);
  assert.equal(declined.context.I, "play");
  assert.deepEqual(declined.writes, []);
  assert.deepEqual(declined.calls, ["cancel"]);
  const accepted = make(true, true);
  assert.deepEqual(accepted.writes, [["lang", "zh"]]);
  assert.deepEqual(accepted.calls, ["cancel", "restore", "reload"]);
});

test("test runtimes keep state and registries isolated and start no browser loop", () => {
  let frames = 0;
  const first = arenaContext({ requestAnimationFrame: () => frames++ });
  const second = arenaContext();
  first.a.kills = 42;
  first.O.rifle.max = 999;
  assert.equal(second.a.kills, undefined);
  assert.notEqual(second.O.rifle.max, 999);
  assert.equal(frames, 0);
});

function fullscreenFixture(t, { ios = false, denied = false } = {}) {
  for (const [key, value] of Object.entries({
    innerWidth: 390,
    innerHeight: 844,
  })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() =>
      previous
        ? Object.defineProperty(globalThis, key, previous)
        : delete globalThis[key],
    );
  }
  const classes = new Set(["arena-expanded"]);
  const calls = [],
    notices = [],
    notice = { hidden: false };
  const document = {
    body: {
      dataset: { fullscreenMode: "page" },
      classList: {
        contains: (name) => classes.has(name),
        add: (name) => classes.add(name),
      },
    },
    querySelector: () => stage,
  };
  const stage = {
    requestFullscreen: async () => {
      calls.push("fullscreen");
      if (denied) throw new Error("denied");
      document.fullscreenElement = stage;
    },
  };
  const context = arenaContext({
    i: false,
    document,
    N: () => notice,
    window: { parent: { postMessage() {} } },
    location: { origin: "https://example.test" },
    screen: {
      orientation: { lock: async (orientation) => calls.push(orientation) },
    },
    usesPageFullscreen: () => ios,
    hasArenaTouch: () => true,
    updateFullscreenLabel() {},
    cancelArenaPointers() {},
    fitTouchStage() {},
    requestAnimationFrame() {},
    notifyDisplay: (message) => notices.push(message),
  });
  return { context, document, calls, classes, notices, notice };
}

test("a start gesture upgrades the expanded page to native full screen; landscape waits for the battle", async (t) => {
  const f = fullscreenFixture(t);
  await f.context.enterArenaFullscreen(true);
  assert.deepEqual(f.calls, []);
  await f.context.enterArenaFullscreen();
  assert.deepEqual(
    f.calls,
    ["fullscreen"],
    "hero, gun and unit menus stay free to be used upright",
  );
  assert.equal(f.document.body.dataset.fullscreenMode, "native");
  f.context.I = "play";
  f.context.lockLandscapeForRun();
  assert.deepEqual(f.calls, ["fullscreen", "landscape"]);
  f.context.lockLandscapeForRun();
  assert.equal(f.calls.length, 2, "the lock is requested once per run");
  await f.context.enterArenaFullscreen();
  assert.equal(f.calls.length, 2, "an active native session is reused");
  f.document.fullscreenElement = null;
  f.context.arenaFullscreenChanged();
  assert.equal(f.document.body.dataset.fullscreenMode, "page");
  assert(
    f.classes.has("arena-expanded"),
    "native exit keeps the stable page layout",
  );
});

test("Esc on a touch-screen laptop (mouse or trackpad) goes back to the website", async (t) => {
  const f = fullscreenFixture(t);
  const restored = [];
  f.context.hasFinePointer = () => true;
  f.context.restoreArenaDisplay = () => restored.push("restore");
  await f.context.enterArenaFullscreen();
  assert.equal(f.document.body.dataset.fullscreenMode, "native");
  f.document.fullscreenElement = null;
  f.context.arenaFullscreenChanged();
  assert.deepEqual(restored, ["restore"]);
});

test("iPad and iPhone retain the safe page player instead of reentering native fullscreen", async (t) => {
  const f = fullscreenFixture(t, { ios: true });
  await f.context.enterArenaFullscreen();
  assert.deepEqual(f.calls, []);
  assert.equal(f.document.body.dataset.fullscreenMode, "page");
  assert.deepEqual(
    f.notices,
    [],
    "no rotate notice on the menus; the battle shows the turn-your-device screen",
  );
});

test("a denied native request keeps the expanded player and says so", async (t) => {
  const f = fullscreenFixture(t, { denied: true });
  await f.context.enterArenaFullscreen();
  assert.deepEqual(f.calls, ["fullscreen"]);
  assert.equal(f.document.body.dataset.fullscreenMode, "page");
  assert(f.classes.has("arena-expanded"));
  assert.match(f.notices[0], /expanded/);
});

test("an upright battle on a touch screen pauses behind the turn-your-device screen and resumes when turned", (t) => {
  const classes = new Set(["arena-expanded", "touch"]);
  const events = [];
  const gate = { id: "landscapeGate" };
  const document = {
    body: {
      dataset: { mode: "run" },
      classList: {
        contains: (name) => classes.has(name),
        toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)),
      },
    },
  };
  const context = arenaContext({
    i: false,
    document,
    N: (id) => (id === "landscapeGate" ? gate : null),
    screen: {},
    innerWidth: 390,
    innerHeight: 664,
  });
  for (const [key, value] of Object.entries({
    innerWidth: 390,
    innerHeight: 664,
  })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
    t.after(() =>
      previous
        ? Object.defineProperty(globalThis, key, previous)
        : delete globalThis[key],
    );
  }
  const previousDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    "document",
  );
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: document,
  });
  t.after(() =>
    previousDocument
      ? Object.defineProperty(globalThis, "document", previousDocument)
      : delete globalThis.document,
  );
  context.usesTouchControls = () => classes.has("touch");
  context.Bt = {
    pause() {
      events.push("pause");
      context.I = "pause";
    },
    unpause() {
      events.push("unpause");
      context.I = "play";
    },
  };
  context.I = "play";
  context.syncLandscapeGate();
  assert.deepEqual(events, ["pause"]);
  assert(classes.has("landscape-gate"), "the turn-your-device screen shows");
  context.syncLandscapeGate();
  assert.deepEqual(events, ["pause"], "still upright: stays paused");
  globalThis.innerWidth = 844;
  globalThis.innerHeight = 390;
  context.syncLandscapeGate();
  assert.deepEqual(events, ["pause", "unpause"]);
  assert(!classes.has("landscape-gate"));
  document.body.dataset.mode = "title";
  globalThis.innerWidth = 390;
  globalThis.innerHeight = 664;
  context.I = "title";
  context.syncLandscapeGate();
  assert.deepEqual(
    events,
    ["pause", "unpause"],
    "menus are left alone when upright",
  );
  assert(!classes.has("landscape-gate"));
});

test("scratchpad coordinates remain normalized and erasing removes ink", () => {
  const rect = { left: 100, top: 50, width: 200, height: 100 };
  assert.deepEqual(normalizedPoint({ clientX: 200, clientY: 100 }, rect), {
    x: 0.5,
    y: 0.5,
  });
  assert.deepEqual(normalizedPoint({ clientX: -1, clientY: 999 }, rect), {
    x: 0,
    y: 1,
  });
  const calls = [],
    context = {
      beginPath() {},
      arc() {},
      fill: () => calls.push("dot"),
      moveTo: (...point) => calls.push(point),
      lineTo: (...point) => calls.push(point),
      stroke() {},
    };
  const from = { x: 0.25, y: 0.5 },
    to = { x: 0.75, y: 0.5 };
  paintSegment(context, { tool: "pen" }, from, to, 200, 100);
  assert.equal(context.globalCompositeOperation, "source-over");
  assert.deepEqual(calls, [
    [50, 50],
    [150, 50],
  ]);
  paintSegment(context, { tool: "eraser" }, to, to, 200, 100);
  assert.equal(context.globalCompositeOperation, "destination-out");
  assert.equal(calls.at(-1), "dot");
});
