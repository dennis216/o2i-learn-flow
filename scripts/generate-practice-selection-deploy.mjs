// Copyable, individually transactional migrations; historical migrations are never replayed.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const hash = s => createHash('md5').update(s).digest('hex');
const out = new URL('../docs/question-bank/production/practice-selection/', import.meta.url);
mkdirSync(out, { recursive: true });
const stages = [
  ['20261024000000', 'question_practice_topic_adaptation', '20261023000000', 'question_practice_random_selection', '20_adaptive_deploy.sql', '21_adaptive_verify.sql'],
  ['20261023000000', 'question_practice_random_selection', '20261021000000', 'question_bank_student_practice', '10_random_deploy.sql', '11_random_verify.sql'],
];
for (const [version, name, previousVersion, previousName, deploy, verify] of stages) {
  const sql = read(`supabase/migrations/${version}_${name}.sql`);
  const prior = read(`supabase/migrations/${previousVersion}_${previousName}.sql`);
  writeFileSync(new URL(deploy, out), `-- Run this complete transaction once, only after its prerequisite is verified.
BEGIN;
DO $deploy$
DECLARE migration_sql text := $selection_migration$${sql}$selection_migration$;
BEGIN
  LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
  IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='${version}') THEN
    RAISE EXCEPTION 'Migration ${version} already recorded; do not rerun.';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='${previousVersion}'
    AND name='${previousName}' AND cardinality(statements)=1 AND md5(statements[1])='${hash(prior)}') THEN
    RAISE EXCEPTION 'Prerequisite ${previousVersion} ledger mismatch. Stop; do not rerun historical migrations.';
  END IF;
  EXECUTE migration_sql;
  INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('${version}','${name}',ARRAY[migration_sql]);
END;
$deploy$;
COMMIT;
`);
  writeFileSync(new URL(verify, out), `-- Read-only verification; no account or question content returned.
WITH checks(name,ok) AS (
  SELECT 'ledger',EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='${version}' AND name='${name}' AND cardinality(statements)=1 AND md5(statements[1])='${hash(sql)}')
  UNION ALL SELECT 'selection_authenticated_only',coalesce((SELECT p.prosecdef AND p.proconfig=ARRAY['search_path=public, extensions'] AND has_function_privilege('authenticated',p.oid,'EXECUTE') AND NOT has_function_privilege('anon',p.oid,'EXECUTE') AND position('pg_advisory_xact_lock' in p.prosrc)>0 AND position('random()' in p.prosrc)>0 FROM pg_proc p WHERE p.oid=to_regprocedure('public.start_question_practice(uuid,uuid)')),false)
${name==='question_practice_topic_adaptation' ? `  UNION ALL SELECT 'summary_column',EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='question_practice_sessions' AND column_name='selection_summary' AND data_type='jsonb')
  UNION ALL SELECT 'summary_projection',position('selection_summary' in pg_get_functiondef('public.question_practice_snapshot(uuid)'::regprocedure))>0
` : ''}  UNION ALL SELECT 'snapshot_private',NOT has_function_privilege('authenticated','public.question_practice_snapshot(uuid)','EXECUTE') AND NOT has_function_privilege('anon','public.question_practice_snapshot(uuid)','EXECUTE')
  UNION ALL SELECT 'sessions_read_only',NOT has_table_privilege('authenticated','public.question_practice_sessions','INSERT,UPDATE,DELETE')
)
SELECT jsonb_build_object('all_checks_pass',bool_and(ok),'checks',jsonb_agg(jsonb_build_object('name',name,'ok',ok) ORDER BY name)) AS practice_selection_verification FROM checks;
`);
}
