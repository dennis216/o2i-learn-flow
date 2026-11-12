-- Close the direct table path that the pre-2026-11-11 Solution Requests page used.
-- Until now anyone holding the public API key could read public questions straight from the table,
-- user_id included, and look the name up in public_profiles: "anonymous" was not anonymous.
-- The current frontend only uses the sr_* functions (SECURITY DEFINER), which never return user ids,
-- so nothing it does depends on direct table access. Run only after the new frontend is live on main.
DROP POLICY IF EXISTS "Users can view public requests or their own" ON public.solution_requests;
DROP POLICY IF EXISTS "Users can create solution requests" ON public.solution_requests;
DROP POLICY IF EXISTS "Users can update their own requests" ON public.solution_requests;
REVOKE ALL ON public.solution_requests FROM anon, authenticated;
GRANT ALL ON public.solution_requests TO service_role;
COMMENT ON TABLE public.solution_requests IS 'Questions. No direct client access: read and write through the sr_* functions.';
NOTIFY pgrst,'reload schema';
