import assert from 'node:assert/strict';
import { resolve } from 'node:path';
export async function verifyStudentCourse({page,context,app,api,course,topic,other,outline,requests,out}) {
  await context.route('https://www.youtube.com/iframe_api',r=>r.fulfill({contentType:'application/javascript',body:`window.YT={Player:class { constructor(el,config){ this.el=document.createElement('iframe');this.el.title='Synthetic YouTube player';this.el.src='https://www.youtube.com/embed/'+config.videoId;this.el.width='640';this.el.height='360';el.replaceWith(this.el);setTimeout(()=>config.events.onReady(),0); }getCurrentTime(){return 0}destroy(){this.el.remove()} }};window.onYouTubeIframeAPIReady?.();`}));
  await context.route('https://www.youtube.com/embed/**',r=>r.fulfill({contentType:'text/html',body:'Synthetic player fixture'}));
  await context.route(api+'/rest/v1/rpc/get_admin_access',r=>r.fulfill({contentType:'application/json',body:'{}'}));
  requests.length=0;
  await page.goto(app+'/courses');await page.getByRole('button',{name:'View Course',exact:true}).first().click();
  await page.getByRole('heading',{name:'Unit 1: Synthetic Unit'}).waitFor();
  assert.equal(requests.filter(p=>p.endsWith('/get_course_topic')).length,0);
  assert.equal(requests.filter(p=>p.endsWith('/iframe_api')).length,0);
  assert.equal(requests.filter(p=>p.endsWith('/course_videos')).length,0);
  assert.equal(await page.getByRole('button',{name:/1.2.*Synthetic Draft/}).count(),0);
  for(const title of ['Synthetic Topic','Synthetic Draft']){const style=await page.getByText(title,{exact:true}).evaluate(el=>({size:getComputedStyle(el).fontSize,weight:getComputedStyle(el).fontWeight,color:getComputedStyle(el).color}));assert.equal(style.size,'14px');assert.equal(style.weight,'500');assert.notEqual(style.color,'rgb(100, 116, 139)');}
  await page.getByRole('button',{name:/1.1.*Synthetic Topic/}).click();
  await page.getByTitle('Synthetic YouTube player').waitFor();
  assert.equal(requests.filter(p=>p.endsWith('/get_course_topic')).length,1);
  assert.equal(await page.locator('iframe[title="Synthetic YouTube player"]').count(),1);
  const bounds=await page.getByTitle('Synthetic YouTube player').boundingBox();assert.ok(Math.abs(bounds.width/bounds.height-16/9)<.02);
  const dialog=await page.getByRole('dialog').boundingBox();assert.ok(dialog.width>=1279 && dialog.height>=959);
  await page.screenshot({path:resolve(out,'student-desktop.png')});
  assert.equal(await page.getByText('Notes & PDF',{exact:true}).count(),0);
  await page.getByRole('button',{name:/1.1.*Synthetic Topic/}).click();await page.getByTitle('Synthetic YouTube player').waitFor({state:'detached'});assert.equal(await page.getByTitle('Synthetic YouTube player').count(),0);
  await page.getByRole('button',{name:/1.1.*Synthetic Topic/}).click();await page.getByTitle('Synthetic YouTube player').waitFor();
  await page.reload();await page.getByTitle('Synthetic YouTube player').waitFor();
  await page.setViewportSize({width:390,height:844});await page.getByTitle('Synthetic YouTube player').waitFor();await page.screenshot({path:resolve(out,'student-mobile.png')});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.setViewportSize({width:1024,height:768});await page.getByTitle('Synthetic YouTube player').waitFor();await page.screenshot({path:resolve(out,'student-tablet.png')});
  if(process.env.O2I_COURSE_GAME_BROWSER){await (await import('./course-game-browser.acceptance.mjs')).verifyCourseGame({page,context,api,course,topic,other,requests,out});}
  if(process.env.O2I_COURSE_PRACTICE_BROWSER){await (await import('./course-practice-browser.acceptance.mjs')).verifyCoursePracticeBrowser({page,context,app,api,course,topic,other});}
  if(process.env.O2I_COURSE_LEGACY_BROWSER){await (await import('./course-legacy-browser.acceptance.mjs')).verifyLegacyCourseLinks({page,context,app,api,course,topic,other});}
  await context.route(api+'/rest/v1/rpc/list_course_practice_topics',r=>r.fulfill({contentType:'application/json',body:'[]'}));
  await page.goto(app+'/courses?course='+course+'&topic='+topic);await page.getByText('Practice for this topic is being prepared. Stay tuned.',{exact:true}).waitFor();assert.equal(await page.getByRole('link',{name:'Start practice',exact:true}).count(),0);await page.screenshot({path:resolve(out,'practice-coming-soon.png')});
  await context.route(api+'/rest/v1/rpc/list_course_practice_topics',r=>r.fulfill({status:500,contentType:'application/json',body:JSON.stringify({message:'Synthetic failure'})}));
  await page.reload();await page.getByText(/Practice availability could not be checked/).waitFor();assert.equal(await page.getByText('Practice for this topic is being prepared. Stay tuned.',{exact:true}).count(),0);
  await context.route(api+'/rest/v1/rpc/list_course_practice_topics',r=>r.fulfill({contentType:'application/json',body:JSON.stringify([{id:topic,question_count:1}])}));await page.getByRole('button',{name:'Retry practice availability'}).click();await page.getByRole('link',{name:'Start practice',exact:true}).waitFor();
  console.log('PASS practice availability: scoped direct entry, no-question message, failure distinct from empty, retry');
  console.log('PASS course student browser: outline without video query, draft title only, detail/player fetched on expand, unload on collapse, refresh deep link, phone/tablet layout');
}
