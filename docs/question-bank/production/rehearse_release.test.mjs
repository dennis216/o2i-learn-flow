// LOCAL ONLY. Refuses all other hosts/ports and verifies the disposable container label.
// Never reset, link, or access the existing Supabase local working database.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import pg from 'pg'

const container = 'o2i-qb-release-rehearsal-20261016'
const label = execFileSync('docker', ['inspect', container, '--format', '{{index .Config.Labels "o2i.purpose"}}'], { encoding: 'utf8' }).trim()
assert.equal(label, 'question-bank-release-rehearsal')
const inspection = JSON.parse(execFileSync('docker', ['inspect', container], { encoding: 'utf8' }))[0]
assert.equal(inspection.HostConfig.PortBindings['5432/tcp'][0].HostIp, '127.0.0.1')
assert.equal(inspection.HostConfig.PortBindings['5432/tcp'][0].HostPort, '55439')
assert.equal(inspection.Mounts.filter((mount) => mount.Type !== 'tmpfs').length, 0)
// Fresh random credential exists only in this process and the throwaway container.
// Never echo it, persist it, or use any existing account/database credential.
const localPassword = randomBytes(32).toString('hex')
execFileSync('docker', ['exec', '-i', container, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-X', '-v', 'ON_ERROR_STOP=1'], {
  input: `ALTER ROLE postgres PASSWORD '${localPassword}';`, stdio: ['pipe', 'pipe', 'pipe'],
})
const root = new URL('../../../', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')
const deploy = read('docs/question-bank/production/10_deploy_question_bank.sql')
const approvedLocalCopy = deploy
  .replace("confirmed_dashboard_project text := '';", "confirmed_dashboard_project text := 'lxoaeaewcrshjkigzyqe';")
  .replace('accept_no_full_backup_risk boolean := false;', 'accept_no_full_backup_risk boolean := true;')
  .replace('production_ledger_evidence_confirmed boolean := false;', 'production_ledger_evidence_confirmed boolean := true;')
const sqlFunction = (sql, name) => {
  const match = sql.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?AS \\$\\$[\\s\\S]*?\\$\\$[^;]*;`))
  assert.ok(match, `Missing prerequisite ${name}`)
  return match[0]
}
const prerequisites = () => {
  const roleMigration = read('supabase/migrations/20260920000000_content_admin_roles.sql')
  const taxonomy = read('supabase/migrations/20260920010000_ap_calculus_ced_framework.sql')
  // Dependency DDL only; NEVER execute the taxonomy migration's destructive/data-changing tail.
  const taxonomyDdl = taxonomy.slice(taxonomy.indexOf('CREATE TABLE public.curriculum_frameworks'), taxonomy.indexOf('ALTER TABLE public.course_videos'))
  return `
    CREATE SCHEMA supabase_migrations;
    CREATE TABLE supabase_migrations.schema_migrations(
      version text PRIMARY KEY, statements text[], name text, created_by text,
      idempotency_key text, rollback text[],
      CONSTRAINT schema_migrations_idempotency_key_key UNIQUE(idempotency_key)
    );
    INSERT INTO supabase_migrations.schema_migrations(version,name,created_by,idempotency_key,rollback) VALUES
      ('20260920000000','content_admin_roles','LOCAL-roles-actor','LOCAL-roles-key',ARRAY['-- LOCAL prior rollback evidence']),
      ('20260920010000','ap_calculus_ced_framework','LOCAL-taxonomy-actor','LOCAL-taxonomy-key',ARRAY['-- LOCAL prior rollback evidence']);
    CREATE TYPE public.app_role AS ENUM ('admin','instructor','student','super_admin');
    CREATE TABLE public.user_roles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES auth.users(id), role public.app_role NOT NULL,
      created_at timestamptz DEFAULT now(), UNIQUE(user_id,role));
    ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
    CREATE TABLE public.courses(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL);
    CREATE TABLE public.course_videos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      course_id uuid REFERENCES public.courses(id), title text NOT NULL);
    CREATE TABLE public.practice_problems(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sentinel text NOT NULL);
    CREATE TABLE public.profiles(user_id uuid REFERENCES auth.users(id));
    ${taxonomyDdl}
    ${sqlFunction(roleMigration, 'has_role')}
    ${sqlFunction(roleMigration, 'is_super_admin')}
    ${sqlFunction(read('supabase/migrations/20250910020036_7f5646ab-55d4-4412-823b-b244048be7ba.sql'), 'update_updated_at_column')}
    INSERT INTO auth.users(id,email) VALUES ('91000000-0000-0000-0000-000000000001','release-sentinel@test.invalid');
    INSERT INTO public.user_roles(user_id,role) VALUES ('91000000-0000-0000-0000-000000000001','student');
    INSERT INTO public.courses(id,title) VALUES ('91000000-0000-0000-0000-000000000002','Local existing course sentinel');
    INSERT INTO public.course_videos(course_id,title) VALUES ('91000000-0000-0000-0000-000000000002','Local existing video sentinel');
    INSERT INTO public.practice_problems(sentinel) VALUES ('Local legacy sentinel');
    INSERT INTO public.curriculum_frameworks(code,title,version,source_title)
      VALUES ('LOCAL-ONLY','Local prerequisite fixture','test','Synthetic only');
    INSERT INTO public.curriculum_units(framework_id,unit_number,title)
      SELECT id,1,'Local unit' FROM public.curriculum_frameworks;
    INSERT INTO public.curriculum_topics(unit_id,topic_code,title,big_idea,order_index)
      SELECT id,'1.1','Local topic one','LIM',1 FROM public.curriculum_units;
    INSERT INTO public.curriculum_topics(unit_id,topic_code,title,big_idea,order_index)
      SELECT id,'1.2','Local topic two','LIM',2 FROM public.curriculum_units;
    INSERT INTO public.curriculum_practices(code,name,description) VALUES (1,'Local practice','Synthetic only');
    INSERT INTO public.curriculum_practice_skills(practice_code,skill_code,description) VALUES (1,'1.A','Local skill');
    CREATE POLICY "Local prerequisite catalogs" ON public.curriculum_topics FOR SELECT TO authenticated USING (true);
    CREATE POLICY "Local prerequisite skills" ON public.curriculum_practice_skills FOR SELECT TO authenticated USING (true);
    CREATE POLICY "Local prerequisite frameworks" ON public.curriculum_frameworks FOR SELECT TO authenticated USING (true);
  `
}
const client = new pg.Client({ host: '127.0.0.1', port: 55439, database: 'postgres', user: 'postgres',
  password: localPassword, connectionTimeoutMillis: 5000 })
const existingTables = ['auth.users','public.user_roles','public.courses','public.course_videos',
  'public.practice_problems','public.curriculum_frameworks','public.curriculum_units',
  'public.curriculum_topics','public.curriculum_practices','public.curriculum_practice_skills']
async function existingSnapshot() {
  const snapshot = {}
  for (const table of existingTables) snapshot[table] = (await client.query(
    `SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text, '[]')) AS hash FROM ${table} t`,
  )).rows[0].hash
  snapshot.ledger = (await client.query(`SELECT jsonb_agg(to_jsonb(t) ORDER BY version) AS value
    FROM supabase_migrations.schema_migrations t WHERE version NOT IN ('20260926000000','20261004000000')`)).rows[0].value
  return snapshot
}
async function assertNoBank() {
  const result = await client.query(`SELECT
    (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname IN ('questions','question_versions','question_options',
      'question_practice_skills','question_topics','misconceptions','option_misconceptions','question_course_videos')) AS tables,
    (SELECT count(*)::int FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
      WHERE n.nspname='public' AND t.typname LIKE 'question_%') AS types,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname IN ('save_question_bank_drafts','approve_question_version','create_question_revision')) AS functions,
    (SELECT count(*)::int FROM supabase_migrations.schema_migrations
      WHERE version IN ('20260926000000','20261004000000')) AS records`)
  assert.deepEqual(result.rows[0], { tables: 0, types: 0, functions: 0, records: 0 })
}
async function rejected(sql, pattern) {
  try { await assert.rejects(client.query(sql), (error) => pattern.test(error.message)) }
  finally { await client.query('ROLLBACK') }
}

test('isolated production-package PostgreSQL rehearsal', async (t) => {
  try {
    await client.connect()
    await client.query(prerequisites())
    const baseline = await existingSnapshot()
    await t.test('starts with existing prerequisites and neither target migration', async () => {
      assert.ok(deploy.includes("confirmed_dashboard_project text := '';"))
      assert.ok(deploy.includes('accept_no_full_backup_risk boolean := false;'))
      assert.ok(deploy.includes('production_ledger_evidence_confirmed boolean := false;'))
      assert.ok(!deploy.includes('verified_backup_reference'))
      const packagedSources = [...deploy.matchAll(/\$o2i_source\$([\s\S]*?)\$o2i_source\$/g)].map((match) => match[1])
      assert.deepEqual(packagedSources, [
        read('supabase/migrations/20260926000000_question_bank_foundation.sql'),
        read('supabase/migrations/20261004000000_question_bank_draft_import.sql'),
      ])
      await assertNoBank()
      const result = await client.query(read('docs/question-bank/production/00_ledger_preflight_readonly.sql'))
      const report = result.find((r) => r.fields?.[0]?.name === 'ledger_preflight').rows[0].ledger_preflight
      assert.deepEqual(report.columns.map((column) => [column.name, column.type, column.not_null]), [
        ['version', 'text', true], ['statements', 'text[]', false], ['name', 'text', false],
        ['created_by', 'text', false], ['idempotency_key', 'text', false], ['rollback', 'text[]', false],
      ])
      assert.ok(report.columns.every((column) => column.default === null && column.identity === '' && column.generated === ''))
      assert.deepEqual(report.constraints.map((constraint) => constraint.definition).sort(),
        ['PRIMARY KEY (version)', 'UNIQUE (idempotency_key)'])
      assert.equal(report.rls_enabled, false)
      assert.deepEqual(report.user_triggers, [])
      assert.equal(report.executor_can_select, true)
      assert.equal(report.executor_can_insert, true)
    })
    await t.test('default closed target/risk/ledger gates refuse all writes', async () => {
      await rejected(deploy, /confirm Dashboard target/)
      await assertNoBank()
    })
    await t.test('unaccepted no-full-backup risk alone refuses all writes', async () => {
      await rejected(approvedLocalCopy.replace('accept_no_full_backup_risk boolean := true;',
        'accept_no_full_backup_risk boolean := false;'), /explicitly accept the no-full-backup risk/)
      await assertNoBank()
      assert.deepEqual(await existingSnapshot(), baseline)
    })
    await t.test('NULL risk acknowledgement also refuses all writes', async () => {
      await rejected(approvedLocalCopy.replace('accept_no_full_backup_risk boolean := true;',
        'accept_no_full_backup_risk boolean := NULL;'), /explicitly accept the no-full-backup risk/)
      await assertNoBank()
    })
    await t.test('unconfirmed target alone still refuses all writes', async () => {
      await rejected(approvedLocalCopy.replace("confirmed_dashboard_project text := 'lxoaeaewcrshjkigzyqe';",
        "confirmed_dashboard_project text := '';"), /confirm Dashboard target/)
      await assertNoBank()
    })
    await t.test('unconfirmed ledger evidence alone still refuses all writes', async () => {
      await rejected(approvedLocalCopy.replace('production_ledger_evidence_confirmed boolean := true;',
        'production_ledger_evidence_confirmed boolean := false;'), /confirm Dashboard target/)
      await assertNoBank()
    })
    const incompatibleLedgers = [
      ['unknown column', 'ALTER TABLE supabase_migrations.schema_migrations ADD COLUMN unexpected text'],
      ['missing column', 'ALTER TABLE supabase_migrations.schema_migrations DROP COLUMN created_by'],
      ['wrong column type', 'ALTER TABLE supabase_migrations.schema_migrations ALTER COLUMN created_by TYPE bigint USING NULL'],
      ['wrong nullability', 'ALTER TABLE supabase_migrations.schema_migrations ALTER COLUMN created_by SET NOT NULL'],
      ['unexpected default', "ALTER TABLE supabase_migrations.schema_migrations ALTER COLUMN created_by SET DEFAULT 'LOCAL-unexpected'"],
      ['generated column', `ALTER TABLE supabase_migrations.schema_migrations DROP COLUMN created_by;
        ALTER TABLE supabase_migrations.schema_migrations ADD COLUMN created_by text GENERATED ALWAYS AS (version) STORED`],
      ['missing primary key', 'ALTER TABLE supabase_migrations.schema_migrations DROP CONSTRAINT schema_migrations_pkey'],
      ['wrong unique key', `ALTER TABLE supabase_migrations.schema_migrations DROP CONSTRAINT schema_migrations_idempotency_key_key;
        ALTER TABLE supabase_migrations.schema_migrations ADD CONSTRAINT schema_migrations_idempotency_key_key UNIQUE(created_by)`],
      ['deferred unique key', `ALTER TABLE supabase_migrations.schema_migrations DROP CONSTRAINT schema_migrations_idempotency_key_key;
        ALTER TABLE supabase_migrations.schema_migrations ADD CONSTRAINT schema_migrations_idempotency_key_key UNIQUE(idempotency_key) DEFERRABLE`],
      ['NULLS NOT DISTINCT unique key', `ALTER TABLE supabase_migrations.schema_migrations DROP CONSTRAINT schema_migrations_idempotency_key_key;
        ALTER TABLE supabase_migrations.schema_migrations ADD CONSTRAINT schema_migrations_idempotency_key_key UNIQUE NULLS NOT DISTINCT(idempotency_key)`],
      ['extra constraint', "ALTER TABLE supabase_migrations.schema_migrations ADD CONSTRAINT local_extra_check CHECK(version <> '')"],
      ['RLS enabled', 'ALTER TABLE supabase_migrations.schema_migrations ENABLE ROW LEVEL SECURITY'],
      ['user trigger', `CREATE FUNCTION public.local_ledger_trigger() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW; END;$$;
        CREATE TRIGGER local_ledger_trigger BEFORE INSERT ON supabase_migrations.schema_migrations
          FOR EACH ROW EXECUTE FUNCTION public.local_ledger_trigger()`],
    ]
    for (const [name, alteration] of incompatibleLedgers) {
      await t.test(`incompatible ledger (${name}) refuses all writes`, async () => {
        // Local negative fixture and failed release share a transaction; rejection rolls both back.
        await client.query('BEGIN')
        await client.query(alteration)
        await rejected(approvedLocalCopy, /ledger shape\/access differs/)
        await assertNoBank()
        assert.deepEqual(await existingSnapshot(), baseline)
      })
    }
    await t.test('preexisting bank object refuses partial/repeat deployment', async () => {
      await client.query('CREATE TABLE public.questions(id uuid)')
      await rejected(approvedLocalCopy, /public.questions already exists/)
      await client.query('DROP TABLE public.questions')
      await assertNoBank()
    })
    await t.test('second-migration failure rolls back completed foundation', async () => {
      await rejected(approvedLocalCopy.replace('EXECUTE draft_import_sql;', "RAISE EXCEPTION 'LOCAL injected second migration failure';"), /LOCAL injected/)
      await assertNoBank()
      assert.deepEqual(await existingSnapshot(), baseline)
    })
    await t.test('failure after both DDL and ledger writes rolls back everything', async () => {
      await rejected(approvedLocalCopy.replace("ARRAY[draft_import_sql]);", "ARRAY[draft_import_sql]);\n RAISE EXCEPTION 'LOCAL injected post-ledger failure';"), /LOCAL injected/)
      await assertNoBank()
      assert.deepEqual(await existingSnapshot(), baseline)
    })
    await t.test('successful atomic deployment and readonly acceptance', async () => {
      await client.query(approvedLocalCopy)
      const results = await client.query(read('docs/question-bank/production/20_verify_readonly.sql'))
      const report = results.find((r) => r.fields?.[0]?.name === 'question_bank_catalog_report').rows[0].question_bank_catalog_report
      assert.equal(report.all_catalog_checks_pass, true, JSON.stringify(report))
      assert.equal(report.tables.length, 8)
      const ledger = results.find((r) => r.fields?.[0]?.name === 'version').rows
      assert.equal(ledger.length, 2)
      assert.ok(ledger.every((record) => record.matches_packaged_migration))
      const optionalFields = (await client.query(`SELECT created_by,idempotency_key,rollback
        FROM supabase_migrations.schema_migrations WHERE version IN ('20260926000000','20261004000000')`)).rows
      assert.deepEqual(optionalFields, [
        { created_by: null, idempotency_key: null, rollback: null },
        { created_by: null, idempotency_key: null, rollback: null },
      ])
      assert.deepEqual(await existingSnapshot(), baseline)
    })
    await t.test('repeat execution rejects without changing successful deployment', async () => {
      const before = (await client.query('SELECT version,md5(statements::text) AS hash FROM supabase_migrations.schema_migrations ORDER BY version')).rows
      await rejected(approvedLocalCopy, /already recorded/)
      assert.deepEqual((await client.query('SELECT version,md5(statements::text) AS hash FROM supabase_migrations.schema_migrations ORDER BY version')).rows, before)
      assert.deepEqual(await existingSnapshot(), baseline)
    })
    await t.test('a second real connection blocks concurrent release execution', async () => {
      const other = new pg.Client({ host: '127.0.0.1', port: 55439, database: 'postgres', user: 'postgres',
        password: localPassword, connectionTimeoutMillis: 5000 })
      try {
        await other.connect()
        await other.query('BEGIN; SELECT pg_advisory_xact_lock(20260926,20261004)')
        await rejected(approvedLocalCopy, /another copy of this release is running/)
      } finally {
        await other.query('ROLLBACK').catch(() => {})
        await other.end()
      }
      assert.deepEqual(await existingSnapshot(), baseline)
    })
    for (const file of ['question_bank_foundation_test.sql','question_bank_draft_import_test.sql']) {
      await t.test(`existing pgTAP regression: ${file}`, async () => {
        const results = await client.query(read(`supabase/tests/${file}`))
        const tap = results.flatMap((r) => r.rows ?? []).flatMap((row) => Object.values(row)).filter((value) => typeof value === 'string')
        const failed = tap.filter((line) => /(^|\n)not ok\b|Looks like you (?:failed|planned)/.test(line))
        assert.deepEqual(failed, [], failed.join('\n'))
        const assertions = tap.filter((line) => /^ok \d+/.test(line)).length
        assert.equal(assertions, file.includes('foundation') ? 99 : 29)
        console.log(`${file}: ${assertions} assertions passed; transaction rolled back`)
      })
    }
    await t.test('readonly verification detects missing integrity index', async () => {
      await client.query('BEGIN; DROP INDEX public.question_options_one_correct_per_version')
      // File 20 contains its own transaction; remove wrappers ONLY in local test copy.
      const sql = read('docs/question-bank/production/20_verify_readonly.sql').replace('BEGIN READ ONLY;', '').replace(/COMMIT;\s*$/, '')
      const results = await client.query(sql)
      assert.equal(results.find((r) => r.fields?.[0]?.name === 'question_bank_catalog_report').rows[0].question_bank_catalog_report.all_catalog_checks_pass, false)
      await client.query('ROLLBACK')
    })
    await t.test('tests leave no content/auth changes and no published questions', async () => {
      assert.deepEqual(await existingSnapshot(), baseline)
      const counts = (await client.query(`SELECT (SELECT count(*)::int FROM public.questions) AS questions,
        (SELECT count(*)::int FROM public.question_versions) AS versions`)).rows[0]
      assert.deepEqual(counts, { questions: 0, versions: 0 })
    })
  } finally {
    await client.query('ROLLBACK').catch(() => {})
    await client.end()
  }
})
