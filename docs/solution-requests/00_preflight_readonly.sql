-- Read only. Run first and keep the output. Stop if baseline_ok is false or any row below looks unexpected.
SELECT jsonb_build_object(
 'baseline_ok', NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261111000000')
  AND to_regprocedure('public.has_admin_module(text)') IS NOT NULL
  AND to_regprocedure('public.get_admin_access()') IS NOT NULL
  AND to_regprocedure('public.has_admin_storage_access(text)') IS NOT NULL
  AND to_regtype('public.problem_type') IS NOT NULL
  AND NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='solution_requests' AND column_name='is_anonymous')
  AND to_regclass('public.solution_request_replies') IS NULL
  AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='storage' AND table_name='objects' AND column_name='owner_id'),
 'migration_registered', EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261111000000'),
 'storage_owner_id_column', EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='storage' AND table_name='objects' AND column_name='owner_id'),
 'requests', (SELECT count(*) FROM public.solution_requests),
 'requests_by_status', (SELECT jsonb_object_agg(coalesce(status,'null'),n) FROM (SELECT status,count(*) n FROM public.solution_requests GROUP BY status) s),
 'requests_public_null', (SELECT count(*) FROM public.solution_requests WHERE is_public IS NULL),
 'requests_with_old_solution', (SELECT count(*) FROM public.solution_requests WHERE solution_text IS NOT NULL OR solution_image_url IS NOT NULL),
 'solution_image_files', (SELECT count(*) FROM storage.objects WHERE bucket_id='solution-images')
) AS preflight;
-- Expected: the three policies below (names may differ only if someone edited them by hand).
SELECT policyname,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' AND tablename='solution_requests' ORDER BY policyname;
SELECT conname,pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.solution_requests'::regclass AND contype='c';
SELECT policyname,cmd,qual,with_check FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
 AND (qual ILIKE '%solution-images%' OR with_check ILIKE '%solution-images%' OR qual ILIKE '%admin_storage%' OR with_check ILIKE '%admin_storage%') ORDER BY policyname;
