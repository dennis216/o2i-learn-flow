-- Read only, after 10_upgrade.sql. all_checks_pass must be true.
WITH checks(name,ok) AS (
  SELECT 'ledger',EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261111000000' AND name='solution_request_threads' AND cardinality(statements)=1 AND md5(statements[1])='00aab0a4fabf0cd06f69ba4aa497063d')
  UNION ALL SELECT 'new_columns',(SELECT count(*)=13 FROM information_schema.columns WHERE table_schema='public' AND table_name='solution_requests'
    AND column_name IN ('is_anonymous','image_paths','solved_at','solved_by','closed_at','closed_by','hidden_at','hidden_by','edited_at','reply_count','reply_floor_seq','last_activity_at','accepted_reply_id'))
  UNION ALL SELECT 'statuses_valid',NOT EXISTS(SELECT 1 FROM public.solution_requests WHERE status NOT IN ('awaiting','replied','answered','solved') OR status IS NULL)
  UNION ALL SELECT 'no_direct_update_policy',NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='solution_requests' AND cmd='UPDATE')
  UNION ALL SELECT 'old_frontend_policies',(SELECT count(*)=2 FROM pg_policies WHERE schemaname='public' AND tablename='solution_requests' AND cmd IN ('SELECT','INSERT'))
  UNION ALL SELECT 'thread_tables_locked',bool_and(c.relrowsecurity AND NOT has_table_privilege('anon',c.oid,'SELECT') AND NOT has_table_privilege('authenticated',c.oid,'SELECT'))
    FROM pg_class c WHERE c.oid IN ('public.solution_request_replies'::regclass,'public.solution_request_reports'::regclass,'public.solution_request_quota'::regclass)
  UNION ALL SELECT 'writes_need_sign_in',bool_and(NOT has_function_privilege('anon',p.oid,'EXECUTE') AND has_function_privilege('authenticated',p.oid,'EXECUTE'))
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('sr_create','sr_update','sr_withdraw','sr_reply','sr_set_solved','sr_set_closed','sr_report')
  UNION ALL SELECT 'reads_public',bool_and(has_function_privilege('anon',p.oid,'EXECUTE'))
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('sr_list','sr_get')
  UNION ALL SELECT 'internals_private',bool_and(NOT has_function_privilege('authenticated',p.oid,'EXECUTE'))
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('sr_refresh','sr_before_insert','sr_after_reply_change','sr_lock_request','sr_clean_images')
  UNION ALL SELECT 'answers_module',pg_get_functiondef('public.has_admin_module(text)'::regprocedure) LIKE '%answers%'
    AND pg_get_functiondef('public.get_admin_access()'::regprocedure) LIKE '%answers%'
  UNION ALL SELECT 'image_policies',(SELECT count(*)=3 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname IN
    ('Users can view own or public solution images','Users can upload unnamed solution images','Users can delete their own solution images'))
  UNION ALL SELECT 'triggers',(SELECT count(*)=2 FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('sr_before_insert','sr_after_reply_change'))
)
SELECT jsonb_build_object('all_checks_pass',bool_and(ok),'checks',jsonb_agg(jsonb_build_object('name',name,'ok',ok) ORDER BY name),
 'requests_by_status',(SELECT jsonb_object_agg(status,n) FROM (SELECT status,count(*) n FROM public.solution_requests GROUP BY status) s)) FROM checks;
