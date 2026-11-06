// Actual frozen pilot content is draft-only, in disposable Auth/REST/PostgreSQL. No production calls.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';
import { privateDirectory, verifySnapshot, sha256 } from './snapshot.mjs';
import { runImport } from './import-batch.mjs';
import { loadQuestionBankPage, loadQuestionBankVersionPreview } from '../../../src/lib/questionBankDraftRepository.ts';
import { loadPublicationPlan } from '../../../src/lib/questionBankPublicationWorkflow.ts';
import { browserBatch } from './browser-batch.mjs';

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
 const prepared=JSON.parse(readFileSync(resolve(base,'review-graph-u1-1-svg-v1-0f2356a45d6a-37102041/prepared-batch.json'),'utf8'));
 const q=prepared.questions[0],source=prepared.sources.find(s=>'arena_legacy_'+s.source_id===q.external_id);
 const asset=prepared.assets.find(a=>q.image_url.endsWith('/'+a.path));assert.ok(asset);
 const one={...prepared,questions:[q],options:prepared.options.filter(o=>o.question_external_id===q.external_id),sources:[source],assets:[asset]};
 const native=await browserBatch(base,one),publicBase=admin.storage.from('practice-images').getPublicUrl('').data.publicUrl;
 native.questions[0].image_url=publicBase+asset.path;
 const upload=resolve(output,'native-intake.json');writeFileSync(upload,JSON.stringify(native),{mode:0o600});
 let storageWrites=0,stored=null;
 const api=new URL(publicBase).origin;
 await context.route(api+'/storage/v1/object/**',async route=>{
  const request=route.request();assert.ok(request.headers().authorization?.startsWith('Bearer '));
  if(request.method()==='POST'){
   storageWrites++;assert.equal(request.headers()['x-upsert'],'false');
   const body=request.postDataBuffer(),contentType=request.headers()['content-type'];
   let bytes=body;
   if(contentType.includes('multipart/form-data')) {
    const form=await new Request(request.url(),{method:'POST',headers:{'content-type':contentType},body}).formData();
    const file=[...form.values()].find(value=>typeof value!=='string');assert.ok(file);bytes=Buffer.from(await file.arrayBuffer());
   }
   assert.equal(sha256(bytes),asset.sha256);stored=bytes;
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({Key:'practice-images/'+asset.path})});
  }
  assert.equal(request.method(),'GET');
  return stored?route.fulfill({status:200,contentType:'image/png',body:stored}):route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({statusCode:'404',error:'not_found',message:'not found'})});
 });
 await openBank();
 const countBefore=(await db.query('SELECT count(*)::int n FROM public.questions')).rows[0].n;
 const choose=async()=>{await page.getByLabel('Choose question bank XLSX or Arena JSON',{exact:true}).setInputFiles(upload);await page.getByRole('button',{name:'Save 1 drafts',exact:true}).waitFor();await page.getByText('Reference data: verified',{exact:true}).waitFor();};
 await choose();assert.equal(storageWrites,0);
 assert.ok((await page.getByRole('region',{name:'Preview and adjust'}).locator('img').getAttribute('src')).startsWith('data:image/png;base64,'));
 await page.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(storageWrites,0);
 assert.equal((await db.query('SELECT count(*)::int n FROM public.questions')).rows[0].n,countBefore);
 await choose();await page.getByRole('button',{name:'Save 1 drafts',exact:true}).evaluate(button=>{button.click();button.click();});
 await page.getByText('Saved 1 unpublished drafts. Nothing was approved or published.',{exact:true}).waitFor();
 assert.equal(storageWrites,1);assert.equal((await db.query('SELECT count(*)::int n FROM public.questions')).rows[0].n,countBefore+1);
 const saved=(await db.query('SELECT v.* FROM public.questions q JOIN public.question_versions v ON v.question_id=q.id WHERE q.external_id=$1',[q.external_id])).rows[0];
 assert.equal(saved.image_url,native.questions[0].image_url);assert.equal(saved.source_page,null);assert.equal(saved.status,'draft');
 assert.equal(saved.import_evidence.human_review_status,'pending');
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await choose();await page.getByText(/external_id already exists in the database/).first().waitFor();
 assert.equal(await page.getByRole('button',{name:'Save 1 drafts',exact:true}).isEnabled(),false);assert.equal(storageWrites,1);
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 check('Signed-in native JSON intake previews checked local PNG without writes; confirmed save uploads once, saves one real draft, reads back and blocks duplicate retry');
}
