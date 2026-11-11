import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  authorLabel, errorCode, errorText, excerpt, mathSafeExcerpt, newImagePath, problemTypeLabel, quotaLeft, uploadImages,
  validateImage, validateQuestion, validateReply, LIMITS,
} from './solutionRequests.ts';

const draft = { title: 'Limit at 0', description: '', problemType: 'calculus', isPublic: true, isAnonymous: true };

test('server error codes map to bilingual messages, unknown errors to a generic one', () => {
  const closed = { message: 'SR_CLOSED', details: 'This thread is closed.' };
  assert.equal(errorCode(closed), 'SR_CLOSED');
  assert.match(errorText(closed)[1], /关闭/);
  assert.match(errorText({ message: 'SR_DAILY_LIMIT' })[0], /5 questions/);
  assert.equal(errorCode(new Error('fetch failed')), null);
  assert.deepEqual(errorText(null), errorText({ message: 'boom' }));
});

test('author labels: anonymous students stay anonymous unless the viewer is an admin', () => {
  assert.deepEqual(authorLabel({ name: null, anonymous: true, official: false, is_mine: false }), ['Anonymous', '匿名同学']);
  assert.deepEqual(authorLabel({ name: 'Ada', anonymous: true, official: false, is_mine: false }), ['Anonymous (Ada)', '匿名（Ada）']);
  assert.deepEqual(authorLabel({ name: 'Ada', anonymous: false, official: false, is_mine: false }), ['Ada', 'Ada']);
  assert.deepEqual(authorLabel({ name: null, anonymous: false, official: false, is_mine: false }), ['Student', '同学']);
  assert.deepEqual(authorLabel({ name: 'Teacher Li', anonymous: false, official: true, is_mine: false }), ['Teacher Li', 'Teacher Li']);
});

test('question validation', () => {
  assert.deepEqual(validateQuestion(draft, 0), []);
  assert.equal(validateQuestion({ ...draft, title: '   ' }, 0).length, 1);
  assert.equal(validateQuestion({ ...draft, title: 'x'.repeat(LIMITS.title + 1) }, 0).length, 1);
  assert.equal(validateQuestion({ ...draft, problemType: '' }, 0).length, 1);
  assert.equal(validateQuestion({ ...draft, description: 'x'.repeat(LIMITS.body + 1) }, 4).length, 2);
});

test('reply and image validation', () => {
  assert.ok(validateReply('  ', false));
  assert.equal(validateReply('', true), null);
  assert.equal(validateReply('ok', false), null);
  assert.ok(validateReply('x'.repeat(LIMITS.body + 1), false));
  assert.equal(validateImage({ type: 'image/png', size: 1000 }), null);
  assert.ok(validateImage({ type: 'image/heic', size: 1000 }));
  assert.ok(validateImage({ type: 'image/jpeg', size: LIMITS.imageBytes + 1 }));
});

test('new image paths never contain the user id', () => {
  assert.equal(newImagePath('image/jpeg', () => 'abc'), 'r/abc.jpg');
  assert.match(newImagePath('image/webp'), /^r\/[0-9a-f-]{36}\.webp$/);
  assert.throws(() => newImagePath('text/plain'));
});

test('small helpers', () => {
  assert.deepEqual(problemTypeLabel('number_theory'), ['Number Theory', '数论']);
  assert.deepEqual(problemTypeLabel(null), ['Other', '其他']);
  assert.equal(quotaLeft({ limit: 5, used: 2, unlimited: false }), 3);
  assert.equal(quotaLeft({ limit: 5, used: 9, unlimited: false }), 0);
  assert.equal(quotaLeft({ limit: 5, used: 9, unlimited: true }), null);
  assert.equal(excerpt('a\n\n b   c'), 'a b c');
  assert.equal(excerpt('x'.repeat(200), 10), `${'x'.repeat(9)}…`);
});

test('a failed upload removes the files already uploaded', async () => {
  const uploaded = [], removed = [];
  let n = 0;
  const client = { storage: { from: () => ({
    upload: async path => (++n === 2 ? { error: new Error('quota') } : (uploaded.push(path), { error: null })),
    remove: async paths => { removed.push(...paths); return { error: null }; },
  }) } };
  const file = { type: 'image/png', size: 10 };
  await assert.rejects(uploadImages(client, [file, file]), /quota/);
  assert.deepEqual(removed, uploaded);
  await assert.rejects(uploadImages(client, [{ type: 'image/heic', size: 1 }]), /JPG/);
});

test('list previews never cut a formula in half', () => {
  assert.equal(mathSafeExcerpt('Find $x$'), 'Find $x$');
  assert.equal(mathSafeExcerpt('ab $\\frac{1}{2}$ cd', 8), 'ab…');
  assert.equal(mathSafeExcerpt('$$x^2$$\n\nnext'), '$x^2$ next');
  const long = mathSafeExcerpt(`${'word '.repeat(40)}$y=1$`, 50);
  assert.ok(long.endsWith('…') && !long.includes('$'));
});
