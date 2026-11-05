// Actual frozen pilot content is draft-only, in disposable Auth/REST/PostgreSQL. No production calls.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';
import { privateDirectory, verifySnapshot, sha256 } from './snapshot.mjs';
import { runImport } from './import-batch.mjs';
import { loadQuestionBankPage, loadQuestionBankVersionPreview } from '../../../src/lib/questionBankDraftRepository.ts';
import { loadPublicationPlan } from '../../../src/lib/questionBankPublicationWorkflow.ts';

export async function verifyLegacyBrowser({db,admin,page,context,openBank,card,dialog,closeEditor,check,read}) {
 const base=privateDirectory(process.env.O2I_LEGACY_ARENA_PRIVATE_DIR);verifySnapshot(base);
 const folder=resolve(base,'review-pilot-svg-v1-0f2356a45d6a-37102041');
 const batch=JSON.parse(readFileSync(resolve(folder,'prepared-batch.json'),'utf8'));
 const snapshot=JSON.parse(readFileSync(resolve(base,'snapshot.json'),'utf8'));
 assert.equal(batch.questions.length,18);assert.equal(batch.excluded.length,2);
 await db.query(read('supabase/migrations/20261104000100_arena_game.sql'));
 await db.query("SET timezone='UTC'");
 await db.query('INSERT INTO public.arena_questions SELECT * FROM jsonb_populate_recordset(NULL::public.arena_questions,$1::jsonb)',[JSON.stringify(snapshot.rows.map(r=>r.source))]);
 await db.query('BEGIN;'+read('supabase/migrations/20261105020000_question_bank_legacy_arena_source.sql')+'COMMIT;');
 const topics=await admin.from('curriculum_topics').select('id,topic_code,title'),skills=await admin.from('curriculum_practice_skills').select('id,skill_code,description');
 assert.ifError(topics.error);assert.ifError(skills.error);
 const references={topics:topics.data,skills:skills.data,existingExternalIds:new Set()};
 const before=(await db.query('SELECT count(*)::int n FROM public.questions')).rows[0].n;
 assert.equal((await runImport({client:admin,batch,references})).to_save,18);
 assert.equal((await db.query('SELECT count(*)::int n FROM public.questions')).rows[0].n,before);
 // Assets here are served from checked local PNG fixtures. Production Storage acceptance is separate.
 for(const asset of batch.assets) {
  const bytes=readFileSync(resolve(base,asset.file));assert.equal(sha256(bytes),asset.sha256);
  await context.route('https://lxoaeaewcrshjkigzyqe.supabase.co/storage/v1/object/public/practice-images/'+asset.path,route=>route.fulfill({status:200,contentType:'image/png',body:bytes}));
 }
 assert.equal((await runImport({client:admin,batch,references,apply:true})).verified.length,18);
 assert.equal((await runImport({client:admin,batch,references,apply:true})).existing,18);
 assert.equal((await db.query('SELECT count(*)::int n FROM public.questions')).rows[0].n,before+18);
 const items=(await loadQuestionBankPage(admin,'drafts',0,100)).items;
 for(const question of batch.questions) {
  const saved=items.find(item=>item.externalId===question.external_id);assert.ok(saved);
  const preview=await loadQuestionBankVersionPreview(admin,saved),[publication]=await loadPublicationPlan(admin,saved);
  assert.equal(preview.sourcePage,null);assert.equal(preview.sourceReference,'arena:'+question.external_id.replace('arena_legacy_',''));
  assert.equal(preview.stem,question.stem);assert.equal(preview.solution,question.solution);
  assert.deepEqual(publication.check.issues.map(i=>i.code),['QB_REVIEW_REQUIRED']);
 }
 check('All 18 real pilot drafts match REST/DB/exact-version preview; repeat import creates no duplicate and human review remains required');
 await page.setViewportSize({width:1280,height:960});await page.reload();await openBank();
 const first=batch.questions[0].external_id;
 await card(first).getByRole('button',{name:/^Edit /}).click();
 await dialog().getByText('Original ID:',{exact:false}).waitFor();
 assert.equal(await dialog().getByLabel(first+' Physical PDF page',{exact:true}).count(),0);
 assert.equal(await dialog().getByLabel(first+' Source locator',{exact:true}).count(),0);
 await dialog().getByLabel(first+' Difficulty',{exact:true}).selectOption('medium');
 await dialog().getByRole('button',{name:'Save changes',exact:true}).click();
 await dialog().getByText('Changes saved and read back.',{exact:false}).waitFor();
 assert.equal(await dialog().getByLabel(first+' Difficulty',{exact:true}).inputValue(),'medium');
 await closeEditor();
 const v=(await db.query('SELECT v.* FROM public.question_versions v JOIN public.questions q ON q.id=v.question_id WHERE q.external_id=$1',[first])).rows[0];
 assert.equal(v.source_page,null);assert.equal(v.source_reference,'arena:q1');assert.equal(v.difficulty,'medium');
 assert.equal(v.import_evidence.human_review_status,'pending');
 await card(first).getByRole('button',{name:'Publish',exact:true}).click();
 assert.equal(await dialog().getByRole('checkbox',{name:/I have checked the selected problems/}).isChecked(),false);
 assert.equal(await dialog().getByRole('button',{name:'Publish 1 problems',exact:true}).isEnabled(),false);
 await closeEditor();
 check('Native Arena draft edit survives save/readback with null page; publication window requires an unchecked real confirmation');
 const output=resolve(folder,'local-acceptance');mkdirSync(output,{recursive:true,mode:0o700});
 for(const question of batch.questions) {
  await card(question.external_id).getByRole('button',{name:'Publish',exact:true}).click();
  await dialog().getByRole('checkbox',{name:/I have checked the selected problems/}).waitFor();
  await dialog().getByText('Loading preview…',{exact:true}).waitFor({state:'hidden'});
  assert.equal(await dialog().locator('.katex-error').count(),0);
  if(question.requires_figure){await dialog().locator('img').first().waitFor();await page.waitForFunction(()=>[...document.querySelectorAll('[role=dialog] img')].every(i=>i.complete&&i.naturalWidth>0));}
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  const file=resolve(output,question.external_id+'.png');await page.screenshot({path:file,fullPage:true});chmodSync(file,0o600);
  await closeEditor();await page.setViewportSize({width:1280,height:960});
 }
 assert.equal((await db.query("SELECT count(*)::int n FROM public.question_version_reviews r JOIN public.question_versions v ON v.id=r.question_version_id JOIN public.questions q ON q.id=v.question_id WHERE q.external_id LIKE 'arena_legacy_%'")).rows[0].n,0);
 assert.equal((await db.query("SELECT count(*)::int n FROM public.questions WHERE external_id LIKE 'arena_legacy_%' AND (status<>'draft' OR current_version_id IS NOT NULL)")).rows[0].n,0);
 check('All 18 actual pilot previews render on mobile with local checked graph images; zero reviews or publications created for real questions');
}
