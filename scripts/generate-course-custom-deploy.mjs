import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const md5 = source => createHash('md5').update(source).digest('hex');
const versions = [
  ['20261101000000', 'course_custom_outline'],
  ['20261101010000', 'managed_course_creation'],
  ['20261101020000', 'course_outline_editor_guard'],
  ['20261101030000', 'course_video_library'],
];
const migrations = versions.map(([version, name]) => ({ version, name, source: read(`supabase/migrations/${version}_${name}.sql`) }));
const previous = read('supabase/migrations/20261031000000_course_shared_lessons.sql');
const lastBody = (source, name) => [...source.matchAll(new RegExp(`CREATE (?:OR REPLACE )?FUNCTION public\\.${name}\\([^]*?AS \\$\\$([^]*?)\\$\\$;`, 'g'))].at(-1)?.[1];
const functionCheck = (name, signature, source) => {
  const body = lastBody(source, name);
  if (!body) throw new Error(`Function ${name} missing from migration source`);
  return `coalesce((SELECT md5(prosrc)='${md5(body)}' AND prosecdef AND proconfig=ARRAY['search_path=public, extensions'] FROM pg_proc WHERE oid=to_regprocedure('public.${name}(${signature})')),false)`;
};
const ledger = ({ version, name, source }) => `EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='${version}' AND name='${name}' AND cardinality(statements)=1 AND md5(statements[1])='${md5(source)}')`;
const ready = [
  ledger({ version: '20261031000000', name: 'course_shared_lessons', source: previous }),
  ...[
    ['get_course_outline', 'uuid'], ['get_course_topic', 'uuid,uuid'],
    ['save_course_lesson', 'uuid,uuid,boolean,jsonb,text,bigint,uuid'],
    ['resolve_course_video', 'uuid'],
  ].map(([name, signature]) => functionCheck(name, signature, previous)),
  `to_regclass('public.course_lessons') IS NOT NULL`,
  `to_regclass('public.course_lesson_courses') IS NOT NULL`,
  `to_regclass('public.course_lesson_videos') IS NOT NULL`,
].join(' AND ');
const absent = [
  ...versions.map(([version]) => `NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='${version}')`),
  `to_regclass('public.course_outline_entries') IS NULL`,
  `to_regclass('public.course_outline_topics') IS NULL`,
  `NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.courses'::regclass AND attname='outline_revision' AND NOT attisdropped)`,
  `NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.course_videos'::regclass AND attname='metadata_revision' AND NOT attisdropped)`,
].join(' AND ');
const destination = new URL('../docs/courses/custom-management/production/', import.meta.url);
mkdirSync(destination, { recursive: true });
writeFileSync(new URL('00_preflight_readonly.sql', destination), `-- Run read-only before deployment. Both gates must be true; stop on any mismatch.\nSELECT (${ready}) AS prerequisite_matches, (${absent}) AS package_absent;\nSELECT count(*) AS courses FROM public.courses;\nSELECT count(*) AS lessons FROM public.course_lessons;\nSELECT count(*) AS lesson_bindings FROM public.course_lesson_courses;\nSELECT count(*) AS videos FROM public.course_videos;\n`);
const deploy = migrations.map(({ version, name, source }, index) => `EXECUTE $migration_${index}$${source}$migration_${index}$;\nINSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('${version}','${name}',ARRAY[$migration_${index}$${source}$migration_${index}$]);`).join('\n');
writeFileSync(new URL('10_deploy.sql', destination), `-- Forward-only, atomic deployment. Do not run on a partial or drifted schema.\nBEGIN;\nLOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;\nDO $release$ BEGIN\nIF NOT (${ready}) THEN RAISE EXCEPTION 'Shared course prerequisite mismatch; stop and inspect.'; END IF;\nIF NOT (${absent}) THEN RAISE EXCEPTION 'Custom course package already present or partially applied; stop and inspect.'; END IF;\n${deploy}\nEND $release$;\nCOMMIT;\n`);
const combined = migrations.map(m => m.source).join('\n');
const checks = [
  ...migrations.map(ledger),
  ...[
    ['get_course_outline_v2', 'uuid'], ['get_course_outline_entry', 'uuid,uuid'],
    ['save_course_outline_content', 'uuid,boolean,jsonb,text,bigint,uuid'],
    ['edit_course_outline', 'uuid,bigint,text,jsonb'], ['resolve_course_entry', 'uuid,uuid,uuid'],
    ['resolve_course_video', 'uuid'], ['get_course_topic', 'uuid,uuid'],
    ['save_course_lesson', 'uuid,uuid,boolean,jsonb,text,bigint,uuid'],
    ['create_managed_course', 'jsonb,public.question_course_scope'],
    ['list_course_video_library', 'uuid,text'], ['save_course_video_metadata', 'uuid,bigint,jsonb'],
  ].map(([name, signature]) => functionCheck(name, signature, combined)),
  ...['course_outline_entries', 'course_outline_topics'].flatMap(table => [
    `coalesce((SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.${table}')),false)`,
    `NOT has_table_privilege('authenticated','public.${table}','INSERT,UPDATE,DELETE') AND NOT has_table_privilege('anon','public.${table}','INSERT,UPDATE,DELETE')`,
  ]),
  ...['edit_course_outline(uuid,bigint,text,jsonb)', 'save_course_outline_content(uuid,boolean,jsonb,text,bigint,uuid)', 'create_managed_course(jsonb,public.question_course_scope)', 'save_course_video_metadata(uuid,bigint,jsonb)'].map(signature => `NOT has_function_privilege('anon','public.${signature}','EXECUTE') AND has_function_privilege('authenticated','public.${signature}','EXECUTE')`),
  `NOT EXISTS(SELECT 1 FROM public.course_lesson_courses b WHERE NOT EXISTS(SELECT 1 FROM public.course_outline_entries e JOIN public.course_outline_topics m ON m.entry_id=e.id WHERE e.course_id=b.course_id AND e.content_id=b.lesson_id AND m.topic_id=b.topic_id AND NOT e.archived))`,
  `NOT EXISTS(SELECT 1 FROM public.course_outline_entries e WHERE NOT e.archived AND NOT EXISTS(SELECT 1 FROM public.course_outline_topics m WHERE m.entry_id=e.id))`,
  `NOT EXISTS(SELECT 1 FROM public.course_outline_topics m JOIN public.course_outline_entries e ON e.id=m.entry_id JOIN public.curriculum_topics t ON t.id=m.topic_id WHERE t.unit_id<>e.unit_id OR NOT public.course_topic_in_scope(e.course_id,m.topic_id))`,
];
writeFileSync(new URL('20_verify_readonly.sql', destination), `-- Run after deployment. all_checks_pass must be true; compare counts to preflight.\nWITH checks(name,ok) AS (\n${checks.map((check, index) => `SELECT 'custom_check_${index + 1}',(${check})`).join('\nUNION ALL\n')}\n) SELECT bool_and(ok) AS all_checks_pass,jsonb_agg(jsonb_build_object('name',name,'ok',ok) ORDER BY name) AS checks FROM checks;\nSELECT count(*) AS courses FROM public.courses;\nSELECT count(*) AS lessons FROM public.course_lessons;\nSELECT count(*) AS lesson_bindings FROM public.course_lesson_courses;\nSELECT count(*) AS videos FROM public.course_videos;\nSELECT count(*) AS outline_entries,count(*) FILTER(WHERE archived) AS archived_entries FROM public.course_outline_entries;\n`);
console.log(`Generated custom course deployment package with ${checks.length} read-only checks.`);
