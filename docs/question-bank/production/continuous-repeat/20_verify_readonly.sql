-- Exact function-body check plus ledger and permissions.
WITH checks(name,ok) AS (
 SELECT 'ledger',EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261115000000' AND name='question_practice_continuous_repeat' AND cardinality(statements)=1 AND md5(statements[1])='49c712a85c7223444eb37f6d9711e4be')
 UNION ALL SELECT 'issue_next_body',coalesce((SELECT md5(prosrc)='65c7e6ec10b2d02f199d439969c50fb2' AND prosecdef AND proconfig=ARRAY['search_path=public, extensions'] FROM pg_proc WHERE oid=to_regprocedure('public.question_practice_issue_next(uuid)')),false)
 UNION ALL SELECT 'issue_next_private',NOT has_function_privilege('authenticated','public.question_practice_issue_next(uuid)','EXECUTE') AND NOT has_function_privilege('anon','public.question_practice_issue_next(uuid)','EXECUTE')
 UNION ALL SELECT 'start_continuous_question_practice',has_function_privilege('authenticated','public.start_continuous_question_practice(uuid,uuid,uuid)','EXECUTE') AND NOT has_function_privilege('anon','public.start_continuous_question_practice(uuid,uuid,uuid)','EXECUTE')
 UNION ALL SELECT 'next_continuous_question_practice',has_function_privilege('authenticated','public.next_continuous_question_practice(uuid)','EXECUTE') AND NOT has_function_privilege('anon','public.next_continuous_question_practice(uuid)','EXECUTE')
) SELECT jsonb_build_object('all_checks_pass',bool_and(ok),'checks',jsonb_agg(jsonb_build_object('name',name,'ok',ok) ORDER BY name)) AS continuous_repeat_verification FROM checks;
