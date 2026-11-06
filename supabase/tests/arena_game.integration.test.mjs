// Runs the real migration against a disposable PostgreSQL database with a stub
// auth schema. It creates roles, so never point this at a shared database.
// ARENA_TEST_DATABASE_URL=postgres://... npm run test:arena:db
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const url = process.env.ARENA_TEST_DATABASE_URL;
assert.ok(url, 'Set ARENA_TEST_DATABASE_URL to a disposable database.');
assert.match(url, /127\.0\.0\.1|localhost/, 'Refusing to run against a non-local database.');

const psql = sql => execFileSync('psql', [url, '-qtAX', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
}).trim();
const asRole = (role, uid, sql) => psql(`
  BEGIN;
  SELECT set_config('request.jwt.claim.sub', '${uid ?? ''}', true);
  SET LOCAL ROLE ${role};
  ${sql};
  COMMIT;`).split('\n').pop();
const rpc = (uid, sql) => JSON.parse(asRole('authenticated', uid, `SELECT ${sql}`));
const refused = (role, uid, sql, pattern) => assert.throws(() => asRole(role, uid, sql), e => pattern.test(String(e.stderr)));

const alice = randomUUID(), bob = randomUUID();
const run = randomUUID();
const next = (uid, runId = run, units = '{1,2}', current = 1, tier = 1) =>
  rpc(uid, `public.arena_next_question('${runId}', '${units}'::integer[], ${current}, ${tier}, true)`);
const submit = (uid, issue, index) => rpc(uid, `public.arena_submit_answer('${issue}', ${index})`);

psql(`
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  END $$;
  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE TABLE IF NOT EXISTS auth.users(id uuid PRIMARY KEY);
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
  -- Mirror Supabase: new public tables and functions are granted to these roles.
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
  INSERT INTO auth.users VALUES ('${alice}'), ('${bob}');
`);
const migration = new URL('../migrations/20261104000100_arena_game.sql', import.meta.url);
execFileSync('psql', [url, '-qX', '-v', 'ON_ERROR_STOP=1', '-f', migration.pathname], { stdio: ['ignore', 'pipe', 'pipe'] });
psql(`INSERT INTO public.arena_questions(id, unit, tier, topic, stem, options, explanation)
  SELECT 'q' || n, 1 + n % 2, 1 + n % 3, 'Topic', 'Stem ' || n,
    jsonb_build_array('RIGHT' || n, 'wrong-a', 'wrong-b', 'wrong-c'), 'Because ' || n
  FROM generate_series(1, 60) n`);

test('anon and signed-in clients cannot read the tables directly', () => {
  for (const role of ['anon', 'authenticated']) {
    for (const table of ['arena_questions', 'arena_question_issues']) {
      refused(role, alice, `SELECT * FROM public.${table}`, /permission denied/);
      refused(role, alice, `DELETE FROM public.${table}`, /permission denied/);
    }
  }
});

test('anon cannot call any RPC, and a role without a user id is refused', () => {
  refused('anon', null, 'SELECT public.arena_catalog()', /permission denied/);
  refused('anon', null, `SELECT public.arena_next_question('${run}', '{1}', 1, 1)`, /permission denied/);
  refused('anon', null, `SELECT public.arena_submit_answer('${run}', 0)`, /permission denied/);
  refused('authenticated', null, 'SELECT public.arena_catalog()', /Sign in to play/);
});

test('the catalog exposes counts only', () => {
  assert.deepEqual(rpc(alice, 'public.arena_catalog()'), { counts: { 1: 30, 2: 30 } });
});

test('an issued question carries no answer, explanation or fixed correct position', () => {
  const seen = new Set();
  for (let i = 0; i < 12; i++) {
    const q = next(alice, randomUUID());
    assert.equal(q.status, 'ok');
    assert.deepEqual(Object.keys(q).sort(), ['graph', 'issue_id', 'opts', 'status', 'stem', 'table', 'tier', 'topic', 'unit']);
    assert.equal(q.opts.length, 4);
    seen.add(q.opts.findIndex(o => o.startsWith('RIGHT')));
    assert.ok(!JSON.stringify(q).includes('Because'));
  }
  assert.ok(seen.size > 1, 'the correct option must move between issues');
});

test('the server grades using the displayed order and the first answer is final', () => {
  const q = next(alice);
  const right = q.opts.findIndex(o => o.startsWith('RIGHT'));
  const wrong = (right + 1) % 4;
  const first = submit(alice, q.issue_id, wrong);
  assert.deepEqual({ correct: first.correct, index: first.correct_index }, { correct: false, index: right });
  assert.match(first.explanation, /^Because/);
  assert.equal(submit(alice, q.issue_id, right).correct, false);

  const again = next(alice);
  assert.equal(submit(alice, again.issue_id, again.opts.findIndex(o => o.startsWith('RIGHT'))).correct, true);
});

test('one account cannot answer or read another account\'s issue', () => {
  const q = next(alice);
  assert.deepEqual(submit(bob, q.issue_id, 0), { status: 'not_found' });
  assert.equal(psql(`SELECT count(*) FROM public.arena_question_issues WHERE id = '${q.issue_id}' AND answered_at IS NOT NULL`), '0');
});

test('questions do not repeat within a run until the pool runs out', () => {
  const runId = randomUUID();
  const stems = Array.from({ length: 8 }, () => next(bob, runId, '{1}', 1, 2).stem);
  assert.equal(new Set(stems).size, 8);
  psql(`DELETE FROM public.arena_question_issues WHERE user_id = '${bob}'`);
});

test('the requested tier and current unit are honoured while available', () => {
  const q = next(bob, randomUUID(), '{1,2}', 2, 3);
  assert.deepEqual({ unit: q.unit, tier: q.tier }, { unit: 2, tier: 3 });
  psql(`DELETE FROM public.arena_question_issues WHERE user_id = '${bob}'`);
});

test('bad requests are rejected', () => {
  refused('authenticated', alice, `SELECT public.arena_next_question('${run}', '{}', 1, 1)`, /Invalid question request/);
  refused('authenticated', alice, `SELECT public.arena_next_question('${run}', '{11}', 1, 1)`, /Invalid question request/);
  refused('authenticated', alice, `SELECT public.arena_next_question('${run}', '{1}', 1, 4)`, /Invalid question request/);
  refused('authenticated', alice, `SELECT public.arena_submit_answer('${run}', 4)`, /Choose one of the four/);
});

test('rate limits stop issuing without an error', () => {
  const runId = randomUUID();
  const statuses = Array.from({ length: 31 }, () => next(bob, runId).status);
  assert.deepEqual(statuses.slice(0, 30), Array(30).fill('ok'));
  assert.equal(statuses[30], 'rate_limited');

  psql(`UPDATE public.arena_question_issues SET issued_at = now() - interval '2 minutes' WHERE user_id = '${bob}'`);
  assert.equal(next(bob, runId).status, 'ok');

  psql(`INSERT INTO public.arena_question_issues(user_id, run_id, question_id, option_order, issued_at)
    SELECT '${bob}', '${runId}', 'q1', '{0,1,2,3}', now() - interval '2 hours' FROM generate_series(1, 300)`);
  assert.equal(next(bob, runId).status, 'rate_limited');
});

test('an empty pool reports empty', () => {
  psql(`UPDATE public.arena_questions SET active = false`);
  assert.equal(next(alice, randomUUID()).status, 'empty');
  assert.deepEqual(rpc(alice, 'public.arena_catalog()'), { counts: {} });
  psql(`UPDATE public.arena_questions SET active = true`);
});
