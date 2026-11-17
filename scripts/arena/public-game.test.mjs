import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parse } from "acorn";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { arenaContext } from "./test-runtime.mjs";

const html = readFileSync(
  new URL("../../public/games/limit-arena.html", import.meta.url),
  "utf8",
);
const code = readFileSync(
  new URL("../../public/games/limit-arena.js", import.meta.url),
  "utf8",
);

test("the archived generator cannot overwrite either maintained game file", () => {
  for (const filename of ["limit-arena.html", "limit-arena.js"]) {
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
  assert.ok(
    html.length + code.length < 1_000_000,
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
