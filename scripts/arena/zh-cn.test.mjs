import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { arenaContext } from "./test-runtime.mjs";
import { legacyStaticTranslations } from "../../public/games/limit-arena.js";

const zh = JSON.parse(
  readFileSync(
    new URL("./fixtures/legacy-zh-CN.json", import.meta.url),
    "utf8",
  ),
);
const entries = Object.entries(zh.strings);
const tags = (text) => (text.match(/<\/?[a-z][^>]*>/gi) ?? []).sort();
const rich = (text) => (text.match(/\[\w\]|\[\/\]/g) ?? []).sort();

test("archive comparison translations keep the markup of its source", () => {
  for (const [source, value] of entries) {
    assert.deepEqual(tags(value), tags(source), source);
    assert.deepEqual(rich(value), rich(source), source);
  }
});

test("archive comparison template placeholders line up with their source", () => {
  for (const [source, value] of entries) {
    const count = source.split("{}").length - 1;
    const sequential = value.split("{}").length - 1;
    const numbered = [...value.matchAll(/\{(\d+)\}/g)].map((match) =>
      Number(match[1]),
    );
    assert.ok(
      sequential === count || (sequential === 0 && numbered.length > 0),
      source,
    );
    assert.ok(
      numbered.every((index) => index < count),
      source,
    );
  }
});

test("the font subset covers every Chinese character", () => {
  const chars = new Set(
    readFileSync(
      new URL("./fonts/cubic-zh-subset.chars.txt", import.meta.url),
      "utf8",
    ),
  );
  const missing = [
    ...new Set(
      JSON.stringify({
        ...legacyStaticTranslations,
        ...arenaContext({ i: true }).O,
      }),
    ),
  ].filter((ch) => ch.charCodeAt(0) > 0x2e7f && !chars.has(ch));
  assert.deepEqual(missing, []);
});

test("the pixel font includes newly added Chinese UI labels in the shipped game", () => {
  const html = readFileSync(
    new URL("../../public/games/limit-arena.html", import.meta.url),
    "utf8",
  );
  const runtime = readFileSync(
    new URL("../../public/games/limit-arena.js", import.meta.url),
    "utf8",
  );
  const scratchpad = readFileSync(
    new URL("../../public/games/arena-scratchpad.js", import.meta.url),
    "utf8",
  );
  const knowledge = readFileSync(
    new URL("../../public/games/arena-knowledge.js", import.meta.url),
    "utf8",
  );
  const decoded = (html + runtime + scratchpad + knowledge).replace(
    /\\u([0-9a-fA-F]{4})/g,
    (_, hex) => String.fromCharCode(parseInt(hex, 16)),
  );
  const chars = new Set(
    readFileSync(
      new URL("./fonts/cubic-zh-subset.chars.txt", import.meta.url),
      "utf8",
    ),
  );
  assert.deepEqual(
    [...new Set(decoded.match(/[\u4e00-\u9fff]/g))].filter(
      (ch) => !chars.has(ch),
    ),
    [],
  );
  const embedded = html.match(
    /font-family:CubicZh;src:url\(data:font\/woff;base64,([A-Za-z0-9+/=]+)/,
  )[1];
  const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
  assert.equal(
    digest(Buffer.from(embedded, "base64")),
    digest(
      readFileSync(new URL("./fonts/cubic-zh-subset.woff", import.meta.url)),
    ),
    "embedded font must match the maintained font asset",
  );
});

test("the actual runtime supplies Chinese and English hero and weapon names", () => {
  const en = arenaContext({ i: false }),
    zh = arenaContext({ i: true });
  for (const id of Object.keys(en.Nt)) {
    assert.notEqual(en.Nt[id].name, zh.Nt[id].name, id);
  }
  for (const id of Object.keys(en.xt)) {
    assert.notEqual(en.xt[id].name, zh.xt[id].name, id);
  }
  assert.equal(zh.Nt.redred.name, "小红");
  assert.equal(en.Nt.redred.name, "redred");
});
