-- Read-only, after the new upgrade. Does not change Team or migration records.
WITH checks(name,ok) AS (
  SELECT 'new_migration_ledger',EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261022000000' AND name='team_schema_compatibility' AND cardinality(statements)=1 AND md5(statements[1])='ff3c0a819c0a252d73730bc92714e851')
  UNION ALL SELECT 'old_migration_disposition',EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261020010000' AND name IN ('superseded_by_20261022000000','team_member_roles_and_departments'))
  UNION ALL SELECT 'all_four_columns',count(*)=4 FROM pg_attribute WHERE attrelid='public.team_members'::regclass AND NOT attisdropped AND ((attname IN ('role','department') AND atttypid='text'::regtype) OR (attname IN ('roles','departments') AND atttypid='text[]'::regtype))
  UNION ALL SELECT 'arrays_populated',NOT EXISTS(SELECT 1 FROM public.team_members WHERE roles IS NULL OR departments IS NULL)
  UNION ALL SELECT 'compound_role_conversion',public.team_roles_from_legacy('Co-founder & Website Developer & Team Leader')=ARRAY['Co-founder','Website Developer','Team Leader']
  UNION ALL SELECT 'sync_trigger',EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.team_members'::regclass AND tgname='sync_team_member_shapes' AND tgenabled='O' AND NOT tgisinternal)
  UNION ALL SELECT 'rls_retained',(SELECT relrowsecurity FROM pg_class WHERE oid='public.team_members'::regclass)
  UNION ALL SELECT 'helpers_private',bool_and(NOT has_function_privilege('anon',oid,'EXECUTE') AND NOT has_function_privilege('authenticated',oid,'EXECUTE')) FROM pg_proc WHERE oid IN ('public.team_roles_from_legacy(text)'::regprocedure,'public.team_department_from_legacy(text)'::regprocedure,'public.sync_team_member_shapes()'::regprocedure)
)
SELECT jsonb_build_object('all_checks_pass',bool_and(ok),'checks',jsonb_agg(jsonb_build_object('name',name,'ok',ok) ORDER BY name),'member_count',(SELECT count(*) FROM public.team_members),'old_migration_disposition',(SELECT name FROM supabase_migrations.schema_migrations WHERE version='20261020010000')) AS team_compatibility_verification FROM checks;
