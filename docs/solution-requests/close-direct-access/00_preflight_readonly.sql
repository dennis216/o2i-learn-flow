-- Read only. baseline_ok must be true; direct_policies should list the two old-page policies (SELECT, INSERT).
SELECT jsonb_build_object(
 'baseline_ok', EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261111000000')
  AND NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261112000000')
  AND to_regprocedure('public.sr_list(text,text,public.problem_type,boolean,text,integer,integer)') IS NOT NULL,
 'direct_policies', (SELECT jsonb_agg(policyname||' ('||cmd||')' ORDER BY policyname) FROM pg_policies WHERE schemaname='public' AND tablename='solution_requests'),
 'anon_can_select', has_table_privilege('anon','public.solution_requests','SELECT'),
 'public_questions', (SELECT count(*) FROM public.solution_requests WHERE is_public),
 'public_anonymous_questions', (SELECT count(*) FROM public.solution_requests WHERE is_public AND is_anonymous)
) AS preflight;
