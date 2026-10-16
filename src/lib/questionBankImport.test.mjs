import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  OPTION_HEADERS, QUESTION_HEADERS, parseQuestionBankWorkbook, validateQuestionBankSheets,
} from './questionBankImport.ts';

const row = (headers, values) => headers.map((header) => values[header] ?? null);
const question = (overrides = {}) => ({
  external_id: 'sample-001', source_document: 'SOURCE_FILE.pdf', source_page: 12,
  source_question_number: null, source_locator: 'p012-item03',
  stem: '求 \\(x^2\\) 的导数。', solution: '导数是 \\[2x\\]。',
  correct_option_key: 'A', difficulty: 'easy', course_scope: 'AB',
  primary_topic_code: '2.1', practice_skill_codes: '1.A',
  representation_type: 'analytical', calculator_policy: 'no_calculator',
  requires_figure: false, figure_reference: null, image_url: null,
  math_review_status: 'pending', source_rights_status: 'pending',
  taxonomy_review_status: 'pending', render_review_status: 'pending',
  human_review_status: 'pending', ai_flags: 'ANSWER_AI_INFERRED',
  human_review_notes: '占位说明，仅供测试。',
  ...overrides,
});
const option = (key, isCorrect, overrides = {}) => ({
  question_external_id: 'sample-001', option_key: key,
  option_text: key === 'A' ? '\\(2x\\)' : '\\(x\\)',
  is_correct: isCorrect, ...overrides,
});
const workbook = (questions = [question()], options = [option('A', true), option('B', false)]) => [
  { sheet: 'Questions', data: [QUESTION_HEADERS, ...questions.map((item) => row(QUESTION_HEADERS, item))] },
  { sheet: 'Options', data: [OPTION_HEADERS, ...options.map((item) => row(OPTION_HEADERS, item))] },
  { sheet: 'Instructions', data: [['Documentation only']] },
];
const hasIssue = (report, sheet, field, fragment) => report.issues.some((issue) =>
  issue.sheet === sheet && issue.field === field && issue.message.includes(fragment));

test('the checked-in blank template parses as exactly three sheets and correct headers', async () => {
  const buffer = readFileSync(new URL('../../docs/question-bank/templates/O2I_Question_Bank_Import_Template.xlsx', import.meta.url));
  const sheets = await parseQuestionBankWorkbook(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
  assert.deepEqual(sheets.map((sheet) => sheet.sheet), ['Questions', 'Options', 'Instructions']);
  assert.deepEqual(sheets[0].data[0], [...QUESTION_HEADERS]);
  assert.deepEqual(sheets[1].data[0], [...OPTION_HEADERS]);
  assert.equal(validateQuestionBankSheets(sheets).questionRowCount, 0);
});

test('a structurally valid pending draft previews but is not import-ready', () => {
  const report = validateQuestionBankSheets(workbook());
  assert.equal(report.questionRowCount, 1);
  assert.equal(report.optionRowCount, 2);
  assert.equal(report.issues.filter((issue) => issue.severity === 'error').length, 0);
  assert.equal(report.questions[0].readiness, 'pending');
  assert.equal(report.topicVerification, 'unverified');
  assert.equal(report.skillVerification, 'unverified');
  assert.ok(hasIssue(report, 'Questions', 'primary_topic_code', 'unverified'));
  assert.equal(report.questions[0].stem, '求 \\(x^2\\) 的导数。');
});

test('canonical codes can be marked verified only when their sets are supplied', () => {
  const approved = question({
    human_review_status: 'approved', ai_flags: null,
    math_review_status: 'passed', source_rights_status: 'passed',
    taxonomy_review_status: 'passed', render_review_status: 'passed',
    reviewed_by: 'educator-1', reviewed_at: '2026-10-01T12:00:00Z',
  });
  const report = validateQuestionBankSheets(workbook([approved]), {
    topicCodes: new Set(['2.1']), practiceSkillCodes: new Set(['1.A']),
  });
  assert.equal(report.issues.length, 0);
  assert.equal(report.questions[0].readiness, 'candidate');
});

test('missing sheet and wrong header are reported at their exact locations', () => {
  const sheets = workbook();
  sheets[0].data[0] = [...QUESTION_HEADERS];
  sheets[0].data[0][0] = 'wrong_id';
  sheets.pop();
  const report = validateQuestionBankSheets(sheets);
  assert.ok(hasIssue(report, 'Questions', 'external_id', 'Header'));
  assert.ok(hasIssue(report, 'Instructions', 'sheet', 'missing'));
  assert.equal(report.questions[0].readiness, 'blocked');
});

test('an extra sheet violates the exact three-sheet contract', () => {
  const sheets = workbook();
  sheets.push({ sheet: 'Extra', data: [['not part of template']] });
  const report = validateQuestionBankSheets(sheets);
  assert.ok(hasIssue(report, 'Workbook', 'sheet', 'Exactly three'));
  assert.ok(hasIssue(report, 'Extra', 'sheet', 'Unexpected'));
  assert.equal(report.questions[0].readiness, 'blocked');
});

test('duplicate external ID and orphan option are rejected', () => {
  const report = validateQuestionBankSheets(workbook(
    [question(), question()],
    [option('A', true), option('B', false), option('C', false, { question_external_id: 'absent' })],
  ));
  assert.ok(hasIssue(report, 'Questions', 'external_id', 'Duplicate'));
  assert.ok(hasIssue(report, 'Options', 'question_external_id', 'orphan'));
});

test('an orphan option blocks a batch with an otherwise valid approved question without hiding pending previews', () => {
  const approved = question({
    human_review_status: 'approved', ai_flags: null,
    math_review_status: 'passed', source_rights_status: 'passed',
    taxonomy_review_status: 'passed', render_review_status: 'passed',
    reviewed_by: 'educator-1', reviewed_at: '2026-10-01T12:00:00Z',
  });
  const options = [option('A', true), option('B', false), option('C', false, { question_external_id: 'absent' })];
  const canonical = { topicCodes: new Set(['2.1']), practiceSkillCodes: new Set(['1.A']) };
  const approvedReport = validateQuestionBankSheets(workbook([approved], options), canonical);
  assert.ok(hasIssue(approvedReport, 'Options', 'question_external_id', 'orphan'));
  assert.equal(approvedReport.questions[0].readiness, 'blocked');
  assert.equal(approvedReport.questions[0].options.length, 2);

  const pendingReport = validateQuestionBankSheets(workbook([question()], options));
  assert.equal(pendingReport.questions[0].readiness, 'pending');
  assert.equal(pendingReport.questions[0].options.length, 2);
});

test('option key duplication, zero or multiple correct options, and answer mismatch are rejected', () => {
  const duplicate = validateQuestionBankSheets(workbook([question()], [option('A', true), option('A', false)]));
  assert.ok(hasIssue(duplicate, 'Options', 'option_key', 'Duplicate'));
  const zero = validateQuestionBankSheets(workbook([question()], [option('A', false), option('B', false)]));
  assert.ok(hasIssue(zero, 'Questions', 'correct_option_key', 'found 0'));
  const multiple = validateQuestionBankSheets(workbook([question()], [option('A', true), option('B', true)]));
  assert.ok(hasIssue(multiple, 'Questions', 'correct_option_key', 'found 2'));
  const mismatch = validateQuestionBankSheets(workbook([question({ correct_option_key: 'B' })]));
  assert.ok(hasIssue(mismatch, 'Questions', 'correct_option_key', 'Does not match'));
});

test('source, figure, review and enum errors retain sheet, row and field', () => {
  const report = validateQuestionBankSheets(workbook([question({
    source_page: 0, source_question_number: null, source_locator: null,
    difficulty: 'expert', requires_figure: true, image_url: null, figure_reference: null,
  })]));
  for (const field of ['source_page', 'source_locator', 'difficulty', 'figure_reference', 'image_url']) {
    assert.ok(report.issues.some((issue) => issue.sheet === 'Questions' && issue.row === 2 && issue.field === field));
  }
});
