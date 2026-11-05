import assert from 'node:assert/strict';

export async function verifyLegacySource({t,rootClient:db,admin,connect,fixture,get,read,studentId}) {
 await db.query(read('supabase/migrations/20261019000000_question_bank_unpublished_status.sql'));
 await db.query(read('supabase/migrations/20261019010000_question_bank_publication.sql'));
 await db.query(read('supabase/migrations/20261020000000_question_bank_simple_publication.sql'));
 await db.query(`CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
 CREATE SCHEMA IF NOT EXISTS supabase_migrations;
 CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations(version text PRIMARY KEY,name text,statements text[]);`);
 await db.query(read('supabase/migrations/20261104000100_arena_game.sql'));
 await db.query(`INSERT INTO public.arena_questions(id,unit,tier,topic,stem,options,explanation)
 SELECT 'q900'||n,1,1,'Synthetic','Synthetic legacy '||n,'["A","B","C","D"]','Synthetic explanation' FROM generate_series(1,4)n`);
 const sourceHash=async id=>(await db.query("SELECT encode(extensions.digest(to_jsonb(q)::text,'sha256'),'hex') hash FROM public.arena_questions q WHERE id=$1",[id])).rows[0].hash;
 const pdf=await fixture(admin);
 const fingerprint=async id=>(await db.query('SELECT public.question_bank_content_fingerprint($1) hash',[id])).rows[0].hash;
 const oldHash=await fingerprint(pdf.version.id);
 const prior=(await db.query('SELECT jsonb_agg(to_jsonb(v) ORDER BY id) result FROM public.question_versions v')).rows[0].result;
 await t.test('source migration and deploy package are atomic, preserve existing rows/fingerprints and refuse replay',async()=>{
  const check=(await db.query(read('docs/arena/legacy-import/00_preflight_readonly.sql'))).rows[0];
  assert.deepEqual(check,{known_functions_match:true,target_absent:true,legacy_table_present:true});
  await db.query(read('docs/arena/legacy-import/10_source_deploy.sql'));
  assert.equal((await db.query(read('docs/arena/legacy-import/20_source_verify_readonly.sql'))).rows[0].all_checks_pass,true);
  assert.equal(await fingerprint(pdf.version.id),oldHash);
  assert.deepEqual((await db.query('SELECT jsonb_agg(to_jsonb(v) ORDER BY id) result FROM public.question_versions v')).rows[0].result,prior);
  await assert.rejects(db.query(read('docs/arena/legacy-import/10_source_deploy.sql')),/already installed|baseline mismatch/);
  await db.query('ROLLBACK');
 });
 const item=async(id='q9001')=>({external_id:'arena_legacy_'+id,stem:'Synthetic $x$',solution:'Synthetic solution',difficulty:'easy',course_scope:'BOTH',primary_topic_code:'1.1',practice_skill_codes:['1.A'],representation_type:'analytical',calculator_policy:'no_calculator',source_document:'Legacy Arena bank',source_page:null,source_question_number:null,source_locator:null,requires_figure:false,image_url:null,correct_option_key:'A',import_evidence:{legacy_arena:{source_id:id,source_sha256:await sourceHash(id),batch_id:'synthetic-pilot',conversion_version:'v1'},human_review_status:'pending'},options:['A','B','C','D'].map((k,i)=>({option_key:k,option_text:'Synthetic '+k,is_correct:i===0,import_evidence:{}}))});
 const save=async items=>(await admin.query('SELECT public.save_question_bank_drafts($1::jsonb) result',[JSON.stringify(items)])).rows[0].result;
 let saved;
 await t.test('verified native source saves only a draft, edits safely, requires real version confirmation and clones source',async()=>{
  [saved]=await save([await item()]);
  let state=await get(admin,saved.question_id,saved.version_id);
  assert.equal(state.version.source_page,null);assert.equal(state.version.source_reference,'arena:q9001');
  assert.equal(state.version.status,'draft');assert.equal(state.question.current_version_id,null);
  assert.deepEqual((await db.query('SELECT public.question_bank_content_issues($1,$2) result',[saved.question_id,saved.version_id])).rows[0].result,[]);
  assert.ok((await admin.query('SELECT public.precheck_question_publication($1,$2,$action$publish$action$) result',[saved.question_id,saved.version_id])).rows[0].result.issues.some(i=>i.code==='QB_REVIEW_REQUIRED'));
  const metadata={difficulty:'medium',calculator_policy:'no_calculator',course_scope:'BOTH',representation_type:'analytical',primary_topic_code:'1.1',practice_skill_codes:['1.A'],source_page:null,source_locator:null};
  await admin.query('SELECT public.update_question_bank_draft_metadata($1,$2,$3,$4)',[saved.question_id,saved.version_id,state.fingerprint,metadata]);
  state=await get(admin,saved.question_id,saved.version_id);
  assert.equal(state.version.source_page,null);assert.equal(state.version.source_reference,'arena:q9001');
  assert.equal(state.version.import_evidence.legacy_arena.source_sha256,await sourceHash('q9001'));
  await assert.rejects(admin.query('SELECT public.update_question_bank_draft_metadata($1,$2,$3,$4)',[saved.question_id,saved.version_id,state.fingerprint,{...metadata,source_page:'1'}]),/provenance/);
  let check=(await admin.query('SELECT public.precheck_question_publication($1,$2,$action$publish$action$) result',[saved.question_id,saved.version_id])).rows[0].result;
  check=(await admin.query('SELECT public.record_question_version_review($1,$2,$3,$4) result',[saved.question_id,saved.version_id,check.fingerprint,{confirmed:true}])).rows[0].result.precheck;
  await admin.query('SELECT public.publish_question_versions($1)',[JSON.stringify([{question_id:saved.question_id,version_id:saved.version_id,expected_fingerprint:check.fingerprint,action:'publish'}])]);
  const current=(await admin.query('SELECT public.precheck_question_publication($1,$2,$action$publish$action$) result',[saved.question_id,saved.version_id])).rows[0].result;
  const revision=(await admin.query('SELECT public.save_question_bank_revision($1,$2,$3,$4) result',[saved.question_id,saved.version_id,current.fingerprint,{...metadata,difficulty:'hard'}])).rows[0].result.version_id;
  const clone=await get(admin,saved.question_id,revision);
  assert.equal(clone.version.source_page,null);assert.equal(clone.version.source_reference,'arena:q9001');
  assert.deepEqual(clone.version.import_evidence.legacy_arena,state.version.import_evidence.legacy_arena);
 });
 await t.test('bad source evidence, ID, PDF impersonation and mixed batch failure leave no partial draft',async()=>{
  const base=await item('q9002');
  const before=(await db.query('SELECT count(*) n FROM public.questions')).rows[0].n;
  const bad=[{...base,source_page:'1'},{...base,source_document:'fake.pdf'},{...base,external_id:'unrelated'},
    {...base,import_evidence:{legacy_arena:{...base.import_evidence.legacy_arena,source_sha256:'0'.repeat(64)}}},
    {...base,import_evidence:{legacy_arena:null}},{...base,source_locator:'p001-item01'},
    {...base,import_evidence:{},source_document:'Synthetic.pdf',source_question_number:'1'}];
  for(const b of bad) await assert.rejects(save([b]),/source|PDF|legacy Arena/);
  const broken=await item('q9003');broken.import_evidence.legacy_arena.source_sha256='0'.repeat(64);
  await assert.rejects(save([base,broken]),/legacy Arena/);
  assert.equal((await db.query('SELECT count(*) n FROM public.questions')).rows[0].n,before);
  await assert.rejects(save([await item()]),/already exists/);
 });
 await t.test('published native-source drafts enter real Practice and Arena; private answers and learner records stay isolated',async()=>{
  await db.query(`ALTER TABLE public.courses ADD COLUMN practice_course_scope public.question_course_scope;
   CREATE TABLE public.course_topic_content(course_id uuid,topic_id uuid);
   CREATE FUNCTION public.course_topic_visible(uuid,uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT false$$;`);
  for(const migration of ['20261021000000_question_bank_student_practice','20261026000000_question_practice_adaptation_v2',
   '20261025000000_question_practice_review_history','20261028000000_course_topic_practice','20261104000000_question_practice_continuous','20261105000000_arena_practice_integration']) {
   await db.query(read('supabase/migrations/'+migration+'.sql'));
  }
  await db.query(`INSERT INTO public.arena_questions(id,unit,tier,topic,stem,options,explanation)
   SELECT 'synthetic-native-'||n,1,1,'Synthetic','Synthetic native '||n,'["A","B","C","D"]','Synthetic solution' FROM generate_series(1,5)n`);
  const items=[];for(let n=1;n<=5;n++)items.push(await item('synthetic-native-'+n));
  const batch=await save(items);
  const nativeIds=batch.map(b=>b.question_id);
  const publishTargets=[];
  for(const target of batch) {
   const check=(await admin.query('SELECT public.precheck_question_publication($1,$2,$3) result',[target.question_id,target.version_id,'publish'])).rows[0].result;
   const reviewed=(await admin.query('SELECT public.record_question_version_review($1,$2,$3,$4) result',[target.question_id,target.version_id,check.fingerprint,{confirmed:true}])).rows[0].result.precheck;
   publishTargets.push({question_id:target.question_id,version_id:target.version_id,expected_fingerprint:reviewed.fingerprint,action:'publish'});
  }
  await admin.query('SELECT public.publish_question_versions($1)',[JSON.stringify(publishTargets)]);
  const student=await connect('authenticated',studentId);
  try {
   const rpc=async(sql,args=[])=>(await student.query(sql,args)).rows[0].result;
   const topic=(await db.query("SELECT id FROM public.curriculum_topics WHERE topic_code='1.1'")).rows[0].id;
   const session=(await db.query('SELECT gen_random_uuid() id')).rows[0].id;
   const practice=await rpc('SELECT public.start_question_practice($1,$2) result',[session,topic]);
   assert.ok(practice.questions.some(q=>nativeIds.includes(q.question_id)),JSON.stringify(practice));
   assert.ok(practice.questions.every(q=>q.solution===undefined&&q.options.every(o=>o.is_correct===undefined)));
   const run=(await db.query('SELECT gen_random_uuid() id')).rows[0].id;
   const issued=await rpc('SELECT public.arena_practice_next_question($1,$2,$3,$4,$5) result',[run,[1],1,1,true]);
   assert.equal(issued.status,'ok');assert.equal(issued.explanation,undefined);assert.equal(issued.correct_index,undefined);
   const issue=(await db.query('SELECT * FROM public.arena_practice_issues WHERE id=$1',[issued.issue_id])).rows[0];
   assert.ok(nativeIds.includes(issue.question_id)||issue.question_id===saved.question_id);
   const right=(await db.query('SELECT id FROM public.question_options WHERE question_version_id=$1 AND is_correct',[issue.version_id])).rows[0].id;
   const answer=await rpc('SELECT public.arena_practice_submit_answer($1,$2) result',[issued.issue_id,issue.option_order.indexOf(right)]);
   assert.equal(answer.correct,true);assert.equal(answer.explanation,'Synthetic solution');
   assert.deepEqual(await rpc('SELECT public.arena_practice_submit_answer($1,$2) result',[issued.issue_id,0]),answer);
   assert.equal((await db.query('SELECT count(*)::int n FROM public.question_practice_attempts WHERE session_id=$1',[run])).rows[0].n,1);
   const foreign=await connect('authenticated',(await db.query('SELECT gen_random_uuid() id')).rows[0].id);
   try {assert.deepEqual((await foreign.query('SELECT public.arena_practice_submit_answer($1,$2) result',[issued.issue_id,0])).rows[0].result,{status:'not_found'});}finally{await foreign.end();}
  } finally {await student.end();}
 });
 await t.test('changed legacy content fails source checks; anon/student cannot import or probe private source helper',async()=>{
  await db.query("UPDATE public.arena_questions SET stem='Synthetic changed' WHERE id='q9001'");
  const issues=(await db.query('SELECT public.question_bank_content_issues($1,$2) result',[saved.question_id,saved.version_id])).rows[0].result;
  assert.ok(issues.some(i=>i.code==='QB_LEGACY_SOURCE'));
  for(const [role,user] of [['authenticated',studentId],['anon','']]) {
   const c=await connect(role,user);
   try {
    await assert.rejects(c.query('SELECT public.save_question_bank_drafts($1)',[JSON.stringify([await item('q9004')])]),/admin|permission/i);
    await assert.rejects(c.query('SELECT public.question_bank_legacy_arena_source($1)',[{}]),/permission/i);
   } finally {await c.end();}
  }
 });
 await t.test('existing PDF validation and review fingerprint remain intact after legacy edits/publication',async()=>{
  assert.equal(await fingerprint(pdf.version.id),oldHash);
  const badPdf={...(await item('q9004')),external_id:'SYNTHETIC-PDF-BAD',import_evidence:{},source_document:'Synthetic.pdf',source_page:'0',source_question_number:'1'};
  await assert.rejects(save([badPdf]),/range|source_page/);
  await fixture(admin,{external_id:'SYNTHETIC-PDF-STILL-VALID'});
 });
}
