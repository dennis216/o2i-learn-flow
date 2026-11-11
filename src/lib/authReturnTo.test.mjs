import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authReturnTo } from './authReturnTo.ts';
test('login returns only to supported local URLs', () => {
  for (const path of ['/courses', '/courses?course=abc&lesson=def&unit=4', '/quiz?topic=abc', '/practice', '/arena', '/solution-requests', '/profile', '/solution-requests/0f8fad5b-d9cb-469f-a165-70867728950e']) assert.equal(authReturnTo(path), path);
  for (const path of ['https://evil.example', '//evil.example/courses', '/courses/evil', '/arena/evil', '/profile?x=1', '/admin', '/courses?x=\\evil', '/courses?x=\n', '/solution-requests/evil', '/solution-requests/0f8fad5b-d9cb-469f-a165-70867728950e/x', '/solution-requests//evil.example']) assert.equal(authReturnTo(path), '/');
});
