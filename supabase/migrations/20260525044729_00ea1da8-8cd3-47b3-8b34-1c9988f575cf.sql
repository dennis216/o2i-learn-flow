
-- Allow public read of non-sensitive profile fields; email is gated by column grants below
CREATE POLICY "Profiles are viewable by everyone"
ON public.profiles FOR SELECT
USING (true);

-- Lock down email column at the privilege layer
REVOKE SELECT (email) ON public.profiles FROM anon, PUBLIC;
-- authenticated users keep SELECT(email) so AuthContext / UserManagement (super admin) still work

-- Recreate the public_profiles view in security_invoker mode
DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles
WITH (security_invoker = true)
AS
SELECT id, user_id, full_name, avatar_url, role, is_zombie, created_at, updated_at
FROM public.profiles;

GRANT SELECT ON public.public_profiles TO anon, authenticated;
