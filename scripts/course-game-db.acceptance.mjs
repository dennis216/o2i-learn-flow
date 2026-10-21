import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
export async function verifyCourseGameStorage({sql,asUser,admin,student,bc,t1,save,video}) {
 sql(`CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;GRANT USAGE ON SCHEMA storage TO anon,authenticated;GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO anon,authenticated;
 ${readFileSync(new URL('../supabase/migrations/20261029000000_course_html_games.sql',import.meta.url),'utf8')}`);
 const path=`${bc}/${t1}/00000000-0000-4000-8000-000000000099.html`;
 asUser(admin,`INSERT INTO storage.objects(bucket_id,name) VALUES('course-games','${path}')`);
 const count=()=>asUser(student,"SELECT count(*) FROM storage.objects WHERE bucket_id='course-games'").trim().split('\n').at(-1);
 assert.equal(count(),'0');
 asUser(admin,`SELECT public.save_course_topic('${bc}','${t1}',true,'${JSON.stringify([video])}','${path}')`);
 assert.equal(count(),'1');
 assert.equal(asUser(admin,`DELETE FROM storage.objects WHERE name='${path}' RETURNING name`).includes(path),false);
 asUser(admin,`SELECT public.save_course_topic('${bc}','${t1}',false,'${JSON.stringify([video])}','${path}')`);
 assert.equal(count(),'0');
 assert.throws(()=>asUser(student,`INSERT INTO storage.objects(bucket_id,name) VALUES('course-games','${path}x')`));
 asUser(admin,`SELECT public.save_course_topic('${bc}','${t1}',false,'${JSON.stringify([video])}',NULL)`);
 assert.ok(asUser(admin,`DELETE FROM storage.objects WHERE name='${path}' RETURNING name`).includes(path));
 assert.equal(sql("SELECT public FROM storage.buckets WHERE id='course-games'").trim(),'f');
 console.log('PASS HTML game storage RLS: private bucket, publication-bound read, admin-only upload, referenced-object deletion refused and unused-object cleanup');
}
