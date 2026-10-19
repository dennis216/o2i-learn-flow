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
