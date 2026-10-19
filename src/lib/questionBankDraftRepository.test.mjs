import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { loadQuestionBankPage, loadQuestionBankVersionPreview, loadAllUnpublishedQuestions } from './questionBankDraftRepository.ts';

const version = (id, questionId, status, number) => ({
  id, question_id: questionId, status, version_number: number,
  stem: `Synthetic ${id} \\(x^2\\)`, solution: 'Synthetic solution \\[2x\\]',
  difficulty: 'easy', calculator_policy:'no_calculator', course_scope: 'AB', primary_topic_id: 'topic-1',
  topic: { topic_code: '1.1', title: 'Synthetic topic' },
  skills: [{ skill: { skill_code: '1.A' } }],
  source_document: 'SYNTHETIC.pdf', source_page: 12,
  source_question_number: null, source_locator: 'p012-item01', source_reference: null,
  requires_figure: false, image_url: null, import_evidence:{ai_flags:['DIFFICULTY_UNCERTAIN','CALCULATOR_POLICY_UNCERTAIN','TAXONOMY_UNCERTAIN']},
});
const question = (id, status = 'draft', current = null) => ({
  id, external_id: `synthetic-${id}`, status, current_version_id: current,
  created_at: '2026-10-01T00:00:00Z',
});

// A SELECT-only PostgREST double: filters/join direction/order/range are executed,
// not just text asserted. All fixtures are synthetic; no real question content.
function fixtureClient({ admin = true, authenticated = true, failTable, missingData = false, authError = false, roleError = false } = {}) {
  const questions = Array.from({ length: 24 }, (_, i) => question(`q${String(i).padStart(2, '0')}`));
  questions.push(question('published', 'approved', 'published-v3'), question('retired', 'retired', 'retired-v1'));
  const versions = questions.slice(0, 24).map(q => version(`${q.id}-v2`, q.id, 'draft', 2));
  versions.push(version('published-v1', 'published', 'superseded', 1),
    version('published-v3', 'published', 'approved', 3),
    version('published-v4', 'published', 'review', 4),
    version('retired-v1', 'retired', 'approved', 1), version('retired-v2', 'retired', 'draft', 2));
  const options = [
    { id: 'option-b', question_version_id: 'published-v3', option_key: 'B', option_text: 'Synthetic wrong', order_index: 2, is_correct: false },
    { id: 'option-a', question_version_id: 'published-v3', option_key: 'A', option_text: 'Synthetic correct \\(2x\\)', order_index: 1, is_correct: true },
  ];
  const calls = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: authenticated ? { id: 'synthetic-admin' } : null }, error: authError ? { message: 'Synthetic identity network failure' } : null }) },
    rpc: async name => {
      calls.push(['rpc', name]);
      assert.equal(name, 'has_role', 'list/preview must never call a write RPC');
      return { data: admin, error: roleError ? { message: 'Synthetic role network failure' } : null };
    },
    from(table) {
      const steps = [];
      calls.push([table, steps]);
      const builder = {};
      for (const method of ['select', 'eq', 'neq', 'in', 'order', 'range', 'single', 'or']) {
        builder[method] = (...args) => { steps.push([method, ...args]); return builder; };
      }
      builder.then = (resolve, reject) => Promise.resolve().then(() => {
        if (table === failTable) return { data: null, error: { message: 'Synthetic permission/network failure' }, count: null };
        if (missingData) return { data: null, error: null, count: null };
        let rows = table === 'questions' ? questions : table === 'question_versions' ? versions : options;
        const select = steps.find(s => s[0] === 'select')?.[1] ?? '';
        if (table === 'questions' && select.includes('working:')) {
          rows = rows.map(q => ({ ...q, current: versions.find(v => v.id === q.current_version_id && v.question_id === q.id) ?? null,
            working: versions.filter(v => v.question_id === q.id) }));
        }
        for (const [method, field, value] of steps) {
          if (!['eq', 'neq', 'in'].includes(method)) continue;
          const matches = actual => method === 'in' ? value.includes(actual) : method === 'eq' ? actual === value : actual !== value;
          if (field.startsWith('working.')) {
            rows = rows.map(q => ({ ...q, working: q.working.filter(v => matches(v[field.slice(8)])) }));
          } else rows = rows.filter(r => matches(r[field]));
        }
        if (steps.some(s => s[0] === 'or')) rows = rows.filter(q => q.status === 'unpublished' || q.working.length);
        if (select.includes('!inner')) rows = rows.filter(q => Array.isArray(q.version) ? q.version.length : q.version);
        const ordering = steps.filter(s => s[0] === 'order');
        rows = [...rows].sort((a, b) => {
          for (const [, field, opts] of ordering) {
            const cmp = String(a[field]).localeCompare(String(b[field]));
            if (cmp) return opts?.ascending === false ? -cmp : cmp;
          }
          return 0;
        });
        const count = rows.length;
        const range = steps.find(s => s[0] === 'range');
        if (range) rows = rows.slice(range[1], range[2] + 1);
        return { data: steps.some(s => s[0] === 'single') ? rows[0] ?? null : rows, count, error: null };
      }).then(resolve, reject);
      return builder;
    },
  };
  return { client, calls, questions, versions };
}

test('draft identity pagination has a stable tie-breaker, no gaps and no historical duplicates', async () => {
  const { client, calls } = fixtureClient();
  const pages = await Promise.all([0, 1, 2].map(page => loadQuestionBankPage(client, 'drafts', page, 10)));
  assert.deepEqual(pages.map(p => p.total), [25, 25, 25]);
  const items = pages.flatMap(p => p.items);
  assert.equal(items.length, 25);
  assert.equal(new Set(items.map(i => i.id)).size, 25);
  assert.ok(items.every(i => ['draft', 'review'].includes(i.versionStatus)));
  assert.equal(items.find(i => i.id === 'published').versionId, 'published-v4');
  assert.ok(!items.some(i => i.id === 'retired'));
  for (const [, steps] of calls.filter(([name]) => name === 'questions')) {
    assert.deepEqual(steps.filter(s => s[0] === 'order').map(s => s[1]), ['created_at', 'id']);
  }
  assert.deepEqual(calls.filter(([name]) => name === 'questions').map(([, steps]) => steps.find(s => s[0] === 'range').slice(1)), [[0, 9], [10, 19], [20, 29]]);
});

test('published list uses the publication pointer while a newer working revision exists', async () => {
  const { client } = fixtureClient();
  const page = await loadQuestionBankPage(client, 'published', 0, 20);
  assert.equal(page.total, 1);
  assert.equal(page.items[0].versionId, 'published-v3');
  assert.equal(page.items[0].versionNumber, 3);
  assert.equal(page.items[0].topicCode, '1.1');
  assert.deepEqual(page.items[0].practiceSkillCodes, ['1.A']);
  assert.equal(page.items[0].workingVersionId, 'published-v4');
});

test('withdrawn identities appear once, preferring a working revision and retaining current pointer', async () => {
  const {client,questions,versions}=fixtureClient();
  questions.push(question('withdrawn','unpublished','withdrawn-v2'));
  versions.push(version('withdrawn-v1','withdrawn','superseded',1),version('withdrawn-v2','withdrawn','approved',2));
  let item=(await loadQuestionBankPage(client,'drafts',0,100)).items.find(i=>i.id==='withdrawn');
  assert.equal(item.versionId,'withdrawn-v2');assert.equal(item.questionStatus,'unpublished');
  versions.push(version('withdrawn-v3','withdrawn','draft',3));
  const all=await loadAllUnpublishedQuestions(client);item=all.find(i=>i.id==='withdrawn');
  assert.equal(item.versionId,'withdrawn-v3');assert.equal(item.currentVersionId,'withdrawn-v2');
  assert.equal(all.filter(i=>i.id==='withdrawn').length,1);
});

test('Publish all reads the entire identity scope beyond the first page',async()=>{
  const {client,questions,versions}=fixtureClient();
  for(let i=24;i<128;i++){questions.push(question(`extra-${i}`));versions.push(version(`extra-${i}-v1`,`extra-${i}`,'draft',1));}
  const all=await loadAllUnpublishedQuestions(client);assert.equal(all.length,129);assert.equal(new Set(all.map(i=>i.id)).size,129);
});

test('a fresh load after remount reads persisted identities rather than an XLSX batch', async () => {
  const { client, questions, versions } = fixtureClient();
  const first = await loadQuestionBankPage(client, 'drafts', 0, 100);
  questions.push(question('new-save'));
  versions.push(version('new-save-v1', 'new-save', 'draft', 1));
  const next = await loadQuestionBankPage(client, 'drafts', 0, 100);
  assert.equal(next.total, first.total + 1);
  assert.ok(next.items.some(i => i.id === 'new-save'));
  assert.ok(next.items.some(i => i.id === first.items[0].id));
});

test('preview reads the selected version and ordered options with source evidence', async () => {
  const { client, calls } = fixtureClient();
  const page = await loadQuestionBankPage(client, 'published', 0, 20);
  const preview = await loadQuestionBankVersionPreview(client, page.items[0]);
  assert.equal(preview.versionId, 'published-v3');
  assert.equal(preview.sourceDocument, 'SYNTHETIC.pdf');
  assert.equal(preview.sourceLocator, 'p012-item01');
  assert.deepEqual(preview.options.map(o => o.option_key), ['A', 'B']);
  assert.equal(preview.options[0].is_correct, true);
  assert.match(preview.solution, /\\\[2x\\\]/);
  assert.ok(calls.filter(([name]) => name === 'rpc').every(([, name]) => name === 'has_role'));
});

test('non-admin, signed-out, query errors and missing responses reject instead of returning an empty list', async () => {
  for (const config of [{ admin: false }, { authenticated: false }, { authError: true }, { roleError: true }]) {
    const { client, calls } = fixtureClient(config);
    await assert.rejects(loadQuestionBankPage(client, 'drafts', 0, 20), /administrator/i);
    assert.ok(!calls.some(([name]) => name === 'questions'));
  }
  for (const config of [{ failTable: 'questions' }, { missingData: true }]) {
    await assert.rejects(loadQuestionBankPage(fixtureClient(config).client, 'drafts', 0, 20), /load|response/i);
  }
  await assert.rejects(loadQuestionBankPage(fixtureClient().client, 'drafts', -1, 20), /page/i);
});

test('a genuinely empty database returns an explicit zero count', async () => {
  const { client, questions, versions } = fixtureClient();
  questions.length = 0;
  versions.length = 0;
  assert.deepEqual(await loadQuestionBankPage(client, 'drafts', 0, 20), { items: [], total: 0 });
  assert.deepEqual(await loadQuestionBankPage(client, 'published', 0, 20), { items: [], total: 0 });
});

test('inconsistent working versions or hidden canonical labels cannot silently become a valid list', async () => {
  const multiple = fixtureClient();
  multiple.versions.push(version('q00-extra', 'q00', 'review', 3));
  await assert.rejects(loadQuestionBankPage(multiple.client, 'drafts', 0, 100), /active version/);
  const hidden = fixtureClient();
  hidden.versions[0].topic = null;
  await assert.rejects(loadQuestionBankPage(hidden.client, 'drafts', 0, 100), /taxonomy/);
});

test('preview rejects permissions, option failures and a version superseded since the list loaded', async () => {
  const fixture = fixtureClient();
  const item = (await loadQuestionBankPage(fixture.client, 'published', 0, 20)).items[0];
  await assert.rejects(loadQuestionBankVersionPreview(fixtureClient({ admin: false }).client, item), /Administrator/);
  await assert.rejects(loadQuestionBankVersionPreview(fixtureClient({ failTable: 'question_options' }).client, item), /preview options/);
  fixture.versions.find(v => v.id === item.versionId).status = 'superseded';
  await assert.rejects(loadQuestionBankVersionPreview(fixture.client, item), /version changed/);
});

test('component lists mount independently of upload state; cancel does not clear them and save refreshes them', () => {
  const preview = readFileSync(new URL('../components/admin/QuestionBankPreview.tsx', import.meta.url), 'utf8');
  const list = readFileSync(new URL('../components/admin/QuestionBankLibrary.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(preview, /setSavedDrafts/);
  assert.match(preview, /<QuestionBankLibrary refreshKey=\{libraryRefresh\}/);
  const cancel = preview.split('const cancelPreview = () => {')[1].split('const confirmSave =')[0];
  assert.doesNotMatch(cancel, /setLibraryRefresh|\.rpc\(|saveQuestionBankDrafts/);
  assert.match(preview, /await saveQuestionBankDrafts[\s\S]*setLibraryRefresh/);
  assert.ok(list.indexOf('kind="drafts"') < list.indexOf('kind="published"'));
  assert.match(list, /useEffect/);
  assert.match(list, /role="alert"/);
  assert.match(list, /Retry/);
  assert.doesNotMatch(list, /\.rpc\(|\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
});

test('exact-version preview carries saved metadata and original evidence without applying UNCERTAIN flags',async()=>{
  const f=fixtureClient();const item=(await loadQuestionBankPage(f.client,'published',0,20)).items[0];
  const current=f.versions.find(v=>v.id===item.versionId);
  Object.assign(current,{difficulty:'hard',calculator_policy:'calculator_allowed',course_scope:'BOTH',topic:{topic_code:'1.6',title:'Saved topic'},skills:[{skill:{skill_code:'1.E'}}]});
  let preview=await loadQuestionBankVersionPreview(f.client,item);
  assert.equal(preview.difficulty,'hard');assert.equal(preview.calculatorPolicy,'calculator_allowed');assert.equal(preview.courseScope,'BOTH');
  assert.equal(preview.topicCode,'1.6');assert.deepEqual(preview.practiceSkillCodes,['1.E']);assert.deepEqual(preview.evidence,current.import_evidence);
  current.calculator_policy=null;preview=await loadQuestionBankVersionPreview(f.client,item);assert.equal(preview.calculatorPolicy,null);
  const query=f.calls.filter(([name])=>name==='question_versions').at(-1)[1].find(([name])=>name==='select')[1];
  assert.match(query,/calculator_policy/);assert.match(query,/difficulty/);assert.match(query,/import_evidence/);
});
