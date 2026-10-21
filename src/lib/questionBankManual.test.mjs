import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyManualQuestion, manualQuestionSheets } from './questionBankManual.ts';
import { QUESTION_HEADERS, OPTION_HEADERS, validateQuestionBankSheets } from './questionBankImport.ts';
import { buildQuestionBankDraftSavePlan } from './questionBankDraftSave.ts';
import { saveQuestionBankDrafts } from './questionBankDraftRepository.ts';

const references = {
  topics: [{ id: 'topic-id', topic_code: '1.6', title: 'Synthetic test only' }],
  skills: [{ id: 'skill-id', skill_code: '1.A', description: 'Synthetic test only' }],
  existingExternalIds: new Set(),
};
const valid = () => ({
  fields: { external_id: 'synthetic-manual', source_document: 'synthetic.pdf', source_page: '12-13',
    source_question_number: '1', stem: 'Synthetic \\(x^2\\)', solution: 'Synthetic \\(2x\\)',
    correct_option_key: 'B', difficulty: 'easy', course_scope: 'AB', primary_topic_code: '1.6',
    practice_skill_codes: '1.A', representation_type: 'analytical', requires_figure: false },
  options: ['A', 'B', 'C', 'D'].map(key => ({ key, text: 'Synthetic '+key, explanation: '', misconceptionCode: '' })),
});
const planFor = (draft, refs = references) => buildQuestionBankDraftSavePlan(validateQuestionBankSheets(manualQuestionSheets(draft), refs ? {
  topicCodes: new Set(refs.topics.map(topic => topic.topic_code)),
  practiceSkillCodes: new Set(refs.skills.map(skill => skill.skill_code)),
} : undefined), refs);

test('empty manual form has four blank choices and cannot be saved', () => {
  const draft = emptyManualQuestion();
  assert.deepEqual(draft.options.map(option => option.key), ['A','B','C','D']);
  assert.ok(draft.options.every(option => !option.text));
  assert.equal(planFor(draft).canSave, false);
});

test('manual and XLSX inputs have the same payload, with no invented review or source facts', () => {
  const draft = valid();
  const manual = planFor(draft);
  const values = { ...draft.fields, human_review_status: 'pending', math_review_status: 'pending', source_rights_status: 'pending',
    taxonomy_review_status: 'pending', render_review_status: 'pending' };
  const workbook = [
    { sheet: 'Questions', data: [QUESTION_HEADERS, QUESTION_HEADERS.map(key => values[key] ?? null)] },
    { sheet: 'Options', data: [OPTION_HEADERS, ...draft.options.map(option => [draft.fields.external_id, option.key, option.text, option.key === 'B', '', ''])] },
    { sheet: 'Instructions', data: [['Synthetic XLSX input']] },
  ];
  const imported = buildQuestionBankDraftSavePlan(validateQuestionBankSheets(workbook, {
    topicCodes: new Set(['1.6']), practiceSkillCodes: new Set(['1.A']),
  }), references);
  assert.equal(manual.canSave, true, JSON.stringify(manual.issues));
  assert.deepEqual(manual.payload, imported.payload);
  const item = manual.payload[0];
  assert.equal(item.calculator_policy, null);
  assert.equal(item.source_type, undefined);
  assert.equal(item.import_evidence.human_review_status, 'pending');
  assert.equal(item.import_evidence.reviewed_by_text, '');
  assert.equal(item.import_evidence.reviewed_at_text, '');
  assert.equal(item.correct_option_key, 'B');
  assert.deepEqual(item.options.map(option => option.is_correct), [false,true,false,false]);
});

test('manual inputs cannot claim approval through the adapter', () => {
  const draft = valid();
  Object.assign(draft.fields, { human_review_status: 'approved', math_review_status: 'passed', reviewed_by: 'invented', reviewed_at: '2026-10-21T00:00:00Z' });
  const evidence = planFor(draft).payload[0].import_evidence;
  assert.equal(evidence.human_review_status, 'pending');
  assert.equal(evidence.review_gates.math_review_status, 'pending');
  assert.equal(evidence.reviewed_by_text, '');
  assert.equal(evidence.reviewed_at_text, '');
});

test('shared checks reject missing fields, bad math, unknown taxonomy, duplicate IDs and missing figures', () => {
  for (const fields of [
    { stem: '' }, { solution: '' }, { source_document: '' }, { source_page: '0' }, { correct_option_key: '' },
    { primary_topic_code: '99.9' }, { practice_skill_codes: '9.Z' }, { requires_figure: true },
    { stem: 'Bad \\(\\frac{1}\\)' }, { source_question_number: '', source_locator: '' },
  ]) {
    const draft = valid(); Object.assign(draft.fields, fields);
    assert.equal(planFor(draft).canSave, false, JSON.stringify(fields));
  }
  assert.equal(planFor(valid(), { ...references, existingExternalIds: new Set(['synthetic-manual']) }).canSave, false);
  assert.equal(planFor(valid(), null).canSave, false);
});

test('2–6 options, unique keys, exactly one matching correct answer and option evidence use shared rules', () => {
  for (const count of [1,2,6,7]) {
    const draft = valid();
    draft.options = Array.from({length:count}, (_,i) => ({key:String.fromCharCode(65+i),text:'Synthetic '+i,explanation:'',misconceptionCode:''}));
    assert.equal(planFor(draft).canSave, count >= 2 && count <= 6);
  }
  const draft = valid(); draft.options[0].key = 'B';
  assert.equal(planFor(draft).canSave, false);
  draft.options = draft.options.filter(option => option.key !== 'B');
  assert.equal(planFor(draft).canSave, false, 'Removing the correct answer invalidates the form');
});

test('manual preview makes no writes; confirmed valid form uses the existing atomic RPC', async () => {
  let writes = 0;
  const plan = planFor(valid());
  const client = { rpc: async (name, args) => {
    writes++; assert.equal(name, 'save_question_bank_drafts'); assert.deepEqual(args._items, plan.payload);
    return {data:[{external_id:'synthetic-manual'}],error:null};
  } };
  assert.equal(writes, 0);
  await assert.rejects(saveQuestionBankDrafts(client, planFor(emptyManualQuestion())));
  assert.equal(writes, 0);
  assert.deepEqual(await saveQuestionBankDrafts(client, plan), ['synthetic-manual']);
  assert.equal(writes, 1);
});
