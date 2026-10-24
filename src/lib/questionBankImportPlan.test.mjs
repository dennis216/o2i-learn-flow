import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { QUESTION_HEADERS, OPTION_HEADERS, validateQuestionBankSheets } from './questionBankImport.ts';
import { buildQuestionBankImportPlan } from './questionBankImportPlan.ts';
import { loadQuestionBankReferences } from './questionBankReferences.ts';

const row = (headers, values) => headers.map((header) => values[header] ?? null);
const approvedQuestion = (overrides = {}) => ({
  external_id: 'synthetic-001', source_document: 'SOURCE_FILE.pdf', source_page: 12,
  source_question_number: null, source_locator: 'p012-item03',
  stem: '合成题干 \\(x^2\\)', solution: '合成解析 \\[2x\\]', correct_option_key: 'A',
  difficulty: 'easy', course_scope: 'AB', primary_topic_code: '2.1',
  practice_skill_codes: '1.A', representation_type: 'analytical',
  calculator_policy: 'no_calculator', requires_figure: false,
  human_review_status: 'approved', math_review_status: 'passed',
  source_rights_status: 'passed', taxonomy_review_status: 'passed',
  render_review_status: 'passed', reviewed_by: 'educator-test',
  reviewed_at: '2026-10-03T12:00:00Z', ...overrides,
});
const option = (questionId, key, correct) => ({
  question_external_id: questionId, option_key: key, option_text: `合成选项 ${key}`,
  is_correct: correct,
});
const sheets = (questions = [approvedQuestion()], options = [
  option('synthetic-001', 'A', true), option('synthetic-001', 'B', false),
]) => [
  { sheet: 'Questions', data: [QUESTION_HEADERS, ...questions.map((item) => row(QUESTION_HEADERS, item))] },
  { sheet: 'Options', data: [OPTION_HEADERS, ...options.map((item) => row(OPTION_HEADERS, item))] },
  { sheet: 'Instructions', data: [['Documentation only']] },
];
const references = (overrides = {}) => ({
  topics: [{ id: 'topic-uuid-1', topic_code: '2.1', title: 'Synthetic topic' }],
  skills: [{ id: 'skill-uuid-1', skill_code: '1.A', description: 'Synthetic skill' }],
  existingExternalIds: new Set(), ...overrides,
});
const planFor = (inputSheets, refs = references()) => {
  const report = validateQuestionBankSheets(inputSheets, {
    topicCodes: new Set(refs.topics.map((item) => item.topic_code)),
    practiceSkillCodes: new Set(refs.skills.map((item) => item.skill_code)),
  });
  return { report, plan: buildQuestionBankImportPlan(report, refs) };
};

test('fully approved valid question resolves real Topic and Skill IDs and becomes a candidate', () => {
  const { plan } = planFor(sheets());
  assert.equal(plan.items[0].status, 'candidate');
  assert.equal(plan.items[0].primaryTopicId, 'topic-uuid-1');
  assert.deepEqual(plan.items[0].practiceSkillIds, ['skill-uuid-1']);
  assert.deepEqual([plan.candidateCount, plan.blockedCount, plan.questionCount,
    plan.versionCount, plan.optionCount, plan.practiceSkillMappingCount], [1, 0, 1, 1, 2, 1]);
});

test('missing canonical Topic and Skill codes block the question with exact sheet, row and field', () => {
  const { report, plan } = planFor(sheets([approvedQuestion({
    primary_topic_code: '9.9', practice_skill_codes: '9.Z',
  })]));
  assert.equal(plan.items[0].status, 'canonical_blocked');
  assert.equal(plan.candidateCount, 0);
  assert.ok(report.issues.some((issue) => issue.sheet === 'Questions' && issue.row === 2
    && issue.field === 'primary_topic_code' && issue.message.includes('does not exist')));
  assert.ok(report.issues.some((issue) => issue.sheet === 'Questions' && issue.row === 2
    && issue.field === 'practice_skill_codes' && issue.message.includes('does not exist')));
});

test('an existing database external_id blocks an otherwise valid candidate', () => {
  const { plan } = planFor(sheets(), references({ existingExternalIds: new Set(['synthetic-001']) }));
  assert.equal(plan.items[0].status, 'duplicate_external_id');
  assert.ok(plan.items[0].reasons.some((reason) => reason.includes('数据库已存在')));
  assert.equal(plan.questionCount, 0);
});

test('pending AI draft remains previewable but does not enter the plan', () => {
  const pending = approvedQuestion({
    human_review_status: 'pending', math_review_status: 'pending',
    source_rights_status: 'pending', taxonomy_review_status: 'pending',
    render_review_status: 'pending', reviewed_by: null, reviewed_at: null,
    ai_flags: 'TAXONOMY_UNCERTAIN',
  });
  const { report, plan } = planFor(sheets([pending]));
  assert.equal(report.questions.length, 1);
  assert.equal(plan.items[0].status, 'pending');
  assert.equal(plan.candidateCount, 0);
  assert.equal(plan.blockedCount, 1);
  const rejected = planFor(sheets([approvedQuestion({ human_review_status: 'rejected' })]));
  assert.equal(rejected.plan.items[0].status, 'blocked');
});

test('legacy review metadata and AI flags do not block a structurally valid intake candidate', () => {
  const cases = [
    { source_rights_status: 'pending' },
    { reviewed_at: '2026-02-30T12:00:00Z' },
    { ai_flags: 'ANSWER_AI_INFERRED' },
  ];
  for (const values of cases) {
    const { plan } = planFor(sheets([approvedQuestion(values)]));
    assert.equal(plan.items[0].status, 'candidate');
    assert.equal(plan.candidateCount, 1);
    assert.equal(plan.items[0].reasons.length, 0);
  }
});

test('summary counts only candidates and their actual options and skill mappings', () => {
  const refs = references({ skills: [
    { id: 'skill-uuid-1', skill_code: '1.A', description: 'A' },
    { id: 'skill-uuid-2', skill_code: '2.B', description: 'B' },
  ] });
  const questions = [approvedQuestion(), approvedQuestion({
    external_id: 'synthetic-002', practice_skill_codes: '1.A|2.B',
  })];
  const options = [
    option('synthetic-001', 'A', true), option('synthetic-001', 'B', false),
    option('synthetic-002', 'A', true), option('synthetic-002', 'B', false),
    option('synthetic-002', 'C', false),
  ];
  const { plan } = planFor(sheets(questions, options), refs);
  assert.deepEqual([plan.candidateCount, plan.blockedCount, plan.questionCount,
    plan.versionCount, plan.optionCount, plan.practiceSkillMappingCount], [2, 0, 2, 2, 5, 3]);
});

test('an orphan option blocks the entire batch rather than leaving a candidate', () => {
  const { plan } = planFor(sheets([approvedQuestion()], [
    option('synthetic-001', 'A', true), option('synthetic-001', 'B', false),
    option('missing-id', 'C', false),
  ]));
  assert.equal(plan.items[0].status, 'blocked');
  assert.ok(plan.items[0].reasons.some((reason) => reason.includes('orphan option')));
  assert.equal(plan.candidateCount, 0);
});

test('read-only plan and reference loader contain no database write calls', () => {
  for (const file of ['./questionBankImportPlan.ts', './questionBankReferences.ts',
    '../components/admin/QuestionBankPreview.tsx']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /\.(?:insert|update|upsert|delete)\s*\(/);
    assert.doesNotMatch(source, /\.rpc\s*\(\s*["'](?:approve|create|retire|submit|return)_question/);
  }
});

test('reference loading checks this user is admin before any SELECT and reads every ID page', async () => {
  const calls = [];
  const data = {
    curriculum_topics: [{ id: 'topic-uuid-1', topic_code: '2.1', title: 'Synthetic topic' }],
    curriculum_practice_skills: [{ id: 'skill-uuid-1', skill_code: '1.A', description: 'Synthetic skill' }],
    questions: Array.from({ length: 1001 }, (_, index) => ({ external_id: `existing-${index}` })),
  };
  const client = {
    auth: { getUser: async () => { calls.push('getUser'); return { data: { user: { id: 'admin-test-id' } }, error: null }; } },
    rpc: async (name, args) => {
      calls.push(`rpc:${name}`);
      assert.deepEqual(args, { _module: 'questions' });
      return { data: true, error: null };
    },
    from: (table) => ({
      select: (columns) => {
        calls.push(`select:${table}:${columns}`);
        return { order: (field) => {
          assert.equal(field, 'id');
          return { range: async (from, to) => ({ data: data[table].slice(from, to + 1), error: null }) };
        } };
      },
    }),
  };
  const loaded = await loadQuestionBankReferences(client);
  assert.deepEqual(calls.slice(0, 2), ['getUser', 'rpc:has_admin_module']);
  assert.equal(loaded.topics.length, 1);
  assert.equal(loaded.skills.length, 1);
  assert.equal(loaded.existingExternalIds.size, 1001);
  assert.ok(loaded.existingExternalIds.has('existing-1000'));

  let queried = false;
  await assert.rejects(loadQuestionBankReferences({
    auth: client.auth,
    rpc: async () => ({ data: false, error: null }),
    from: () => { queried = true; throw new Error('SELECT must not run'); },
  }), /Administrator access is required/);
  assert.equal(queried, false);
});

test('missing questions schema rejects the reference snapshot and a read-only retry succeeds', async () => {
  let unavailable = true;
  const calls = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'temporary-admin' } }, error: null }) },
    rpc: async (name) => { calls.push(name); return { data: true, error: null }; },
    from: (table) => ({ select: () => ({ order: () => ({ range: async () => {
      if (table === 'questions' && unavailable) return { data: null, error: { message: "Could not find the table 'public.questions' in the schema cache" } };
      return { data: [], error: null };
    } }) }) }),
  };
  await assert.rejects(loadQuestionBankReferences(client), /Could not load existing question IDs:.*schema cache/);
  unavailable = false;
  const loaded = await loadQuestionBankReferences(client);
  assert.deepEqual(loaded.topics, []);
  assert.deepEqual(loaded.skills, []);
  assert.equal(loaded.existingExternalIds.size, 0);
  assert.deepEqual(calls, ['has_admin_module', 'has_admin_module']);
});
