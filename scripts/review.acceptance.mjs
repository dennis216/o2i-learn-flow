// Runs only against the disposable database/accounts created by student-practice.test.mjs.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function verifyReviewDatabase({db,start,submit,rpc,student,other,visitor,topicId,check}) {
  const sessions=[], wrong=[], correct=[];
  const ownBefore=await rpc(student,'list_question_practice_attempts');
  try {
    for(let i=0;i<24;i++) {
      const s=await start(other,topicId);sessions.push(s.id);
      const q=s.questions[0],isCorrect=i>=12;
      const saved=await submit(other,s,q,q.options.find(o=>o.key===(isCorrect?'A':'B')).id);
      const a=saved.questions[0].attempt;assert.equal(a.is_correct,isCorrect);
      // Fixed past timestamps exercise deterministic ties without hiding later browser answers.
      await db.query('UPDATE public.question_practice_attempts SET submitted_at=$1 WHERE id=$2',[isCorrect?'2020-02-01T00:00:00Z':'2020-01-01T00:00:00Z',a.id]);
      (isCorrect?correct:wrong).push(a.id);
    }
    const recent=await rpc(other,'list_question_practice_attempts');
    const incorrect=await rpc(other,'list_question_practice_attempts',{_incorrect_only:true});
    assert.deepEqual(recent.map(a=>a.id),correct.sort().slice(0,10));assert.ok(recent.every(a=>a.is_correct));
    assert.deepEqual(incorrect.map(a=>a.id),wrong.sort().slice(0,10));assert.ok(incorrect.every(a=>!a.is_correct));
    assert.deepEqual(await rpc(other,'list_question_practice_attempts',{_incorrect_only:false}),recent);
    assert.deepEqual(await rpc(student,'list_question_practice_attempts'),ownBefore);
    assert.ok((await visitor.rpc('list_question_practice_attempts',{_incorrect_only:true})).error);
    assert.ok((await other.rpc('list_question_practice_attempts',{_incorrect_only:null})).error);
    check('Review RPC: latest 10, wrong answers beyond latest 10, deterministic ties, legacy compatibility, anonymous/null rejection and account isolation');
  } finally {
    await db.query('DELETE FROM public.question_practice_sessions WHERE id=ANY($1::uuid[])',[sessions]);
  }
}

export async function verifyReviewBrowser({page,context,app,start,submit,rpc,student,topicId,browserSession,check,shot}) {
  const history=()=>page.getByRole('list',{name:'Saved answer history'});
  const toggle=()=>page.getByRole('button',{name:'Only incorrect',exact:true});
  const review=()=>page.getByRole('link',{name:'Review',exact:true});
  await page.goto(app+'/practice');await review().waitFor();
  assert.equal(await review().getAttribute('href'),'/review');
  assert.equal(await page.getByRole('navigation').getByRole('link',{name:'Review',exact:true}).count(),0);
  const startButton=await page.getByRole('link',{name:'Start up to 5 questions',exact:false}).boundingBox();
  const reviewButton=await review().boundingBox();
  assert.ok(startButton&&reviewButton&&Math.abs(startButton.y-reviewButton.y)<1&&reviewButton.x>startButton.x);
  await shot('11-practice-review-desktop');
  await review().click();await history().waitFor();
  await page.setViewportSize({width:390,height:844});
  await page.goto(app+'/practice');await review().waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await shot('12-practice-review-mobile');
  await page.getByRole('button',{name:'Open menu',exact:true}).click();
  assert.equal(await page.getByRole('dialog').getByRole('link',{name:'Review',exact:true}).count(),0);
  await page.keyboard.press('Escape');await review().click();await history().waitFor();
  await page.setViewportSize({width:1280,height:960});
  check('Practice Review entry: beside start, desktop/mobile navigation, no global menu entry and no mobile overflow');
  await page.goto(app+'/review');await history().waitFor();
  const expected=await rpc(student,'list_question_practice_attempts');
  assert.equal(await history().getByRole('link').count(),expected.length);
  for(const [i,a] of expected.entries()) {
    const row=history().getByRole('listitem').nth(i);
    assert.equal(await row.getByRole('link').getAttribute('href'),`/quiz?session=${a.session_id}&question=${a.question_id}`);
    assert.ok((await row.innerText()).includes(`Topic ${a.topic_code} · ${a.topic_title}`));
    assert.equal(await row.locator('time').getAttribute('datetime'),a.submitted_at);
    assert.equal(await row.locator('time').innerText(),await page.evaluate(t=>new Date(t).toLocaleString(),a.submitted_at));
    assert.equal(await row.getByText(a.is_correct?'Correct':'Incorrect',{exact:true}).count(),1);
  }
  for(const text of ['Review cards','From your lessons','Saved moments','FAKE_LOCALSTORAGE']) assert.equal(await page.getByText(text,{exact:true}).count(),0);
  await shot('07-review-history');
  await toggle().click();await history().waitFor();
  assert.equal(await toggle().getAttribute('aria-pressed'),'true');
  const wrong=await rpc(student,'list_question_practice_attempts',{_incorrect_only:true});
  assert.equal(await history().getByRole('link').count(),wrong.length);assert.equal(await history().getByText('Correct',{exact:true}).count(),0);
  const saved=await rpc(student,'get_question_practice',{_session_id:browserSession});
  const target=saved.questions[1];
  await page.locator(`a[href="/quiz?session=${browserSession}&question=${target.question_id}"]`).click();
  await page.getByRole('heading',{name:'Question 2 of 2',exact:true}).waitFor();
  await page.getByRole('region',{name:'Saved answer',exact:true}).filter({hasText:'Incorrect'}).waitFor();
  await page.getByRole('heading',{name:'Solution',exact:true}).waitFor();
  await page.reload();await page.getByRole('heading',{name:'Question 2 of 2',exact:true}).waitFor();
  await page.getByRole('link',{name:'Back to Review',exact:true}).click();await history().waitFor();
  const partial=await start(student,topicId),q=partial.questions[0];
  await submit(student,partial,q,q.options.find(o=>o.key==='B').id);
  await page.reload();await history().waitFor();
  let startCalls=0;
  const countStarts=req=>{if(req.url().endsWith('/start_question_practice'))startCalls++;};page.on('request',countStarts);
  await page.locator(`a[href="/quiz?session=${partial.id}&question=${q.question_id}"]`).click();
  await page.getByRole('heading',{name:'Question 1 of 2',exact:true}).waitFor();
  await page.getByRole('region',{name:'Saved answer',exact:true}).filter({hasText:'Incorrect'}).waitFor();
  for(const [sid,qid] of [[partial.id,partial.questions[1].question_id],[partial.id,randomUUID()],[randomUUID(),q.question_id]]) {
    await page.goto(`${app}/quiz?session=${sid}&question=${qid}`);await page.getByRole('alert').waitFor();
    assert.equal(await page.getByRole('region',{name:'Saved answer',exact:true}).count(),0);
  }
  assert.equal(startCalls,0);page.off('request',countStarts);
  check('Review browser: real account fields/time, no sample data, wrong filter, exact completed/partial-session solution, refresh, invalid/unanswered links fail read-only');

  const pattern='**/rpc/list_question_practice_attempts';
  await page.route(pattern,r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Synthetic history outage'})}));
  await page.goto(app+'/review');await page.getByRole('alert').filter({hasText:'Could not load your saved answers'}).waitFor();
  assert.equal(await history().count(),0);await page.unroute(pattern);
  await page.getByRole('button',{name:'Retry',exact:true}).click();await history().waitFor();
  await page.route(pattern,r=>r.fulfill({status:200,contentType:'application/json',body:'[]'}));
  await page.goto(app+'/practice');await page.getByText('Your saved answers will appear here after you submit a published question.',{exact:true}).waitFor();
  await review().click();
  await page.reload();await page.getByText('Your saved answers will appear here after you submit a published question.',{exact:true}).waitFor();
  await toggle().click();await page.getByText('No incorrect answers in your account history.',{exact:true}).waitFor();
  await page.unroute(pattern);
  await page.route(pattern,r=>r.fulfill({status:200,contentType:'application/json',body:'[{}]'}));
  await toggle().click();await page.getByRole('alert').filter({hasText:'Could not verify account practice history'}).waitFor();await page.unroute(pattern);
  await page.getByRole('button',{name:'Retry',exact:true}).click();await history().waitFor();

  let release,arrived;
  const gate=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{arrived=resolve;});
  await page.route(pattern,async r=>{
    if(r.request().postDataJSON()?._incorrect_only) {const res=await r.fetch();arrived();await gate;await r.fulfill({response:res});}
    else await r.continue();
  });
  await toggle().click();await started;
  await page.getByRole('status').filter({hasText:'Loading your saved answers'}).waitFor();assert.equal(await history().count(),0);
  await toggle().click();await history().waitFor();const before=await history().innerText();
  const late=page.waitForResponse(r=>r.url().endsWith('/list_question_practice_attempts')&&r.request().postDataJSON()?._incorrect_only);
  release();await late;await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(await history().innerText(),before);assert.equal(await toggle().getAttribute('aria-pressed'),'false');await page.unroute(pattern);
  await page.setViewportSize({width:390,height:844});await shot('08-review-mobile');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.setViewportSize({width:1280,height:960});
  check('Review browser: history failure/retry, malformed response, distinct empty states, stale filter response ignored, loading hides old rows and mobile layout');
}

export async function verifyReviewAccountSwitch({page,context,app,other,login,browserSession,check}) {
  const pattern='**/rpc/list_question_practice_attempts';
  await page.goto(app+'/review');await page.getByRole('list',{name:'Saved answer history'}).waitFor();
  const authKey=await page.evaluate(()=>Object.keys(localStorage).find(key=>key.startsWith('sb-')&&key.endsWith('-auth-token')));assert.ok(authKey);
  const {data:{session:bSession}}=await other.auth.getSession();assert.ok(bSession);
  let release,arrived;
  const gate=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{arrived=resolve;});
  await page.route(pattern,async r=>{
    if(r.request().postDataJSON()?._incorrect_only) {const res=await r.fetch();arrived();await gate;await r.fulfill({response:res});}
    else await r.continue();
  });
  await page.getByRole('button',{name:'Only incorrect',exact:true}).click();await started;
  const late=page.waitForResponse(r=>r.url().endsWith('/list_question_practice_attempts')&&r.request().postDataJSON()?._incorrect_only);
  // Another tab switching its Supabase account must reset this still-mounted Review page.
  const switcher=await context.newPage();await switcher.goto(app+'/');
  await switcher.evaluate(async({key,session})=>{localStorage.setItem(key,JSON.stringify(session));const channel=new BroadcastChannel(key);channel.postMessage({event:'SIGNED_IN',session});channel.close();},{key:authKey,session:bSession});
  await page.getByText('Your saved answers will appear here after you submit a published question.',{exact:true}).waitFor();
  assert.equal(await page.getByRole('list',{name:'Saved answer history'}).count(),0);
  release();await late;await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(await page.getByRole('list',{name:'Saved answer history'}).count(),0);
  await page.unroute(pattern);await switcher.close();
  await page.goto(app+'/quiz?session='+browserSession+'&question='+randomUUID());await page.getByRole('alert').filter({hasText:'not available to your account'}).waitFor();
  await page.goto(app+'/review');await page.getByRole('button',{name:'Sign Out',exact:true}).click();
  await page.waitForURL(app+'/');assert.equal(await page.getByRole('list',{name:'Saved answer history'}).count(),0);await page.goto(app+'/review');
  await page.getByText('Sign in to review your saved answers.',{exact:true}).waitFor();assert.equal(await page.getByRole('list',{name:'Saved answer history'}).count(),0);
  await login(1);
  check('Review browser: cross-tab A-to-B switch resets mounted view/filter, late A response cannot refill B, foreign solution denied and logout removes history');
}
