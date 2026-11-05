// Generates a guarded, forward-only release. Never connects to a database.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const hash = value => createHash('md5').update(value).digest('hex');
const version = '20261105000000', name = 'arena_practice_integration';
const source = read(`supabase/migrations/${version}_${name}.sql`);
const dir = new URL('../../docs/arena/production/', import.meta.url);
mkdirSync(dir, { recursive: true });
const prerequisites = [
  ['20261025000000', 'question_practice_review_history'], ['20261026000000', 'question_practice_adaptation_v2'],
  ['20261028000000', 'course_topic_practice'], ['20261104000000', 'question_practice_continuous'],
];
const functions = sql => [...sql.matchAll(/CREATE (?:OR REPLACE )?FUNCTION public\.(\w+)\([\s\S]*?AS \$\$([\s\S]*?)\$\$;/g)];
const signatures = {
  arena_practice_pool: '', arena_practice_payload: 'uuid', arena_practice_catalog: '',
  arena_practice_next_question: 'uuid,integer[],integer,integer,boolean', arena_practice_submit_answer: 'uuid,integer',
  get_question_practice_statistics: 'uuid', question_practice_signals: '',
  submit_question_practice_v2: 'uuid,uuid,uuid,integer,jsonb,boolean', start_question_practice_in_scope: 'uuid,uuid,uuid',
  question_practice_topic_status: 'uuid', question_practice_continuous_pool: 'uuid', question_practice_continuous_state: 'uuid',
  question_practice_snapshot: 'uuid', list_question_practice_attempts: 'boolean',
};
const inventory = functions(source);
if (inventory.length !== Object.keys(signatures).length || inventory.some(([, n]) => !(n in signatures))) throw new Error('Unexpected function inventory.');
const signature = n => `public.${n}(${signatures[n]})`;
const baseline = new Map();
for (const [v, n] of prerequisites) {
  const seen = new Set();
  for (const [, fn, body] of functions(read(`supabase/migrations/${v}_${n}.sql`))) {
    if (!seen.has(fn)) baseline.set(fn, body);
    seen.add(fn);
  }
}
const ledger = prerequisites.map(([v, n]) => `EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='${v}' AND name='${n}' AND cardinality(statements)=1 AND md5(statements[1])='${hash(read(`supabase/migrations/${v}_${n}.sql`))}')`).join(' AND ');
const bodies = inventory.filter(([, n]) => baseline.has(n)).map(([, n]) => `coalesce((SELECT md5(prosrc)='${hash(baseline.get(n))}' FROM pg_proc WHERE oid=to_regprocedure('${signature(n)}')),false)`).join(' AND ');
const absent = `NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='${version}') AND to_regclass('public.arena_practice_issues') IS NULL AND NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='question_practice_sessions' AND column_name='source') AND ${inventory.filter(([, n]) => !baseline.has(n)).map(([, n]) => `to_regprocedure('${signature(n)}') IS NULL`).join(' AND ')}`;
writeFileSync(new URL('00_preflight_readonly.sql', dir), `-- Catalog and ledger only. Does not read account or question content.\nSELECT (${ledger}) AS prerequisite_ledger_matches,(${bodies}) AS prerequisite_functions_match,(${absent}) AS integration_absent;\n`);
writeFileSync(new URL('10_deploy.sql', dir), `-- Execute once only after explicit authorization and a fresh preflight. Never replay legacy Arena.\nBEGIN;\nDO $deploy$\nDECLARE migration_sql text := $arena_source$${source}$arena_source$;\nBEGIN\n LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;\n IF NOT (${absent}) THEN RAISE EXCEPTION 'Arena integration already recorded or partially present; stop without replay.'; END IF;\n IF NOT (${ledger}) OR NOT (${bodies}) THEN RAISE EXCEPTION 'Practice prerequisite mismatch; stop without replaying migrations.'; END IF;\n EXECUTE migration_sql;\n INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('${version}','${name}',ARRAY[migration_sql]);\nEND;\n$deploy$;\nCOMMIT;\n`);
const checks = [
  `SELECT 'ledger' AS name,EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='${version}' AND name='${name}' AND cardinality(statements)=1 AND md5(statements[1])='${hash(source)}') AS ok`,
  ...inventory.map(([, n, body]) => `SELECT '${n}',coalesce((SELECT md5(prosrc)='${hash(body)}' AND prosecdef AND proconfig=ARRAY['search_path=public, extensions'] FROM pg_proc WHERE oid=to_regprocedure('${signature(n)}')),false)`),
  ...['arena_practice_catalog', 'arena_practice_next_question', 'arena_practice_submit_answer', 'get_question_practice_statistics'].map(n => `SELECT '${n}_permissions',has_function_privilege('authenticated','${signature(n)}','EXECUTE') AND NOT has_function_privilege('anon','${signature(n)}','EXECUTE')`),
  ...['arena_practice_pool', 'arena_practice_payload', 'question_practice_signals', 'start_question_practice_in_scope', 'question_practice_topic_status', 'question_practice_continuous_pool', 'question_practice_continuous_state'].map(n => `SELECT '${n}_private',NOT has_function_privilege('authenticated','${signature(n)}','EXECUTE') AND NOT has_function_privilege('anon','${signature(n)}','EXECUTE')`),
  `SELECT 'issues_private',NOT has_table_privilege('authenticated','public.arena_practice_issues','SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('anon','public.arena_practice_issues','SELECT,INSERT,UPDATE,DELETE') AND (SELECT relrowsecurity FROM pg_class WHERE oid='public.arena_practice_issues'::regclass)`,
  `SELECT 'source_constraint',EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.question_practice_sessions'::regclass AND conname='arena_practice_context')`,
];
writeFileSync(new URL('20_verify_readonly.sql', dir), `-- Exact ledger, function, RLS and privilege checks. No business data.\nWITH checks(name,ok) AS (\n ${checks.join('\n UNION ALL ')}\n) SELECT jsonb_build_object('all_checks_pass',bool_and(ok),'checks',jsonb_agg(jsonb_build_object('name',name,'ok',ok) ORDER BY name)) AS arena_practice_verification FROM checks;\n`);
console.log('Generated Arena Practice preflight, atomic release and exact readonly verification.');
