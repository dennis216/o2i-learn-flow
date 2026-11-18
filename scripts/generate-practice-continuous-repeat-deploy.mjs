// One forward release on top of continuous practice and option order (#44); never replays historical migrations.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const md5 = s => createHash('md5').update(s).digest('hex');
const version = '20261115000000', name = 'question_practice_continuous_repeat';
const source = read(`supabase/migrations/${version}_${name}.sql`);
const dir = new URL('../docs/question-bank/production/continuous-repeat/', import.meta.url); mkdirSync(dir, { recursive: true });
const prerequisites = [['20261104000000', 'question_practice_continuous'], ['20261111010000', 'question_practice_option_order']];
const ledger = prerequisites.map(([v, n]) => `EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='${v}' AND name='${n}' AND cardinality(statements)=1 AND md5(statements[1])='${md5(read(`supabase/migrations/${v}_${n}.sql`))}')`).join(' AND ');
const fn = 'public.question_practice_issue_next(uuid)';
const bodyOf = text => text.match(/FUNCTION public\.question_practice_issue_next\(_session_id uuid\) RETURNS text\s+LANGUAGE[^\n]*AS \$\$([^]*?)\$\$;/)[1];
// The body being replaced is the 20261104 definition, not changed since.
const previousBody = `coalesce((SELECT md5(prosrc)='${md5(bodyOf(read('supabase/migrations/20261104000000_question_practice_continuous.sql')))}' FROM pg_proc WHERE oid=to_regprocedure('${fn}')),false)`;
const absent = `NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='${version}')`;
writeFileSync(new URL('00_preflight_readonly.sql', dir), `-- Catalog/ledger only. No account or question content.\nSELECT (${ledger}) AS prerequisites_match,${previousBody} AS issue_next_body_matches,(${absent}) AS repeat_absent;\n`);
writeFileSync(new URL('10_deploy.sql', dir), `-- Execute once after a fresh preflight. No seeds, question changes or historical replay.\nBEGIN;\nDO $deploy$\nDECLARE migration_sql text:=$continuous_repeat$${source}$continuous_repeat$;\nBEGIN\n LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;\n IF NOT (${absent}) THEN RAISE EXCEPTION 'Continuous repeat already recorded; stop without replay.'; END IF;\n IF NOT (${ledger}) OR NOT ${previousBody} THEN RAISE EXCEPTION 'Practice prerequisite mismatch; stop without replaying migrations.'; END IF;\n EXECUTE migration_sql;\n INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('${version}','${name}',ARRAY[migration_sql]);\nEND;\n$deploy$;\nCOMMIT;\n`);
const rpc = ['public.start_continuous_question_practice(uuid,uuid,uuid)', 'public.next_continuous_question_practice(uuid)'];
writeFileSync(new URL('20_verify_readonly.sql', dir), `-- Exact function-body check plus ledger and permissions.\nWITH checks(name,ok) AS (\n SELECT 'ledger',EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='${version}' AND name='${name}' AND cardinality(statements)=1 AND md5(statements[1])='${md5(source)}')\n UNION ALL SELECT 'issue_next_body',coalesce((SELECT md5(prosrc)='${md5(bodyOf(source))}' AND prosecdef AND proconfig=ARRAY['search_path=public, extensions'] FROM pg_proc WHERE oid=to_regprocedure('${fn}')),false)\n UNION ALL SELECT 'issue_next_private',NOT has_function_privilege('authenticated','${fn}','EXECUTE') AND NOT has_function_privilege('anon','${fn}','EXECUTE')\n UNION ALL ${rpc.map(s => `SELECT '${s.split('.')[1].split('(')[0]}',has_function_privilege('authenticated','${s}','EXECUTE') AND NOT has_function_privilege('anon','${s}','EXECUTE')`).join('\n UNION ALL ')}\n) SELECT jsonb_build_object('all_checks_pass',bool_and(ok),'checks',jsonb_agg(jsonb_build_object('name',name,'ok',ok) ORDER BY name)) AS continuous_repeat_verification FROM checks;\n`);
console.log('Generated preflight, atomic deploy and exact readonly checks for continuous repeat.');
