-- No real account mutation or deletion. Verify registered source and guards.
SELECT version,name,cardinality(statements) AS source_parts FROM supabase_migrations.schema_migrations
 WHERE version BETWEEN '20261103000000' AND '20261103030000' ORDER BY version;
SELECT to_regprocedure('public.get_admin_access()') IS NOT NULL AS access_rpc,
 to_regprocedure('public.set_account_role(uuid,public.app_role)') IS NOT NULL AS role_rpc,
 to_regprocedure('public.preview_user_deletion(uuid)') IS NOT NULL AS preview_rpc,
 to_regprocedure('public.prepare_user_deletion(uuid,text)') IS NOT NULL AS confirmed_delete_rpc,
 EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='auth.users'::regclass AND tgname='guard_admin_user_deletion' AND tgenabled='O') AS delete_guard,
 EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='storage.objects'::regclass AND tgname='guard_storage_account_owner' AND tgenabled='O') AS storage_owner_guard,
 EXISTS(SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='account_private_read' AND permissive='RESTRICTIVE') AS private_accounts_guard,
 NOT EXISTS(SELECT 1 FROM public.user_roles WHERE role::text='instructor') AS no_instructor_assignments;
SELECT role,count(*) FROM public.user_roles GROUP BY role ORDER BY role;
SELECT count(*) AS courses FROM public.courses;
SELECT count(*) AS questions FROM public.questions;
SELECT count(*) AS versions FROM public.question_versions;
SELECT count(*) AS reviews FROM public.question_version_reviews;
SELECT count(*) AS files FROM storage.objects;
SELECT actor_id,target_user_id,target_email,outcome,created_at FROM public.admin_user_deletion_audit ORDER BY created_at DESC LIMIT 20;
