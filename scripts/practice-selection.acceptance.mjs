import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const ids = session => session.questions.map(q => q.question_id);
export async function verifyRandomSelection({ fixture, topics, start, student, other, rpc, safe, check }) {
  const topic = code => topics.find(t => t.topic_code === code).id;
  for (let i = 0; i < 12; i++) await fixture('1.4');
  const first = await start(student, topic('1.4')), second = await start(student, topic('1.4'));
  assert.equal(new Set([...ids(first), ...ids(second)]).size, 10);
  assert.deepEqual(await rpc(student, 'get_question_practice', { _session_id: first.id }), first);
  safe(first); safe(second);
  const parallel = await Promise.all([start(other, topic('1.4')), start(other, topic('1.4'))]);
  assert.equal(new Set(parallel.flatMap(ids)).size, 10, 'Different concurrent sessions serialize per account');
  const sameId = randomUUID();
  const retried = await Promise.all([start(student, topic('1.4'), sameId), start(student, topic('1.4'), sameId)]);
  assert.deepEqual(retried[0], retried[1]);
  check('Random selection: twelve-question pool, ten distinct across two sets, per-account concurrency and stable retry/snapshot');
  const eight = []; for (let i = 0; i < 8; i++) eight.push((await fixture('1.5')).question_id);
  const a = await start(student, topic('1.5')), b = await start(student, topic('1.5'));
  const unseen = eight.filter(id => !ids(a).includes(id));
  assert.deepEqual(new Set(ids(b).slice(0, 3)), new Set(unseen));
  assert.equal(ids(b).filter(id => ids(a).includes(id)).length, 2);
  const c = await start(student, topic('1.5'));
  const oldest = ids(a).filter(id => !ids(b).includes(id));
  assert.deepEqual(new Set(ids(c).slice(0, 3)), new Set(oldest));
  for (const [code, count] of [['1.6', 1], ['1.7', 4]]) {
    for (let i = 0; i < count; i++) await fixture(code);
    assert.equal((await start(student, topic(code))).questions.length, count);
  }
  check('Random selection: eight-question exhaustion uses three unseen then oldest; one/four-question pools remain usable');
}

export async function verifyTopicAdaptation({ db, fixture, topics, start, student, other, rpc, submit, check, admin, precheck, publish }) {
  const tid = topics.find(t => t.topic_code === '2.1').id;
  const uid = (await student.auth.getUser()).data.user.id;
  const pool = [];
  for (const difficulty of ['easy', 'medium', 'hard']) for (let i = 0; i < 5; i++) pool.push(await fixture('2.1', true, difficulty));
  const cold = await start(student, tid);
  assert.deepEqual(cold.selection_summary, { rule_version: 'topic-difficulty-v1', target_difficulty: 'medium', sample_count: 0, correct_count: 0, fallback_count: 0 });
  assert.ok(cold.questions.every(q => q.difficulty === 'medium'));
  for (const q of cold.questions) await submit(student, cold, q, q.options.find(o => o.key === 'A').id);
  const hard = await start(student, tid);
  assert.equal(hard.selection_summary.target_difficulty, 'hard');
  assert.ok(hard.questions.every(q => q.difficulty === 'hard'));
  assert.equal((await rpc(student, 'get_question_practice', { _session_id: cold.id })).selection_summary.sample_count, 0);
  const otherCold = await start(other, tid); assert.equal(otherCold.selection_summary.sample_count, 0);
  assert.equal((await start(student)).selection_summary.target_difficulty, null);
  check('Adaptive: cold start medium, five server-graded correct answers select hard, frozen rationale and account/global-scope isolation');

  // Synthetic history is inserted only into this disposable database, with valid version/option bindings.
  let sequence = 0;
  const clear = () => db.query('DELETE FROM public.question_practice_attempts WHERE user_id=$1 AND question_id=ANY($2::uuid[])', [uid, pool.map(q => q.question_id)]);
  const history = async (q, correct) => {
    const sid = randomUUID(), timestamp = new Date(Date.now() - 3600000 + (++sequence) * 1000).toISOString();
    const option = (await db.query('SELECT id FROM public.question_options WHERE question_version_id=$1 AND is_correct=$2', [q.version_id, correct])).rows[0].id;
    await db.query(`WITH s AS (INSERT INTO public.question_practice_sessions(id,user_id,topic_id) VALUES($1,$2,$3) RETURNING id),
      i AS (INSERT INTO public.question_practice_items(session_id,question_id,version_id,position) SELECT id,$4,$5,1 FROM s RETURNING session_id)
      INSERT INTO public.question_practice_attempts(user_id,session_id,question_id,version_id,selected_option_id,is_correct,submitted_at)
      SELECT $2,session_id,$4,$5,$6,$7,$8 FROM i`, [sid, uid, tid, q.question_id, q.version_id, option, correct, timestamp]);
  };
  for (const [n, correct, target] of [[4, 4, 'medium'], [5, 2, 'easy'], [5, 3, 'medium'], [5, 4, 'hard'], [10, 4, 'easy'], [10, 5, 'medium'], [10, 7, 'medium'], [10, 8, 'hard']]) {
    await clear(); for (let i = 0; i < n; i++) await history(pool[i], i < correct);
    const result = await start(student, tid);
    assert.equal(result.selection_summary.sample_count, n); assert.equal(result.selection_summary.correct_count, correct);
    assert.equal(result.selection_summary.target_difficulty, target);
  }
  await clear(); for (let i = 0; i < 11; i++) await history(pool[i], i === 0);
  let result = await start(student, tid); assert.equal(result.selection_summary.sample_count, 10); assert.equal(result.selection_summary.correct_count, 0);
  await clear(); for (let i = 0; i < 5; i++) await history(pool[i], false);
  for (let i = 0; i < 12; i++) await history(pool[0], true);
  result = await start(student, tid); assert.equal(result.selection_summary.sample_count, 5); assert.equal(result.selection_summary.correct_count, 1);
  assert.equal(result.selection_summary.target_difficulty, 'easy');
  check('Adaptive: exact 50/80 percent thresholds, fewer-than-five cold start, ten distinct limit and latest-result deduplication');

  const smallTopic = topics.find(t => t.topic_code === '2.2').id;
  await fixture('2.2', true, 'easy');
  const fallback = await start(student, smallTopic);
  assert.equal(fallback.selection_summary.sample_count, 0); assert.equal(fallback.selection_summary.fallback_count, 1);
  assert.equal(fallback.questions.length, 1); assert.equal(fallback.questions[0].topic.id, smallTopic);
  const full = await start(student, tid); assert.equal(new Set(ids(full)).size, 5);
  assert.ok(full.questions.every(q => q.topic.id === tid));
  // Candidate sorting: unseen outranks matching difficulty, lower equidistant difficulty wins.
  const sparseCode='2.3', sparseTopic=topics.find(t=>t.topic_code===sparseCode).id;
  for(let i=0;i<5;i++)await fixture(sparseCode,true,'easy');
  for(let i=0;i<5;i++)await fixture(sparseCode,true,'hard');
  const lower=await start(student,sparseTopic); assert.ok(lower.questions.every(q=>q.difficulty==='easy'));
  const unseen=await start(student,sparseTopic); assert.ok(unseen.questions.every(q=>q.difficulty==='hard'));
  const preferredCode='2.4', preferredTopic=topics.find(t=>t.topic_code===preferredCode).id;
  for(let i=0;i<5;i++)await fixture(preferredCode,true,'medium');
  await start(student,preferredTopic);
  for(let i=0;i<5;i++)await fixture(preferredCode,true,'easy');
  assert.ok((await start(student,preferredTopic)).questions.every(q=>q.difficulty==='easy'));
  check('Adaptive: missing difficulty falls back within Topic, exhausted pool stays unique, unseen outranks difficulty and ties prefer lower difficulty');

  const state=await precheck(pool[0]);
  const revision=await rpc(admin,'save_question_bank_revision',{_question_id:pool[0].question_id,_source_version_id:pool[0].version_id,_expected_fingerprint:state.fingerprint,_metadata:{difficulty:'hard',calculator_policy:null,course_scope:'AB',representation_type:'analytical',primary_topic_code:'2.2',practice_skill_codes:['1.A'],source_page:'1',source_locator:'p001-item01'}});
  await publish({question_id:pool[0].question_id,version_id:revision.version_id??revision.id});
  result=await start(student,tid); assert.equal(result.selection_summary.sample_count,5);assert.equal(result.selection_summary.correct_count,1);
  assert.equal((await start(student,smallTopic)).selection_summary.sample_count,0);
  check('Adaptive: later Topic/difficulty revision does not rewrite the historical signal or count it in the new Topic');
}
