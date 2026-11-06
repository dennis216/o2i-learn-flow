// Synthetic fixtures in the disposable course test database only; no production connection.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

export async function verifyArenaPractice({ sql, asUser, admin, student, bc, tids, name }) {
  const read = p => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
  const rpc = (uid, fn, args = '') => JSON.parse(asUser(uid, `SELECT public.${fn}(${args})`).trim().split('\n').at(-1));
  const learner = randomUUID(), other = randomUUID(), [topic] = tids, skill = randomUUID();
  sql(`INSERT INTO auth.users(id) VALUES('${learner}'),('${other}')`);
  const releaseDir = 'docs/arena/production/';
  sql(read('supabase/migrations/20261104000100_arena_game.sql'));
  sql(`INSERT INTO public.arena_questions(id,unit,tier,topic,stem,options,explanation) VALUES('legacy-synthetic',1,1,'Legacy','Legacy synthetic stem','["A","B","C","D"]','Legacy solution');
    INSERT INTO public.arena_question_issues(user_id,run_id,question_id,option_order) VALUES('${learner}','${randomUUID()}','legacy-synthetic','{0,1,2,3}');`);
  const legacy = sql('SELECT row_to_json(q) FROM public.arena_questions q').trim();
  const legacyIssues = sql('SELECT row_to_json(q) FROM public.arena_question_issues q').trim();
  sql(read('supabase/migrations/20261025000000_question_practice_review_history.sql'));
  sql('CREATE SCHEMA IF NOT EXISTS supabase_migrations; CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations(version text PRIMARY KEY,name text,statements text[])');
  for (const [v, n] of [['20261025000000','question_practice_review_history'],['20261026000000','question_practice_adaptation_v2'],['20261028000000','course_topic_practice'],['20261104000000','question_practice_continuous']]) {
    sql(`INSERT INTO supabase_migrations.schema_migrations VALUES('${v}','${n}',ARRAY[$source$${read(`supabase/migrations/${v}_${n}.sql`)}$source$])`);
  }
  assert.equal(sql(read(releaseDir + '00_preflight_readonly.sql')).trim(), 't|t|t');
  sql("UPDATE supabase_migrations.schema_migrations SET name='synthetic-drift' WHERE version='20261104000000'");
  assert.throws(() => sql(read(releaseDir + '10_deploy.sql')));
  assert.equal(sql("SELECT to_regclass('public.arena_practice_issues') IS NULL").trim(), 't');
  sql("UPDATE supabase_migrations.schema_migrations SET name='question_practice_continuous' WHERE version='20261104000000'");
  sql('CREATE TABLE public.arena_practice_issues(synthetic integer)');
  assert.throws(() => sql(read(releaseDir + '10_deploy.sql')));
  sql('DROP TABLE public.arena_practice_issues');
  sql(read(releaseDir + '10_deploy.sql'));
  const verification = JSON.parse(sql(read(releaseDir + '20_verify_readonly.sql')).trim());
  assert.ok(verification.all_checks_pass, JSON.stringify(verification));
  assert.throws(() => sql(read(releaseDir + '10_deploy.sql')));
  assert.equal(sql('SELECT row_to_json(q) FROM public.arena_questions q').trim(), legacy);
  assert.equal(sql('SELECT row_to_json(q) FROM public.arena_question_issues q').trim(), legacyIssues);
  console.log('PASS Arena release: guarded atomic package, drift/partial/replay rejection, exact verification and unchanged legacy data');

  sql(`INSERT INTO public.curriculum_practices(code,name,description) VALUES(1,'Synthetic','Synthetic') ON CONFLICT DO NOTHING;
    INSERT INTO public.curriculum_practice_skills(id,practice_code,skill_code,description) VALUES('${skill}',1,'SYNTH.ARENA','Synthetic skill')`);
  const valid = [], invalid = [];
  const add = ({ level = 'medium', status = 'approved', options = 4, correct = 1, stem = 'Synthetic $x^2$ question', image = null, figure = false, blankOption = false } = {}) => {
    const q = randomUUID(), v = randomUUID();
    sql(`INSERT INTO public.questions VALUES('${q}','${v}','${status}');
      INSERT INTO public.question_versions(id,question_id,primary_topic_id,stem,solution,difficulty,course_scope,representation_type,status,question_type,image_url,requires_figure)
      VALUES('${v}','${q}','${topic}','${stem}','Synthetic solution for ${q}','${level}','BOTH','analytical','approved','mcq_single',${image ? `'${image}'` : 'NULL'},${figure});
      INSERT INTO public.question_options(id,question_version_id,option_key,option_text,order_index,is_correct)
      SELECT gen_random_uuid(),'${v}',chr(64+n),${blankOption ? "CASE WHEN n=2 THEN '' ELSE 'Synthetic option '||n END" : "'Synthetic option '||n"},n,n<=${correct} FROM generate_series(1,${options}) n;
      INSERT INTO public.question_practice_skills VALUES('${v}','${skill}');`);
    return { q, v };
  };
  for (const level of ['easy','easy','medium','medium','hard','hard']) valid.push(add({ level }));
  for (const config of [{ status: 'draft' }, { status: 'unpublished' }, { options: 3 }, { options: 5 }, { correct: 2 }, { correct: 0 }, { stem: '' }, { figure: true }, { image: 'javascript:alert(1)' }, { blankOption: true }]) invalid.push(add(config));
  const pool = sql('SELECT question_id FROM public.arena_practice_pool()').trim().split('\n');
  assert.deepEqual(new Set(pool), new Set(valid.map(item => item.q)));
  assert.equal(rpc(learner, 'arena_practice_catalog').counts['1'], 6);
  const next = (uid, run, units = '{1}', tier = 2) => rpc(uid, 'arena_practice_next_question', `'${run}','${units}',${units === '{2}' ? 2 : 1},${tier},true`);
  const answer = (uid, issue, index) => rpc(uid, 'arena_practice_submit_answer', `'${issue}',${index}`);
  const stats = uid => rpc(uid, 'get_question_practice_statistics', `'${uid}'`);
  const run = randomUUID(), emptyRun = randomUUID();
  assert.equal(next(learner, emptyRun, '{2}').status, 'empty');
  assert.equal(sql(`SELECT count(*) FROM public.question_practice_sessions WHERE id='${emptyRun}'`).trim(), '0');
  for (const args of [`NULL,'{1}',1,2`, `'${run}','{1}',1,0`, `'${run}','{1}',2,2`, `'${run}','{NULL}',1,2`]) {
    assert.throws(() => rpc(learner, 'arena_practice_next_question', args));
  }
  const issued = next(learner, run);
  assert.equal(issued.status, 'ok'); assert.equal(issued.tier, 2); assert.equal(issued.opts.length, 4);
  assert.equal(issued.explanation, undefined); assert.equal(issued.correct_index, undefined);
  assert.deepEqual(next(learner, run), issued);
  assert.throws(() => next(other, run));
  assert.deepEqual(answer(other, issued.issue_id, 0), { status: 'not_found' });
  assert.equal(stats(learner).sessionCount, 1); assert.equal(stats(learner).attemptCount, 0);
  const info = JSON.parse(sql(`SELECT json_build_object('question',question_id,'version',version_id,'order',option_order) FROM public.arena_practice_issues WHERE id='${issued.issue_id}'`).trim());
  const correctId = sql(`SELECT id FROM public.question_options WHERE question_version_id='${info.version}' AND is_correct`).trim();
  const right = info.order.indexOf(correctId), wrong = (right + 1) % 4;
  // Publication changes after issuance must not change the frozen version or its solution.
  const revision = randomUUID();
  sql(`INSERT INTO public.question_versions(id,question_id,primary_topic_id,stem,solution,difficulty,course_scope,representation_type,status,question_type)
    VALUES('${revision}','${info.question}','${topic}','Different revision','Different solution','hard','BOTH','analytical','approved','mcq_single');
    UPDATE public.questions SET current_version_id='${revision}',status='unpublished' WHERE id='${info.question}';`);
  sql(`CREATE FUNCTION public.synthetic_arena_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic answer write failure'; END; $$;
    CREATE TRIGGER synthetic_arena_fail AFTER INSERT ON public.question_practice_attempts FOR EACH ROW EXECUTE FUNCTION public.synthetic_arena_fail()`);
  assert.throws(() => answer(learner, issued.issue_id, wrong));
  assert.equal(stats(learner).attemptCount, 0);
  assert.deepEqual(next(learner, run), issued);
  sql('DROP TRIGGER synthetic_arena_fail ON public.question_practice_attempts; DROP FUNCTION public.synthetic_arena_fail()');
  const result = answer(learner, issued.issue_id, wrong);
  assert.equal(result.correct, false); assert.equal(result.correct_index, right); assert.equal(result.selected_index, wrong);
  assert.equal(result.explanation, 'Synthetic solution for ' + info.question);
  assert.deepEqual(answer(learner, issued.issue_id, right), result);
  assert.equal(stats(learner).attemptCount, 1); assert.equal(stats(learner).correctCount, 0);
  assert.deepEqual(stats(learner).sources.find(row => row.source === 'arena'), { source: 'arena', sessionCount: 1, attemptCount: 1, correctCount: 0 });
  const history = rpc(learner, 'list_question_practice_attempts', 'true');
  assert.equal(history[0].source, 'arena'); assert.equal(history[0].version_id, info.version);
  const snapshot = rpc(learner, 'get_question_practice', `'${run}'`);
  assert.equal(snapshot.source, 'arena'); assert.equal(snapshot.questions[0].attempt.solution, result.explanation);
  assert.equal(snapshot.questions[0].attempt.selected_option_id, info.order[wrong]);
  assert.equal(snapshot.questions[0].attempt.timing_complete, false);
  assert.equal(snapshot.questions[0].attempt.elapsed_seconds, null);
  assert.equal(rpc(learner, 'start_question_practice', `'${run}'`).source, 'arena');
  assert.deepEqual(rpc(other, 'list_question_practice_attempts'), []);
  assert.throws(() => rpc(other, 'get_question_practice', `'${run}'`));
  assert.equal(rpc(other, 'get_question_practice_statistics', `'${learner}'`).attemptCount, 0);
  for (const role of ['anon', 'authenticated']) {
    assert.throws(() => asUser(learner, 'SELECT * FROM public.arena_practice_issues', role));
    for (const expr of ['public.arena_practice_pool()', `public.arena_practice_payload('${issued.issue_id}')`]) assert.throws(() => asUser(learner, `SELECT ${expr}`, role));
  }
  assert.throws(() => asUser(learner, "UPDATE public.question_practice_sessions SET source='practice'"));
  assert.throws(() => asUser(learner, 'SELECT public.arena_practice_catalog()', 'anon'));
  assert.throws(() => rpc(null, 'arena_practice_catalog'));
  console.log('PASS Arena learning: eligible published pool, frozen version, safe issue, shuffled-option grading, first answer final, source totals, Review and account/RLS isolation');

  const exec = promisify(execFile);
  const concurrentRpc = async (fn, args) => {
    const query = `BEGIN;SET LOCAL ROLE authenticated;SELECT set_config('request.jwt.claim.sub','${learner}',true);SELECT set_config('request.jwt.claim.role','authenticated',true);SELECT public.${fn}(${args});COMMIT;`;
    const { stdout } = await exec('docker', ['exec', name, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', 'postgres', '-c', query]);
    return JSON.parse(stdout.trim().split('\n').at(-1));
  };
  const secondRun = randomUUID();
  const concurrent = await Promise.all([1, 2].map(() => concurrentRpc('arena_practice_next_question', `'${secondRun}','{1}',1,1,true`)));
  assert.equal(concurrent[0].issue_id, concurrent[1].issue_id);
  const issue2 = concurrent[0].issue_id;
  const concurrentAnswers = await Promise.all([0, 1].map(index => concurrentRpc('arena_practice_submit_answer', `'${issue2}',${index}`)));
  assert.deepEqual(concurrentAnswers[0], concurrentAnswers[1]);
  assert.equal(stats(learner).attemptCount, 2);
  assert.equal(sql(`SELECT count(*) FROM public.question_practice_items WHERE session_id='${secondRun}'`).trim(), '1');

  // Game answers do not become Topic evidence, nor make normal-practice questions old.
  assert.equal(asUser(learner, 'SELECT count(*) FROM public.question_practice_attempts').trim().split('\n').at(-1), '2');
  assert.equal(sql(`SELECT count(*) FROM public.question_practice_topic_status('${learner}')`).trim(), '0');
  const continuousId = randomUUID();
  const continuous = rpc(learner, 'start_continuous_question_practice', `'${continuousId}','${topic}'`);
  assert.equal(continuous.mode, 'continuous');
  const gameQuestion = sql(`SELECT question_id FROM public.arena_practice_issues WHERE id='${issue2}'`).trim();
  assert.equal(sql(`SELECT is_new FROM public.question_practice_continuous_pool('${continuousId}') WHERE question_id='${gameQuestion}'`).trim(), 't');
  assert.equal(sql(`SELECT set_config('request.jwt.claim.sub','${learner}',false); SELECT set_config('request.jwt.claim.role','authenticated',false); SELECT count(*) FROM public.question_practice_signals()`).trim().split('\n').at(-1), '0');
  const set = rpc(learner, 'start_question_practice', `'${randomUUID()}'`);
  assert.equal(set.source, 'practice'); assert.ok(set.questions.length > 0 && set.questions.length <= 5);
  assert.equal(set.selection_summary ?? null, null); // v2 returns adaptation_summary instead.
  assert.equal(set.adaptation_summary.error_count, 0); assert.equal(set.adaptation_summary.slow_count, 0);
  const normal = continuous.questions[0];
  sql(`INSERT INTO public.question_practice_skills SELECT '${normal.version_id}','${skill}' WHERE NOT EXISTS(SELECT 1 FROM public.question_practice_skills WHERE question_version_id='${normal.version_id}' AND practice_skill_id='${skill}')`);
  const normalRight = sql(`SELECT id FROM public.question_options WHERE question_version_id='${normal.version_id}' AND is_correct LIMIT 1`).trim();
  rpc(learner, 'submit_question_practice_v2', `'${continuousId}','${normal.question_id}','${normalRight}',30,NULL,false`);
  assert.equal(sql(`SELECT sample_count FROM public.question_practice_topic_status('${learner}')`).trim(), '1');
  assert.equal(sql(`SELECT set_config('request.jwt.claim.sub','${learner}',false); SELECT set_config('request.jwt.claim.role','authenticated',false); SELECT count(*) FROM public.question_practice_signals()`).trim().split('\n').at(-1), '1');
  const nextIssued = next(learner, run);
  assert.notEqual(nextIssued.issue_id, issued.issue_id);
  const nextInfo = JSON.parse(sql(`SELECT json_build_object('question',question_id,'version',version_id,'order',option_order) FROM public.arena_practice_issues WHERE id='${nextIssued.issue_id}'`).trim());
  // Even a client calling the shared grading RPC cannot label game timing as complete.
  rpc(learner, 'submit_question_practice_v2', `'${run}','${nextInfo.question}','${nextInfo.order[0]}',10,'[{"option_id":"${nextInfo.order[0]}","elapsed_seconds":10}]',true`);
  assert.equal(sql(`SELECT timing_complete OR elapsed_seconds IS NOT NULL FROM public.question_practice_attempts WHERE session_id='${run}' AND question_id='${nextInfo.question}'`).trim(), 'f');
  assert.equal(rpc(learner, 'get_question_practice_analysis').totals.timing_count, 0);
  assert.throws(() => rpc(learner, 'start_question_practice', `'${run}','${topic}'`));
  assert.throws(() => rpc(learner, 'start_course_question_practice', `'${run}','${bc}','${topic}'`));
  assert.throws(() => next(learner, set.id));
  assert.throws(() => rpc(learner, 'start_continuous_question_practice', `'${run}'`));
  // Exhaustion never repeats a question within a run.
  for (let i = 0; i < 7; i++) { const q = next(learner, run); if (q.status === 'empty') break; answer(learner, q.issue_id, 0); }
  assert.equal(next(learner, run).status, 'empty');
  assert.equal(sql(`SELECT count(*)=count(DISTINCT question_id) FROM public.arena_practice_issues WHERE session_id='${run}'`).trim(), 't');
  assert.equal(sql('SELECT row_to_json(q) FROM public.arena_question_issues q').trim(), legacyIssues);
  // Per-account issue limits also apply across different runs; waiting requests remain idempotent.
  sql("UPDATE public.arena_practice_issues SET issued_at=clock_timestamp()-interval '2 days'");
  const rateIssues=[];
  for (let i=0;i<30;i++) { const id=randomUUID(),q=next(learner,id); assert.equal(q.status,'ok'); rateIssues.push({id,q}); }
  assert.deepEqual(next(learner,rateIssues[0].id),rateIssues[0].q);
  for (const {q} of rateIssues.slice(0,12)) assert.equal(answer(learner,q.issue_id,q.opts.indexOf('Synthetic option 1')).correct,true);
  assert.ok(rpc(learner,'list_question_practice_attempts').every(a=>a.is_correct));
  assert.ok(rpc(learner,'list_question_practice_attempts','true').some(a=>a.session_id===run && a.question_id===info.question));
  const limitedRun=randomUUID(); assert.equal(next(learner, limitedRun).status, 'rate_limited');
  assert.equal(sql(`SELECT count(*) FROM public.question_practice_sessions WHERE id='${limitedRun}'`).trim(), '0');
  assert.equal(sql('SELECT row_to_json(q) FROM public.arena_question_issues q').trim(), legacyIssues);
  console.log('PASS Arena concurrency and regression: one issue/answer on retries, ordinary sets and continuous practice, excluded adaptation/timing, exhaustion without repeats and legacy preservation');
}
