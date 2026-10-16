import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { QUESTION_HEADERS, OPTION_HEADERS, validateQuestionBankSheets } from './questionBankImport.ts';
import { buildQuestionBankDraftSavePlan, getPublicationReviewTasks, isPublicationReviewIssue } from './questionBankDraftSave.ts';
import {
  applyQuestionFieldEdit, getQuestionEditChanges, revertQuestionEdits,
} from './questionBankPreviewEdits.ts';

const row = (headers, values) => headers.map((header) => values[header] ?? null);
const question = {
  external_id: 'synthetic-001', source_document: 'SOURCE_FILE.pdf', source_page: 12,
  source_locator: 'p012-item03', stem: '合成题干 \\(x^2\\)', solution: '合成解析 \\[2x\\]',
  correct_option_key: 'A', difficulty: 'easy', course_scope: 'AB', primary_topic_code: '2.1',
  practice_skill_codes: '1.A', representation_type: 'analytical', calculator_policy: null,
  requires_figure: false, human_review_status: 'pending', math_review_status: 'pending',
  source_rights_status: 'pending', taxonomy_review_status: 'pending', render_review_status: 'pending',
  ai_flags: 'ANSWER_AI_INFERRED',
};
const sheets = () => [
  { sheet: 'Questions', data: [QUESTION_HEADERS, row(QUESTION_HEADERS, question)] },
  { sheet: 'Options', data: [OPTION_HEADERS,
    row(OPTION_HEADERS, { question_external_id: 'synthetic-001', option_key: 'A', option_text: '合成 A', is_correct: true }),
    row(OPTION_HEADERS, { question_external_id: 'synthetic-001', option_key: 'B', option_text: '合成 B', is_correct: false })] },
  { sheet: 'Instructions', data: [['Documentation only']] },
];
const references = {
  topics: [
    { id: 'topic-1', topic_code: '2.1', title: 'Synthetic 1' },
    { id: 'topic-2', topic_code: '2.2', title: 'Synthetic 2' },
  ],
  skills: [
    { id: 'skill-1', skill_code: '1.A', description: 'Synthetic A' },
    { id: 'skill-2', skill_code: '2.B', description: 'Synthetic B' },
  ],
  existingExternalIds: new Set(),
};
const validated = (input) => validateQuestionBankSheets(input, {
  topicCodes: new Set(references.topics.map((item) => item.topic_code)),
  practiceSkillCodes: new Set(references.skills.map((item) => item.skill_code)),
});

test('unavailable reference data blocks the batch once without inventing invalid codes', () => {
  const report = validateQuestionBankSheets(sheets());
  const plan = buildQuestionBankDraftSavePlan(report, null);
  assert.equal(plan.canSave, false);
  assert.equal(plan.batchReasons.length, 1);
  assert.equal(plan.items[0].reasons.length, 0);
  assert.deepEqual(plan.payload, []);
});

test('loaded empty canonical sets are verified and genuinely missing codes still block', () => {
  const report = validateQuestionBankSheets(sheets(), { topicCodes: new Set(), practiceSkillCodes: new Set() });
  assert.equal(report.topicVerification, 'verified');
  assert.equal(report.skillVerification, 'verified');
  assert.ok(report.issues.some(issue => issue.field === 'primary_topic_code' && issue.severity === 'error'));
  assert.ok(report.issues.some(issue => issue.field === 'practice_skill_codes' && issue.severity === 'error'));
  assert.equal(buildQuestionBankDraftSavePlan(report, { topics: [], skills: [], existingExternalIds: new Set() }).canSave, false);
});

test('publication classification is stable when display messages change language', () => {
  const report = validated(sheets());
  const calculatorIssue = report.issues.find(issue => issue.field === 'calculator_policy');
  assert.equal(isPublicationReviewIssue({ ...calculatorIssue, message: 'Any translated missing-policy message' }), true);
  const input = sheets();
  input[0].data[1][input[0].data[0].indexOf('math_review_status')] = 'invalid';
  const invalidGate = validated(input).issues.find(issue => issue.field === 'math_review_status' && issue.severity === 'error');
  assert.equal(isPublicationReviewIssue({ ...invalidGate, message: 'Any translated invalid-enum message' }), false);
});

test('working-copy edits revalidate page, locator, Topic and Skills without changing source sheets', () => {
  const original = sheets();
  let working = applyQuestionFieldEdit(original, 2, 'source_page', '13');
  assert.ok(validated(working).issues.some((issue) => issue.field === 'source_locator' && issue.message.includes('does not match')));
  working = applyQuestionFieldEdit(working, 2, 'source_locator', 'p013-item03');
  working = applyQuestionFieldEdit(working, 2, 'primary_topic_code', '9.9');
  assert.ok(validated(working).issues.some((issue) => issue.field === 'primary_topic_code' && issue.message.includes('does not exist')));
  working = applyQuestionFieldEdit(working, 2, 'primary_topic_code', '2.2');
  working = applyQuestionFieldEdit(working, 2, 'practice_skill_codes', '1.A|2.B');
  assert.equal(buildQuestionBankDraftSavePlan(validated(working), references).canSave, true);
  assert.equal(getQuestionEditChanges(original, working).length, 4);
  assert.equal(original[0].data[1][QUESTION_HEADERS.indexOf('source_page')], 12);
  assert.equal(original[0].data[1][QUESTION_HEADERS.indexOf('primary_topic_code')], '2.1');
});

test('confirmation uses edited values and preserves exact before/after evidence', () => {
  const original = sheets();
  let working = applyQuestionFieldEdit(original, 2, 'source_page', '13');
  working = applyQuestionFieldEdit(working, 2, 'source_locator', 'p013-item03');
  working = applyQuestionFieldEdit(working, 2, 'calculator_policy', 'calculator_allowed');
  working = applyQuestionFieldEdit(working, 2, 'difficulty', 'hard');
  working = applyQuestionFieldEdit(working, 2, 'course_scope', 'BOTH');
  working = applyQuestionFieldEdit(working, 2, 'representation_type', 'mixed');
  working = applyQuestionFieldEdit(working, 2, 'primary_topic_code', '2.2');
  working = applyQuestionFieldEdit(working, 2, 'practice_skill_codes', '1.A|2.B');
  const changes = getQuestionEditChanges(original, working);
  const plan = buildQuestionBankDraftSavePlan(validated(working), references, changes);
  assert.equal(plan.canSave, true);
  assert.equal(plan.payload[0].source_page, '13');
  assert.equal(plan.payload[0].source_locator, 'p013-item03');
  assert.equal(plan.payload[0].calculator_policy, 'calculator_allowed');
  assert.equal(plan.payload[0].difficulty, 'hard');
  assert.equal(plan.payload[0].course_scope, 'BOTH');
  assert.equal(plan.payload[0].representation_type, 'mixed');
  assert.equal(plan.payload[0].primary_topic_code, '2.2');
  assert.deepEqual(plan.payload[0].practice_skill_codes, ['1.A', '2.B']);
  assert.equal(plan.payload[0].import_evidence.original_source_page, '12');
  assert.equal(plan.payload[0].import_evidence.original_source_locator, 'p012-item03');
  assert.deepEqual(plan.payload[0].import_evidence.manual_edits, changes);
  assert.equal(plan.payload[0].import_evidence.human_review_status, 'pending');
  assert.equal(plan.payload[0].import_evidence.ai_flags[0], 'ANSWER_AI_INFERRED');
});

test('undo restores one row and cancellation never creates a save payload', () => {
  const original = sheets();
  const changed = applyQuestionFieldEdit(original, 2, 'difficulty', 'hard');
  assert.equal(getQuestionEditChanges(original, changed).length, 1);
  const undone = revertQuestionEdits(original, changed, 2);
  assert.deepEqual(getQuestionEditChanges(original, undone), []);
  assert.deepEqual(undone, original);
  assert.deepEqual(getQuestionEditChanges(original, original), []);
});

test('pending review and unresolved flags are publication tasks, not draft-save errors', () => {
  const original = sheets();
  const report = validated(original);
  const plan = buildQuestionBankDraftSavePlan(report, references);
  assert.equal(plan.canSave, true);
  assert.equal(plan.batchReasons.length, 0);
  assert.equal(report.questions[0].humanReviewStatus, 'pending');
  assert.equal(report.questions[0].reviewGates.math_review_status, 'pending');
  assert.ok(getPublicationReviewTasks(report.questions[0]).some((item) => item.includes('ANSWER_AI_INFERRED')));
  assert.ok(getPublicationReviewTasks(report.questions[0]).some((item) => item.includes('source_type')));
});

test('claimed XLSX approval with unpassed gates or AI flags still saves only a draft', () => {
  const input = sheets();
  const header = input[0].data[0];
  input[0].data[1][header.indexOf('human_review_status')] = 'approved';
  const report = validated(input);
  assert.ok(report.issues.some((issue) => issue.severity === 'error' && issue.field === 'math_review_status'));
  const plan = buildQuestionBankDraftSavePlan(report, references);
  assert.equal(plan.canSave, true);
  assert.equal(plan.payload[0].import_evidence.human_review_status, 'approved');
  assert.equal(plan.payload[0].import_evidence.review_gates.math_review_status, 'pending');
  assert.equal(plan.payload[0].import_evidence.ai_flags[0], 'ANSWER_AI_INFERRED');
});

test('invalid controlled review values still block the workbook contract', () => {
  for (const [field, value] of [
    ['human_review_status', 'not_a_status'],
    ['math_review_status', 'not_a_gate'],
  ]) {
    const input = sheets();
    input[0].data[1][input[0].data[0].indexOf(field)] = value;
    const plan = buildQuestionBankDraftSavePlan(validated(input), references);
    assert.equal(plan.canSave, false, field);
    assert.ok(plan.batchReasons.some((reason) => reason.includes(field)), field);
  }
});

test('Admin preview labels draft blockers separately from publication review and never edits approval gates', () => {
  const preview = readFileSync(new URL('../components/admin/QuestionBankPreview.tsx', import.meta.url), 'utf8');
  assert.match(preview, /field issue\(s\) block draft saving/);
  assert.match(preview, /Review details/);
  assert.match(preview, /original XLSX stays unchanged/);
  assert.doesNotMatch(preview, /editQuestion\([^\n]*"(?:human_review_status|math_review_status|source_rights_status|taxonomy_review_status|render_review_status|ai_flags)"/);
});
