-- Controlled forward deployment. Run each numbered file separately, in order. Never use broad db push.
BEGIN;
DO $preflight$ BEGIN
 IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261103000000') THEN RAISE EXCEPTION 'This migration is already registered. Stop; use read-only verification.'; END IF;

END $preflight$;
-- Commit enum additions before the permission migration uses them.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'course_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'question_admin';

INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261103000000','admin_module_role_values',ARRAY[$admin_source$-- Commit enum additions before the permission migration uses them.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'course_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'question_admin';
$admin_source$]);
COMMIT;
