// Builds the controlled production package for 20261111000000_solution_request_threads.sql.
// node scripts/generate-solution-request-deploy.mjs  → docs/solution-requests/{00,10,20}_*.sql
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const VERSION = '20261111000000';
const NAME = 'solution_request_threads';
const dir = new URL('../docs/solution-requests/', import.meta.url);
mkdirSync(dir, { recursive: true });
const sql = readFileSync(new URL(`../supabase/migrations/${VERSION}_${NAME}.sql`, import.meta.url), 'utf8');
if (sql.includes('$sr_sql$')) throw new Error('Migration text must not contain the wrapper tag.');
const hash = createHash('md5').update(sql).digest('hex');

export const files = {
  '00_preflight_readonly.sql': `-- Read only. Run first and keep the output. Stop if baseline_ok is false or any row below looks unexpected.
SELECT jsonb_build_object(
 'baseline_ok', NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='${VERSION}')
  AND to_regprocedure('public.has_admin_module(text)') IS NOT NULL
  AND to_regprocedure('public.get_admin_access()') IS NOT NULL
  AND to_regprocedure('public.has_admin_storage_access(text)') IS NOT NULL
  AND to_regtype('public.problem_type') IS NOT NULL
  AND NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='solution_requests' AND column_name='is_anonymous')
  AND to_regclass('public.solution_request_replies') IS NULL
  AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='storage' AND table_name='objects' AND column_name='owner_id'),
 'migration_registered', EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='${VERSION}'),
 'storage_owner_id_column', EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='storage' AND table_name='objects' AND column_name='owner_id'),
 'requests', (SELECT count(*) FROM public.solution_requests),
 'requests_by_status', (SELECT jsonb_object_agg(coalesce(status,'null'),n) FROM (SELECT status,count(*) n FROM public.solution_requests GROUP BY status) s),
 'requests_public_null', (SELECT count(*) FROM public.solution_requests WHERE is_public IS NULL),
 'requests_with_old_solution', (SELECT count(*) FROM public.solution_requests WHERE solution_text IS NOT NULL OR solution_image_url IS NOT NULL),
 'solution_image_files', (SELECT count(*) FROM storage.objects WHERE bucket_id='solution-images')
) AS preflight;
-- Expected: the three policies below (names may differ only if someone edited them by hand).
SELECT policyname,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' AND tablename='solution_requests' ORDER BY policyname;
SELECT conname,pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.solution_requests'::regclass AND contype='c';
SELECT policyname,cmd,qual,with_check FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
 AND (qual ILIKE '%solution-images%' OR with_check ILIKE '%solution-images%' OR qual ILIKE '%admin_storage%' OR with_check ILIKE '%admin_storage%') ORDER BY policyname;
`,
  '10_upgrade.sql': `-- Run once, after 00_preflight_readonly.sql looked right. The whole file is one transaction.
-- Safe for the frontend that is live now: it keeps reading, inserting and showing questions.
BEGIN;
DO $upgrade$
DECLARE migration_sql text := $sr_sql$${sql}$sr_sql$;
BEGIN
  LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
  IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='${VERSION}') THEN
    RAISE EXCEPTION 'Solution request migration already registered; do not rerun. Use 20_verify_readonly.sql.';
  END IF;
  IF to_regclass('public.solution_request_replies') IS NOT NULL THEN
    RAISE EXCEPTION 'solution_request_replies already exists without a ledger entry. Stop and investigate.';
  END IF;
  IF md5(migration_sql) <> '${hash}' THEN RAISE EXCEPTION 'Package text does not match the repository migration.'; END IF;
  EXECUTE migration_sql;
  INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('${VERSION}','${NAME}',ARRAY[migration_sql]);
END;
$upgrade$;
COMMIT;
`,
  '20_verify_readonly.sql': `-- Read only, after 10_upgrade.sql. all_checks_pass must be true.
WITH checks(name,ok) AS (
  SELECT 'ledger',EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='${VERSION}' AND name='${NAME}' AND cardinality(statements)=1 AND md5(statements[1])='${hash}')
  UNION ALL SELECT 'new_columns',(SELECT count(*)=13 FROM information_schema.columns WHERE table_schema='public' AND table_name='solution_requests'
    AND column_name IN ('is_anonymous','image_paths','solved_at','solved_by','closed_at','closed_by','hidden_at','hidden_by','edited_at','reply_count','reply_floor_seq','last_activity_at','accepted_reply_id'))
  UNION ALL SELECT 'statuses_valid',NOT EXISTS(SELECT 1 FROM public.solution_requests WHERE status NOT IN ('awaiting','replied','answered','solved') OR status IS NULL)
  UNION ALL SELECT 'no_direct_update_policy',NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='solution_requests' AND cmd='UPDATE')
  UNION ALL SELECT 'old_frontend_policies',(SELECT count(*)=2 FROM pg_policies WHERE schemaname='public' AND tablename='solution_requests' AND cmd IN ('SELECT','INSERT'))
  UNION ALL SELECT 'thread_tables_locked',bool_and(c.relrowsecurity AND NOT has_table_privilege('anon',c.oid,'SELECT') AND NOT has_table_privilege('authenticated',c.oid,'SELECT'))
    FROM pg_class c WHERE c.oid IN ('public.solution_request_replies'::regclass,'public.solution_request_reports'::regclass,'public.solution_request_quota'::regclass)
  UNION ALL SELECT 'writes_need_sign_in',bool_and(NOT has_function_privilege('anon',p.oid,'EXECUTE') AND has_function_privilege('authenticated',p.oid,'EXECUTE'))
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('sr_create','sr_update','sr_withdraw','sr_reply','sr_set_solved','sr_set_closed','sr_report')
  UNION ALL SELECT 'reads_public',bool_and(has_function_privilege('anon',p.oid,'EXECUTE'))
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('sr_list','sr_get')
  UNION ALL SELECT 'internals_private',bool_and(NOT has_function_privilege('authenticated',p.oid,'EXECUTE'))
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('sr_refresh','sr_before_insert','sr_after_reply_change','sr_lock_request','sr_clean_images')
  UNION ALL SELECT 'answers_module',pg_get_functiondef('public.has_admin_module(text)'::regprocedure) LIKE '%answers%'
    AND pg_get_functiondef('public.get_admin_access()'::regprocedure) LIKE '%answers%'
  UNION ALL SELECT 'image_policies',(SELECT count(*)=3 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname IN
    ('Users can view own or public solution images','Users can upload unnamed solution images','Users can delete their own solution images'))
  UNION ALL SELECT 'triggers',(SELECT count(*)=2 FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('sr_before_insert','sr_after_reply_change'))
)
SELECT jsonb_build_object('all_checks_pass',bool_and(ok),'checks',jsonb_agg(jsonb_build_object('name',name,'ok',ok) ORDER BY name),
 'requests_by_status',(SELECT jsonb_object_agg(status,n) FROM (SELECT status,count(*) n FROM public.solution_requests GROUP BY status) s)) FROM checks;
`,
};

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const [name, text] of Object.entries(files)) writeFileSync(new URL(name, dir), text);
  console.log(`Wrote ${Object.keys(files).length} files to docs/solution-requests/ (migration md5 ${hash}).`);
}
