import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { QUESTION_HEADERS, OPTION_HEADERS, validateQuestionBankSheets } from './questionBankImport.ts';
import { buildQuestionBankDraftSavePlan, getPublicationReviewTasks } from './questionBankDraftSave.ts';
import { saveQuestionBankDrafts } from './questionBankDraftRepository.ts';
import { analyzeQuestionBankMath } from './questionBankMath.ts';

const row = (headers, values) => headers.map((header) => values[header] ?? null);
const question = (overrides = {}) => ({
  external_id: 'synthetic-001', source_document: 'SOURCE_FILE.pdf', source_page: '12-13',
  source_locator: 'p012-item03', stem: '合成题干 \\(x^2\\)', solution: '合成解析 \\[2x\\]',
  correct_option_key: 'A', difficulty: 'easy', course_scope: 'AB', primary_topic_code: '2.1',
  practice_skill_codes: '1.A', representation_type: 'analytical', calculator_policy: null,
  requires_figure: false, human_review_status: 'pending', ai_flags: 'ANSWER_AI_INFERRED',
  source_transcription_notes: '合成抄录备注', ai_inference_notes: '合成推断备注',
  human_review_notes: '合成人工备注', ...overrides,
});
const option = (key, correct, overrides = {}) => ({
  question_external_id: 'synthetic-001', option_key: key, option_text: `合成选项 ${key}`,
  is_correct: correct, option_explanation: `合成选项解析 ${key}`, ...overrides,
});
const sheets = (questions = [question()], options = [option('A', true), option('B', false)]) => [
  { sheet: 'Questions', data: [QUESTION_HEADERS, ...questions.map((value) => row(QUESTION_HEADERS, value))] },
  { sheet: 'Options', data: [OPTION_HEADERS, ...options.map((value) => row(OPTION_HEADERS, value))] },
  { sheet: 'Instructions', data: [['Documentation only']] },
];
const references = (existingExternalIds = new Set()) => ({
  topics: [{ id: 'topic-id', topic_code: '2.1', title: 'Synthetic' }],
  skills: [{ id: 'skill-id', skill_code: '1.A', description: 'Synthetic' }],
  existingExternalIds,
});
const planFor = (input, refs = references()) => {
  const report = validateQuestionBankSheets(input, {
    topicCodes: new Set(refs.topics.map((value) => value.topic_code)),
    practiceSkillCodes: new Set(refs.skills.map((value) => value.skill_code)),
  });
  return buildQuestionBankDraftSavePlan(report, refs);
};

test('pending and XLSX-approved rows both become draft-save payload without invented policy or rights', () => {
  for (const status of ['pending', 'approved']) {
    const input = question(status === 'approved' ? {
      human_review_status: 'approved', ai_flags: null, math_review_status: 'passed',
      source_rights_status: 'passed', taxonomy_review_status: 'passed', render_review_status: 'passed',
      reviewed_by: 'educator-test', reviewed_at: '2026-10-04T12:00:00Z',
      calculator_policy: 'no_calculator',
    } : {});
    const plan = planFor(sheets([input]));
    assert.equal(plan.canSave, true, JSON.stringify(plan));
    assert.equal(plan.payload[0].calculator_policy, status === 'pending' ? null : 'no_calculator');
    assert.equal(plan.payload[0].source_type, undefined);
    assert.equal(plan.payload[0].import_evidence.human_review_status, status);
    assert.equal(plan.payload[0].import_evidence.source_transcription_notes, '合成抄录备注');
    assert.equal(plan.payload[0].import_evidence.ai_inference_notes, '合成推断备注');
    assert.equal(plan.payload[0].import_evidence.human_review_notes, '合成人工备注');
    assert.equal(plan.payload[0].options[0].import_evidence.option_explanation, '合成选项解析 A');
  }
});

test('bad workbook, duplicate external ID, and orphan option block the whole batch', () => {
  const missingSheet = sheets(); missingSheet.pop();
  assert.equal(planFor(missingSheet).canSave, false);
  assert.equal(planFor(sheets(), references(new Set(['synthetic-001']))).canSave, false);
  assert.equal(planFor(sheets([question()], [option('A', true), option('B', false), option('C', false, {
    question_external_id: 'orphan',
  })])).canSave, false);
});

test('stored draft fields and taxonomy must be complete even if preview allows pending warnings', () => {
  assert.equal(planFor(sheets([question({ solution: null })])).canSave, false);
  assert.equal(planFor(sheets([question({ primary_topic_code: '9.9' })])).canSave, false);
});

test('blocked or cancelled preview cannot call the write RPC; valid confirmation calls it once', async () => {
  let writes = 0;
  const client = { rpc: async (name, args) => {
    writes += 1;
    assert.equal(name, 'save_question_bank_drafts');
    assert.equal(args._items.length, 1);
    return { data: [{ external_id: 'synthetic-001' }], error: null };
  } };
  const valid = planFor(sheets());
  assert.equal(writes, 0, 'mere parsing and preview never write');
  await assert.rejects(saveQuestionBankDrafts(client, planFor(sheets(), references(new Set(['synthetic-001'])))));
  assert.equal(writes, 0);
  assert.deepEqual(await saveQuestionBankDrafts(client, valid), ['synthetic-001']);
  assert.equal(writes, 1);

  const preview = readFileSync(new URL('../components/admin/QuestionBankPreview.tsx', import.meta.url), 'utf8');
  const cancelBody = preview.split('const cancelPreview = () => {')[1].split('const confirmSave =')[0];
  assert.doesNotMatch(cancelBody, /saveQuestionBankDrafts|\.rpc\s*\(/);
  assert.match(cancelBody, /setOriginalSheets\(null\)/);
  assert.match(cancelBody, /setWorkingSheets\(null\)/);
});

test('existing strict math renderer handles template delimiters and flags bad LaTeX', () => {
  const result = analyzeQuestionBankMath('行内 \\(x^2\\)\n\n独立 \\[\\frac{1}{2}\\]');
  assert.deepEqual(result.issues, []);
  assert.match(result.renderContent, /\$x\^2\$/);
  assert.match(result.renderContent, /\$\$\s*\\frac\{1\}\{2\}\s*\$\$/);
  assert.ok(analyzeQuestionBankMath('坏公式 \\(\\frac{1}\\)').issues.length > 0);
});

test('unknown calculator and original flags remain evidence without obsolete publication tasks',()=>{
  const data=sheets([question({human_review_status:'approved'})]);
  const plan=planFor(data);assert.equal(plan.canSave,true);assert.equal(plan.payload[0].calculator_policy,null);
  assert.deepEqual(plan.payload[0].import_evidence.ai_flags,['ANSWER_AI_INFERRED']);
  const tasks=getPublicationReviewTasks();
  assert.equal(tasks.length,1);assert.match(tasks[0],/confirm once/);
  assert.doesNotMatch(tasks.join(),/source_type|undecided|not passed|timestamp|AI flag/);
});
