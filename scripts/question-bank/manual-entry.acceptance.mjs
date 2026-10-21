// Synthetic-only acceptance inside task4d's disposable Auth/PostgREST/PostgreSQL environment.
import assert from 'node:assert/strict';

export async function verifyManualQuestionBrowser({page,context,db,state,selectFixture,synthetic,writeRequests,check,output}) {
  const dialog=()=>page.getByRole('dialog',{name:'New question',exact:true});
  const button=name=>dialog().getByRole('button',{name,exact:true});
  const start=async()=>{await page.getByRole('button',{name:'New question',exact:true}).click();await dialog().getByText('Loading canonical Topics, Skills and existing question IDs…',{exact:true}).waitFor({state:'hidden'});};
  const fill=async id=>{
    for(const [label,value] of Object.entries({'External ID':id,'Source PDF filename':'synthetic-manual.pdf','Printed question number':'1',
      'Question stem':'Synthetic only \\(x^2\\)','Solution':'Synthetic only \\(2x\\)','Option A':'Synthetic A','Option B':'Synthetic B','Option C':'Synthetic C','Option D':'Synthetic D'}))await dialog().getByLabel(label,{exact:true}).fill(value);
    await dialog().getByLabel('Correct answer B',{exact:true}).check();
    await dialog().getByLabel(id+' Difficulty',{exact:true}).selectOption('easy');
    await dialog().getByLabel(id+' Course scope',{exact:true}).selectOption('AB');
    await dialog().getByLabel(id+' Representation',{exact:true}).selectOption('analytical');
    await dialog().getByLabel(id+' CED Topic',{exact:true}).selectOption('1.6');
    await dialog().getByLabel(id+' Physical PDF page',{exact:true}).fill('12');
    await dialog().getByLabel(/^1\.A ·/).check();
  };
  const cancel=async()=>{await button('Cancel').click();await page.getByRole('alertdialog').getByRole('button',{name:'Discard form',exact:true}).click();await dialog().waitFor({state:'hidden'});};
  const remove=async id=>{await db.query('DELETE FROM public.questions WHERE external_id=$1',[id]);};
  const id='synthetic-manual-browser';
  assert.equal(await page.getByRole('tab',{name:'Practice',exact:true}).count(),0);
  await selectFixture(synthetic);
  const fileBefore=await page.getByLabel('Choose question bank XLSX').inputValue();
  let before=await state();
  await start();await fill(id);await button('Check preview').click();
  await dialog().getByRole('region',{name:'New question preview',exact:true}).waitFor();
  assert.equal(await button('Save draft').isEnabled(),true);
  await page.keyboard.press('Escape');await page.getByRole('alertdialog').waitFor();
  await page.getByRole('alertdialog').getByRole('button',{name:'Keep editing',exact:true}).click();
  assert.equal(await dialog().getByLabel('External ID',{exact:true}).inputValue(),id);
  await cancel();assert.deepEqual(await state(),before);
  assert.equal(await page.getByLabel('Choose question bank XLSX').inputValue(),fileBefore);
  check('Manual preview/cancel makes zero writes and retains the XLSX work copy; old Practice tab is removed');
  await page.getByRole('button',{name:'Cancel',exact:true}).click();

  const referencePattern='**/rest/v1/curriculum_topics?*';
  await context.route(referencePattern,r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Synthetic reference outage'})}));
  await start();await dialog().getByLabel('External ID',{exact:true}).fill(id);
  await dialog().getByRole('button',{name:'Retry reference data',exact:true}).waitFor();
  assert.equal(await button('Save draft').isEnabled(),false);
  await context.unroute(referencePattern);
  await button('Retry reference data').click();await dialog().getByText('Loading canonical Topics, Skills and existing question IDs…',{exact:true}).waitFor({state:'hidden'});
  assert.equal(await dialog().getByLabel('External ID',{exact:true}).inputValue(),id);
  await fill(id);
  await dialog().getByLabel('Question stem',{exact:true}).fill('Bad \\(\\frac{1}\\)');await button('Check preview').click();
  assert.equal(await button('Save draft').isEnabled(),false);
  await dialog().getByLabel('Question stem',{exact:true}).fill('Synthetic only \\(x^2\\)');
  await button('Remove option B').click();assert.equal(await button('Save draft').isEnabled(),false);
  await button('Add option').click();await dialog().getByLabel('Option B',{exact:true}).fill('Synthetic B');await dialog().getByLabel('Correct answer B',{exact:true}).check();
  assert.equal(await button('Save draft').isEnabled(),true);
  await context.setOffline(true);await button('Save draft').click();await button('Check save status').waitFor();await context.setOffline(false);
  assert.equal(await dialog().getByLabel('Question stem',{exact:true}).inputValue(),'Synthetic only \\(x^2\\)');
  await button('Check save status').click();await dialog().getByText('No question with this external ID was found.',{exact:false}).waitFor();
  const writes=writeRequests.filter(name=>name==='save_question_bank_drafts').length;
  await button('Save draft').evaluate(element=>{element.click();element.click();});await dialog().waitFor({state:'hidden'});
  assert.equal(writeRequests.filter(name=>name==='save_question_bank_drafts').length,writes+1);
  const result=await db.query(`SELECT q.status,q.current_version_id,v.status AS version_status,v.stem,v.import_evidence,
    (SELECT count(*)::int FROM public.question_options o WHERE o.question_version_id=v.id) AS options
    FROM public.questions q JOIN public.question_versions v ON v.question_id=q.id WHERE q.external_id=$1`,[id]);
  assert.equal(result.rows.length,1);const saved=result.rows[0];
  assert.equal(saved.status,'draft');assert.equal(saved.version_status,'draft');assert.equal(saved.current_version_id,null);
  assert.equal(saved.options,4);assert.equal(saved.import_evidence.human_review_status,'pending');
  await page.getByRole('region',{name:'Saved drafts',exact:true}).getByRole('article',{name:'Problem '+id,exact:true}).waitFor();
  check('Manual form preserves inputs on reference/network failure, invalidates removed answers and bad math, and double click saves one verified unpublished draft');

  await start();await fill(id);await button('Check preview').click();assert.equal(await button('Save draft').isEnabled(),false);await cancel();
  check('Manual form rejects an existing external ID before writing');

  const uncertain=id+'-uncertain',savePattern='**/rest/v1/rpc/save_question_bank_drafts';
  await start();await fill(uncertain);await button('Check preview').click();
  await context.route(savePattern,async route=>{await route.fetch();await route.abort('failed');});
  await button('Save draft').click();await button('Check save status').waitFor();await context.unroute(savePattern);
  const afterCommit=writeRequests.filter(name=>name==='save_question_bank_drafts').length;
  await button('Check save status').click();await dialog().getByText('This external ID exists in the question bank.',{exact:false}).waitFor();
  assert.equal(await button('Save draft').count(),0);assert.equal(writeRequests.filter(name=>name==='save_question_bank_drafts').length,afterCommit);
  await cancel();assert.equal((await db.query('SELECT count(*)::int AS n FROM public.questions WHERE external_id=$1',[uncertain])).rows[0].n,1);
  check('Committed transaction with lost response is detected; form blocks duplicate resubmission');

  await page.setViewportSize({width:390,height:844});await start();await fill(id+'-narrow');await button('Check preview').click();
  assert.ok(await dialog().evaluate(element=>element.scrollWidth<=element.clientWidth),'No horizontal dialog overflow');
  await page.screenshot({path:output+'/manual-narrow.png'});await cancel();await page.setViewportSize({width:1280,height:960});
  await remove(id);await remove(uncertain);
  check('Narrow manual dialog is usable; synthetic manual records removed from disposable database');
}
