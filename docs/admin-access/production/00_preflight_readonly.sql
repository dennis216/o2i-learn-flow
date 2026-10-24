-- Read only. Inspect these results before executing any deployment file.
SELECT to_regprocedure('public.get_course_outline_v2(uuid)') IS NOT NULL AS course_baseline,
 to_regprocedure('public.question_bank_require_admin()') IS NOT NULL AS question_baseline,
 to_regclass('public.playground_links') IS NOT NULL AS playground_baseline,
 to_regclass('public.public_profiles') IS NOT NULL AS public_profile_view,
 NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='public_profiles' AND column_name='email') AS public_view_excludes_email,
 NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version BETWEEN '20261103000000' AND '20261103030000') AS package_absent;
SELECT role,count(*) FROM public.user_roles GROUP BY role ORDER BY role;
SELECT p.full_name,p.email,r.role FROM public.user_roles r JOIN public.profiles p ON p.user_id=r.user_id
 WHERE r.role::text IN ('admin','instructor','super_admin') ORDER BY r.role,p.email;
SELECT c.conrelid::regclass AS dependent,c.confrelid::regclass AS parent,pg_get_constraintdef(c.oid) AS definition
 FROM pg_constraint c WHERE c.contype='f' AND c.confrelid IN ('auth.users'::regclass,'public.profiles'::regclass);
SELECT count(*) AS courses FROM public.courses;
SELECT count(*) AS questions FROM public.questions;
SELECT count(*) AS versions FROM public.question_versions;
SELECT count(*) AS reviews FROM public.question_version_reviews;
SELECT count(*) AS files FROM storage.objects;
