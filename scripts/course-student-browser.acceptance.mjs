import assert from 'node:assert/strict';
import { resolve } from 'node:path';
export async function verifyStudentCourse({page,context,app,api,course,topic,other,outline,requests,out}) {
  await context.route('https://www.youtube.com/iframe_api',r=>r.fulfill({contentType:'application/javascript',body:`window.YT={Player:class { constructor(el,config){ this.el=document.createElement('iframe');this.el.title='Synthetic YouTube player';this.el.src='https://www.youtube.com/embed/'+config.videoId;el.append(this.el);setTimeout(()=>config.events.onReady(),0); }getCurrentTime(){return 0}destroy(){this.el.remove()} }};window.onYouTubeIframeAPIReady?.();`}));
  await context.route('https://www.youtube.com/embed/**',r=>r.fulfill({contentType:'text/html',body:'Synthetic player fixture'}));
  requests.length=0;
  await page.goto(app+'/courses');await page.getByRole('button',{name:'View Course',exact:true}).click();
  await page.getByRole('heading',{name:'Unit 1: Synthetic Unit'}).waitFor();
  assert.equal(requests.filter(p=>p.endsWith('/get_course_topic')).length,0);
  assert.equal(requests.filter(p=>p.endsWith('/iframe_api')).length,0);
  assert.equal(requests.filter(p=>p.endsWith('/course_videos')).length,0);
  assert.equal(await page.getByRole('button',{name:/1.2.*Synthetic Draft/}).count(),0);
  await page.getByRole('button',{name:/1.1.*Synthetic Topic/}).click();
  await page.getByTitle('Synthetic YouTube player').waitFor();
  assert.equal(requests.filter(p=>p.endsWith('/get_course_topic')).length,1);
  assert.equal(await page.locator('iframe[title="Synthetic YouTube player"]').count(),1);
  assert.equal(await page.getByText('Notes & PDF',{exact:true}).count(),0);
  await page.getByRole('button',{name:/1.1.*Synthetic Topic/}).click();await page.getByTitle('Synthetic YouTube player').waitFor({state:'detached'});assert.equal(await page.getByTitle('Synthetic YouTube player').count(),0);
  await page.getByRole('button',{name:/1.1.*Synthetic Topic/}).click();await page.getByTitle('Synthetic YouTube player').waitFor();
  await page.reload();await page.getByTitle('Synthetic YouTube player').waitFor();
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:resolve(out,'student-mobile.png')});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.setViewportSize({width:1024,height:768});await page.screenshot({path:resolve(out,'student-tablet.png')});
  if(process.env.O2I_COURSE_GAME_BROWSER){await (await import('./course-game-browser.acceptance.mjs')).verifyCourseGame({page,context,api,course,topic,other,requests});}
  if(process.env.O2I_COURSE_PRACTICE_BROWSER){await (await import('./course-practice-browser.acceptance.mjs')).verifyCoursePracticeBrowser({page,context,app,api,course,topic,other});}
  console.log('PASS course student browser: outline without video query, draft title only, detail/player fetched on expand, unload on collapse, refresh deep link, phone/tablet layout');
}
