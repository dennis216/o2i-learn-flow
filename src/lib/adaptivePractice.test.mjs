import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAttempt, recommendQuestions, skillMastery } from './adaptivePractice.ts';

const question = {
  id: 'q1', subjectId: 'calculus', skillIds: ['limits'], difficulty: 'easy', approved: true,
  misconceptionTagsByOption: { b: ['confuses_limit_with_value'] },
};

test('feedback keeps a correct but slow answer correct', () => {
  const result = evaluateAttempt(question, ['a'], true, 181);
  assert.equal(result.correct, true);
  assert.equal(result.overTarget, true);
  assert.equal(result.needsReview, true);
  assert.equal(result.targetSeconds, 180);
});

test('wrong option metadata is retained for later selection', () => {
  const result = evaluateAttempt(question, ['b'], false, 50);
  assert.deepEqual(result.misconceptionTags, ['confuses_limit_with_value']);
  assert.deepEqual(result.selectedOptionIds, ['b']);
});

test('every option touched in a selection trajectory contributes misconception metadata', () => {
  const trajectoryQuestion = {
    ...question,
    misconceptionTagsByOption: {
      a: ['first_misconception'],
      b: ['second_misconception'],
      c: [],
    },
  };
  const result = evaluateAttempt(trajectoryQuestion, ['a', 'b', 'c'], true, 42);
  assert.equal(result.correct, true);
  assert.deepEqual(result.selectedOptionIds, ['a', 'b', 'c']);
  assert.deepEqual(result.misconceptionTags, ['first_misconception', 'second_misconception']);
  assert.equal(result.needsReview, true);
});

test('difficulty time targets stay at 3, 5 and 10 minutes', () => {
  assert.equal(evaluateAttempt({ ...question, difficulty: 'easy' }, ['a'], true, 1).targetSeconds, 180);
  assert.equal(evaluateAttempt({ ...question, difficulty: 'medium' }, ['a'], true, 1).targetSeconds, 300);
  assert.equal(evaluateAttempt({ ...question, difficulty: 'hard' }, ['a'], true, 1).targetSeconds, 600);
});

test('selection is subject-scoped, approved-only and avoids seen questions', () => {
  const bank = [
    question,
    { ...question, id: 'q2' },
    { ...question, id: 'q3', approved: false },
    { ...question, id: 'q4', subjectId: 'physics' },
  ];
  const attempts = [{
    questionId: 'q1', subjectId: 'calculus', skillIds: ['limits'], difficulty: 'easy',
    correct: false, elapsedSeconds: 190, selectedOptionIds: ['b'],
    misconceptionTags: ['confuses_limit_with_value'],
  }];
  const result = recommendQuestions(bank, attempts, [], 'calculus', 1);
  assert.deepEqual(result.map((item) => item.question.id), ['q2']);
  assert.ok(skillMastery('limits', attempts) < 0.5);
});

test('selection gives an empty result when there is no reviewed bank', () => {
  assert.deepEqual(recommendQuestions([], [], [], 'chemistry', 5), []);
});

test('strong repeated performance advances difficulty within one subject', () => {
  const attempts = Array.from({ length: 4 }, (_, index) => ({
    questionId: `seen-${index}`, subjectId: 'calculus', skillIds: ['derivatives'],
    difficulty: 'medium', correct: true, elapsedSeconds: 90,
    selectedOptionIds: ['a'], misconceptionTags: [],
  }));
  const bank = [
    { id: 'easy', subjectId: 'calculus', skillIds: ['derivatives'], difficulty: 'easy', approved: true },
    { id: 'hard', subjectId: 'calculus', skillIds: ['derivatives'], difficulty: 'hard', approved: true },
  ];
  assert.equal(recommendQuestions(bank, attempts, [], 'calculus', 1)[0].question.id, 'hard');
});

test('a different subject cannot change this subject’s mastery', () => {
  const physicsAttempt = {
    questionId: 'physics-1', subjectId: 'physics', skillIds: ['shared-label'],
    difficulty: 'easy', correct: false, elapsedSeconds: 400,
    selectedOptionIds: ['b'], misconceptionTags: [],
  };
  const bank = [
    { id: 'easy', subjectId: 'calculus', skillIds: ['shared-label'], difficulty: 'easy', approved: true },
    { id: 'medium', subjectId: 'calculus', skillIds: ['shared-label'], difficulty: 'medium', approved: true },
  ];
  const withoutOtherSubject = recommendQuestions(bank, [], [], 'calculus', 1);
  const withOtherSubject = recommendQuestions(bank, [physicsAttempt], [], 'calculus', 1);
  assert.deepEqual(withOtherSubject, withoutOtherSubject);
});
