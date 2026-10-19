-- Read-only catalog/ledger verification. No question, answer or account data is read.
WITH checks(name,ok) AS (
  SELECT 'ledger',EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261021000000' AND name='question_bank_student_practice' AND cardinality(statements)=1 AND md5(statements[1])='bc92e36429c448b7d1523432f1250115')
  UNION ALL SELECT t.name||'_rls_and_read_only',coalesce((SELECT relrowsecurity AND has_table_privilege('authenticated',c.oid,'SELECT') AND NOT has_table_privilege('anon',c.oid,'SELECT') AND NOT has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE') FROM pg_class c WHERE c.oid=to_regclass('public.'||t.name)),false)
    FROM (VALUES('question_practice_sessions'),('question_practice_items'),('question_practice_attempts')) t(name)
  UNION ALL SELECT f.signature||'_authenticated_only',coalesce((SELECT p.prosecdef AND p.proconfig=ARRAY['search_path=public, extensions'] AND has_function_privilege('authenticated',p.oid,'EXECUTE') AND NOT has_function_privilege('anon',p.oid,'EXECUTE') FROM pg_proc p WHERE p.oid=to_regprocedure('public.'||f.signature)),false)
    FROM (VALUES('list_question_practice_topics()'),('start_question_practice(uuid,uuid)'),('get_question_practice(uuid)'),('submit_question_practice(uuid,uuid,uuid,integer)'),('list_question_practice_attempts()')) f(signature)
  UNION ALL SELECT f.signature||'_private',coalesce((SELECT NOT has_function_privilege('authenticated',p.oid,'EXECUTE') AND NOT has_function_privilege('anon',p.oid,'EXECUTE') FROM pg_proc p WHERE p.oid=to_regprocedure('public.'||f.signature)),false)
    FROM (VALUES('question_practice_require_user()'),('question_practice_snapshot(uuid)')) f(signature)
)
SELECT jsonb_build_object('all_checks_pass',bool_and(ok),'checks',jsonb_agg(jsonb_build_object('name',name,'ok',ok) ORDER BY name)) AS student_practice_verification FROM checks;
