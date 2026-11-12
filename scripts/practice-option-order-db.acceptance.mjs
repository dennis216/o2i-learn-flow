// Synthetic fixtures in the disposable course test database only; runs after the Arena acceptance.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

export function verifyPracticeOptionOrder({ sql, asUser, tids }) {
  const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
  const dir = 'docs/question-bank/production/option-order/';
  const last = s => s.trim().split('\n').at(-1);
  const rpc = (uid, fn, args = '') => JSON.parse(last(asUser(uid, `SELECT public.${fn}(${args})`)));
  // Server-side view of a session exactly as its owner receives it.
  const snapshot = (uid, id) => sql(`BEGIN; SELECT set_config('request.jwt.claim.sub','${uid}',true),set_config('request.jwt.claim.role','authenticated',true); SELECT public.question_practice_snapshot('${id}'); COMMIT;`).split('\n').find(l => l.startsWith('{'));
  const sessions = sql('SELECT id||\'|\'||user_id FROM public.question_practice_sessions ORDER BY id').trim().split('\n').filter(Boolean).map(r => r.split('|'));
  assert.ok(sessions.length >= 3, 'Earlier acceptances must leave existing sessions to protect');
  const before = sessions.map(([id, uid]) => snapshot(uid, id));
  const attemptsBefore = sql('SELECT md5(string_agg(row_to_json(a)::text,\'\' ORDER BY id)) FROM public.question_practice_attempts a').trim();

  // Release package: preflight, atomic deploy, exact verification, no replay, no partial state.
  assert.equal(sql(read(dir + '00_preflight_readonly.sql')).trim(), 't|t|t');
  sql('ALTER TABLE public.question_practice_items ADD COLUMN option_order uuid[]');
  assert.equal(sql(read(dir + '00_preflight_readonly.sql')).trim(), 't|t|f');
  assert.throws(() => sql(read(dir + '10_deploy.sql')));
  sql('ALTER TABLE public.question_practice_items DROP COLUMN option_order');
  sql(read(dir + '10_deploy.sql'));
  const verification = JSON.parse(sql(read(dir + '20_verify_readonly.sql')).trim());
  assert.ok(verification.all_checks_pass, JSON.stringify(verification));
  assert.throws(() => sql(read(dir + '10_deploy.sql')));
  assert.equal(sql(read(dir + '00_preflight_readonly.sql')).trim(), 't|f|f');

  // Existing history: no order assigned, identical snapshots and attempts.
  assert.equal(sql('SELECT count(*) FROM public.question_practice_items WHERE option_order IS NOT NULL').trim(), '0');
  assert.deepEqual(sessions.map(([id, uid]) => snapshot(uid, id)), before);
  assert.equal(sql('SELECT md5(string_agg(row_to_json(a)::text,\'\' ORDER BY id)) FROM public.question_practice_attempts a').trim(), attemptsBefore);

  const student = randomUUID(), other = randomUUID(), [topic] = tids;
  sql(`INSERT INTO auth.users(id) VALUES('${student}'),('${other}')`);
  // A synthetic question whose stored correct option is always A, like the legacy Arena imports.
  const correctIds = new Set(sql('SELECT id FROM public.question_options WHERE is_correct').trim().split('\n'));
  const positions = {}, checkSession = practice => {
    for (const q of practice.questions) {
      const stored = sql(`SELECT string_agg(id::text,',' ORDER BY id) FROM public.question_options WHERE question_version_id='${q.version_id}'`).trim();
      assert.deepEqual(q.options.map(o => o.id).sort().join(','), stored, 'Every option exactly once');
      assert.deepEqual(q.options.map(o => o.key), q.options.map((_, n) => 'ABCDEF'[n]), 'Keys follow display position');
      assert.ok(q.options.every(o => Object.keys(o).sort().join() === 'id,key,text'), 'Snapshot option shape unchanged');
      const frozen = sql(`SELECT array_to_string(option_order,',') FROM public.question_practice_items WHERE session_id='${practice.id}' AND question_id='${q.question_id}'`).trim();
      assert.equal(frozen, q.options.map(o => o.id).join(','), 'Display order is the frozen order');
      if (q.options.filter(o => correctIds.has(o.id)).length !== 1) continue; // Arena's invalid fixtures
      const at = q.options.findIndex(o => correctIds.has(o.id));
      positions[q.options.length] ??= {}; positions[q.options.length]['ABCDEF'[at]] = (positions[q.options.length]['ABCDEF'[at]] ?? 0) + 1;
    }
  };
  const runs = [];
  for (let n = 0; n < 40; n++) {
    const practice = rpc(student, 'start_question_practice', `'${randomUUID()}','${topic}'`);
    assert.ok(practice.questions.length > 0); checkSession(practice); runs.push(practice);
  }
  for (const [count, seen] of Object.entries(positions)) if (+count === 4) {
    assert.deepEqual(Object.keys(seen).sort(), ['A', 'B', 'C', 'D'], 'Correct option appears in every position: ' + JSON.stringify(positions));
  }
  // Refresh and repeated start return the same frozen order; another account cannot read it.
  const first = runs[0];
  assert.deepEqual(rpc(student, 'get_question_practice', `'${first.id}'`), first);
  assert.deepEqual(rpc(student, 'start_question_practice', `'${first.id}','${topic}'`), first);
  assert.throws(() => rpc(other, 'get_question_practice', `'${first.id}'`));
  assert.throws(() => asUser(student, `UPDATE public.question_practice_items SET option_order=NULL WHERE session_id='${first.id}'`));
  // Grading follows option IDs whatever the display position; Review keeps the order.
  const [right, wrong] = [first.questions[0], first.questions[1] ?? first.questions[0]];
  const rightOption = right.options.find(o => correctIds.has(o.id)), wrongOption = wrong.options.find(o => !correctIds.has(o.id));
  let submitted = rpc(student, 'submit_question_practice', `'${first.id}','${right.question_id}','${rightOption.id}',9`);
  assert.equal(submitted.questions.find(q => q.question_id === right.question_id).attempt.is_correct, true);
  if (wrong !== right) {
    submitted = rpc(student, 'submit_question_practice', `'${first.id}','${wrong.question_id}','${wrongOption.id}',9`);
    const graded = submitted.questions.find(q => q.question_id === wrong.question_id);
    assert.equal(graded.attempt.is_correct, false); assert.ok(correctIds.has(graded.attempt.correct_option_id));
  }
  assert.deepEqual(submitted.questions.map(q => q.options), first.questions.map(q => q.options));
  assert.deepEqual(rpc(student, 'get_question_practice', `'${first.id}'`), submitted);
  assert.deepEqual(rpc(student, 'submit_question_practice', `'${first.id}','${right.question_id}','${rightOption.id}',9`), submitted);
  const review = rpc(student, 'list_question_practice_attempts', 'false');
  assert.ok(review.some(a => a.session_id === first.id && a.selected_option_id === rightOption.id && a.is_correct));

  // Continuous practice freezes an order on its single issued item too.
  const continuous = rpc(student, 'start_continuous_question_practice', `'${randomUUID()}','${topic}',NULL`);
  const issued = continuous.questions.filter(q => !q.attempt);
  assert.ok(issued.length >= 1); checkSession({ ...continuous, questions: issued });

  // Arena: the practice item takes Arena's frozen order, so Review shows what was played.
  const run = randomUUID(), arena = rpc(student, 'arena_practice_next_question', `'${run}','{1}',1,2,true`);
  assert.equal(arena.status, 'ok'); {
    const order = sql(`SELECT array_to_string(i.option_order,',')||'|'||array_to_string(p.option_order,',') FROM public.arena_practice_issues i JOIN public.question_practice_items p ON p.session_id=i.session_id AND p.question_id=i.question_id WHERE i.id='${arena.issue_id}'`).trim().split('|');
    assert.equal(order[0], order[1]);
    const played = rpc(student, 'get_question_practice', `'${run}'`).questions[0];
    assert.deepEqual(played.options.map(o => o.text), arena.opts);
  }
  console.log('PASS practice option order: guarded package, unchanged history, frozen per-issue shuffle in every position, refresh/retry/Review stability, ID grading, continuous, Arena parity and isolation');
  return positions;
}
