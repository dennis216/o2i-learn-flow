import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authReturnTo } from './authReturnTo.ts';
test('login returns only to supported local course and quiz URLs', () => {
  for (const path of ['/courses', '/courses?course=abc&lesson=def&unit=4', '/quiz?topic=abc']) assert.equal(authReturnTo(path), path);
  for (const path of ['https://evil.example', '//evil.example/courses', '/courses/evil', '/courses?x=\\evil', '/courses?x=\n']) assert.equal(authReturnTo(path), '/');
});
