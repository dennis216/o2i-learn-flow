import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARENA_GAME_SOURCE, ARENA_HOST_SOURCE, isArenaRequest, replyToArenaRequest } from './arenaBridge.ts';

const request = (action, payload) => ({ source: ARENA_GAME_SOURCE, id: 7, action, payload });
const recorder = (result = { data: { status: 'ok' }, error: null }) => {
  const calls = [];
  return { calls, rpc: async (name, args) => { calls.push({ name, args }); return result; } };
};

test('only well-formed game messages count as requests', () => {
  assert.equal(isArenaRequest(request('catalog')), true);
  for (const bad of [null, 'text', {}, { source: 'other', id: 1, action: 'next' }, { source: ARENA_GAME_SOURCE, id: 'x', action: 'next' }]) {
    assert.equal(isArenaRequest(bad), false);
  }
});

test('each game action maps to its RPC', async () => {
  const { rpc, calls } = recorder();
  await replyToArenaRequest(rpc, request('catalog'));
  await replyToArenaRequest(rpc, request('next', { runId: 'r', units: [1], currentUnit: 1, tier: 2, preferCurrent: false }));
  await replyToArenaRequest(rpc, request('answer', { issueId: 'i', index: 3 }));
  assert.deepEqual(calls, [
    { name: 'arena_catalog', args: undefined },
    { name: 'arena_next_question', args: { _run_id: 'r', _units: [1], _current_unit: 1, _tier: 2, _prefer_current: false } },
    { name: 'arena_submit_answer', args: { _issue_id: 'i', _selected: 3 } },
  ]);
});

test('replies echo the request id and carry the data', async () => {
  const reply = await replyToArenaRequest(recorder().rpc, request('catalog'));
  assert.deepEqual(reply, { source: ARENA_HOST_SOURCE, id: 7, ok: true, data: { status: 'ok' } });
});

test('unknown actions never reach Supabase', async () => {
  const { rpc, calls } = recorder();
  assert.equal((await replyToArenaRequest(rpc, request('get_user_roles'))).ok, false);
  assert.deepEqual(calls, []);
});

test('database errors become a plain failure without details', async () => {
  const reply = await replyToArenaRequest(recorder({ data: null, error: { message: 'secret detail' } }).rpc, request('catalog'));
  assert.deepEqual(reply, { source: ARENA_HOST_SOURCE, id: 7, ok: false });
});
