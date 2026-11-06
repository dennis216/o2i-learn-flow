import assert from 'node:assert/strict';
import test from 'node:test';
import { practiceTopicCards } from './practiceTopics.ts';

const topics = ['10.1', '1.15', '2.1', '1.6', '1.5', 'unknown'].map((code, id) => Object.freeze({ id: String(id), code, title: code, question_count: id + 1 }));
Object.freeze(topics);

test('naturally sorts cards, derives numeric Units, and preserves source rows', () => {
  const { units, cards } = practiceTopicCards(topics, null);
  assert.deepEqual(units, [1, 2, 10]);
  assert.deepEqual(cards.map(t => t.code), ['1.5', '1.6', '1.15', '2.1', '10.1', 'unknown']);
  assert.equal(cards.find(t => t.code === '1.15'), topics[1]);
  assert.equal(topics[0].code, '10.1');
});

test('filters only cards and All restores every row including unknown codes', () => {
  assert.deepEqual(practiceTopicCards(topics, 1).cards.map(t => t.code), ['1.5', '1.6', '1.15']);
  assert.deepEqual(practiceTopicCards(topics, 1).units, [1, 2, 10]);
  assert.equal(practiceTopicCards(topics, null).cards.length, topics.length);
  assert.deepEqual(practiceTopicCards([], null), { units: [], cards: [] });
  assert.deepEqual(practiceTopicCards([topics[1]], 1), { units: [1], cards: [topics[1]] });
});

test('newly loaded published topics, Units, and counts are derived afresh', () => {
  const updated = [{ ...topics[1], question_count: 9 }, { id: 'new', code: '3.2', title: 'New', question_count: 1 }];
  const { cards, units } = practiceTopicCards(updated, null);
  assert.deepEqual(units, [1, 3]);
  assert.equal(cards[0].question_count, 9);
  assert.equal(practiceTopicCards(updated, 3).cards[0].id, 'new');
});
