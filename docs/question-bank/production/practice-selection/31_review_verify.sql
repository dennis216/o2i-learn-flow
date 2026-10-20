-- Read-only verification; no account or question content returned.
WITH checks(name,ok) AS (
  SELECT 'ledger',EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261025000000' AND name='question_practice_review_history' AND cardinality(statements)=1 AND md5(statements[1])='dbb06ac25eebc2319a3543505c1dff36')
  UNION ALL SELECT f.signature||'_authenticated_only',coalesce((SELECT p.prosecdef AND p.proconfig=ARRAY['search_path=public, extensions'] AND has_function_privilege('authenticated',p.oid,'EXECUTE') AND NOT has_function_privilege('anon',p.oid,'EXECUTE') FROM pg_proc p WHERE p.oid=to_regprocedure('public.'||f.signature)),false)
    FROM (VALUES('list_question_practice_attempts()'),('list_question_practice_attempts(boolean)')) f(signature)
  UNION ALL SELECT 'attempts_read_only',NOT has_table_privilege('authenticated','public.question_practice_attempts','INSERT,UPDATE,DELETE')
  UNION ALL SELECT 'snapshot_private',NOT has_function_privilege('authenticated','public.question_practice_snapshot(uuid)','EXECUTE') AND NOT has_function_privilege('anon','public.question_practice_snapshot(uuid)','EXECUTE')
  UNION ALL SELECT 'sessions_read_only',NOT has_table_privilege('authenticated','public.question_practice_sessions','INSERT,UPDATE,DELETE')
)
SELECT jsonb_build_object('all_checks_pass',bool_and(ok),'checks',jsonb_agg(jsonb_build_object('name',name,'ok',ok) ORDER BY name)) AS practice_selection_verification FROM checks;
