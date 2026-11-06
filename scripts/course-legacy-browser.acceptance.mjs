import assert from 'node:assert/strict';
export async function verifyLegacyCourseLinks({page,context,app,api,course,topic,other}) {
 await context.route(api+'/rest/v1/rpc/resolve_course_video',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({course_id:course,topic_id:topic})}));
 await page.goto(app+'/learn');await page.waitForURL(app+'/courses');assert.equal(await page.getByText('AP Calculus pilot lessons',{exact:true}).count(),0);
 await page.goto(app+'/learn/limits-foundations');await page.waitForURL(app+'/courses');
 await page.goto(app+'/courses?video='+other+'&autoplay=true');await page.getByTitle('Synthetic YouTube player').waitFor();
 assert.equal(new URL(page.url()).searchParams.get('topic'),topic);assert.equal(new URL(page.url()).searchParams.has('autoplay'),false);
 await page.goto(app+'/practice/'+other);await page.waitForURL(u=>u.pathname==='/quiz'&&u.searchParams.get('course')===course);await page.getByRole('heading',{name:'Question 1 of 1'}).waitFor();
 console.log('PASS legacy browser: Learn/Lesson replaced, video link maps to published canonical Topic without autoplay, legacy practice reaches scoped quiz');
}
