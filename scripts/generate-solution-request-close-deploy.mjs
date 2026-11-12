// Builds the production package for 20261112000000_solution_requests_close_direct_access.sql.
// node scripts/generate-solution-request-close-deploy.mjs  → docs/solution-requests/close-direct-access/{00,10,20}_*.sql
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const VERSION = '20261112000000';
const NAME = 'solution_requests_close_direct_access';
const dir = new URL('../docs/solution-requests/close-direct-access/', import.meta.url);
const sql = readFileSync(new URL(`../supabase/migrations/${VERSION}_${NAME}.sql`, import.meta.url), 'utf8');
if (sql.includes('$sr_sql$')) throw new Error('Migration text must not contain the wrapper tag.');
if (/[ \t]\n|\r/.test(sql)) throw new Error('Migration must use LF line ends without trailing spaces (the package normalizes pasted text).');
const hash = createHash('md5').update(sql).digest('hex');
const LIST = 'public.sr_list(text,text,public.problem_type,boolean,text,integer,integer)';
const CREATE = 'public.sr_create(text,text,public.problem_type,text[],boolean,boolean)';

export const files = {
  '00_preflight_readonly.sql': `-- Read only. baseline_ok must be true; direct_policies should list the two old-page policies (SELECT, INSERT).
SELECT jsonb_build_object(
 'baseline_ok', EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261111000000')
  AND NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='${VERSION}')
  AND to_regprocedure('${LIST}') IS NOT NULL,
 'direct_policies', (SELECT jsonb_agg(policyname||' ('||cmd||')' ORDER BY policyname) FROM pg_policies WHERE schemaname='public' AND tablename='solution_requests'),
 'anon_can_select', has_table_privilege('anon','public.solution_requests','SELECT'),
 'public_questions', (SELECT count(*) FROM public.solution_requests WHERE is_public),
 'public_anonymous_questions', (SELECT count(*) FROM public.solution_requests WHERE is_public AND is_anonymous)
) AS preflight;
`,
  '10_upgrade.sql': `-- Run once, after the new Solution Requests page is live on www.o2iinstitute.org. One transaction.
BEGIN;
DO $upgrade$
DECLARE migration_sql text := $sr_sql$${sql}$sr_sql$;
BEGIN
  LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
  IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='${VERSION}') THEN
    RAISE EXCEPTION 'Already registered; do not rerun. Use 20_verify_readonly.sql.';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261111000000') THEN
    RAISE EXCEPTION 'Deploy 20261111000000_solution_request_threads first.';
  END IF;
  -- Pasting through an editor or clipboard can turn line ends into CRLF or add trailing spaces; undo that first.
  migration_sql := regexp_replace(replace(migration_sql, E'\\r', ''), '[ \\t]+\\n', E'\\n', 'g');
  IF md5(migration_sql) <> '${hash}' THEN
    RAISE EXCEPTION 'Package text does not match the repository migration (got % characters, md5 %; expected ${sql.length} characters).',
      length(migration_sql), md5(migration_sql);
  END IF;
  EXECUTE migration_sql;
  INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('${VERSION}','${NAME}',ARRAY[migration_sql]);
END;
$upgrade$;
COMMIT;
`,
  '20_verify_readonly.sql': `-- Read only, after 10_upgrade.sql. all_checks_pass must be true.
WITH checks(name,ok) AS (
  SELECT 'ledger',EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='${VERSION}' AND name='${NAME}' AND md5(statements[1])='${hash}')
  UNION ALL SELECT 'no_direct_policies',NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='solution_requests')
  UNION ALL SELECT 'rls_on',(SELECT relrowsecurity FROM pg_class WHERE oid='public.solution_requests'::regclass)
  UNION ALL SELECT 'clients_cannot_touch_table',NOT (has_table_privilege('anon','public.solution_requests','SELECT')
    OR has_table_privilege('anon','public.solution_requests','INSERT') OR has_table_privilege('authenticated','public.solution_requests','SELECT')
    OR has_table_privilege('authenticated','public.solution_requests','INSERT') OR has_table_privilege('authenticated','public.solution_requests','UPDATE')
    OR has_table_privilege('authenticated','public.solution_requests','DELETE'))
  UNION ALL SELECT 'functions_still_open',has_function_privilege('anon','${LIST}','EXECUTE') AND has_function_privilege('authenticated','${CREATE}','EXECUTE')
)
SELECT jsonb_build_object('all_checks_pass',bool_and(ok),'checks',jsonb_agg(jsonb_build_object('name',name,'ok',ok) ORDER BY name)) FROM checks;
`,
};

if (import.meta.url === `file://${process.argv[1]}`) {
  mkdirSync(dir, { recursive: true });
  for (const [name, text] of Object.entries(files)) writeFileSync(new URL(name, dir), text);
  console.log(`Wrote ${Object.keys(files).length} files to docs/solution-requests/close-direct-access/ (migration md5 ${hash}).`);
}
