import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setupCoursePractice } from './course-practice-db.acceptance.mjs';
export async function verifyCourseRelease({sql,bootstrap,admin,student}) {
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
 sql('CREATE DATABASE course_release_test');
 const fresh=s=>sql('\\connect course_release_test\n'+s);
 fresh(bootstrap.replace(read('supabase/migrations/20261027000000_course_topic_content.sql'),''));
 setupCoursePractice(fresh,admin,student,false);
 const v2=read('supabase/migrations/20261026000000_question_practice_adaptation_v2.sql');
 fresh(`CREATE SCHEMA supabase_migrations;CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY,name text,statements text[]);
 CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
 INSERT INTO supabase_migrations.schema_migrations VALUES('20261026000000','question_practice_adaptation_v2',ARRAY[$source$${v2}$source$]);`);
 const preflight=fresh(read('docs/courses/production/00_preflight_readonly.sql'));
 assert.ok(preflight.includes('t|t|t|t|t'));
 fresh(read('docs/courses/production/10_deploy.sql'));
 const checks=fresh(read('docs/courses/production/20_verify_readonly.sql')).trim().split('\n').at(-1);
 assert.ok(checks.startsWith('t|'),checks);
 assert.throws(()=>fresh(read('docs/courses/production/10_deploy.sql')));
 assert.equal(fresh('SELECT count(*) FROM supabase_migrations.schema_migrations').trim(),'5');
 console.log('PASS exact release package: clean prerequisite database, atomic four-migration deployment, exact function/ledger/RLS checks and repeat-deploy refusal');
}
