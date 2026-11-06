import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
const read = path => readFileSync(new URL('../../'+path,import.meta.url),'utf8');
const md5 = value => createHash('md5').update(value).digest('hex');
test('every migration version is unique and deployed administrator/Arena source is preserved',()=>{
 const files=readdirSync(new URL('../../supabase/migrations/',import.meta.url)).filter(f=>f.endsWith('.sql'));
 assert.equal(new Set(files.map(f=>f.split('_')[0])).size,files.length);
 assert.ok(files.includes('20261105010000_course_login_access.sql'));
 assert.equal(md5(read('supabase/migrations/20261103020000_admin_user_deletion.sql')),'d11ccb83ad64a84db35645599c39f9eb');
 assert.equal(md5(read('supabase/migrations/20261104000100_arena_game.sql')),JSON.parse(read('docs/database-reconciliation/arena-baseline.json')).source_md5);
 assert.ok(!read('scripts/course-outline-db.acceptance.mjs').includes('20261103020000_course_login_access.sql'));
});
test('generated repair is reproducible, embeds exact source and never executes Arena source',()=>{
 const paths=['00_preflight_readonly.sql','10_reconcile.sql','20_verify_readonly.sql'].map(f=>'docs/database-reconciliation/'+f);
 const before=paths.map(read);
 execFileSync(process.execPath,['scripts/migrations/generate-reconciliation.mjs'],{cwd:new URL('../../',import.meta.url),stdio:'pipe'});
 assert.deepEqual(paths.map(read),before);
 const repair=read(paths[1]);
 assert.ok(repair.includes('$course_source$'+read('supabase/migrations/20261105010000_course_login_access.sql')+'$course_source$'));
 assert.ok(repair.includes('$arena_source$'+read('supabase/migrations/20261104000100_arena_game.sql')+'$arena_source$'));
 assert.deepEqual([...repair.matchAll(/EXECUTE ([a-z_]+);/g)].map(m=>m[1]),['course_sql']);
 assert.ok(!/UPDATE supabase_migrations|DELETE FROM|DROP TABLE|TRUNCATE /.test(repair));
});
