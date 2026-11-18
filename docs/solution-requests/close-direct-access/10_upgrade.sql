-- Run once, after the new Solution Requests page is live on www.o2iinstitute.org. One transaction.
BEGIN;
DO $upgrade$
DECLARE migration_sql text := $sr_sql$-- Close the direct table path that the pre-2026-11-11 Solution Requests page used.
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
$sr_sql$;
BEGIN
  LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
  IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261112000000') THEN
    RAISE EXCEPTION 'Already registered; do not rerun. Use 20_verify_readonly.sql.';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261111000000') THEN
    RAISE EXCEPTION 'Deploy 20261111000000_solution_request_threads first.';
  END IF;
  -- Pasting through an editor or clipboard can turn line ends into CRLF or add trailing spaces; undo that first.
  migration_sql := regexp_replace(replace(migration_sql, E'\r', ''), '[ \t]+\n', E'\n', 'g');
  IF md5(migration_sql) <> '39a05cd2a3e0d890355985473d268fca' THEN
    RAISE EXCEPTION 'Package text does not match the repository migration (got % characters, md5 %; expected 1033 characters).',
      length(migration_sql), md5(migration_sql);
  END IF;
  EXECUTE migration_sql;
  INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261112000000','solution_requests_close_direct_access',ARRAY[migration_sql]);
END;
$upgrade$;
COMMIT;
