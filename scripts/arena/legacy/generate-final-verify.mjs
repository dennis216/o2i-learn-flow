// Compose the latest function owners; old continuous function hashes are superseded by Arena.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const read=path=>readFileSync(new URL('../../../'+path,import.meta.url),'utf8');
const md5=text=>createHash('md5').update(text).digest('hex');
const arena=read('docs/arena/production/20_verify_readonly.sql').trim().replace(/;$/,'');
const source=read('docs/arena/legacy-import/20_source_verify_readonly.sql').trim().replace(/;$/,'');
const migration=read('supabase/migrations/20261105020000_question_bank_legacy_arena_source.sql');
const helper=migration.match(/CREATE FUNCTION public\.question_bank_legacy_arena_source\([^]*?AS \$\$([^]*?)\$\$;/)[1];
const continuous=read('supabase/migrations/20261104000000_question_practice_continuous.sql');
const sql=`-- Read-only final state. Arena owns the Practice functions it replaces.
WITH arena AS (${arena}), source AS (${source}), checks(name,ok) AS (
 SELECT 'arena_latest_functions_rls_grants',(SELECT (arena_practice_verification->>'all_checks_pass')::boolean FROM arena)
 UNION ALL SELECT 'legacy_source_rpc_and_ledger',(SELECT all_checks_pass FROM source)
 UNION ALL SELECT 'legacy_helper_body_and_context',EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.question_bank_legacy_arena_source(jsonb,text)') AND md5(prosrc)='${md5(helper)}' AND prosecdef AND provolatile='s' AND proconfig @> ARRAY['search_path=public, extensions','TimeZone=UTC'])
 UNION ALL SELECT 'continuous_ledger',EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261104000000' AND name='question_practice_continuous' AND cardinality(statements)=1 AND md5(statements[1])='${md5(continuous)}')
 UNION ALL SELECT 'continuous_columns',(SELECT count(*)=2 FROM information_schema.columns WHERE table_schema='public' AND table_name='question_practice_sessions' AND column_name IN ('mode','ended_at'))
 UNION ALL SELECT 'continuous_ended_trigger',EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='question_practice_reject_ended' AND tgrelid='public.question_practice_attempts'::regclass AND tgenabled='O')
 UNION ALL SELECT 'native_page_nullable',EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='question_versions' AND column_name='source_page' AND is_nullable='YES')
 UNION ALL SELECT 'legacy_tables_retained',to_regclass('public.arena_questions') IS NOT NULL AND to_regclass('public.arena_question_issues') IS NOT NULL
) SELECT jsonb_build_object('all_checks_pass',bool_and(coalesce(ok,false)),'checks',jsonb_agg(jsonb_build_object('name',name,'ok',ok) ORDER BY name)) AS final_verification FROM checks;
`;
writeFileSync(new URL('../../../docs/arena/legacy-import/30_final_verify_readonly.sql',import.meta.url),sql);
console.log('Generated final Arena, Practice and source alignment verification.');
