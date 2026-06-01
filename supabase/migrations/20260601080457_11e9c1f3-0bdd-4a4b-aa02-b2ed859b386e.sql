-- Remove the permissive "everyone" SELECT policy that exposed emails to anon
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;

-- Recreate a SELECT policy scoped to authenticated users only
CREATE POLICY "Authenticated users can view profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);

-- Hard revoke table/column privileges from anon and PUBLIC
REVOKE ALL ON TABLE public.profiles FROM anon, PUBLIC;
REVOKE SELECT (email) ON TABLE public.profiles FROM anon, PUBLIC;

-- Ensure authenticated and service_role retain proper access
GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;