// Only the disposable Auth/REST/database/browser environment from student-practice.test.mjs.
import assert from 'node:assert/strict';
import { loadPracticeStatistics } from '../src/lib/studentPractice.ts';

async function identity(client) {
  const { data: { session } } = await client.auth.getSession();
  assert.ok(session);
  return session;
}
async function databaseStatistics(db, userId) {
  const { rows: [row] } = await db.query(`SELECT
    (SELECT count(*)::int FROM public.question_practice_sessions WHERE user_id=$1) AS "sessionCount",
    count(*)::int AS "attemptCount", count(*) FILTER (WHERE is_correct)::int AS "correctCount"
    FROM public.question_practice_attempts WHERE user_id=$1`, [userId]);
  return row;
}
export async function verifyProfileDatabase({db,start,submit,student,other,visitor,topicId,check}) {
  const userId=(await identity(other)).user.id, studentId=(await identity(student)).user.id;
  const before=await databaseStatistics(db,userId), sessions=[];
  try {
    for(let i=0;i<14;i++) {
      const s=await start(other,topicId);sessions.push(s.id);
      if(i===13) continue;
      const q=s.questions[0], option=q.options.find(o=>o.key===(i<6?'A':'B')).id;
      await submit(other,s,q,option);await submit(other,s,q,option);
    }
    assert.deepEqual(await loadPracticeStatistics(other,userId), {sessionCount:before.sessionCount+14,attemptCount:before.attemptCount+13,correctCount:before.correctCount+6});
    assert.deepEqual(await loadPracticeStatistics(other,userId),await databaseStatistics(db,userId));
    assert.deepEqual(await loadPracticeStatistics(student,userId),{sessionCount:0,attemptCount:0,correctCount:0});
    assert.deepEqual(await loadPracticeStatistics(other,studentId),{sessionCount:0,attemptCount:0,correctCount:0});
    await assert.rejects(loadPracticeStatistics(visitor,userId));
    check('Profile database: exact full-history counts beyond ten, unstarted/partial sets, repeat submissions counted once, RLS and anonymous rejection');
  } finally { await db.query('DELETE FROM public.question_practice_sessions WHERE id=ANY($1::uuid[])',[sessions]); }
}
export async function verifyProfileBrowser({page,context,app,db,start,student,other,login,topicId,check,shot}) {
  const a=await identity(student), b=await identity(other);
  const verify=async userId=>{
    await page.locator('dl[aria-label="Practice statistics"]').waitFor();
    const expected=await databaseStatistics(db,userId);
    assert.deepEqual(await page.locator('dl[aria-label="Practice statistics"] dd').allTextContents(),[String(expected.sessionCount),String(expected.attemptCount),expected.attemptCount?`${(expected.correctCount/expected.attemptCount*100).toFixed(1)}%`:'—']);
  };
  await page.goto(app+'/profile');await verify(a.user.id);await page.reload();await verify(a.user.id);
  for(const label of ['Courses Enrolled','Solutions Requested','Account Actions']) assert.equal(await page.getByText(label,{exact:true}).count(),0);
  for(const label of ['Change Password','Update Profile','Delete Account']) assert.equal(await page.getByRole('button',{name:label,exact:true}).count(),0);
  assert.equal(await page.locator('#email').inputValue(),a.user.email);
  assert.equal(await page.locator('#user-id').inputValue(),a.user.id);
  await shot('09-profile-statistics');
  const pattern='**/rest/v1/question_practice_attempts?*';
  await page.route(pattern,r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Synthetic count outage'})}));
  await page.reload();await page.getByRole('alert').filter({hasText:'Could not load your practice statistics'}).waitFor();
  assert.equal(await page.locator('dl[aria-label="Practice statistics"] dd').count(),0);await page.unroute(pattern);
  await page.getByRole('button',{name:'Retry',exact:true}).click();await verify(a.user.id);
  await page.route(pattern,r=>r.fulfill({status:200}));
  await page.reload();await page.getByRole('alert').filter({hasText:'Could not verify account practice statistics'}).waitFor();
  assert.equal(await page.locator('dl[aria-label="Practice statistics"] dd').count(),0);await page.unroute(pattern);
  check('Profile browser: database-matched counts, refresh, own account fields, hidden placeholders, outage/missing-count errors and retry');

  const authKey=await page.evaluate(()=>Object.keys(localStorage).find(k=>k.startsWith('sb-')&&k.endsWith('-auth-token')));assert.ok(authKey);
  const switcher=await context.newPage();await switcher.goto(app+'/');
  const switchAccount=async session=>switcher.evaluate(({key,session})=>{
    localStorage.setItem(key,JSON.stringify(session));const channel=new BroadcastChannel(key);channel.postMessage({event:'SIGNED_IN',session});channel.close();
  },{key:authKey,session});
  let release;
  const gate=new Promise(resolve=>{release=resolve;});
  const pending=[];
  const held=async r=>{const response=await r.fetch();await gate;await r.fulfill({response});};
  await page.route(pattern,r=>{
    if(new URL(r.request().url()).searchParams.get('user_id')===`eq.${a.user.id}`) return held(r);
    return r.continue();
  });
  // Old A role and profile responses arrive after B has loaded.
  const fromAccountA=request=>{try{return JSON.parse(Buffer.from(request.headers().authorization?.split('.')[1]??'','base64url').toString()).sub===a.user.id;}catch{return false;}};
  const rolePattern='**/rpc/get_admin_access';
  await page.route(rolePattern,async r=>{
    if(fromAccountA(r.request())) { await gate;await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({courses:true,questions:true,playground:true,team:true,users:true})}); }
    else await r.continue();
  });
  const profilePattern='**/rest/v1/profiles?*';
  await page.route(profilePattern,r=>new URL(r.request().url()).searchParams.get('user_id')===`eq.${a.user.id}`?held(r):r.continue());
  for(const match of [u=>u.includes('/question_practice_attempts?'),u=>u.endsWith('/get_admin_access'),u=>u.includes('/profiles?')]) pending.push(page.waitForRequest(r=>match(r.url())));
  await page.reload();await Promise.all(pending);await page.getByRole('status').filter({hasText:'Loading your practice statistics'}).waitFor();
  assert.equal(await page.locator('dl[aria-label="Practice statistics"] dd').count(),0);
  const late=page.waitForResponse(r=>r.url().endsWith('/get_admin_access')&&fromAccountA(r.request()));
  await switchAccount(b);await verify(b.user.id);
  assert.equal(await page.locator('#email').inputValue(),b.user.email);
  release();await late;await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await verify(b.user.id);assert.equal(await page.getByText('Super Admin',{exact:true}).count(),0);
  assert.equal(await page.getByRole('link',{name:'Admin',exact:true}).count(),0);
  await page.unroute(pattern);await page.unroute(rolePattern);await page.unroute(profilePattern);
  const bBefore=await databaseStatistics(db,b.user.id);
  assert.equal(bBefore.attemptCount,0);
  await page.getByText('No submitted answers yet.',{exact:false}).waitFor();
  const emptySet=await start(other,topicId);
  await page.reload();await verify(b.user.id);
  assert.equal((await databaseStatistics(db,b.user.id)).sessionCount,bBefore.sessionCount+1);
  assert.equal(await page.getByRole('link',{name:'Start practice',exact:true}).getAttribute('href'),'/practice');
  await page.setViewportSize({width:390,height:844});await shot('10-profile-mobile-empty');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.setViewportSize({width:1280,height:960});
  await db.query('DELETE FROM public.question_practice_sessions WHERE id=$1',[emptySet.id]);
  await switchAccount(null);await page.getByText('You need to be logged in to view your profile.',{exact:true}).waitFor();
  assert.equal(await page.locator('dl[aria-label="Practice statistics"] dd').count(),0);assert.equal(await page.locator('#email').count(),0);
  await switcher.close();await login(1);await page.goto(app+'/profile');await verify(a.user.id);
  await page.getByRole('button',{name:'Sign Out',exact:true}).click();await page.waitForURL(app+'/');
  await page.goto(app+'/profile');await page.getByText('You need to be logged in to view your profile.',{exact:true}).waitFor();
  assert.equal(await page.locator('dl[aria-label="Practice statistics"] dd').count(),0);await login(1);
  check('Profile browser: cross-tab A/B switch, late A counts/profile/super-admin responses ignored, zero-answer sets, mobile and both cross-tab/local logout');
}
