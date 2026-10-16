// Mechanical packaging only: never connects to any database.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = new URL('../../../', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')
const sources = [
  ['20260926000000', 'question_bank_foundation'],
  ['20261004000000', 'question_bank_draft_import'],
].map(([version, name]) => ({ version, name,
  sql: read(`supabase/migrations/${version}_${name}.sql`),
}))
const hash = (value, algorithm = 'md5') => createHash(algorithm).update(value).digest('hex')
const quote = (value) => `'${value.replaceAll("'", "''")}'`
const tables = [...sources[0].sql.matchAll(/CREATE TABLE public\.(\w+) \(/g)].map((m) => m[1])
const types = [...sources[0].sql.matchAll(/CREATE TYPE public\.(\w+) AS ENUM/g)].map((m) => m[1])
const functions = new Map()
const parseFunctions = (sql) => [...sql.matchAll(
  /CREATE OR REPLACE FUNCTION public\.(\w+)\(([^)]*)\)\s+RETURNS ([\w.]+)\s+([\s\S]*?)AS \$\$([\s\S]*?)\$\$([\s\S]*?);/g,
)].map((m) => ({ name: m[1], args: m[2].trim()
  ? m[2].trim().split(',').map((arg) => arg.trim().split(/\s+/).slice(1).join(' ')).join(', ')
  : '', argumentNames: m[2].trim() ? m[2].trim().split(',').map((arg) => arg.trim().split(/\s+/)[0]) : [],
  returns: m[3].toLowerCase(), definer: `${m[4]} ${m[6]}`.includes('SECURITY DEFINER'),
  bodyHash: hash(m[5].replace(/\s/g, '')) }))
for (const source of sources) for (const fn of parseFunctions(source.sql)) functions.set(fn.name, fn)
const roles = read('supabase/migrations/20260920000000_content_admin_roles.sql')
const legacy = read('supabase/migrations/20250910020036_7f5646ab-55d4-4412-823b-b244048be7ba.sql')
const prerequisites = [...parseFunctions(roles), ...parseFunctions(legacy)]
  .filter((fn) => ['has_role', 'is_super_admin', 'update_updated_at_column'].includes(fn.name))
assert.equal(prerequisites.length, 3)
assert.equal(tables.length, 8)
assert.equal(functions.size, 18)
for (const source of sources) assert.ok(!source.sql.includes('$o2i_source$'))
const policies = [...sources[0].sql.matchAll(/CREATE POLICY "([^"]+)"\s+ON public\.(\w+)\s+FOR (ALL|SELECT)\s+TO authenticated/g)]
const triggers = [...sources.map((s) => s.sql).join('\n').matchAll(
  /CREATE TRIGGER (\w+)\s+(?:BEFORE|AFTER)[\s\S]*? ON public\.(\w+)\s+FOR EACH ROW\s+EXECUTE FUNCTION public\.(\w+)\(\);/g,
)].map((m) => ({ name: m[1], table: m[2], fn: m[3] }))
const tableValues = tables.map((t) => `(${quote(t)})`).join(',\n  ')
const fnValues = [...functions.values()].map((fn) =>
  `(${quote(`public.${fn.name}(${fn.args})`)}, ${quote(fn.bodyHash)}, ${fn.definer}, ${quote(fn.returns)}, ARRAY[${fn.argumentNames.map(quote).join(',')}]::text[])`).join(',\n  ')
const policyValues = policies.map((m) => `(${quote(m[2])}, ${quote(m[1])}, ${quote(m[3] === 'ALL' ? '*' : 'r')})`).join(',\n  ')
const triggerValues = triggers.map((t) => `(${quote(t.table)}, ${quote(t.name)}, ${quote(`public.${t.fn}()`)})`).join(',\n  ')

// Also reused inside the deployment transaction, before writing the ledger.
const catalogReport = `WITH expected_tables(name) AS (VALUES
  ${tableValues}
), expected_functions(signature, body_hash, definer, return_type, argument_names) AS (VALUES
  ${fnValues}
), expected_policies(table_name, name, command) AS (VALUES
  ${policyValues}
), expected_triggers(table_name, name, signature) AS (VALUES
  ${triggerValues}
), table_checks AS (
  SELECT e.name, c.oid, c.relrowsecurity,
    c.relkind = 'r' AND c.relrowsecurity
      AND has_schema_privilege('authenticated', 'public', 'USAGE')
      AND (SELECT bool_and(has_table_privilege('authenticated', c.oid, privilege))
        FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) privilege)
      AND (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) = 2
      AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid
        AND p.polroles <> ARRAY[(SELECT oid FROM pg_roles WHERE rolname = 'authenticated')])
      AS ok
  FROM expected_tables e LEFT JOIN pg_class c ON c.oid = to_regclass('public.' || e.name)
), function_checks AS (
  SELECT e.signature, p.oid IS NOT NULL AS exists,
    p.prosecdef = e.definer AND p.prorettype = to_regtype(e.return_type)
      AND COALESCE(p.proargnames, ARRAY[]::text[]) = e.argument_names
      AND md5(regexp_replace(p.prosrc, '[[:space:]]', '', 'g')) = e.body_hash
      AND 'search_path=public, extensions' = ANY(p.proconfig) AS ok,
    has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute
  FROM expected_functions e LEFT JOIN pg_proc p ON p.oid = to_regprocedure(e.signature)
), policy_checks AS (
  SELECT e.table_name, e.name,
    p.polcmd::text = e.command AND p.polpermissive
      AND p.polroles = ARRAY[(SELECT oid FROM pg_roles WHERE rolname = 'authenticated')] AS ok,
    pg_get_expr(p.polqual, p.polrelid) AS using_expression,
    pg_get_expr(p.polwithcheck, p.polrelid) AS check_expression
  FROM expected_policies e LEFT JOIN pg_policy p
    ON p.polrelid = to_regclass('public.' || e.table_name) AND p.polname = e.name
), trigger_checks AS (
  SELECT e.table_name, e.name,
    t.tgfoid = to_regprocedure(e.signature) AND t.tgenabled = 'O' AS ok
  FROM expected_triggers e LEFT JOIN pg_trigger t
    ON t.tgrelid = to_regclass('public.' || e.table_name) AND t.tgname = e.name
), key_constraints(name, table_name, kind, keys) AS (VALUES
  ('questions_current_version_belongs_to_question', 'questions', 'f', ARRAY['current_version_id','id']),
  ('question_versions_question_version_unique', 'question_versions', 'u', ARRAY['question_id','version_number']),
  ('question_versions_id_question_unique', 'question_versions', 'u', ARRAY['id','question_id']),
  ('question_versions_source_identity_check', 'question_versions', 'c', NULL),
  ('question_versions_approval_audit_check', 'question_versions', 'c', NULL),
  ('question_versions_published_metadata_required', 'question_versions', 'c', NULL),
  ('questions_lifecycle_pointer_check', 'questions', 'c', NULL)
), constraint_checks AS (
  SELECT e.name, c.contype::text = e.kind AND c.convalidated
    AND (e.keys IS NULL OR e.keys = ARRAY(SELECT a.attname::text
      FROM unnest(c.conkey) WITH ORDINALITY k(attnum, ord)
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum ORDER BY k.ord))
    AND (e.kind <> 'f' OR (c.confrelid = to_regclass('public.question_versions')
      AND c.condeferrable AND ARRAY['id','question_id'] = ARRAY(SELECT a.attname::text
        FROM unnest(c.confkey) WITH ORDINALITY k(attnum, ord)
        JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.attnum ORDER BY k.ord))) AS ok
  FROM key_constraints e LEFT JOIN pg_constraint c
    ON c.conrelid = to_regclass('public.' || e.table_name) AND c.conname = e.name
), index_checks AS (
  SELECT n.name, i.indisunique AND i.indisvalid AND i.indpred IS NOT NULL AS ok,
    pg_get_indexdef(i.indexrelid) AS definition
  FROM (VALUES ('question_options_one_correct_per_version'),
    ('question_versions_one_working_revision'), ('question_versions_one_approved_version')) n(name)
  LEFT JOIN pg_index i ON i.indexrelid = to_regclass('public.' || n.name)
), column_checks AS (
  SELECT e.table_name, e.name,
    a.attnotnull = e.not_null AND format_type(a.atttypid, a.atttypmod) = e.type AS ok,
    pg_get_expr(d.adbin, d.adrelid) AS default_expression
  FROM (VALUES
    ('question_versions','calculator_policy','question_calculator_policy',false),
    ('question_versions','source_type','question_source_type',false),
    ('question_versions','import_evidence','jsonb',true),
    ('question_options','import_evidence','jsonb',true),
    ('question_versions','source_page','integer',true),
    ('question_versions','source_question_number','text',false),
    ('question_versions','source_locator','text',false),
    ('questions','status','question_status',true),
    ('question_versions','status','question_version_status',true)
  ) e(table_name,name,type,not_null)
  LEFT JOIN pg_attribute a ON a.attrelid = to_regclass('public.' || e.table_name)
    AND a.attname = e.name AND a.attnum > 0 AND NOT a.attisdropped
  LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
), rpc_checks AS (
  SELECT bool_and(COALESCE(has_function_privilege('authenticated', to_regprocedure(signature), 'EXECUTE'), false)) AS authenticated_execute,
    NOT COALESCE(has_function_privilege('anon', to_regprocedure('public.save_question_bank_drafts(jsonb)'), 'EXECUTE'), true) AS anon_save_denied
  FROM (VALUES ('public.save_question_bank_drafts(jsonb)'), ('public.create_question_revision(uuid)'),
    ('public.submit_question_version_for_review(uuid, uuid)'), ('public.return_question_version_to_draft(uuid, uuid)'),
    ('public.approve_question_version(uuid, uuid)'), ('public.retire_question(uuid)')) r(signature)
)
SELECT jsonb_build_object(
  'all_catalog_checks_pass',
    (SELECT bool_and(COALESCE(ok,false)) FROM table_checks)
    AND (SELECT bool_and(COALESCE(ok,false)) FROM function_checks)
    AND (SELECT bool_and(COALESCE(ok,false)) FROM policy_checks)
    AND (SELECT bool_and(COALESCE(ok,false)) FROM trigger_checks)
    AND (SELECT bool_and(COALESCE(ok,false)) FROM constraint_checks)
    AND (SELECT bool_and(COALESCE(ok,false)) FROM index_checks)
    AND (SELECT bool_and(COALESCE(ok,false)) FROM column_checks)
    AND (SELECT authenticated_execute AND anon_save_denied FROM rpc_checks),
  'tables', (SELECT jsonb_agg(to_jsonb(t) - 'oid') FROM table_checks t),
  'functions', (SELECT jsonb_agg(to_jsonb(f)) FROM function_checks f),
  'policies', (SELECT jsonb_agg(to_jsonb(p)) FROM policy_checks p),
  'triggers', (SELECT jsonb_agg(to_jsonb(t)) FROM trigger_checks t),
  'key_constraints', (SELECT jsonb_agg(to_jsonb(c)) FROM constraint_checks c),
  'partial_indexes', (SELECT jsonb_agg(to_jsonb(i)) FROM index_checks i),
  'draft_columns', (SELECT jsonb_agg(to_jsonb(c)) FROM column_checks c),
  'rpc_grants', (SELECT to_jsonb(r) FROM rpc_checks r),
  'all_constraints', (SELECT jsonb_agg(jsonb_build_object('table', e.name,
    'name', c.conname, 'definition', pg_get_constraintdef(c.oid)))
    FROM expected_tables e JOIN pg_constraint c ON c.conrelid = to_regclass('public.' || e.name)),
  'warning', 'Catalog checks are NOT an administrator session, REST cache, or real XLSX acceptance test.'
)`

const prereqValues = prerequisites.map((fn) =>
  `(${quote(`public.${fn.name}(${fn.args})`)}, ${quote(fn.bodyHash)}, ${fn.definer})`).join(',\n      ')
const deploy = `-- O2I production question-bank release package. Generated; do not edit migration bodies.
-- TARGET: lxoaeaewcrshjkigzyqe. This comment DOES NOT verify the connection.
-- Run the WHOLE file once in that project's Dashboard SQL Editor as postgres.
-- BLOCKED BY DEFAULT: confirm target + ledger evidence and explicitly accept no-full-backup risk.
-- No full backup exists. Atomic rollback protects pre-commit failure, NOT post-commit recovery.
-- No taxonomy, roles initialization, test fixtures, content import, or frontend deployment.
${sources.map((s) => `-- ${s.version}_${s.name}.sql SHA256 ${hash(s.sql, 'sha256')}`).join('\n')}
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
SET LOCAL search_path = public, extensions;

DO $o2i_release$
DECLARE
  -- Edit ONLY these gates in the SQL Editor copy, after the separate evidence review.
  confirmed_dashboard_project text := ''; -- must be lxoaeaewcrshjkigzyqe; manual attestation only
  accept_no_full_backup_risk boolean := false; -- explicit acceptance; NOT proof of backup or recovery
  production_ledger_evidence_confirmed boolean := false; -- requires 00_ledger_preflight_readonly.sql result
  foundation_sql constant text := $o2i_source$${sources[0].sql}$o2i_source$;
  draft_import_sql constant text := $o2i_source$${sources[1].sql}$o2i_source$;
  catalog_report jsonb;
  dependency text;
  actual_columns jsonb;
BEGIN
  IF confirmed_dashboard_project <> 'lxoaeaewcrshjkigzyqe' OR NOT production_ledger_evidence_confirmed THEN
    RAISE EXCEPTION 'STOP: confirm Dashboard target and production ledger evidence first.';
  END IF;
  IF accept_no_full_backup_risk IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'STOP: explicitly accept the no-full-backup risk; a transaction does not provide post-commit recovery.';
  END IF;
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'STOP: this package was reviewed for SQL Editor postgres execution only.';
  END IF;
  IF NOT pg_try_advisory_xact_lock(20260926, 20261004) THEN
    RAISE EXCEPTION 'STOP: another copy of this release is running.';
  END IF;
  IF to_regclass('supabase_migrations.schema_migrations') IS NULL THEN
    RAISE EXCEPTION 'STOP: migration ledger missing; do not create or guess its structure.';
  END IF;
  -- Exact six-column production shape confirmed by the user's readonly metadata.
  SELECT jsonb_agg(jsonb_build_array(a.attname, format_type(a.atttypid,a.atttypmod), a.attnotnull)
    ORDER BY a.attname) INTO actual_columns FROM pg_attribute a
  WHERE a.attrelid = 'supabase_migrations.schema_migrations'::regclass
    AND a.attnum > 0 AND NOT a.attisdropped;
  IF actual_columns IS DISTINCT FROM
    '[ ["created_by","text",false], ["idempotency_key","text",false], ["name","text",false],
       ["rollback","text[]",false], ["statements","text[]",false], ["version","text",true] ]'::jsonb
    OR EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'supabase_migrations.schema_migrations'::regclass
      AND attnum > 0 AND NOT attisdropped AND (attidentity <> '' OR attgenerated <> ''))
    OR EXISTS (SELECT 1 FROM pg_attrdef WHERE adrelid = 'supabase_migrations.schema_migrations'::regclass)
    OR (SELECT relrowsecurity FROM pg_class WHERE oid = 'supabase_migrations.schema_migrations'::regclass)
    OR EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'supabase_migrations.schema_migrations'::regclass AND NOT tgisinternal)
    OR (SELECT count(*) FROM pg_constraint WHERE conrelid = 'supabase_migrations.schema_migrations'::regclass) <> 2
    OR NOT EXISTS (SELECT 1 FROM pg_constraint c
      JOIN pg_index i ON i.indexrelid = c.conindid
      WHERE c.conrelid = 'supabase_migrations.schema_migrations'::regclass AND c.contype = 'p'
        AND c.conname = 'schema_migrations_pkey' AND c.convalidated
        AND NOT c.condeferrable AND NOT c.condeferred
        AND i.indisprimary AND i.indisunique AND i.indisvalid AND i.indisready
        AND i.indnatts = 1 AND i.indpred IS NULL AND i.indexprs IS NULL
        AND c.conkey = ARRAY[(SELECT attnum FROM pg_attribute
          WHERE attrelid = c.conrelid AND attname = 'version')]::smallint[])
    OR NOT EXISTS (SELECT 1 FROM pg_constraint c
      JOIN pg_index i ON i.indexrelid = c.conindid
      WHERE c.conrelid = 'supabase_migrations.schema_migrations'::regclass AND c.contype = 'u'
        AND c.conname = 'schema_migrations_idempotency_key_key' AND c.convalidated
        AND NOT c.condeferrable AND NOT c.condeferred
        AND i.indisunique AND i.indisvalid AND i.indisready AND NOT i.indnullsnotdistinct
        AND i.indnatts = 1 AND i.indpred IS NULL AND i.indexprs IS NULL
        AND c.conkey = ARRAY[(SELECT attnum FROM pg_attribute
          WHERE attrelid = c.conrelid AND attname = 'idempotency_key')]::smallint[])
    OR NOT (has_table_privilege(current_user, 'supabase_migrations.schema_migrations', 'SELECT')
      AND has_table_privilege(current_user, 'supabase_migrations.schema_migrations', 'INSERT')) THEN
    RAISE EXCEPTION 'STOP: ledger shape/access differs from the supported, reviewed shape. Return readonly metadata; do not bypass.';
  END IF;
  LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version IN ('20260926000000','20261004000000')) THEN
    RAISE EXCEPTION 'STOP: one or both target migrations are already recorded. No repeat or partial deployment.';
  END IF;
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations
    WHERE version IN ('20260920000000','20260920010000')) <> 2 THEN
    RAISE EXCEPTION 'STOP: required roles/taxonomy migration records are missing; do not replay them with this package.';
  END IF;
  FOREACH dependency IN ARRAY ARRAY[${tables.map(quote).join(', ')}] LOOP
    IF to_regclass('public.' || dependency) IS NOT NULL THEN
      RAISE EXCEPTION 'STOP: public.% already exists; investigate partial deployment.', dependency;
    END IF;
  END LOOP;
  FOREACH dependency IN ARRAY ARRAY[${types.map(quote).join(', ')}] LOOP
    IF to_regtype('public.' || dependency) IS NOT NULL THEN
      RAISE EXCEPTION 'STOP: public.% type already exists; investigate partial deployment.', dependency;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN (${[...functions.keys()].map(quote).join(', ')})) THEN
    RAISE EXCEPTION 'STOP: question-bank function already exists; investigate partial deployment.';
  END IF;
  FOREACH dependency IN ARRAY ARRAY['auth.users','public.user_roles','public.courses','public.course_videos',
    'public.curriculum_frameworks','public.curriculum_units','public.curriculum_topics',
    'public.curriculum_practices','public.curriculum_practice_skills','public.practice_problems'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = to_regclass(dependency) AND relkind = 'r') THEN
      RAISE EXCEPTION 'STOP: required existing table % missing.', dependency;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'extensions')
    OR to_regprocedure('auth.uid()') IS NULL OR to_regprocedure('auth.role()') IS NULL
    OR to_regprocedure('gen_random_uuid()') IS NULL
    OR (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon','authenticated')) <> 2
    OR (SELECT count(*) FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
      JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='app_role'
        AND e.enumlabel IN ('admin','super_admin','student','instructor')) <> 4 THEN
    RAISE EXCEPTION 'STOP: auth, UUID, role, or schema dependencies are incomplete.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM (VALUES
      ${prereqValues}
    ) e(signature, body_hash, definer) LEFT JOIN pg_proc p ON p.oid = to_regprocedure(e.signature)
    WHERE p.oid IS NULL OR p.prosecdef IS DISTINCT FROM e.definer
      OR md5(regexp_replace(p.prosrc,'[[:space:]]','','g')) IS DISTINCT FROM e.body_hash
  ) THEN
    RAISE EXCEPTION 'STOP: required role/updated_at function differs from the reviewed repository.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.curriculum_topics)
    OR NOT EXISTS (SELECT 1 FROM public.curriculum_practice_skills) THEN
    RAISE EXCEPTION 'STOP: canonical Topic/Skill catalogs are empty.';
  END IF;

  EXECUTE foundation_sql;
  EXECUTE draft_import_sql;

  ${catalogReport} INTO catalog_report;
  IF NOT COALESCE((catalog_report->>'all_catalog_checks_pass')::boolean, false) THEN
    RAISE EXCEPTION 'STOP: post-DDL catalog verification failed; both migrations will roll back.';
  END IF;
  -- Only now record success, still INSIDE the same transaction as both migrations.
  -- No ON CONFLICT, no repair of unrelated ledger versions.
  -- Leave optional created_by, idempotency_key, rollback NULL; invent no audit facts.
  INSERT INTO supabase_migrations.schema_migrations(version, name, statements) VALUES
    ('20260926000000','question_bank_foundation',ARRAY[foundation_sql]),
    ('20261004000000','question_bank_draft_import',ARRAY[draft_import_sql]);
END;
$o2i_release$;
COMMIT;
-- Do not infer success from an isolated statement. Require no errors AND file 20 verification.
`
const verify = `-- Readonly acceptance for project lxoaeaewcrshjkigzyqe; verify Dashboard target manually.
-- No RPC execution, content reads, auth sessions, cache refresh, or test fixtures.
-- Run after a successful deployment. Ledger columns must first match file 00.
BEGIN READ ONLY;
SET LOCAL search_path = public, extensions;
${catalogReport} AS question_bank_catalog_report;
SELECT version, name, cardinality(statements) AS statement_blocks,
  CASE version
${sources.map((s) => `    WHEN '${s.version}' THEN name = '${s.name}' AND cardinality(statements) = 1 AND md5(statements[1]) = '${hash(s.sql)}'`).join('\n')}
    ELSE false END AS matches_packaged_migration
FROM supabase_migrations.schema_migrations
WHERE version IN ('20260926000000','20261004000000') ORDER BY version;
COMMIT;
`
for (const [name, sql] of [['10_deploy_question_bank.sql', deploy], ['20_verify_readonly.sql', verify]]) {
  const path = new URL(name, import.meta.url)
  if (process.argv.includes('--check')) assert.equal(readFileSync(path, 'utf8'), sql, `${name} is stale`)
  else writeFileSync(path, sql)
  console.log(`${process.argv.includes('--check') ? 'Verified' : 'Generated'} ${fileURLToPath(path)}`)
}
console.log(`Inventory: ${tables.length} tables, ${types.length} types, ${functions.size} final functions, ${policies.length} policies, ${triggers.length} triggers`)
