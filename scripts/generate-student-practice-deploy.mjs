// Generate the copyable SQL Editor transaction from the single authoritative new migration.
import { readFileSync,writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const version='20261021000000',name='question_bank_student_practice';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const hash=s=>createHash('md5').update(s).digest('hex');
const sql=read(`supabase/migrations/${version}_${name}.sql`);
const prior=read('supabase/migrations/20261020000000_question_bank_simple_publication.sql');
const output=new URL('../docs/question-bank/production/student-practice/',import.meta.url);
writeFileSync(new URL('10_deploy.sql',output),`-- Execute this entire file ONCE in SQL Editor. It runs only the new student-practice migration.
BEGIN;
DO $deploy$
DECLARE migration_sql text := $practice_migration$${sql}$practice_migration$;
BEGIN
  LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
  IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='${version}') THEN
    RAISE EXCEPTION 'Student practice migration is already recorded; do not rerun.';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version='20261020000000' AND name='question_bank_simple_publication'
      AND cardinality(statements)=1 AND md5(statements[1])='${hash(prior)}') THEN
    RAISE EXCEPTION 'Previously completed simple-publication migration ledger does not match. Stop; do not rerun historical migrations.';
  END IF;
  EXECUTE migration_sql;
  INSERT INTO supabase_migrations.schema_migrations(version,name,statements)
    VALUES('${version}','${name}',ARRAY[migration_sql]);
END;
$deploy$;
COMMIT;
`);
writeFileSync(new URL('20_verify_readonly.sql',output),`-- Read-only catalog/ledger verification. No question, answer or account data is read.
WITH checks(name,ok) AS (
  SELECT 'ledger',EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='${version}' AND name='${name}' AND cardinality(statements)=1 AND md5(statements[1])='${hash(sql)}')
  UNION ALL SELECT t.name||'_rls_and_read_only',coalesce((SELECT relrowsecurity AND has_table_privilege('authenticated',c.oid,'SELECT') AND NOT has_table_privilege('anon',c.oid,'SELECT') AND NOT has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE') FROM pg_class c WHERE c.oid=to_regclass('public.'||t.name)),false)
    FROM (VALUES('question_practice_sessions'),('question_practice_items'),('question_practice_attempts')) t(name)
  UNION ALL SELECT f.signature||'_authenticated_only',coalesce((SELECT p.prosecdef AND p.proconfig=ARRAY['search_path=public, extensions'] AND has_function_privilege('authenticated',p.oid,'EXECUTE') AND NOT has_function_privilege('anon',p.oid,'EXECUTE') FROM pg_proc p WHERE p.oid=to_regprocedure('public.'||f.signature)),false)
    FROM (VALUES('list_question_practice_topics()'),('start_question_practice(uuid,uuid)'),('get_question_practice(uuid)'),('submit_question_practice(uuid,uuid,uuid,integer)'),('list_question_practice_attempts()')) f(signature)
  UNION ALL SELECT f.signature||'_private',coalesce((SELECT NOT has_function_privilege('authenticated',p.oid,'EXECUTE') AND NOT has_function_privilege('anon',p.oid,'EXECUTE') FROM pg_proc p WHERE p.oid=to_regprocedure('public.'||f.signature)),false)
    FROM (VALUES('question_practice_require_user()'),('question_practice_snapshot(uuid)')) f(signature)
)
SELECT jsonb_build_object('all_checks_pass',bool_and(ok),'checks',jsonb_agg(jsonb_build_object('name',name,'ok',ok) ORDER BY name)) AS student_practice_verification FROM checks;
`);
