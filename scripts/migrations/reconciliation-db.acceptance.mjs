import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
export function verifyReconciliation({ sql, student }) {
 const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
 const literal = value => "'" + value.replaceAll("'", "''") + "'";
 const arena = read('supabase/migrations/20261104000100_arena_game.sql');
 const admin = read('supabase/migrations/20261103020000_admin_user_deletion.sql');
 const policies = JSON.parse(read('docs/database-reconciliation/course-read-policies.json'));
 // Mirror the installed module-permissions patch without deploying unrelated admin features.
 sql(`CREATE FUNCTION public.has_admin_storage_access(text) RETURNS boolean LANGUAGE sql AS $$ SELECT public.has_admin_module('courses') $$;
 DO $patch$ DECLARE f record; BEGIN
 FOR f IN SELECT oid FROM pg_proc WHERE oid IN ('public.course_topic_visible(uuid,uuid)'::regprocedure,'public.course_lesson_visible(uuid)'::regprocedure,'public.get_course_outline_entry(uuid,uuid)'::regprocedure) LOOP
 EXECUTE replace(pg_get_functiondef(f.oid),'public.has_role(auth.uid(),''admin'')','public.has_admin_module(''courses'')');
 EXECUTE format('ALTER FUNCTION %s OWNER TO postgres',f.oid::regprocedure);
 END LOOP; END $patch$;
 GRANT USAGE ON SCHEMA public,auth,storage TO postgres;
 GRANT ALL ON ALL TABLES IN SCHEMA public,storage TO postgres;
 ${policies.map(p=>`DROP POLICY ${p.policyname} ON ${p.schemaname}.${p.tablename}; CREATE POLICY ${p.policyname} ON ${p.schemaname}.${p.tablename} FOR SELECT USING(${p.qual});`).join('\n')}
 INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261103020000','admin_user_deletion',ARRAY[${literal(admin)}]);
 SET ROLE postgres;
 ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
 ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role;
 ${arena}
 RESET ROLE;
 INSERT INTO auth.users(id) VALUES('${student}') ON CONFLICT DO NOTHING;
 INSERT INTO public.arena_questions(id,unit,tier,topic,stem,options,explanation) VALUES('retained',1,1,'Synthetic','Synthetic','["A","B","C","D"]','Synthetic');
 INSERT INTO public.arena_question_issues(user_id,run_id,question_id,option_order,selected_index,is_correct,answered_at) VALUES('${student}',gen_random_uuid(),'retained','{2,0,3,1}',1,true,now());`);
 const catalog = () => JSON.parse(sql('SET search_path=public,pg_catalog;'+read('scripts/migrations/arena-catalog.sql')).trim());
 assert.deepEqual(catalog(),JSON.parse(read('docs/database-reconciliation/arena-baseline.json')).catalog);
 const snapshot = () => sql(`SELECT jsonb_build_array((SELECT jsonb_agg(to_jsonb(q) ORDER BY id) FROM public.arena_questions q),(SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM public.arena_question_issues i),(SELECT to_jsonb(m) FROM supabase_migrations.schema_migrations m WHERE version='20261103020000'),(SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM public.course_lessons l),(SELECT jsonb_agg(to_jsonb(v) ORDER BY id) FROM public.course_videos v))`).trim();
 const before = snapshot();
 const preflight = () => JSON.parse(sql(read('docs/database-reconciliation/00_preflight_readonly.sql')).trim());
 assert.equal(preflight().all_checks_pass,true);
 const repair = read('docs/database-reconciliation/10_reconcile.sql');
 for (const mutation of [
  'ALTER TABLE public.arena_questions DISABLE ROW LEVEL SECURITY;',
  'ALTER TABLE public.arena_questions ADD COLUMN unexpected text;',
  'ALTER TABLE public.arena_questions DROP CONSTRAINT arena_questions_unit_check;',
  'DROP INDEX public.arena_question_issues_user_time_idx;',
  'GRANT SELECT ON public.arena_questions TO PUBLIC;',
  'GRANT SELECT(stem) ON public.arena_questions TO authenticated;',
  'GRANT EXECUTE ON FUNCTION public.arena_catalog() TO PUBLIC;',
  'ALTER FUNCTION public.arena_catalog() SET search_path=public,extensions;',
  'ALTER FUNCTION public.arena_catalog() OWNER TO supabase_admin;',
  "CREATE FUNCTION public.arena_catalog(integer) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;",
  'CREATE POLICY unexpected ON public.arena_questions FOR SELECT USING(true);',
  "UPDATE supabase_migrations.schema_migrations SET name='unexpected' WHERE version='20261103020000';",
  "INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES('20261104000100','arena_game');",
  "ALTER FUNCTION public.course_lesson_visible(uuid) SET search_path=public;",
  'ALTER TABLE public.course_lessons DISABLE ROW LEVEL SECURITY;',
 ]) {
  assert.throws(()=>sql('BEGIN;'+mutation+'\n'+repair),undefined,mutation);
  assert.equal(snapshot(),before,'Failed repair must roll back all changes');
  assert.equal(preflight().all_checks_pass,true,'Failed repair must leave the baseline intact');
 }
 // Fail the second ledger insert after function replacement and the first insert.
 assert.throws(()=>sql(`BEGIN; ALTER TABLE supabase_migrations.schema_migrations ADD CONSTRAINT test_rollback CHECK(version<>'20261105010000');\n${repair}`));
 assert.equal(snapshot(),before);
 assert.equal(preflight().all_checks_pass,true,'DDL and both ledger writes must roll back together');
 sql(repair);
 assert.equal(snapshot(),before,'All existing game/content rows and administrator history must be byte-for-byte unchanged');
 assert.equal(JSON.parse(sql(read('docs/database-reconciliation/20_verify_readonly.sql')).trim()).all_checks_pass,true);
 assert.throws(()=>sql(repair));
 assert.equal(snapshot(),before);
 assert.equal(sql("SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version IN ('20261104000100','20261105010000')").trim(),'2');
 console.log('PASS reconciliation: exact catalog adoption, 15 drift refusals, late-failure atomic rollback, repeat refusal and unchanged game/content/admin history');
}
