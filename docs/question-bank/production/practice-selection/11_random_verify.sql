-- Read-only verification; no account or question content returned.
WITH checks(name,ok) AS (
  SELECT 'ledger',EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261023000000' AND name='question_practice_random_selection' AND cardinality(statements)=1 AND md5(statements[1])='463ff7e63c60ebf1b79a3ca34a9ebdc1')
  UNION ALL SELECT 'selection_authenticated_only',coalesce((SELECT p.prosecdef AND p.proconfig=ARRAY['search_path=public, extensions'] AND has_function_privilege('authenticated',p.oid,'EXECUTE') AND NOT has_function_privilege('anon',p.oid,'EXECUTE') AND position('pg_advisory_xact_lock' in p.prosrc)>0 AND position('random()' in p.prosrc)>0 FROM pg_proc p WHERE p.oid=to_regprocedure('public.start_question_practice(uuid,uuid)')),false)
  UNION ALL SELECT 'snapshot_private',NOT has_function_privilege('authenticated','public.question_practice_snapshot(uuid)','EXECUTE') AND NOT has_function_privilege('anon','public.question_practice_snapshot(uuid)','EXECUTE')
  UNION ALL SELECT 'sessions_read_only',NOT has_table_privilege('authenticated','public.question_practice_sessions','INSERT,UPDATE,DELETE')
)
SELECT jsonb_build_object('all_checks_pass',bool_and(ok),'checks',jsonb_agg(jsonb_build_object('name',name,'ok',ok) ORDER BY name)) AS practice_selection_verification FROM checks;
