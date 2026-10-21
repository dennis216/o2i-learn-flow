// Local synthetic data only; this module is called by the isolated acceptance harness.
import assert from 'node:assert/strict';
import { PRACTICE_CAPTURE_PREFIX } from '../src/lib/practiceCapture.ts';
export async function verifyAdaptationV2Browser({page,app,db,login,student,topics,v2Fixture,check,shot,userId}) {
  await page.setViewportSize({width:1280,height:960});
  await page.goto(app+'/practice');await page.getByRole('button',{name:'Sign Out',exact:true}).click();await page.getByRole('link',{name:'Sign In / Sign Up',exact:true}).waitFor();await login(1);
  const tid=topics.find(t=>t.topic_code==='3.3').id;
  await page.goto(app+'/quiz?topic='+tid);await page.getByRole('heading',{name:'Question 1 of 1'}).waitFor();
  await page.waitForFunction(prefix=>{const row=Object.entries(sessionStorage).find(([k])=>k.startsWith(prefix)&&!k.endsWith(':seen')&&!k.endsWith(':new'));return row&&JSON.parse(row[1]).milliseconds>=1000;},PRACTICE_CAPTURE_PREFIX);
  const hidden=await page.evaluate(prefix=>{
    Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});document.dispatchEvent(new Event('visibilitychange'));
    return JSON.parse(Object.entries(sessionStorage).find(([k])=>k.startsWith(prefix)&&!k.endsWith(':seen')&&!k.endsWith(':new'))[1]).milliseconds;
  },PRACTICE_CAPTURE_PREFIX);
  await page.waitForTimeout(1200);
  assert.equal(await page.evaluate(prefix=>JSON.parse(Object.entries(sessionStorage).find(([k])=>k.startsWith(prefix)&&!k.endsWith(':seen')&&!k.endsWith(':new'))[1]).milliseconds,PRACTICE_CAPTURE_PREFIX),hidden);
  await page.evaluate(()=>{delete document.visibilityState;document.dispatchEvent(new Event('visibilitychange'));});
  await page.getByRole('button',{name:'Option B',exact:true}).click();await page.getByRole('button',{name:'Option A',exact:true}).click();
  await page.getByRole('button',{name:'Pause',exact:true}).click();
  const paused=await page.evaluate(prefix=>JSON.parse(Object.entries(sessionStorage).find(([key])=>key.startsWith(prefix)&&key.endsWith(':seen')===false&&key.endsWith(':new')===false)[1]),PRACTICE_CAPTURE_PREFIX);
  assert.equal(paused.paused,true);assert.equal(paused.trajectory.length,2);assert.equal(paused.complete,true);
  await page.reload();await page.getByRole('button',{name:'Resume',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Option A',exact:true}).getAttribute('aria-pressed'),'true');
  const restored=await page.evaluate(prefix=>JSON.parse(Object.entries(sessionStorage).find(([key])=>key.startsWith(prefix)&&!key.endsWith(':seen')&&!key.endsWith(':new'))[1]),PRACTICE_CAPTURE_PREFIX);
  assert.deepEqual(restored,paused);
  await page.getByRole('button',{name:'Resume',exact:true}).click();
  await page.getByRole('button',{name:'Option B',exact:true}).click();await page.getByRole('button',{name:'Option A',exact:true}).click();await page.getByRole('button',{name:'Option A',exact:true}).click();
  assert.equal(await page.getByLabel('Selection trajectory',{exact:true}).count(),0);
  const response=page.waitForResponse(r=>r.url().endsWith('/submit_question_practice_v2')&&r.ok());
  await page.getByRole('button',{name:'Submit answer',exact:true}).click();const body=await(await response).json();
  await page.getByRole('region',{name:'Saved answer',exact:true}).waitFor();
  const a=body.questions[0].attempt;assert.equal(a.timing_complete,true);assert.equal(a.selection_trajectory.length,4);assert.equal(a.is_correct,true);
  assert.deepEqual(a.selection_trajectory.map(s=>s.option_id),[body.questions[0].options[1].id,body.questions[0].options[0].id,body.questions[0].options[1].id,body.questions[0].options[0].id]);
  assert.equal(await page.getByLabel('Selection trajectory',{exact:true}).locator('li').count(),4);
  const ownSession=body.id;await page.reload();await page.getByRole('heading',{name:'Practice complete'}).waitFor();assert.equal(await page.getByLabel('Selection trajectory',{exact:true}).locator('li').count(),4);await shot('v2-trajectory');
  check('Adaptation v2 browser: B/A/B/A trajectory, duplicate-click suppression, monotonic running time, hidden-tab pause, manual pause, same-tab refresh recovery, complete timed submission, post-submit-only correctness and saved history');

  await page.goto(app+'/profile');const panel=page.getByRole('region',{name:'Practice analysis',exact:true});
  await panel.getByText('Final accuracy',{exact:true}).waitFor();await panel.getByLabel('Time period',{exact:true}).selectOption('all');
  const uid=userId;
  const total=(await db.query('SELECT count(*)::int n FROM public.question_practice_attempts WHERE user_id=$1',[uid])).rows[0].n;
  await panel.getByText('Submitted answers',{exact:true}).locator('..').locator('dd').filter({hasText:new RegExp('^'+total+'$')}).waitFor();
  await panel.getByLabel('Time period',{exact:true}).selectOption('custom');await panel.getByLabel('From date').fill('2019-12-31');await panel.getByLabel('Through date').fill('2020-01-01');
  await panel.getByText('Submitted answers',{exact:true}).locator('..').locator('dd').filter({hasText:/^1$/}).waitFor();
  await page.route('**/rpc/get_question_practice_analysis',r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Synthetic analysis unavailable'})}));
  await panel.getByLabel('Time period',{exact:true}).selectOption('7');await panel.getByRole('alert').filter({hasText:'Synthetic analysis unavailable'}).waitFor();
  await page.unroute('**/rpc/get_question_practice_analysis');await panel.getByRole('button',{name:'Retry analysis'}).click();await panel.getByText('Final accuracy',{exact:true}).waitFor();
  await panel.getByLabel('Unit practice accuracy').locator('summary').first().click();await panel.getByRole('link',{name:/Topic/}).first().waitFor();
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await shot('v2-analysis-mobile');await page.setViewportSize({width:1280,height:960});
  check('Adaptation v2 browser: server-matched full-history statistics, custom local dates, Unit/Topic drilldown, real failure/retry and mobile layout');

  // A copied existing session has no local continuous capture and must not silently become reliable timing.
  const next=await student.rpc('start_question_practice',{_session_id:crypto.randomUUID(),_topic_id:tid});assert.ifError(next.error);
  await page.goto(app+'/quiz?session='+next.data.id);await page.getByText('Timing or selection history is incomplete.',{exact:false}).waitFor();
  await page.getByRole('button',{name:'Option B',exact:true}).click();
  await page.getByRole('button',{name:'Sign Out',exact:true}).click();await page.getByRole('link',{name:'Sign In / Sign Up',exact:true}).waitFor();
  assert.equal(await page.evaluate(prefix=>Object.keys(sessionStorage).filter(k=>k.startsWith(prefix)).length,PRACTICE_CAPTURE_PREFIX),0);
  await login(2);await page.goto(app+'/quiz?session='+ownSession);await page.getByRole('alert').filter({hasText:'not available to your account'}).waitFor();assert.equal(await page.getByLabel('Selection trajectory',{exact:true}).count(),0);
  await page.goto(app+'/practice');await page.getByRole('button',{name:'Sign Out',exact:true}).click();await page.getByRole('link',{name:'Sign In / Sign Up',exact:true}).waitFor();
  await login(0);await page.getByRole('link',{name:'Admin',exact:true}).click();await page.getByRole('tab',{name:'Question Bank',exact:true}).click();
  const published=page.getByLabel('Published problems',{exact:true});
  await published.getByRole('status').waitFor({state:'hidden'});
  const preview=published.getByRole('button',{name:'Preview '+v2Fixture.externalId+' published version',exact:true});
  for(let i=0;i<20 && !(await preview.count());i++) {
    const next=published.getByRole('button',{name:'Next',exact:true});assert.equal(await next.isEnabled(),true,'Expected historical-statistics fixture in the published list');
    await Promise.all([page.waitForResponse(r=>r.url().includes('/rest/v1/questions?')&&r.ok()),next.click()]);
    await published.getByText(new RegExp('^Page '+(i+2)+' of ')).waitFor();
  }
  await preview.click();
  const stats=page.getByRole('region',{name:'Question practice statistics',exact:true});
  await stats.getByText('Overall accuracy',{exact:true}).waitFor();
  await stats.getByLabel('Statistics version').selectOption({label:'Version 1'});
  await stats.getByText('Overall accuracy',{exact:true}).locator('..').locator('dd').filter({hasText:'0.0% (0/1)'}).waitFor();
  await page.route('**/rpc/get_question_practice_admin_statistics',r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Synthetic statistics unavailable'})}));
  await stats.getByLabel('Time period',{exact:true}).selectOption('30');await stats.getByRole('alert').waitFor();await page.unroute('**/rpc/get_question_practice_admin_statistics');await stats.getByRole('button',{name:'Retry statistics'}).click();await stats.getByText('Overall accuracy',{exact:true}).waitFor();
  await shot('v2-admin-statistics');
  check('Adaptation v2 browser: incomplete capture warning, logout draft cleanup, foreign saved trajectory denied, actual Admin current/history version statistics and retry');
}
