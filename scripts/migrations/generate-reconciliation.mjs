// Generates a targeted repair; never connects to production.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const write = (file, value) => writeFileSync(new URL('../../docs/database-reconciliation/' + file, import.meta.url), value);
const md5 = value => createHash('md5').update(value).digest('hex');
const literal = value => "'" + value.replaceAll("'", "''") + "'";
const normalize = value => value.replaceAll('\r', '').replace(/[ \t]+\n/g, '\n');
const arenaVersion = '20261104000100', courseVersion = '20261105010000';
const arena = read(`supabase/migrations/${arenaVersion}_arena_game.sql`);
const course = read(`supabase/migrations/${courseVersion}_course_login_access.sql`);
const admin = read('supabase/migrations/20261103020000_admin_user_deletion.sql');
const baseline = JSON.parse(read('docs/database-reconciliation/arena-baseline.json'));
assert.equal(baseline.source_md5, md5(arena), 'Rebuild and inspect Arena baseline after source changes.');
const catalog = read('scripts/migrations/arena-catalog.sql').trim().replace(/;$/, '');
const arenaMatches = `(${catalog}) = ${literal(JSON.stringify(baseline.catalog))}::jsonb`;
const functions = sql => [...sql.matchAll(/CREATE (?:OR REPLACE )?FUNCTION public\.(\w+)\([^;]*?AS \$\$([\s\S]*?)\$\$;/g)];
const signatures = { course_topic_visible: 'uuid,uuid', course_lesson_visible: 'uuid', get_course_outline_entry: 'uuid,uuid' };
const inventory = functions(course);
assert.equal(inventory.length, 3);
assert.deepEqual(inventory.map(([,name]) => name).sort(), Object.keys(signatures).sort());
const old = read('supabase/migrations/20261101000000_course_custom_outline.sql');
// The module-permissions migration patches this exact admin check in installed functions.
const oldBodies = new Map(functions(old).map(([,name,body]) => [name, body.replaceAll("public.has_role(auth.uid(),'admin')", "public.has_admin_module('courses')")]));
const bodyCheck = (name, body) => `EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.${name}(${signatures[name]})') AND md5(regexp_replace(replace(prosrc,E'\\r',''),E'[ \\t]+\\n',E'\\n','g'))='${md5(normalize(body))}' AND prosecdef AND provolatile='s' AND proconfig=ARRAY['search_path=public, extensions'] AND pg_get_userbyid(proowner)='postgres')`;
const bodiesBefore = inventory.map(([,name]) => bodyCheck(name,oldBodies.get(name))).join(' AND ');
const bodiesAfter = inventory.map(([,name,body]) => bodyCheck(name,body)).join(' AND ');
const permissions = inventory.map(([,name]) => `coalesce(has_function_privilege('anon',to_regprocedure('public.${name}(${signatures[name]})'),'EXECUTE'),false) AND coalesce(has_function_privilege('authenticated',to_regprocedure('public.${name}(${signatures[name]})'),'EXECUTE'),false)`).join(' AND ');
const policies = JSON.parse(read('docs/database-reconciliation/course-read-policies.json'));
assert.equal(policies.length,5);
const policyChecks = policies.map(p => `EXISTS(SELECT 1 FROM pg_policies WHERE schemaname=${literal(p.schemaname)} AND tablename=${literal(p.tablename)} AND policyname=${literal(p.policyname)} AND cmd='SELECT' AND permissive='PERMISSIVE' AND roles=ARRAY['public']::name[] AND qual=${literal(p.qual)} AND with_check IS NULL) AND EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('${p.schemaname}.${p.tablename}') AND relrowsecurity)`);
const security = [...policyChecks, permissions].join(' AND ');
const adminMatches = `EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261103020000' AND name='admin_user_deletion' AND cardinality(statements)=1 AND md5(statements[1])='${md5(admin)}')`;
const targetsAbsent = `NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version IN ('${arenaVersion}','${courseVersion}') OR name IN ('arena_game','course_login_access'))`;
const checks = [
 ['administrator_history_matches',adminMatches],['target_records_absent',targetsAbsent],
 ['course_functions_are_known_baseline',bodiesBefore],['course_security_dependencies_match',security],['arena_catalog_matches',arenaMatches],
];
const report = rows => `WITH checks(name,ok) AS (\n${rows.map(([name,check]) => ` SELECT '${name}',coalesce((${check}),false)`).join('\n UNION ALL\n')}\n) SELECT jsonb_build_object('all_checks_pass',bool_and(ok),'checks',jsonb_agg(jsonb_build_object('name',name,'ok',ok) ORDER BY name)) AS reconciliation FROM checks;\n`;
const settings = `SET LOCAL search_path=public,pg_catalog;\nSET LOCAL lock_timeout='5s';\nSET LOCAL statement_timeout='30s';\n`;
write('00_preflight_readonly.sql', `-- Generated. Only catalogs and migration history.\nBEGIN READ ONLY;\n${settings}${report(checks)}COMMIT;\n`);
write('10_reconcile.sql', `-- Generated. Existing Arena objects must match; its source is recorded but NEVER executed.\nBEGIN;\n${settings}DO $repair$\nDECLARE\n course_sql text := $course_source$${course}$course_source$;\n arena_sql text := $arena_source$${arena}$arena_source$;\n before_counts bigint[];\nBEGIN\n LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;\n IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='supabase_migrations.schema_migrations'::regclass AND NOT tgisinternal) THEN RAISE EXCEPTION 'Unexpected ledger trigger; stop.'; END IF;\n IF NOT (${adminMatches}) OR NOT (${targetsAbsent}) THEN RAISE EXCEPTION 'History mismatch or repair already recorded; stop without replay.'; END IF;\n LOCK TABLE public.arena_questions,public.arena_question_issues IN SHARE MODE;\n IF NOT coalesce((${arenaMatches}),false) THEN RAISE EXCEPTION 'Arena catalog differs; no DDL or ledger adoption is allowed.'; END IF;\n IF NOT coalesce((${bodiesBefore}),false) OR NOT coalesce((${security}),false) THEN RAISE EXCEPTION 'Course baseline differs; stop before replacing functions.'; END IF;\n before_counts:=ARRAY[(SELECT count(*) FROM public.arena_questions),(SELECT count(*) FROM public.arena_question_issues)];\n EXECUTE course_sql;\n IF NOT coalesce((${bodiesAfter}),false) OR NOT coalesce((${security}),false) OR NOT coalesce((${arenaMatches}),false) OR NOT (${adminMatches}) THEN RAISE EXCEPTION 'Post-install verification failed; entire repair rolls back.'; END IF;\n IF before_counts<>ARRAY[(SELECT count(*) FROM public.arena_questions),(SELECT count(*) FROM public.arena_question_issues)] THEN RAISE EXCEPTION 'Arena row count changed; entire repair rolls back.'; END IF;\n INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES\n ('${arenaVersion}','arena_game',ARRAY[arena_sql]),\n ('${courseVersion}','course_login_access',ARRAY[course_sql]);\nEND;\n$repair$;\nCOMMIT;\n`);
const ledgerCheck = (version,name,source) => `EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='${version}' AND name='${name}' AND cardinality(statements)=1 AND md5(statements[1])='${md5(source)}')`;
write('20_verify_readonly.sql', `-- Generated. Exact installed state and history; no account/question content.\nBEGIN READ ONLY;\n${settings}${report([
 ['administrator_history_matches',adminMatches],['arena_history_matches',ledgerCheck(arenaVersion,'arena_game',arena)],
 ['course_history_matches',ledgerCheck(courseVersion,'course_login_access',course)],['course_functions_installed',bodiesAfter],
 ['course_security_dependencies_match',security],['arena_catalog_matches',arenaMatches],
])}COMMIT;\n`);
console.log('Generated atomic course installation + catalog-proven Arena ledger adoption.');
