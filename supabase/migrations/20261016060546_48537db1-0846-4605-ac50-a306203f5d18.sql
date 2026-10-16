DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;
ALTER VIEW public.public_profiles SET (security_invoker = false);
GRANT SELECT ON public.public_profiles TO anon, authenticated;