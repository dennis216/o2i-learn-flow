import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const zh = JSON.parse(readFileSync(new URL('./zh-CN.json', import.meta.url), 'utf8'));
const entries = Object.entries(zh.strings);
const tags = text => (text.match(/<\/?[a-z][^>]*>/gi) ?? []).sort();
const rich = text => (text.match(/\[\w\]|\[\/\]/g) ?? []).sort();

test('every translation keeps the markup of its source', () => {
  for (const [source, value] of entries) {
    assert.deepEqual(tags(value), tags(source), source);
    assert.deepEqual(rich(value), rich(source), source);
  }
});

test('template placeholders line up with their source', () => {
  for (const [source, value] of entries) {
    const count = source.split('{}').length - 1;
    const sequential = value.split('{}').length - 1;
    const numbered = [...value.matchAll(/\{(\d+)\}/g)].map(match => Number(match[1]));
    assert.ok(sequential === count || (sequential === 0 && numbered.length > 0), source);
    assert.ok(numbered.every(index => index < count), source);
  }
});

test('the font subset covers every Chinese character', () => {
  const chars = new Set(readFileSync(new URL('./fonts/cubic-zh-subset.chars.txt', import.meta.url), 'utf8'));
  const missing = [...new Set(Object.values(zh.strings).concat(Object.values(zh.static)).join(''))]
    .filter(ch => ch.charCodeAt(0) > 0x2e7f && !chars.has(ch));
  assert.deepEqual(missing, []);
});
