// Synthetic fixtures in the disposable course test database only; runs after the option-order acceptance (#44).
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

export function verifyContinuousRepeat({ sql, asUser, tids }) {
  const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
  const dir = 'docs/question-bank/production/continuous-repeat/';
  const rpc = (uid, fn, args = '') => JSON.parse(asUser(uid, `SELECT coalesce(public.${fn}(${args})::text,'null')`).trim().split('\n').at(-1));

  // Release package: preflight, atomic deploy, exact verification, no replay.
  assert.equal(sql(read(dir + '00_preflight_readonly.sql')).trim(), 't|t|t');
  sql(read(dir + '10_deploy.sql'));
  const verification = JSON.parse(sql(read(dir + '20_verify_readonly.sql')).trim());
  assert.ok(verification.all_checks_pass, JSON.stringify(verification));
  assert.throws(() => sql(read(dir + '10_deploy.sql')));
  assert.equal(sql(read(dir + '00_preflight_readonly.sql')).trim(), 't|f|f');

  const learner = randomUUID();
  sql(`INSERT INTO auth.users(id) VALUES('${learner}')`);
  const start = (id, topic) => rpc(learner, 'start_continuous_question_practice', `'${id}',${topic ? `'${topic}'` : 'NULL'},NULL`);
  const next = id => rpc(learner, 'next_continuous_question_practice', `'${id}'`);
  const pending = s => s.questions.find(q => !q.attempt);
  const reason = (s, q) => s.continuous.items.find(i => i.question_id === q.question_id).reason;
  const option = (q, correct) => sql(`SELECT id FROM public.question_options WHERE question_version_id='${q.version_id}' AND is_correct=${correct} LIMIT 1`).trim();
  const answer = (s, correct) => { const q = pending(s); assert.ok(q, 'Expected a waiting question'); return rpc(learner, 'submit_question_practice', `'${s.id}','${q.question_id}','${option(q, correct)}',30`); };
  // Answers every question a session issues; `wrong` picks which ones to answer incorrectly.
  const drain = (s, wrong = () => false) => { while (pending(s)) { const q = pending(s); s = next(answer(s, !wrong(q, s)).id); } return s; };

  // First pass over one Topic: all unseen, the first two answered wrong.
  const topic = tids[1], first = drain(start(randomUUID(), topic), (_, s) => s.questions.length <= 2);
  assert.equal(first.next_result, 'topic_exhausted');
  const size = first.questions.length, wrongIds = first.questions.slice(0, 2).map(q => q.question_id);
  assert.ok(size >= 4, 'Topic needs several questions');
  assert.ok(first.continuous.items.every(i => i.reason.repeat === undefined), 'Unseen questions carry no repeat marker');

  // Second pass: keeps going instead of stopping at the first question. Incorrect ones first, then the
  // least recently answered; never twice in a session; exhausted only after every question was issued again.
  const secondId = randomUUID();
  let s = start(secondId, topic);
  assert.equal(s.next_result, 'issued');
  assert.equal(reason(s, s.questions[0]).repeat, 'incorrect');
  assert.ok(wrongIds.includes(s.questions[0].question_id));
  assert.deepEqual(start(secondId, topic).questions, s.questions, 'Repeat issue is idempotent');
  s = next(answer(s, true).id);
  assert.equal(reason(s, s.questions[1]).repeat, 'incorrect');
  assert.deepEqual(s.questions.slice(0, 2).map(q => q.question_id).sort(), [...wrongIds].sort());
  s = drain(s);
  assert.equal(s.next_result, 'topic_exhausted');
  assert.equal(s.questions.length, size);
  assert.equal(new Set(s.questions.map(q => q.question_id)).size, size);
  const firstOrder = first.questions.map(q => q.question_id).slice(2);
  assert.deepEqual(s.questions.slice(2).map(q => q.question_id), firstOrder, 'Then least recently answered first');
  for (const [n, q] of s.questions.entries()) {
    const r = reason(s, q);
    // Shape the deployed frontend validates: known kind, Topic, difficulty and status.
    assert.equal(r.rule_version, 'continuous-v1'); assert.equal(r.kind, 'continue'); assert.equal(r.repeat, n < 2 ? 'incorrect' : 'oldest');
    assert.ok(r.topic_code && ['easy', 'medium', 'hard'].includes(r.target_difficulty) && ['insufficient', 'needs_practice', 'stable'].includes(r.topic_status));
    // Repeats are reshuffled per issue like any other question.
    assert.equal(sql(`SELECT cardinality(option_order) FROM public.question_practice_items WHERE session_id='${s.id}' AND question_id='${q.question_id}'`).trim(), String(q.options.length));
  }
  const recap = rpc(learner, 'end_continuous_question_practice', `'${secondId}'`).continuous.recap;
  assert.equal(recap.answered_count, size); assert.equal(recap.new_count, 0, 'Repeats are not counted as new');

  // Free practice: unseen questions in other Topics still come before any repeat.
  const freeId = randomUUID();
  s = start(freeId, null);
  assert.equal(s.next_result, 'issued');
  assert.notEqual(s.questions[0].topic.id, topic);
  assert.equal(reason(s, s.questions[0]).repeat, undefined);
  rpc(learner, 'end_continuous_question_practice', `'${freeId}'`);

  // Free practice after every published question was answered: starts with a repeat, not "all done".
  const total = +sql(`SELECT count(*) FROM public.questions q JOIN public.question_versions v ON v.id=q.current_version_id
    WHERE q.status='approved' AND v.status='approved' AND v.question_type='mcq_single' AND btrim(coalesce(v.stem,''))<>''
      AND (SELECT count(*) BETWEEN 2 AND 6 AND count(*) FILTER(WHERE o.is_correct)=1 FROM public.question_options o WHERE o.question_version_id=v.id)`).trim();
  assert.ok(total <= 100, 'Free-practice fixture must fit one session');
  const sweep = drain(start(randomUUID(), null));
  assert.equal(sweep.next_result, 'all_exhausted');
  const unseen = +sql(`SELECT count(*) FROM public.questions q WHERE q.status='approved' AND q.id NOT IN (SELECT question_id FROM public.question_practice_attempts WHERE user_id='${learner}')`).trim();
  const again = start(randomUUID(), null);
  assert.equal(again.next_result, 'issued', 'Answered everything: keeps practicing');
  assert.ok(reason(again, again.questions[0]).repeat, 'First question is a repeat once nothing is unseen (' + unseen + ' approved but not answerable)');
  console.log(`PASS continuous repeat: guarded package, repeats after unseen run out (incorrect first, then oldest), unique per session, exhausted only after a full pass, legacy-compatible reasons, reshuffled options, free practice over ${total} questions`);
}
