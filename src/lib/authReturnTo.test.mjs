import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authReturnTo } from './authReturnTo.ts';
test('login returns only to supported local URLs', () => {
  for (const path of ['/courses', '/courses?course=abc&lesson=def&unit=4', '/quiz?topic=abc', '/practice', '/arena', '/solution-requests', '/profile']) assert.equal(authReturnTo(path), path);
  for (const path of ['https://evil.example', '//evil.example/courses', '/courses/evil', '/arena/evil', '/profile?x=1', '/admin', '/courses?x=\\evil', '/courses?x=\n']) assert.equal(authReturnTo(path), '/');
});
