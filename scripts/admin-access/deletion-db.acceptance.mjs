import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
export function verifyUserDeletion({sql,user,uid,superId,full,course,question,student}) {
 const checks=[],check=(name,run)=>{run();checks.push(name);console.log('PASS deletion: '+name);};
 const fail=(run,pattern)=>assert.throws(run,e=>!pattern||pattern.test(String(e.stderr||e.message)));
 const preview=id=>JSON.parse(user(superId,`SELECT public.preview_user_deletion('${id}')`));
 const prepare=(id,email)=>user(superId,`SELECT public.prepare_user_deletion('${id}','${email}')`);
 if(sql("SELECT to_regprocedure('public.preview_user_deletion(uuid)') IS NOT NULL")==='f')sql(readFileSync(new URL('../../supabase/migrations/20261103020000_admin_user_deletion.sql',import.meta.url),'utf8'));
 check('Super Admin only, self protected, private inspector inaccessible',()=>{
  for(const id of [full,course,question,student])fail(()=>user(id,`SELECT public.preview_user_deletion('${student}')`),/Super Admin/);
  fail(()=>user(superId,`SELECT public.preview_user_deletion('${superId}')`),/own account/);
  fail(()=>user(full,`SELECT public.inspect_user_deletion('${student}')`),/permission denied/);
  fail(()=>sql(`DELETE FROM auth.users WHERE id='${superId}'`),/confirmation/);
 });
 check('course ownership, question authorship and stored files block permanent deletion',()=>{
  for(const id of [course,question]){const p=preview(id);assert.equal(p.can_delete,false);assert.ok(p.blockers.length);fail(()=>prepare(id,p.email),/associated content/);assert.equal(sql(`SELECT count(*) FROM auth.users WHERE id='${id}'`),'1');}
  const before=sql('SELECT count(*) FROM public.courses');
  const p=preview(uid(6));assert.ok(p.blockers.some(b=>b.table==='courses'));fail(()=>prepare(uid(6),p.email),/associated content/);assert.equal(sql('SELECT count(*) FROM public.courses'),before);
  assert.equal(sql("SELECT confdeltype FROM pg_constraint WHERE conrelid='public.courses'::regclass AND confrelid='public.profiles'::regclass"),'r');
 });
 const clean=uid(50),email='deletion-clean@example.test';
 sql(`INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES('${clean}','${email}','{"full_name":"Synthetic deletion account"}');
 INSERT INTO public.user_roles(user_id,role) VALUES('${clean}','student');
 INSERT INTO public.user_login_events(user_id) VALUES('${clean}');
 INSERT INTO public.question_practice_sessions(id,user_id) VALUES('${uid(51)}','${clean}');
 CREATE TABLE IF NOT EXISTS auth.sessions(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE);
 INSERT INTO auth.sessions(id,user_id) VALUES('${uid(52)}','${clean}');`);
 check('preview lists personal records, validates confirmation and blocks direct Auth deletion',()=>{
  const p=preview(clean);assert.equal(p.can_delete,true);for(const table of ['profiles','user_roles','user_login_events','question_practice_sessions'])assert.ok(p.personal_data.some(row=>row.table===table),table);
  fail(()=>prepare(clean,'wrong@example.test'),/confirm deletion/);
  fail(()=>sql(`DELETE FROM auth.users WHERE id='${clean}'`),/confirmation/);
  assert.equal(sql(`SELECT count(*) FROM public.profiles WHERE user_id='${clean}'`),'1');
 });
 check('new references after preview/confirmation abort deletion without losing content',()=>{
  prepare(clean,email);
  sql(`INSERT INTO public.courses(id,title,level,subject,instructor_id) VALUES('${uid(53)}','Late reference','advanced','Synthetic','${clean}')`);
  fail(()=>sql(`DELETE FROM auth.users WHERE id='${clean}'`),/associated content|changed/);
  assert.equal(sql(`SELECT count(*) FROM public.courses WHERE id='${uid(53)}'`),'1');
  assert.equal(sql(`SELECT count(*) FROM public.admin_user_deletion_audit WHERE target_user_id='${clean}' AND outcome='deleted'`),'0');
  sql(`DELETE FROM public.courses WHERE id='${uid(53)}';INSERT INTO storage.objects(bucket_id,name,owner) VALUES('practice-images','late-reference','${clean}')`);
  fail(()=>sql(`DELETE FROM auth.users WHERE id='${clean}'`),/associated content|changed/);
  sql("DELETE FROM storage.objects WHERE name='late-reference'");
 });
 check('expired authorization and revoked owner permissions cannot delete',()=>{
  prepare(clean,email);sql(`UPDATE public.admin_user_deletion_requests SET expires_at=clock_timestamp()-interval '1 second' WHERE target_user_id='${clean}'`);
  fail(()=>sql(`DELETE FROM auth.users WHERE id='${clean}'`),/confirmation/);
  prepare(clean,email);sql(`DELETE FROM public.user_roles WHERE user_id='${superId}' AND role='super_admin'`);
  fail(()=>sql(`DELETE FROM auth.users WHERE id='${clean}'`),/confirmation/);
  sql(`INSERT INTO public.user_roles(user_id,role) VALUES('${superId}','super_admin')`);
 });
 check('unowned course asset paths are not mistaken for account IDs',()=>{sql(`INSERT INTO storage.objects(bucket_id,name) VALUES('course-games','${uid(10)}/${uid(60)}/synthetic.html')`);sql("DELETE FROM storage.objects WHERE name LIKE '%/synthetic.html'");});
 check('confirmed Auth deletion removes only personal data and sessions, records success atomically',()=>{
  const before=sql('SELECT count(*) FROM public.courses');prepare(clean,email);sql(`DELETE FROM auth.users WHERE id='${clean}'`);
  for(const table of ['public.profiles','public.user_roles','public.user_login_events','public.question_practice_sessions','auth.sessions'])assert.equal(sql(`SELECT count(*) FROM ${table} WHERE user_id='${clean}'`),'0',table);
  assert.equal(sql(`SELECT count(*) FROM auth.users WHERE id='${clean}'`),'0');assert.equal(sql('SELECT count(*) FROM public.courses'),before);
  assert.equal(sql(`SELECT count(*) FROM public.admin_user_deletion_audit WHERE target_user_id='${clean}' AND outcome='deleted'`),'1');
  assert.equal(sql(`SELECT count(*) FROM public.admin_user_deletion_requests WHERE target_user_id='${clean}'`),'0');
  assert.equal(user(full,'SELECT count(*) FROM public.admin_user_deletion_audit'),'0');assert.equal(user(superId,'SELECT count(*) FROM public.admin_user_deletion_audit'),'1');
  fail(()=>sql(`INSERT INTO storage.objects(bucket_id,name,owner) VALUES('practice-images','deleted-owner','${clean}')`),/no longer exists/);
  assert.equal(user(clean,"SELECT public.has_admin_module('questions')"),'f');
  fail(()=>user(clean,`SELECT public.start_question_practice('${uid(54)}',NULL)`));
 });
 writeFileSync('docs/admin-access/task4-database-results.txt','Actual disposable PostgreSQL; synthetic accounts; no production changes.\n'+checks.map(s=>'PASS '+s).join('\n')+'\n');
}
