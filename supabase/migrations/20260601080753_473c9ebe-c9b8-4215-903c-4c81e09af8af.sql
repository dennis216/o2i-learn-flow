CREATE OR REPLACE FUNCTION public.count_all_profiles()
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER FROM public.profiles;
$$;

GRANT EXECUTE ON FUNCTION public.count_all_profiles() TO anon, authenticated;