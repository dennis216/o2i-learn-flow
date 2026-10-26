// Actual local Auth + PostgREST + database + course/quiz UI. Only synthetic content in disposable services.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
export async function verifyCourseContentIntegration({db,topics,admin,student,other,visitor,rpc,fixture,check,page,context,app,login,shot}) {
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
 const ab='93124428-92f4-48d2-a6dc-e5f9e010248b',bc='fccc7540-0c29-43be-8682-ae90ff2534cb';
 const t1=topics.find(t=>t.topic_code==='1.5').id,t2=topics.find(t=>t.topic_code==='1.6').id;
 await db.query(`ALTER TABLE public.courses ADD COLUMN category text DEFAULT 'High School',ADD COLUMN image_url text;
 ALTER TABLE public.course_videos ADD COLUMN description text,ADD COLUMN duration integer;
 CREATE TABLE IF NOT EXISTS storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 CREATE TABLE IF NOT EXISTS storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text);
 ALTER TABLE public.course_videos ENABLE ROW LEVEL SECURITY;
 INSERT INTO public.courses(id,title,description,level,subject,price,is_published) VALUES('${ab}','AP Calculus AB','Local verification only','advanced','AP Calc',0,true),('${bc}','AP Calculus BC','Local verification only — synthetic video, real canonical directory','advanced','AP Calc',0,true);
 INSERT INTO public.course_curriculum_units SELECT c.id,u.id,u.unit_number FROM public.courses c CROSS JOIN public.curriculum_units u WHERE c.id IN ('${ab}','${bc}') AND u.unit_number=1;`);
 await db.query(read('docs/courses/production/10_deploy.sql'));
 const verification=(await db.query(read('docs/courses/production/20_verify_readonly.sql'))).rows[0];assert.equal(verification.all_checks_pass,true,JSON.stringify(verification));
 await db.query("NOTIFY pgrst,'reload schema'");
 for(let n=0;;n++){const r=await student.rpc('get_course_outline',{_course_id:bc});if(!r.error)break;if(n>40)throw r.error;await new Promise(r=>setTimeout(r,200));}
 const video={id:randomUUID(),title:'Local video preview · supplied YouTube URL goes here',video_url:'https://youtu.be/abcdefghijk'};
 const save=(c,t,p,v)=>rpc(admin,'save_course_topic',{_course_id:c,_topic_id:t,_is_published:p,_videos:v,_game_path:null});
 await save(bc,t1,false,[video]);await assert.rejects(rpc(student,'get_course_topic',{_course_id:bc,_topic_id:t1}));
 await save(bc,t1,true,[video]);await save(bc,t2,false,[video]);
 assert.equal((await rpc(student,'get_course_outline',{_course_id:bc}))[0].topics.length,16);
 assert.equal((await rpc(student,'get_course_topic',{_course_id:bc,_topic_id:t1})).videos[0].id,video.id);
 await assert.rejects(rpc(other,'save_course_topic',{_course_id:bc,_topic_id:t1,_is_published:true,_videos:[video]}));
 await fixture('1.5',true,'medium',{course_scope:'BC'});await fixture('1.5',true,'medium',{course_scope:'BOTH'});
 await save(ab,t1,true,[{...video,id:randomUUID()}]);
 const a=await rpc(student,'start_course_question_practice',{_session_id:randomUUID(),_course_id:ab,_topic_id:t1});assert.ok(a.questions.every(q=>q.course_scope!=='BC'));
 const b=await rpc(student,'start_course_question_practice',{_session_id:randomUUID(),_course_id:bc,_topic_id:t1});assert.equal(b.course_id,bc);await assert.rejects(rpc(other,'get_question_practice',{_session_id:b.id}));
 check('Courses actual Auth/REST/database: exact release package, Draft isolation, 16 canonical titles, shared video, admin writes, course scopes and account isolation');
 await login(0);await page.goto(app+'/admin');await page.getByRole('heading',{name:'Course Content',exact:true}).waitFor();await page.getByLabel('Course',{exact:true}).selectOption(bc);await page.getByLabel('Unit / Topic',{exact:true}).selectOption(t1);
 await page.getByLabel('Video 1 title').fill('Local video preview · test environment');await page.getByRole('button',{name:'Save lesson',exact:true}).click();await page.getByRole('status').filter({hasText:'Published changes are visible immediately'}).waitFor();
 assert.equal((await rpc(student,'get_course_topic',{_course_id:bc,_topic_id:t1})).videos[0].title,'Local video preview · test environment');await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:new URL('../node_modules/.cache/student-practice/course-01-admin-real-local.png',import.meta.url).pathname,fullPage:true});
 await context.route('https://www.youtube.com/iframe_api',r=>r.fulfill({contentType:'application/javascript',body:`window.YT={Player:class{constructor(el,c){this.frame=document.createElement('iframe');this.frame.title='Local video preview';this.frame.style='width:100%;height:100%;border:0';this.frame.srcdoc='<html><body style="margin:0;display:grid;place-items:center;background:#132443;color:white;font-family:system-ui;height:100vh"><div style="text-align:center"><div style="font-size:54px">▶</div><h2>YouTube video</h2><p>Local preview · awaiting your real video URL</p></div></body></html>';el.append(this.frame);setTimeout(()=>c.events.onReady(),0)}getCurrentTime(){return 0}destroy(){this.frame.remove()}}};window.onYouTubeIframeAPIReady?.();`}));
 await login(1);await page.goto(app+'/courses?course='+bc);await page.getByRole('heading',{name:'Unit 1: Limits and Continuity',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:/1.6.*Determining Limits Using Algebraic Manipulation/}).count(),0);
 await page.getByRole('button',{name:/1.5.*Determining Limits Using Algebraic Properties/}).click();await page.getByRole('link',{name:'Go to Practice',exact:true}).waitFor();await page.getByTitle('Local video preview').waitFor();await shot('course-02-student-real-local');await page.getByRole('link',{name:'Go to Practice',exact:true}).scrollIntoViewIfNeeded();await shot('course-02b-topic-practice-real-local');
 await page.setViewportSize({width:390,height:844});await page.getByTitle('Local video preview').waitFor();await page.getByRole('button',{name:/1.5.*Determining Limits Using Algebraic Properties/}).evaluate(el=>{const body=el.closest('[data-dialog-body]');body.scrollTop+=el.getBoundingClientRect().top-body.getBoundingClientRect().top-20;});await shot('course-03-phone-real-local');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.setViewportSize({width:1024,height:768});await page.getByTitle('Local video preview').waitFor();await shot('course-04-tablet-real-local');
 await page.getByRole('link',{name:'Go to Practice',exact:true}).click();await page.getByRole('heading',{name:/Question 1 of/}).waitFor();await page.getByRole('button',{name:'Option A',exact:true}).click();await page.getByRole('button',{name:'Submit answer',exact:true}).click();await page.getByRole('region',{name:'Saved answer',exact:true}).waitFor();
 const sessionId=new URL(page.url()).searchParams.get('session');assert.equal((await rpc(student,'get_question_practice',{_session_id:sessionId})).course_id,bc);await shot('course-05-practice-real-local');
 await page.reload();await page.getByRole('link',{name:'Back to Course',exact:true}).waitFor();await page.getByRole('link',{name:'Back to Course',exact:true}).click();await page.getByRole('link',{name:'Go to Practice',exact:true}).waitFor();
 await save(bc,t1,false,[video]);await page.reload();await page.getByRole('heading',{name:'Unit 1: Limits and Continuity',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:/1.5.*Determining Limits Using Algebraic Properties/}).count(),0);
 await page.getByText('Determining Limits Using Algebraic Properties of Limits',{exact:true}).waitFor();
 await assert.rejects(rpc(visitor,'get_course_topic',{_course_id:bc,_topic_id:t1}));
 check('Courses actual browser: admin edit persisted to server, published Topic→real scoped grading→refresh→return, Draft title only, phone/tablet screenshots');
}
