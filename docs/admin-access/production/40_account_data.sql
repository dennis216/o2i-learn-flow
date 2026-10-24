-- Controlled forward deployment. Run each numbered file separately, in order. Never use broad db push.
BEGIN;
DO $preflight$ BEGIN
 IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261103030000') THEN RAISE EXCEPTION 'This migration is already registered. Stop; use read-only verification.'; END IF;
IF to_regprocedure('public.has_admin_module(text)') IS NULL THEN RAISE EXCEPTION 'Module permissions must be installed first.'; END IF;
END $preflight$;
-- An old permissive policy must never expose other accounts' private profiles.
-- Public display continues through the existing view, which excludes email.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='public_profiles' AND column_name='email') THEN RAISE EXCEPTION 'Public profile view must exclude email before account guards are installed.'; END IF;
END $$;
ALTER VIEW IF EXISTS public.public_profiles SET (security_invoker=false);
CREATE POLICY account_private_read ON public.profiles AS RESTRICTIVE FOR SELECT TO anon,authenticated
 USING(user_id=auth.uid() OR public.has_admin_module('users'));
CREATE POLICY account_private_update ON public.profiles AS RESTRICTIVE FOR UPDATE TO authenticated
 USING(user_id=auth.uid() OR public.has_admin_module('users'))
 WITH CHECK(user_id=auth.uid() OR public.has_admin_module('users'));
CREATE POLICY account_private_insert ON public.profiles AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK(user_id=auth.uid());
CREATE POLICY account_no_direct_delete ON public.profiles AS RESTRICTIVE FOR DELETE TO authenticated USING(false);
CREATE POLICY account_roles_read ON public.user_roles AS RESTRICTIVE FOR SELECT TO anon,authenticated
 USING(user_id=auth.uid() OR public.has_admin_module('users'));
CREATE POLICY account_roles_no_insert ON public.user_roles AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(false);
CREATE POLICY account_roles_no_update ON public.user_roles AS RESTRICTIVE FOR UPDATE TO authenticated USING(false) WITH CHECK(false);
CREATE POLICY account_roles_no_delete ON public.user_roles AS RESTRICTIVE FOR DELETE TO authenticated USING(false);
CREATE POLICY account_activity_read ON public.user_login_events AS RESTRICTIVE FOR SELECT TO anon,authenticated
 USING(public.has_admin_module('users'));
NOTIFY pgrst,'reload schema';

INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261103030000','admin_account_data_guards',ARRAY[$admin_source$-- An old permissive policy must never expose other accounts' private profiles.
-- Public display continues through the existing view, which excludes email.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='public_profiles' AND column_name='email') THEN RAISE EXCEPTION 'Public profile view must exclude email before account guards are installed.'; END IF;
END $$;
ALTER VIEW IF EXISTS public.public_profiles SET (security_invoker=false);
CREATE POLICY account_private_read ON public.profiles AS RESTRICTIVE FOR SELECT TO anon,authenticated
 USING(user_id=auth.uid() OR public.has_admin_module('users'));
CREATE POLICY account_private_update ON public.profiles AS RESTRICTIVE FOR UPDATE TO authenticated
 USING(user_id=auth.uid() OR public.has_admin_module('users'))
 WITH CHECK(user_id=auth.uid() OR public.has_admin_module('users'));
CREATE POLICY account_private_insert ON public.profiles AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK(user_id=auth.uid());
CREATE POLICY account_no_direct_delete ON public.profiles AS RESTRICTIVE FOR DELETE TO authenticated USING(false);
CREATE POLICY account_roles_read ON public.user_roles AS RESTRICTIVE FOR SELECT TO anon,authenticated
 USING(user_id=auth.uid() OR public.has_admin_module('users'));
CREATE POLICY account_roles_no_insert ON public.user_roles AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(false);
CREATE POLICY account_roles_no_update ON public.user_roles AS RESTRICTIVE FOR UPDATE TO authenticated USING(false) WITH CHECK(false);
CREATE POLICY account_roles_no_delete ON public.user_roles AS RESTRICTIVE FOR DELETE TO authenticated USING(false);
CREATE POLICY account_activity_read ON public.user_login_events AS RESTRICTIVE FOR SELECT TO anon,authenticated
 USING(public.has_admin_module('users'));
NOTIFY pgrst,'reload schema';
$admin_source$]);
COMMIT;
