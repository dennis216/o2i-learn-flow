import assert from 'node:assert/strict';
export async function verifyCoursePracticeBrowser({page,context,app,api,course,topic,other,entryId,practiceName='Start practice'}) {
 let session;
 await context.route(api+'/rest/v1/rpc/start_course_question_practice',r=>{
   const args=r.request().postDataJSON();assert.equal(args._course_id,course);assert.equal(args._topic_id,topic);
   session={id:args._session_id,course_id:course,course_scope:'BC',topic_id:topic,created_at:new Date().toISOString(),questions:[{question_id:other,version_id:other,position:1,stem:'Synthetic course practice',difficulty:'easy',calculator_policy:null,course_scope:'BOTH',image_url:null,requires_figure:false,topic:{id:topic,code:'1.1',title:'Synthetic Topic'},skills:[],options:[{id:topic,key:'A',text:'Synthetic correct'},{id:other,key:'B',text:'Synthetic incorrect'}],attempt:null}]};
   return r.fulfill({contentType:'application/json',body:JSON.stringify(session)});
 });
 await context.route(api+'/rest/v1/rpc/submit_question_practice_v2',r=>{
   const args=r.request().postDataJSON();session.questions[0].attempt={id:other,selected_option_id:args._option_id,is_correct:true,submitted_at:new Date().toISOString(),elapsed_seconds:args._elapsed_seconds,correct_option_id:topic,solution:'Synthetic explanation',timing_complete:args._timing_complete,selection_trajectory:args._selection_trajectory};
   return r.fulfill({contentType:'application/json',body:JSON.stringify(session)});
 });
 await page.getByRole('link',{name:practiceName,exact:true}).click();await page.getByRole('heading',{name:'Question 1 of 1'}).waitFor();
 assert.equal(new URL(page.url()).searchParams.get('course'),course);
 assert.equal(await page.getByText(/expected|saved to your account/i).count(),0);
 await page.getByRole('button',{name:'Option A',exact:true}).click();await page.getByRole('button',{name:'Submit answer',exact:true}).click();await page.getByRole('region',{name:'Saved answer',exact:true}).waitFor();
 assert.equal(await page.getByText(/expected|saved to your account/i).count(),0);
 assert.match(await page.getByRole('region',{name:'Saved answer',exact:true}).innerText(),/Time: \d+ seconds/);
 await page.getByRole('button',{name:'Finish practice',exact:true}).click();await page.getByRole('heading',{name:'Practice complete',exact:true}).waitFor();
 assert.equal(await page.getByText(/expected|saved to your account/i).count(),0);
 await page.getByText('1/1 correct',{exact:true}).waitFor();
 await page.getByRole('link',{name:'Back to Course',exact:true}).click();await page.getByTitle('Synthetic YouTube player').waitFor();
 assert.equal(new URL(page.url()).searchParams.get(entryId ? 'lesson' : 'topic'),entryId ?? topic);
 console.log('PASS course practice browser: scoped entry, safe question render, submitted result and return to original expanded Topic');
}
