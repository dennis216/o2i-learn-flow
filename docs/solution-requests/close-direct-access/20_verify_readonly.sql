-- Read only, after 10_upgrade.sql. all_checks_pass must be true.
WITH checks(name,ok) AS (
  SELECT 'ledger',EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261112000000' AND name='solution_requests_close_direct_access' AND md5(statements[1])='39a05cd2a3e0d890355985473d268fca')
  UNION ALL SELECT 'no_direct_policies',NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='solution_requests')
  UNION ALL SELECT 'rls_on',(SELECT relrowsecurity FROM pg_class WHERE oid='public.solution_requests'::regclass)
  UNION ALL SELECT 'clients_cannot_touch_table',NOT (has_table_privilege('anon','public.solution_requests','SELECT')
    OR has_table_privilege('anon','public.solution_requests','INSERT') OR has_table_privilege('authenticated','public.solution_requests','SELECT')
    OR has_table_privilege('authenticated','public.solution_requests','INSERT') OR has_table_privilege('authenticated','public.solution_requests','UPDATE')
    OR has_table_privilege('authenticated','public.solution_requests','DELETE'))
  UNION ALL SELECT 'functions_still_open',has_function_privilege('anon','public.sr_list(text,text,public.problem_type,boolean,text,integer,integer)','EXECUTE') AND has_function_privilege('authenticated','public.sr_create(text,text,public.problem_type,text[],boolean,boolean)','EXECUTE')
)
SELECT jsonb_build_object('all_checks_pass',bool_and(ok),'checks',jsonb_agg(jsonb_build_object('name',name,'ok',ok) ORDER BY name)) FROM checks;
