// One forward release supports random-only production and locally installed v1; never replay historical migrations.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const md5 = s => createHash('md5').update(s).digest('hex');
const source = read('supabase/migrations/20261026000000_question_practice_adaptation_v2.sql');
const dir = new URL('../docs/question-bank/production/adaptation-v2/', import.meta.url);mkdirSync(dir, { recursive: true });
const prerequisites = [
  ['20261021000000', 'question_bank_student_practice'],
  ['20261023000000', 'question_practice_random_selection'],
];
const checks = prerequisites.map(([version, name]) => {
  const sql = read(`supabase/migrations/${version}_${name}.sql`);
  return `EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='${version}' AND name='${name}' AND cardinality(statements)=1 AND md5(statements[1])='${md5(sql)}')`;
});
const v1 = md5(read('supabase/migrations/20261024000000_question_practice_topic_adaptation.sql'));
const optional = `NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261024000000') OR EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261024000000' AND name='question_practice_topic_adaptation' AND cardinality(statements)=1 AND md5(statements[1])='${v1}')`;
writeFileSync(new URL('00_preflight_readonly.sql', dir), `-- Catalog/ledger only. No account or question content.\nSELECT ${checks[0]} AS base_matches,${checks[1]} AS random_matches,(${optional}) AS optional_v1_matches,EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261026000000') AS v2_recorded,EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='question_practice_attempts' AND column_name='selection_trajectory') AS telemetry_present;\n`);
writeFileSync(new URL('10_deploy.sql', dir), `-- Execute once after preflight. No seeds, question publication or historical migration replay.\nBEGIN;\nDO $deploy$\nDECLARE migration_sql text:=$adaptation_v2$${source}$adaptation_v2$;\nBEGIN\n LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;\n IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261026000000') THEN RAISE EXCEPTION 'Migration 20261026000000 already recorded; do not rerun.'; END IF;\n IF NOT (${checks.join(' AND ')}) OR NOT (${optional}) THEN RAISE EXCEPTION 'Prerequisite ledger mismatch; stop without replaying migrations.'; END IF;\n IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='question_practice_attempts' AND column_name='selection_trajectory') OR to_regprocedure('public.submit_question_practice_v2(uuid,uuid,uuid,integer,jsonb,boolean)') IS NOT NULL THEN RAISE EXCEPTION 'Unrecorded v2 objects; investigate partial deployment.'; END IF;\n EXECUTE migration_sql;\n INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261026000000','question_practice_adaptation_v2',ARRAY[migration_sql]);\nEND;\n$deploy$;\nCOMMIT;\n`);
const functions = [...source.matchAll(/CREATE (?:OR REPLACE )?FUNCTION public\.(\w+)\(([^]*?)\) RETURNS[^]*?AS \$\$([^]*?)\$\$;/g)];
const signatures = {
  question_practice_expected_seconds: 'public.question_practice_expected_seconds(public.question_difficulty)',
  question_practice_target: 'public.question_practice_target(bigint,bigint)',question_practice_signals:'public.question_practice_signals()',
  question_practice_snapshot:'public.question_practice_snapshot(uuid)',submit_question_practice_v2:'public.submit_question_practice_v2(uuid,uuid,uuid,integer,jsonb,boolean)',
  submit_question_practice:'public.submit_question_practice(uuid,uuid,uuid,integer)',start_question_practice:'public.start_question_practice(uuid,uuid)',
  get_question_practice_analysis:'public.get_question_practice_analysis(timestamptz,timestamptz)',get_question_practice_admin_statistics:'public.get_question_practice_admin_statistics(uuid,uuid,timestamptz,timestamptz)',
};
if (functions.length !== 9) throw new Error('Unexpected migration function inventory.');
const bodyChecks = functions.map(([,name,,body]) => `SELECT '${name}' AS name,coalesce((SELECT md5(prosrc)='${md5(body)}' AND prosecdef=${!['question_practice_target','question_practice_expected_seconds'].includes(name)} AND proconfig=ARRAY['search_path=public, extensions'] FROM pg_proc WHERE oid=to_regprocedure('${signatures[name]}')),false) AS ok`);
const rpc = ['submit_question_practice_v2','get_question_practice_analysis','get_question_practice_admin_statistics'];
const privateFns = ['question_practice_expected_seconds','question_practice_target','question_practice_signals','question_practice_snapshot'];
const privilegeChecks = [...rpc.map(name => `SELECT '${name}_privileges',has_function_privilege('authenticated','${signatures[name]}','EXECUTE') AND NOT has_function_privilege('anon','${signatures[name]}','EXECUTE')`),...privateFns.map(name=>`SELECT '${name}_private',NOT has_function_privilege('authenticated','${signatures[name]}','EXECUTE') AND NOT has_function_privilege('anon','${signatures[name]}','EXECUTE')`)];
writeFileSync(new URL('20_verify_readonly.sql', dir), `-- Exact function-body checks in addition to migration ledger and permissions.\nWITH checks(name,ok) AS (\n SELECT 'ledger',EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261026000000' AND name='question_practice_adaptation_v2' AND cardinality(statements)=1 AND md5(statements[1])='${md5(source)}')\n UNION ALL ${[...bodyChecks,...privilegeChecks].join('\n UNION ALL ')}\n UNION ALL SELECT 'attempts_read_only',NOT has_table_privilege('authenticated','public.question_practice_attempts','INSERT,UPDATE,DELETE')\n UNION ALL SELECT 'sessions_read_only',NOT has_table_privilege('authenticated','public.question_practice_sessions','INSERT,UPDATE,DELETE')\n UNION ALL SELECT 'telemetry_columns',(SELECT count(*)=2 FROM information_schema.columns WHERE table_schema='public' AND table_name='question_practice_attempts' AND column_name IN ('selection_trajectory','timing_complete'))\n) SELECT jsonb_build_object('all_checks_pass',bool_and(ok),'checks',jsonb_agg(jsonb_build_object('name',name,'ok',ok) ORDER BY name)) AS adaptation_verification FROM checks;\n`);
console.log('Generated preflight, atomic deploy and exact readonly checks for adaptation v2.');
