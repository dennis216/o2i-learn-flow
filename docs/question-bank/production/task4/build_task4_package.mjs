// Mechanical SQL packaging only. No network/database connections.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../../../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const hash = (value, algorithm = 'md5') => createHash(algorithm).update(value).digest('hex');
const quote = value => `'${value.replaceAll("'", "''")}'`;
export const sources = [
  ['20260926000000', 'question_bank_foundation'],
  ['20261004000000', 'question_bank_draft_import'],
  ['20261018000000', 'question_bank_draft_management'],
  ['20261019000000', 'question_bank_unpublished_status'],
  ['20261019010000', 'question_bank_publication'],
].map(([version, name]) => ({ version, name, sql: read(`supabase/migrations/${version}_${name}.sql`) }));

function functions(sql) {
  return [...sql.matchAll(/CREATE(?: OR REPLACE)? FUNCTION public\.(\w+)\(([^)]*)\)\s+RETURNS ([\w.]+)([\s\S]*?)AS \$\$([\s\S]*?)\$\$([^;]*);/g)]
    .map(m => {
      const args = m[2].trim() ? m[2].split(',').map(arg => arg.trim().split(/\s+/)) : [];
      const attributes = `${m[4]} ${m[6]}`;
      const searchPath = attributes.match(/SET search_path\s*=\s*([a-z_, ]+)/)?.[1].replace(/\s/g, '');
      assert.ok(searchPath, `Missing search_path in ${m[1]}`);
      return { name: m[1], signature: `public.${m[1]}(${args.map(arg => arg[1]).join(',')})`,
        arguments: args.map(arg => arg[0]), returns: m[3], definer: attributes.includes('SECURITY DEFINER'),
        searchPath, bodyHash: hash(m[5].replace(/\s/g, '')) };
    });
}
const prerequisites = [
  ...functions(read('supabase/migrations/20260920000000_content_admin_roles.sql')),
  ...functions(read('supabase/migrations/20250910020036_7f5646ab-55d4-4412-823b-b244048be7ba.sql')),
].filter(fn => ['has_role', 'is_super_admin', 'update_updated_at_column'].includes(fn.name));
assert.equal(prerequisites.length, 3);
const baselineTables = [...sources[0].sql.matchAll(/CREATE TABLE public\.(\w+) \(/g)].map(m => m[1]);
assert.equal(baselineTables.length, 8);
const enumSpecs = [...sources[0].sql.matchAll(/CREATE TYPE public\.(\w+) AS ENUM\s*\(([^)]*)\)/g)]
  .map(m => ({ name: m[1], values: [...m[2].matchAll(/'([^']+)'/g)].map(value => value[1]) }));
assert.equal(enumSpecs.length, 8);
const extraTables = ['question_version_reviews', 'question_publication_events'];
const publicRPCs = ['precheck_question_publication(uuid,uuid,text)', 'get_question_publication_state(uuid)',
  'record_question_version_review(uuid,uuid,text,jsonb)', 'save_question_bank_revision(uuid,uuid,text,jsonb)',
  'publish_question_versions(jsonb)', 'publish_question_version(uuid,uuid,text)',
  'unpublish_question(uuid,uuid,text)', 'republish_question(uuid,uuid,text)', 'archive_question(uuid,uuid,text)'];
const draftRPCs = ['get_question_bank_draft(uuid,uuid)', 'update_question_bank_draft_metadata(uuid,uuid,text,jsonb)',
  'delete_question_bank_draft(uuid,uuid,text,boolean)'];

function inventory(stage) {
  const fns = new Map(prerequisites.map(fn => [fn.name, fn])), policies = new Map(), triggers = new Map();
  for (const source of sources.slice(0, stage + 2)) {
    for (const fn of functions(source.sql)) fns.set(fn.name, fn);
    for (const m of source.sql.matchAll(/CREATE POLICY "([^"]+)"\s+ON public\.(\w+)\s+FOR (ALL|SELECT)\s+TO authenticated|DROP POLICY "([^"]+)"\s+ON public\.(\w+);/g)) {
      if (m[4]) policies.delete(`${m[5]}.${m[4]}`);
      else policies.set(`${m[2]}.${m[1]}`, { name: m[1], table: m[2], command: m[3] === 'ALL' ? '*' : 'r' });
    }
    for (const m of source.sql.matchAll(/CREATE TRIGGER (\w+)\s+(?:BEFORE|AFTER)[\s\S]*? ON public\.(\w+)\s+FOR EACH ROW[\s\S]*?EXECUTE FUNCTION public\.(\w+)\(\);/g))
      triggers.set(`${m[2]}.${m[1]}`, { name: m[1], table: m[2], signature: `public.${m[3]}()` });
  }
  return { fns, policies, triggers, tables: stage === 3 ? [...baselineTables, ...extraTables] : baselineTables };
}

// Catalog checks never call lifecycle RPCs or read question/user content.
function catalog(stage) {
  const { fns, policies, triggers, tables } = inventory(stage);
  const fnValues = [...fns.values()].map(fn => `(${quote(fn.signature)},${quote(fn.bodyHash)},${fn.definer},${quote(fn.returns)},ARRAY[${fn.arguments.map(quote).join(',')}]::text[],${quote(fn.searchPath)})`).join(',\n');
  const columns = [
    ['questions', 'status', 'question_status', true],
    ['question_versions', 'status', 'question_version_status', true],
    ['question_versions', 'source_page', 'integer', true],
    ['question_versions', 'source_question_number', 'text', false],
    ['question_versions', 'source_locator', 'text', false],
    ['question_versions', 'source_locator_verified', 'boolean', true],
    ['question_versions', 'calculator_policy', 'question_calculator_policy', false],
    ['question_versions', 'source_type', 'question_source_type', false],
    ['question_versions', 'import_evidence', 'jsonb', true],
    ['question_options', 'import_evidence', 'jsonb', true],
    ...(stage === 3 ? [['questions', 'lifecycle_revision', 'bigint', true], ['question_versions', 'editorial_revision', 'bigint', true],
      ['question_version_reviews', 'review_data', 'jsonb', true], ['question_version_reviews', 'reviewed_by', 'uuid', true],
      ['question_publication_events', 'actor_id', 'uuid', true], ['question_publication_events', 'request_fingerprint', 'text', true]] : []),
  ];
  const allowed = ['save_question_bank_drafts(jsonb)', ...(stage >= 1 ? draftRPCs : []), ...(stage === 3 ? publicRPCs : [])];
  const privateFns = stage === 3 ? [...fns.values()].filter(fn => fn.name.startsWith('question_bank_') ||
    ['approve_question_version', 'create_question_revision', 'retire_question', 'assert_question_bank_admin', 'validate_question_version_approval'].includes(fn.name))
    .map(fn => fn.signature) : stage >= 1 ? ['public.question_bank_draft_fingerprint(uuid,uuid)'] : [];
  return `WITH expected_functions(signature,body_hash,definer,return_type,argument_names,search_path) AS (VALUES ${fnValues}),
function_checks AS (
  SELECT e.signature,p.oid IS NOT NULL AND p.prosecdef=e.definer AND p.prorettype=to_regtype(e.return_type)
    AND coalesce(p.proargnames,ARRAY[]::text[])=e.argument_names
    AND md5(regexp_replace(p.prosrc,'[[:space:]]','','g'))=e.body_hash
    AND EXISTS(SELECT 1 FROM unnest(p.proconfig) config WHERE replace(config,' ','')='search_path='||e.search_path) AS ok
  FROM expected_functions e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature)
), table_checks AS (
  SELECT e.name,c.relkind='r' AND c.relrowsecurity
    AND has_table_privilege('authenticated',c.oid,'SELECT')
    AND (SELECT count(*) FROM pg_policy p WHERE p.polrelid=c.oid)=e.policy_count AS ok
  FROM (VALUES ${tables.map(table => `(${quote(table)},${[...policies.values()].filter(p => p.table === table).length})`).join(',')}) e(name,policy_count)
  LEFT JOIN pg_class c ON c.oid=to_regclass('public.'||e.name)
), policy_checks AS (
  SELECT e.table_name,e.name,p.polcmd::text=e.command AND p.polpermissive
    AND p.polroles=ARRAY[(SELECT oid FROM pg_roles WHERE rolname='authenticated')]
    AND (e.name NOT LIKE 'Admins %' OR regexp_replace(pg_get_expr(p.polqual,p.polrelid),'[[:space:]]','','g')='has_role(auth.uid(),''admin''::app_role)')
    AND (e.command<>'*' OR regexp_replace(pg_get_expr(p.polwithcheck,p.polrelid),'[[:space:]]','','g')='has_role(auth.uid(),''admin''::app_role)') AS ok
  FROM (VALUES ${[...policies.values()].map(p => `(${quote(p.table)},${quote(p.name)},${quote(p.command)})`).join(',')}) e(table_name,name,command)
  LEFT JOIN pg_policy p ON p.polrelid=to_regclass('public.'||e.table_name) AND p.polname=e.name
), trigger_checks AS (
  SELECT e.table_name,e.name,t.tgenabled='O' AND t.tgfoid=to_regprocedure(e.signature) AS ok
  FROM (VALUES ${[...triggers.values()].map(t => `(${quote(t.table)},${quote(t.name)},${quote(t.signature)})`).join(',')}) e(table_name,name,signature)
  LEFT JOIN pg_trigger t ON t.tgrelid=to_regclass('public.'||e.table_name) AND t.tgname=e.name
), column_checks AS (
  SELECT e.table_name,e.name,a.attnotnull=e.not_null AND format_type(a.atttypid,a.atttypmod)=e.type AS ok
  FROM (VALUES ${columns.map(([table, name, type, notNull]) => `(${quote(table)},${quote(name)},${quote(type)},${notNull})`).join(',')}) e(table_name,name,type,not_null)
  LEFT JOIN pg_attribute a ON a.attrelid=to_regclass('public.'||e.table_name) AND a.attname=e.name AND a.attnum>0 AND NOT a.attisdropped
), index_checks AS (
  SELECT e.name,i.indisvalid AND i.indisready AND i.indisunique AND i.indpred IS NOT NULL AS ok
  FROM (VALUES ('question_options_one_correct_per_version'),('question_versions_one_working_revision'),('question_versions_one_approved_version')) e(name)
  LEFT JOIN pg_index i ON i.indexrelid=to_regclass('public.'||e.name)
), constraint_checks AS (
  SELECT e.table_name,e.name,c.convalidated AS ok,pg_get_constraintdef(c.oid) AS definition
  FROM (VALUES ('questions','questions_current_version_belongs_to_question'),('questions','questions_lifecycle_pointer_check'),
    ('question_versions','question_versions_question_version_unique'),('question_versions','question_versions_id_question_unique'),
    ('question_versions','question_versions_source_identity_check'),('question_versions','question_versions_approval_audit_check'),
    ('question_versions','question_versions_published_metadata_required')) e(table_name,name)
  LEFT JOIN pg_constraint c ON c.conrelid=to_regclass('public.'||e.table_name) AND c.conname=e.name
), checks AS (
  SELECT 'function:'||signature AS name,ok FROM function_checks
  UNION ALL SELECT 'table:'||name,ok FROM table_checks
  UNION ALL SELECT 'policy:'||table_name||'.'||name,ok FROM policy_checks
  UNION ALL SELECT 'trigger:'||table_name||'.'||name,ok FROM trigger_checks
  UNION ALL SELECT 'column:'||table_name||'.'||name,ok FROM column_checks
  UNION ALL SELECT 'index:'||name,ok FROM index_checks
  UNION ALL SELECT 'constraint:'||table_name||'.'||name,ok FROM constraint_checks
  UNION ALL SELECT 'enum:'||e.name,ARRAY(SELECT enumlabel::text FROM pg_enum WHERE enumtypid=to_regtype('public.'||e.name) ORDER BY enumsortorder)=e.expected_values
    FROM (VALUES ${enumSpecs.map(e => `(${quote(e.name)},ARRAY[${[...e.values, ...(e.name === 'question_status' && stage >= 2 ? ['unpublished'] : [])].map(quote).join(',')}]::text[])`).join(',')}) e(name,expected_values)
  UNION ALL SELECT 'lifecycle_constraint_matches_stage',position('unpublished' IN (SELECT definition FROM constraint_checks WHERE name='questions_lifecycle_pointer_check'))${stage === 3 ? '>0' : '=0'}
  UNION ALL SELECT 'compound_current_version_fk',EXISTS(SELECT 1 FROM pg_constraint c WHERE c.conrelid=to_regclass('public.questions')
    AND c.conname='questions_current_version_belongs_to_question' AND c.contype='f' AND c.condeferrable AND c.confrelid=to_regclass('public.question_versions')
    AND ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(attnum,ord) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.attnum ORDER BY ord)=ARRAY['current_version_id','id']
    AND ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(attnum,ord) JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.attnum ORDER BY ord)=ARRAY['id','question_id'])
  UNION ALL SELECT 'rpc:'||signature,coalesce(has_function_privilege('authenticated',to_regprocedure(signature),'EXECUTE'),false)
    AND NOT coalesce(has_function_privilege('anon',to_regprocedure(signature),'EXECUTE'),true)
    FROM (VALUES ${allowed.map(signature => `(${quote('public.' + signature)})`).join(',')}) e(signature)
${privateFns.length ? `UNION ALL SELECT 'private:'||signature,NOT has_function_privilege('authenticated',to_regprocedure(signature),'EXECUTE')
    AND NOT has_function_privilege('anon',to_regprocedure(signature),'EXECUTE') FROM (VALUES ${privateFns.map(signature => `(${quote(signature)})`).join(',')}) e(signature)` : ''}
${stage === 3 ? `UNION ALL SELECT 'protected:'||table_name||'.'||column_name,NOT has_column_privilege('authenticated','public.'||table_name,column_name,'UPDATE')
    FROM (VALUES ('questions','status'),('questions','current_version_id'),('questions','lifecycle_revision'),('question_versions','status'),
      ('question_versions','import_evidence'),('question_versions','source_locator_verified'),('question_versions','editorial_revision')) e(table_name,column_name)
    UNION ALL SELECT 'no_direct_identity_insert',NOT has_table_privilege('authenticated','public.questions','INSERT')
    UNION ALL SELECT 'no_direct_version_insert',NOT has_table_privilege('authenticated','public.question_versions','INSERT')` : ''}
)
SELECT jsonb_build_object('all_catalog_checks_pass',bool_and(coalesce(ok,false)),
  'checks',jsonb_agg(jsonb_build_object('name',name,'ok',coalesce(ok,false)) ORDER BY name),
  'note','Catalog checks do not replace administrator login/API/XLSX acceptance.') AS catalog_report FROM checks`;
}

const oldPackage = read('docs/question-bank/production/10_deploy_question_bank.sql');
// Reuse the previously exercised exact six-column ledger guard unchanged.
const ledgerGuard = oldPackage.slice(oldPackage.indexOf("  IF to_regclass('supabase_migrations.schema_migrations') IS NULL"),
  oldPackage.indexOf('  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations\n    WHERE version IN'));
assert.ok(ledgerGuard.includes('actual_columns'));
assert.ok(ledgerGuard.includes('LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;'));

function requireLedger(items) {
  return `IF EXISTS(SELECT 1 FROM (VALUES ${items.map(s => `(${quote(s.version)},${quote(s.name)},${quote(hash(s.sql))})`).join(',')}) e(version,name,body_hash)
    LEFT JOIN supabase_migrations.schema_migrations m ON m.version=e.version
    WHERE m.version IS NULL OR m.name IS DISTINCT FROM e.name OR cardinality(m.statements) IS DISTINCT FROM 1 OR md5(m.statements[1]) IS DISTINCT FROM e.body_hash) THEN
    RAISE EXCEPTION 'STOP: prerequisite migration ledger is missing or differs from repository SQL. Do not replay or repair it blindly.';
  END IF;`;
}

export function buildTask4Package() {
  const result = new Map();
  result.set('00_status_readonly.sql', `-- TARGET: lxoaeaewcrshjkigzyqe. Safe before, between or after steps; metadata only.
-- Dashboard project selection must be checked manually. Never reads question/user content.
BEGIN READ ONLY;
SET LOCAL search_path=public,extensions;
WITH expected(version,name,body_hash) AS (VALUES ${sources.map(s => `(${quote(s.version)},${quote(s.name)},${quote(hash(s.sql))})`).join(',')}),
ledger AS (
  SELECT e.version,m.version IS NOT NULL AS recorded,m.name,
    cardinality(m.statements) AS statement_blocks,
    m.name=e.name AND cardinality(m.statements)=1 AND md5(m.statements[1])=e.body_hash AS exact_repository_sql_matches
  FROM expected e LEFT JOIN supabase_migrations.schema_migrations m ON m.version=e.version
), functions AS (
  SELECT e.signature,p.oid IS NOT NULL AS exists,
    md5(regexp_replace(p.prosrc,'[[:space:]]','','g'))=e.body_hash AS matches_final_function_body,
    p.prosecdef AS security_definer,p.proconfig AS settings,
    has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
    has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute
  FROM (VALUES ${[...inventory(3).fns.values()].map(fn => `(${quote(fn.signature)},${quote(fn.bodyHash)})`).join(',')}) e(signature,body_hash)
  LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature)
)
SELECT jsonb_build_object('requested_project','lxoaeaewcrshjkigzyqe',
  'note','Confirm Dashboard project manually; partial states are evidence, not permission to repeat migrations.',
  'migration_records',(SELECT jsonb_agg(to_jsonb(l) ORDER BY version) FROM ledger l),
  'question_status_values',(SELECT coalesce(jsonb_agg(enumlabel ORDER BY enumsortorder),'[]') FROM pg_enum WHERE enumtypid=to_regtype('public.question_status')),
  'tables',(SELECT jsonb_agg(jsonb_build_object('name',e.name,'exists',c.oid IS NOT NULL,'rls_enabled',c.relrowsecurity) ORDER BY e.name)
    FROM (VALUES ${inventory(3).tables.map(name => `(${quote(name)})`).join(',')}) e(name) LEFT JOIN pg_class c ON c.oid=to_regclass('public.'||e.name)),
  'functions',(SELECT jsonb_agg(to_jsonb(f) ORDER BY signature) FROM functions f),
  'revision_columns',(SELECT coalesce(jsonb_agg(jsonb_build_object('table',c.relname,'column',a.attname,'type',format_type(a.atttypid,a.atttypmod))),'[]')
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid WHERE a.attnum>0 AND NOT a.attisdropped
      AND (a.attrelid=to_regclass('public.questions') AND a.attname='lifecycle_revision'
        OR a.attrelid=to_regclass('public.question_versions') AND a.attname='editorial_revision'))
) AS task4_status;
COMMIT;
`);
  for (let stage = 1; stage <= 3; stage++) {
    const source = sources[stage + 1], before = inventory(stage - 1), final = inventory(3);
    const newNames = [...final.fns.keys()].filter(name => !before.fns.has(name));
    assert.ok(!source.sql.includes('$o2i_task4_source$'));
    const filename = ['10_draft_management.sql', '20_unpublished_status.sql', '30_publication.sql'][stage - 1];
    result.set(filename, `-- Task 4 step ${stage}/3. TARGET: lxoaeaewcrshjkigzyqe (manual Dashboard confirmation required).
-- Execute this WHOLE file as a SEPARATE SQL Editor run. Do NOT concatenate the three files.
-- Only ${source.version}_${source.name}.sql is applied; no old migration is replayed.
-- Original migration SHA256 ${hash(source.sql, 'sha256')}
-- DEFAULT CLOSED. No complete backup exists; pre-commit rollback is NOT post-commit recovery.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SET LOCAL search_path=public,extensions;
DO $o2i_task4_release$
DECLARE
  -- Change only these three gates in the SQL Editor copy after reviewing preflight evidence.
  confirmed_dashboard_project text := '';
  accept_no_full_backup_risk boolean := false;
  preflight_evidence_confirmed boolean := false;
  actual_columns jsonb;
  report jsonb;
  migration_sql constant text := $o2i_task4_source$${source.sql}$o2i_task4_source$;
BEGIN
  IF confirmed_dashboard_project IS DISTINCT FROM 'lxoaeaewcrshjkigzyqe' OR preflight_evidence_confirmed IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'STOP: confirm Dashboard project and reviewed Task 4 preflight evidence.';
  END IF;
  IF accept_no_full_backup_risk IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'STOP: explicitly accept no-full-backup risk; committed earlier steps cannot be rolled back by a later step.';
  END IF;
  IF current_user<>'postgres' THEN RAISE EXCEPTION 'STOP: reviewed for SQL Editor postgres execution only.'; END IF;
  IF NOT pg_try_advisory_xact_lock(20260926,20261004) THEN RAISE EXCEPTION 'STOP: another question-bank release is running.'; END IF;
${ledgerGuard}
  IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version IN (${sources.slice(stage + 1).map(s => quote(s.version)).join(',')})) THEN
    RAISE EXCEPTION 'STOP: this or a later Task 4 migration is already recorded. Readonly verify; never repeat blindly.';
  END IF;
  ${requireLedger(sources.slice(0, stage + 1))}
  IF to_regclass('public.question_version_reviews') IS NOT NULL OR to_regclass('public.question_publication_events') IS NOT NULL
    OR EXISTS(SELECT 1 FROM pg_attribute WHERE (attrelid=to_regclass('public.questions') AND attname='lifecycle_revision'
      OR attrelid=to_regclass('public.question_versions') AND attname='editorial_revision') AND attnum>0 AND NOT attisdropped)
    OR EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN (${newNames.map(quote).join(',')})) THEN
    RAISE EXCEPTION 'STOP: unrecorded or out-of-order Task 4 objects exist. Investigate partial deployment.';
  END IF;
  ${catalog(stage - 1)} INTO report;
  IF NOT coalesce((report->>'all_catalog_checks_pass')::boolean,false) THEN
    RAISE EXCEPTION 'STOP: prerequisite catalog differs from the reviewed stage.' USING DETAIL=report::text;
  END IF;
  EXECUTE migration_sql;
  ${catalog(stage)} INTO report;
  IF NOT coalesce((report->>'all_catalog_checks_pass')::boolean,false) THEN
    RAISE EXCEPTION 'STOP: post-migration catalog validation failed; this step and ledger roll back.' USING DETAIL=report::text;
  END IF;
  -- LEDGER: only after DDL/catalog success, in the same transaction.
  -- Optional created_by/idempotency_key/rollback remain NULL. No invented audit data.
  INSERT INTO supabase_migrations.schema_migrations(version,name,statements)
    VALUES(${quote(source.version)},${quote(source.name)},ARRAY[migration_sql]);
END;
$o2i_task4_release$;
COMMIT;
-- Stop on ANY error or uncertain outcome. Do not run the next file or repeat this file blindly.
`);
  }
  result.set('40_verify_readonly.sql', `-- TARGET: lxoaeaewcrshjkigzyqe. Metadata ONLY; no RPC or question/user content reads.
-- After all three separate runs. This is not an administrator-session acceptance test.
BEGIN READ ONLY;
SET LOCAL search_path=public,extensions;
SELECT catalog_report AS task4_catalog FROM (${catalog(3)}) final_catalog;
WITH expected(version,name,body_hash) AS (VALUES ${sources.map(s => `(${quote(s.version)},${quote(s.name)},${quote(hash(s.sql))})`).join(',')}), checks AS (
  SELECT e.version,m.version IS NOT NULL AND m.name=e.name AND cardinality(m.statements)=1 AND md5(m.statements[1])=e.body_hash AS ok,
    cardinality(m.statements) AS statement_blocks,
    CASE WHEN e.version IN ('20261018000000','20261019000000','20261019010000') THEN m.created_by IS NULL AND m.idempotency_key IS NULL AND m.rollback IS NULL ELSE true END AS optional_audit_columns_untouched
  FROM expected e LEFT JOIN supabase_migrations.schema_migrations m ON m.version=e.version
)
SELECT jsonb_build_object('all_ledger_checks_pass',bool_and(coalesce(ok,false) AND coalesce(optional_audit_columns_untouched,false)),
  'migration_records',jsonb_agg(to_jsonb(c) ORDER BY version)) AS task4_ledger FROM checks c;
COMMIT;
`);
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const [name, sql] of buildTask4Package()) {
    const path = new URL(name, import.meta.url);
    if (process.argv.includes('--check')) assert.equal(readFileSync(path, 'utf8'), sql, `${name} is stale`);
    else writeFileSync(path, sql);
    console.log(`${process.argv.includes('--check') ? 'Verified' : 'Generated'} ${name}`);
  }
}
