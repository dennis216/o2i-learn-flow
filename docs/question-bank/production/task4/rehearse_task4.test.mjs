// LOCAL ONLY. Creates/destroys its own loopback/tmpfs PostgreSQL container.
// Never copy this file into production SQL Editor.
import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { buildTask4Package, sources } from './build_task4_package.mjs';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const files = buildTask4Package(), names = ['10_draft_management.sql', '20_unpublished_status.sql', '30_publication.sql'];
const unlock = sql => sql.replace("confirmed_dashboard_project text := '';", "confirmed_dashboard_project text := 'lxoaeaewcrshjkigzyqe';")
  .replace('accept_no_full_backup_risk boolean := false;', 'accept_no_full_backup_risk boolean := true;')
  .replace('preflight_evidence_confirmed boolean := false;', 'preflight_evidence_confirmed boolean := true;');
const steps = names.map(name => unlock(files.get(name)));
const password = randomBytes(32).toString('hex'), container = `o2i-task4-release-${process.pid}`, port = 55446;
const label = 'task4-release-rehearsal';
const docker = args => {
  try { return execFileSync('docker', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }); }
  catch (error) { throw new Error(String(error.stderr ?? error.message).replaceAll(password, '[redacted]')); }
};
const connect = async () => {
  const client = new pg.Client({ host: '127.0.0.1', port, database: 'postgres', user: 'postgres', password, connectionTimeoutMillis: 5000 });
  await client.connect(); return client;
};
const sqlFunction = (sql, name) => {
  const match = sql.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?AS \\$\\$[\\s\\S]*?\\$\\$[^;]*;`));
  assert.ok(match); return match[0];
};
function prerequisites() {
  // Reuse only the trusted existing release test's dependency fixture, not its
  // test runner, database connection, old deployment script or destructive seed.
  const fixture = read('docs/question-bank/production/rehearse_release.test.mjs');
  const start = fixture.indexOf('const prerequisites = () => {'), end = fixture.indexOf('\nconst client =', start);
  assert.ok(start >= 0 && end > start);
  return new Function('read', 'sqlFunction', `${fixture.slice(start, end)}\nreturn prerequisites();`)(read, sqlFunction);
}
const scalar = async (db, sql, args = []) => (await db.query(sql, args)).rows[0].result;
async function execute(db, sql) {
  try { return await db.query(sql); }
  catch (error) {
    if (error.detail?.startsWith('{')) {
      const report = JSON.parse(error.detail);
      error.message += ' ' + (report.checks ?? []).filter(c => !c.ok).map(c => c.name).join(', ');
    }
    throw error;
  }
}
async function rejected(db, sql, pattern) {
  try { await assert.rejects(execute(db, sql), error => pattern.test(error.message)); }
  finally { await db.query('ROLLBACK'); }
}
const failAfterDDL = sql => sql.replace('  -- LEDGER: only after DDL/catalog success, in the same transaction.',
  "  RAISE EXCEPTION 'LOCAL injected failure after DDL';\n  -- LEDGER: only after DDL/catalog success, in the same transaction.");
const unwrapped = sql => sql.replace(/^BEGIN;\n/m, '').replace(/\nCOMMIT;\n/, '\n');
const enumPresent = db => scalar(db, "SELECT EXISTS(SELECT 1 FROM pg_enum WHERE enumtypid='public.question_status'::regtype AND enumlabel='unpublished') result");
const recorded = (db, version) => scalar(db, 'SELECT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version=$1) result', [version]);

test('Task 4 separate-transaction production package on disposable PostgreSQL', { timeout: 180000 }, async t => {
  let created = false, db;
  try {
    docker(['run', '--pull', 'never', '-d', '--name', container, '--label', `o2i.purpose=${label}`,
      '--tmpfs', '/var/lib/postgresql/data:rw', '-p', `127.0.0.1:${port}:5432`, '-e', `POSTGRES_PASSWORD=${password}`,
      'public.ecr.aws/supabase/postgres:17.11.0.002']); created = true;
    const inspection = JSON.parse(docker(['inspect', container]))[0];
    assert.equal(inspection.Config.Labels['o2i.purpose'], label);
    assert.deepEqual(inspection.HostConfig.PortBindings['5432/tcp'], [{ HostIp: '127.0.0.1', HostPort: String(port) }]);
    assert.ok(inspection.Mounts.every(mount => mount.Type === 'tmpfs'));
    let ready = false;
    for (let i = 0; i < 120; i++) {
      try { docker(['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'supabase_admin']); ready = true; break; }
      catch { await new Promise(resolve => setTimeout(resolve, 250)); }
    }
    assert.ok(ready);
    docker(['exec', container, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-c', `ALTER ROLE postgres PASSWORD '${password}';`]);
    db = await connect(); await db.query(prerequisites());
    for (const source of sources.slice(0, 2)) {
      await db.query('BEGIN;' + source.sql);
      await db.query('INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES($1,$2,ARRAY[$3])', [source.version, source.name, source.sql]);
      await db.query('COMMIT');
    }
    const admin = '95000000-0000-0000-0000-000000000001';
    await db.query("INSERT INTO auth.users(id,email) VALUES($1,'task4-release-admin@example.test');", [admin]);
    await db.query("INSERT INTO public.user_roles(user_id,role) VALUES($1,'admin');", [admin]);
    await db.query("SET ROLE authenticated; SELECT set_config('request.jwt.claim.role','authenticated',false);");
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [admin]);
    const item = { external_id: 'SYNTHETIC-TASK4-RELEASE', stem: 'Synthetic \\(x^2\\)', solution: 'Synthetic \\[2x\\]',
      difficulty: 'easy', course_scope: 'AB', primary_topic_code: '1.1', practice_skill_codes: ['1.A'], representation_type: 'analytical',
      calculator_policy: null, source_document: 'SYNTHETIC.pdf', source_page: '12-13', source_locator: 'p012-item01', requires_figure: false,
      correct_option_key: 'A', import_evidence: { human_review_status: 'pending', ai_flags: ['ANSWER_AI_INFERRED'], human_review_notes: 'Retain synthetic note' },
      options: [{ option_key: 'A', option_text: 'Synthetic correct', is_correct: true, import_evidence: { option_explanation: 'Retain synthetic explanation' } },
        { option_key: 'B', option_text: 'Synthetic wrong', is_correct: false, import_evidence: {} }] };
    const saved = (await scalar(db, 'SELECT public.save_question_bank_drafts($1::jsonb) result', [JSON.stringify([item])]))[0];
    await db.query('RESET ROLE');
    const snapshot = async () => {
      const result = {};
      const tables = ['auth.users', 'public.user_roles', 'public.profiles', 'public.courses', 'public.course_videos', 'public.practice_problems',
        'public.curriculum_topics', 'public.curriculum_practice_skills', 'public.questions', 'public.question_versions', 'public.question_options',
        'public.question_practice_skills', 'public.question_topics', 'public.misconceptions', 'public.option_misconceptions', 'public.question_course_videos'];
      for (const table of tables) result[table] = await scalar(db, `SELECT md5(coalesce(jsonb_agg(to_jsonb(t)-ARRAY['lifecycle_revision','editorial_revision'] ORDER BY (to_jsonb(t)-ARRAY['lifecycle_revision','editorial_revision'])::text)::text,'[]')) result FROM ${table} t`);
      result.ledger = await scalar(db, "SELECT jsonb_agg(to_jsonb(t) ORDER BY version) result FROM supabase_migrations.schema_migrations t WHERE version NOT IN ('20261018000000','20261019000000','20261019010000')");
      return result;
    };
    const baseline = await snapshot();
    await t.test('packaging preserves originals/default gates; initial readonly status reflects missing Task 4', async () => {
      for (const [i, name] of names.entries()) {
        const sql = files.get(name);
        assert.equal(read('docs/question-bank/production/task4/' + name), sql);
        assert.deepEqual([...sql.matchAll(/\$o2i_task4_source\$([\s\S]*?)\$o2i_task4_source\$/g)].map(m => m[1]), [sources[i + 2].sql]);
        assert.ok(sql.includes('accept_no_full_backup_risk boolean := false;'));
      }
      assert.equal(read('docs/question-bank/production/task4/40_verify_readonly.sql'), files.get('40_verify_readonly.sql'));
      const statusResults = await execute(db, files.get('00_status_readonly.sql'));
      const status = statusResults.find(r => r.rows[0]?.task4_status).rows[0].task4_status;
      assert.deepEqual(status.question_status_values, ['draft', 'approved', 'retired']);
      assert.ok(status.migration_records.slice(2).every(record => !record.recorded));
    });
    await t.test('unconfirmed gates reject all writes; existing bank baseline remains unchanged', async () => {
      await rejected(db, files.get(names[0]), /confirm Dashboard project/);
      await rejected(db, steps[0].replace('accept_no_full_backup_risk boolean := true;', 'accept_no_full_backup_risk boolean := false;'), /no-full-backup risk/);
      assert.deepEqual(await snapshot(), baseline); assert.equal(await recorded(db, sources[2].version), false);
    });
    await t.test('unknown ledger columns are rejected without weakening six-column/two-constraint checks', async () => {
      await db.query('ALTER TABLE supabase_migrations.schema_migrations ADD COLUMN local_unreviewed text');
      try { await rejected(db, steps[0], /ledger shape\/access differs/); }
      finally { await db.query('ALTER TABLE supabase_migrations.schema_migrations DROP COLUMN local_unreviewed'); }
      assert.deepEqual(await snapshot(), baseline);
    });
    await t.test('two real connections: release advisory lock refuses a simultaneous run', async () => {
      const other = await connect();
      try { await other.query('BEGIN;SELECT pg_advisory_xact_lock(20260926,20261004)'); await rejected(db, steps[0], /another question-bank release/); }
      finally { await other.query('ROLLBACK'); await other.end(); }
    });
    await t.test('draft-management failure rolls back its functions and ledger together', async () => {
      await rejected(db, failAfterDDL(steps[0]), /LOCAL injected failure/);
      assert.equal(await scalar(db, "SELECT to_regprocedure('public.get_question_bank_draft(uuid,uuid)') IS NULL result"), true);
      assert.equal(await recorded(db, sources[2].version), false); assert.deepEqual(await snapshot(), baseline);
    });
    await t.test('step 1 succeeds with six-column ledger; optional audit fields remain NULL', async () => {
      await execute(db, steps[0]); assert.equal(await recorded(db, sources[2].version), true);
      assert.equal(await scalar(db, "SELECT created_by IS NULL AND idempotency_key IS NULL AND rollback IS NULL result FROM supabase_migrations.schema_migrations WHERE version='20261018000000'"), true);
      assert.deepEqual(await snapshot(), baseline);
    });
    await t.test('repeating step 1 is refused and publication cannot run before the enum migration', async () => {
      await rejected(db, steps[0], /already recorded/); await rejected(db, steps[2], /prerequisite migration ledger/);
      assert.equal(await enumPresent(db), false);
    });
    await t.test('combining enum and publication in one transaction fails and rolls enum/ledger back', async () => {
      await rejected(db, 'BEGIN;' + unwrapped(steps[1]) + unwrapped(steps[2]) + 'COMMIT;', /unsafe use of new value|new enum values must be committed/i);
      assert.equal(await enumPresent(db), false); assert.equal(await recorded(db, sources[3].version), false);
    });
    await t.test('enum failure before ledger insertion rolls back the enum itself', async () => {
      await rejected(db, failAfterDDL(steps[1]), /LOCAL injected failure/);
      assert.equal(await enumPresent(db), false); assert.equal(await recorded(db, sources[3].version), false);
    });
    await t.test('step 2 commits enum and exact migration record independently; repeats are refused', async () => {
      await execute(db, steps[1]); assert.equal(await enumPresent(db), true); assert.equal(await recorded(db, sources[3].version), true);
      await rejected(db, steps[1], /already recorded/); assert.deepEqual(await snapshot(), baseline);
      const status = (await execute(db, files.get('00_status_readonly.sql'))).find(r => r.rows[0]?.task4_status).rows[0].task4_status;
      assert.deepEqual(status.question_status_values, ['draft', 'approved', 'retired', 'unpublished']);
      assert.equal(status.migration_records.at(-1).recorded, false);
    });
    await t.test('incorrect predecessor fingerprint and unrecorded publication objects stop step 3', async () => {
      await db.query("UPDATE supabase_migrations.schema_migrations SET statements=ARRAY['LOCAL incorrect source'] WHERE version='20261019000000'");
      try { await rejected(db, steps[2], /prerequisite migration ledger/); }
      finally { await db.query("UPDATE supabase_migrations.schema_migrations SET statements=ARRAY[$1] WHERE version='20261019000000'", [sources[3].sql]); }
      await db.query('CREATE TABLE public.question_version_reviews(local_sentinel text)');
      try { await rejected(db, steps[2], /partial deployment/); }
      finally { await db.query('DROP TABLE public.question_version_reviews'); }
    });
    await t.test('step 3 failure rolls back all new objects/permissions, retaining committed steps 1 and 2', async () => {
      await rejected(db, failAfterDDL(steps[2]), /LOCAL injected failure/);
      assert.equal(await scalar(db, "SELECT to_regclass('public.question_version_reviews') IS NULL result"), true);
      assert.equal(await scalar(db, "SELECT to_regprocedure('public.publish_question_versions(jsonb)') IS NULL result"), true);
      assert.equal(await recorded(db, sources[4].version), false); assert.equal(await enumPresent(db), true);
      assert.equal(await scalar(db, "SELECT has_table_privilege('authenticated','public.questions','INSERT') result"), true);
      assert.deepEqual(await snapshot(), baseline);
    });
    await t.test('step 3 succeeds; readonly final catalog and all five exact ledger fingerprints pass', async () => {
      await execute(db, steps[2]);
      const results = await execute(db, files.get('40_verify_readonly.sql'));
      const catalog = results.find(r => r.rows[0]?.task4_catalog)?.rows[0].task4_catalog;
      const ledger = results.find(r => r.rows[0]?.task4_ledger)?.rows[0].task4_ledger;
      assert.equal(catalog.all_catalog_checks_pass, true, JSON.stringify(catalog.checks.filter(c => !c.ok)));
      assert.equal(ledger.all_ledger_checks_pass, true); assert.equal(ledger.migration_records.length, 5);
      assert.deepEqual(await snapshot(), baseline);
    });
    await t.test('migration never publishes/imports/deletes existing drafts; administrator readback still works', async () => {
      assert.equal(await scalar(db, 'SELECT status::text result FROM public.questions WHERE id=$1', [saved.question_id]), 'draft');
      assert.equal(await scalar(db, 'SELECT current_version_id IS NULL result FROM public.questions WHERE id=$1', [saved.question_id]), true);
      assert.equal(await scalar(db, 'SELECT count(*)::int result FROM public.question_version_reviews'), 0);
      assert.equal(await scalar(db, 'SELECT count(*)::int result FROM public.question_publication_events'), 0);
      await db.query("SET ROLE authenticated;SELECT set_config('request.jwt.claim.role','authenticated',false)");
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [admin]);
      const draft = await scalar(db, 'SELECT public.get_question_bank_draft($1,$2) result', [saved.question_id, saved.version_id]);
      assert.equal(draft.version.import_evidence.ai_flags[0], 'ANSWER_AI_INFERRED');
      assert.equal(draft.options[0].import_evidence.option_explanation, 'Retain synthetic explanation');
      const p = await scalar(db, "SELECT public.precheck_question_publication($1,$2,'publish') result", [saved.question_id, saved.version_id]);
      assert.equal(p.eligible, false); assert.ok(p.issues.some(issue => issue.code === 'QB_REVIEW_REQUIRED'));
      await db.query('RESET ROLE');
    });
    await t.test('ordinary and anonymous sessions cannot read draft/answer rows or use publication RPC', async () => {
      for (const role of ['authenticated', 'anon']) {
        await db.query(`SET ROLE ${role}`);
        await db.query("SELECT set_config('request.jwt.claim.role',$1,false),set_config('request.jwt.claim.sub','',false)", [role]);
        for (const table of ['questions', 'question_versions', 'question_options']) assert.equal((await db.query(`SELECT * FROM public.${table}`)).rowCount, 0);
        await assert.rejects(db.query('SELECT public.publish_question_versions(\'[]\'::jsonb)'), /QB_FORBIDDEN|permission denied/);
        await db.query('RESET ROLE');
      }
    });
    await t.test('all repeated deployment files are refused; unrelated data and older migration records remain intact', async () => {
      for (const sql of steps) await rejected(db, sql, /already recorded/);
      assert.deepEqual(await snapshot(), baseline);
      assert.equal(await scalar(db, "SELECT count(*)::int result FROM supabase_migrations.schema_migrations WHERE version IN ('20261018000000','20261019000000','20261019010000') AND created_by IS NULL AND idempotency_key IS NULL AND rollback IS NULL"), 3);
    });
  } finally {
    await db?.end();
    if (created) { assert.equal(docker(['inspect', container, '--format', '{{index .Config.Labels "o2i.purpose"}}']).trim(), label); docker(['rm', '-f', container]); }
  }
});
