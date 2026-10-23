// Browser UI/network fixtures only; database authorization is tested separately.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
const { chromium } = await import(process.env.O2I_PLAYWRIGHT_MODULE ?? '/Users/mucenyao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const app='http://127.0.0.1:5194',api='http://127.0.0.1:55529';
const course='fccc7540-0c29-43be-8682-ae90ff2534cb',topic='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',uid='33333333-3333-4333-8333-333333333333';
const outline=[{id:other,unit_number:1,title:'Synthetic Unit',topics:[{id:topic,code:'1.1',title:'Synthetic Topic',is_published:false},{id:other,code:'1.2',title:'Synthetic Draft',is_published:false}]}];
const ab='93124428-92f4-48d2-a6dc-e5f9e010248b';
let content={course_id:course,topic_id:topic,is_published:false,game_path:null,videos:[],lesson_id:null,revision:0,owner_course_id:course,linked_courses:[]},saved;
let otherContent={...content,course_id:ab,owner_course_id:ab};
const savedRows=()=>content.lesson_id ? [{lesson_id:content.lesson_id,topic_id:topic,topic_code:'1.1',topic_title:'Synthetic Topic',is_published:content.is_published,revision:content.revision,owner_course_id:course,owner_course_title:'AP Calculus BC',archived:false,courses:content.linked_courses}] : [];
let outlineRevision=0;
let entries=outline[0].topics.map(t=>({...t,entry_id:t.id,content_id:null,cb_topics:[{id:t.id,code:t.code,title:t.title}]}));
let archivedEntries=[];
const customOutline=()=>({revision:outlineRevision,units:[{...outline[0],topics:entries}]});
const anon=['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',Buffer.from(JSON.stringify({role:'anon'})).toString('base64url'),'synthetic'].join('.');
let browser, page;
let createdCourse=false;
const stage=Number(process.env.O2I_OUTLINE_STAGE ?? 2);
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5194','--strictPort'],{env:{...process.env,VITE_LOCAL_SUPABASE_URL:api,VITE_LOCAL_SUPABASE_ANON_KEY:anon},stdio:'ignore'});
const out=resolve('docs/courses/custom-management/screenshots');mkdirSync(out,{recursive:true});
try{
 for(let n=0;;n++){try{if((await fetch(app)).ok)break;}catch{}if(n>150)throw new Error('Vite startup timeout');await new Promise(r=>setTimeout(r,200));}
 browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const context=await browser.newContext({viewport:{width:1280,height:960}});
 const requests=[];
 const routeFixture=async route=>{
   const u=new URL(route.request().url());requests.push(u.pathname);
   if(u.origin===api){
     let body=[];
     const fn=u.pathname.split('/').at(-1);
     if(fn==='has_role')body=true;
     else if(fn==='is_super_admin')body=false;
     else if(fn==='profiles')body={user_id:uid,full_name:'Synthetic admin'};
     else if(fn==='courses'){ const all=[{id:course,title:'AP Calculus BC',practice_course_scope:'BC',category:'High School',subject:'AP Calc',is_published:true,level:'advanced',price:0,description:'Synthetic browser fixture'},{id:ab,title:'AP Calculus AB',practice_course_scope:'AB',category:'High School',subject:'AP Calc',is_published:true,level:'advanced',price:0,description:'Synthetic browser fixture'}];body=u.searchParams.get('id') ? all.filter(c=>'eq.'+c.id===u.searchParams.get('id')) : all; }
     else if(fn==='get_course_outline')body=outline;
     else if(fn==='get_course_outline_v2')body=customOutline();
     else if(fn==='resolve_course_entry'){const a=route.request().postDataJSON();body=entries.find(e=>e.is_published&&(!a._topic_id||e.cb_topics.some(t=>t.id===a._topic_id)))?.id??null;}
     else if(fn==='resolve_course_video')body={course_id:course,entry_id:entries.find(e=>e.is_published)?.id,topic_id:topic};
     else if(fn==='list_course_outline_archive')body=archivedEntries;
     else if(fn==='get_course_outline_entry'){const a=route.request().postDataJSON();body={...content,course_id:a._course_id,entry_id:a._entry_id};}
     else if(fn==='edit_course_outline'){
       const a=route.request().postDataJSON(),p=a._payload;assert.equal(a._expected_revision,outlineRevision);outlineRevision++;
       if(a._action==='save'){if(p.entry_id){const e=entries.find(e=>e.id===p.entry_id);e.title=p.title;e.cb_topics=outline[0].topics.filter(t=>p.topic_ids.includes(t.id)).map(t=>({id:t.id,code:t.code,title:t.title}));body=e.id;}else{const id=crypto.randomUUID();entries.push({id,entry_id:id,title:p.title,code:'1.1',is_published:false,cb_topics:[{id:topic,code:'1.1',title:'Synthetic Topic'}]});body=id;}}
       else if(a._action==='merge'){const chosen=entries.filter(e=>p.entry_ids.includes(e.id));archivedEntries.push(...chosen.map(e=>({entry_id:e.id,title:e.title,topic_ids:e.cb_topics.map(t=>t.id)})));const id=crypto.randomUUID();entries=entries.filter(e=>!p.entry_ids.includes(e.id));entries.push({id,entry_id:id,title:p.title,code:'1.1 · 1.2',is_published:false,cb_topics:chosen.flatMap(e=>e.cb_topics)});body=id;}
       else if(a._action==='reorder'){entries=p.entry_ids.map(id=>entries.find(e=>e.id===id));body=null;}
       else if(a._action==='split'||a._action==='remove'){const e=entries.find(e=>e.id===p.entry_id);archivedEntries.push({entry_id:e.id,title:e.title,topic_ids:e.cb_topics.map(t=>t.id)});entries=entries.filter(x=>x.id!==e.id);for(const t of e.cb_topics)if(!entries.some(e=>e.cb_topics.some(c=>c.id===t.id)))entries.push({...t,entry_id:t.id,is_published:false,cb_topics:[t]});body=null;}
     }
     else if(fn==='save_course_outline_content'){const a=route.request().postDataJSON();content={...content,lesson_id:content.lesson_id??other,revision:content.revision+1,entry_id:a._entry_id,is_published:a._is_published,videos:a._videos.map((v,n)=>({...v,id:v.id??crypto.randomUUID(),course_id:course,order_index:n})),game_path:a._game_path,linked_courses:[{id:course,title:'AP Calculus BC'}]};const e=entries.find(e=>e.id===a._entry_id);if(e){e.is_published=a._is_published;e.content_id=content.lesson_id;}body=null;}

     else if(fn==='create_managed_course'){const args=route.request().postDataJSON();assert.equal(args._scope,'AB');assert.equal(args._details.title,'Synthetic new course');createdCourse=true;body=ab;}
     else if(fn==='subjects')body=[{id:other,name:'AP Calc',category:'High School',order_index:0}];
     else if(fn==='list_course_practice_topics')body=[{id:topic,question_count:1}];
     else if(fn==='get_course_topic')body=route.request().postDataJSON()._course_id===ab ? otherContent : content;
     else if(fn==='list_saved_course_lessons')body=savedRows();
     else if(fn==='save_course_topic'||fn==='save_course_lesson'){
       saved=route.request().postDataJSON();
       content={...content,lesson_id:content.lesson_id??other,revision:content.revision+1,linked_courses:content.linked_courses.length?content.linked_courses:[{id:course,title:'AP Calculus BC'}],is_published:saved._is_published,game_path:saved._game_path,videos:saved._videos.map((v,n)=>({...v,id:v.id??other,course_id:course,order_index:n}))};
       outline[0].topics[0].is_published=saved._is_published;body=null;
     }
     else if(fn==='share_course_lesson'){ const args=route.request().postDataJSON();assert.equal(args._expected_lesson_id,content.lesson_id);assert.equal(args._expected_revision,content.revision);assert.equal(args._expected_other_revision,otherContent.revision);content={...content,revision:content.revision+1,linked_courses:[{id:course,title:'AP Calculus BC'},{id:ab,title:'AP Calculus AB'}]};otherContent={...content,course_id:ab};body=null; }
     else if(fn==='restore_course_lesson'){content={...content,lesson_id:uid,revision:1,is_published:false,linked_courses:[{id:course,title:'AP Calculus BC'}]};outline[0].topics[0].is_published=false;body=null;}
     else if(fn==='list_course_video_library'){body=content.videos.map(v=>({...v,metadata_revision:v.metadata_revision??1,reference_count:1,courses:{title:'AP Calculus BC'},usage:[{course_id:ab,course_title:'AP Calculus AB',entry_id:topic,lesson_title:'Combined limits',archived:false},{course_id:course,course_title:'AP Calculus BC',entry_id:other,lesson_title:'Shared limits',archived:false}]}));}
     else if(fn==='save_course_video_metadata'){const a=route.request().postDataJSON();assert.equal(a._expected_revision,1);assert.equal(a._details.transcript[0].t,'Updated transcript');content.videos=content.videos.map(v=>v.id===a._video_id?{...v,...a._details,metadata_revision:2}:v);body=null;}
     else if(fn==='course_videos')body=content.videos;
     else if(fn==='course_topic_content')body=content.videos.length ? [{course_id:course,topic_id:topic,is_published:content.is_published}] : [];
     return route.fulfill({status:200,headers:{'access-control-allow-origin':app,'access-control-allow-headers':'*','access-control-allow-methods':'*'},contentType:'application/json',body:JSON.stringify(body)});
   }
   if(u.origin!==app)return route.abort();
   return route.continue();
 };
 await context.route('**/*',routeFixture);
 const token=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:uid,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.synthetic';
 await context.addInitScript(({token,uid})=>{if(window.top!==window)return;localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:token,refresh_token:'synthetic',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user:{id:uid,aud:'authenticated',role:'authenticated',email:'synthetic@example.test',app_metadata:{provider:'email'},user_metadata:{}}}));},{token,uid});
 page=await context.newPage();page.setDefaultTimeout(15000);
 page.on('pageerror',e=>console.error('PAGE',e.message));
 await page.goto(app+'/admin');await page.getByRole('heading',{name:'All Courses',exact:true}).waitFor();
 assert.equal(await page.getByRole('tab',{name:'Create Course',exact:true}).count(),0);
 assert.equal(await page.getByRole('tab',{name:'Subjects',exact:true}).count(),0);
 assert.equal(await page.getByRole('tab',{name:'Manage Videos',exact:true}).count(),0);
 await page.screenshot({path:resolve(out,'task2-courses.png'),fullPage:true});
 await page.getByRole('button',{name:'Manage content',exact:true}).first().click();
 await page.getByRole('heading',{name:'Course Content',exact:true}).waitFor();
 if(stage===2){assert.equal(await page.getByLabel('Course',{exact:true}).inputValue(),course);}
 await page.getByRole('button',{name:'Back to Courses',exact:true}).click();
 await page.getByRole('button',{name:'Create Course',exact:true}).click();
 await page.locator('#title').fill('Synthetic new course');
 await page.getByText('Select subject',{exact:true}).click();await page.getByRole('option',{name:'AP Calc',exact:true}).click();
 await page.getByText('Select level',{exact:true}).click();await page.getByRole('option',{name:'Advanced',exact:true}).click();
 await page.getByLabel('Curriculum template',{exact:true}).selectOption('AB');
 await page.screenshot({path:resolve(out,'task2-create-course.png'),fullPage:true});
 await page.getByRole('button',{name:'Create Course',exact:true}).click();
 await page.getByRole('heading',{name:'Course Content',exact:true}).waitFor();assert.equal(createdCourse,true);
 console.log('PASS task2: Courses entry, nested creation/subjects/videos, course context, creation routes directly to outline');
 if(stage>=3){
   assert.equal(await page.getByLabel('Unit / Topic',{exact:true}).count(),0);
   await page.getByRole('checkbox',{name:'Select Synthetic Topic',exact:true}).check();await page.getByRole('checkbox',{name:'Select Synthetic Draft',exact:true}).check();
   await page.getByRole('button',{name:'Merge selected lessons',exact:true}).click();
   await page.getByLabel('Lesson title shown to students',{exact:true}).fill('Limits: graphs and tables');
   await page.getByText('Selected content preview', {exact:false}).waitFor();
   await page.screenshot({path:resolve(out,'task3-merge-preview.png'),fullPage:true});
   page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Confirm merge',exact:true}).click();
   await page.getByRole('heading',{name:'Edit lesson',exact:true}).waitFor();
   assert.equal(entries.length,1);assert.equal(entries[0].cb_topics.length,2);
   await page.getByRole('dialog').last().getByRole('button',{name:'Close',exact:true}).click();
   await page.getByRole('button',{name:'Limits: graphs and tables CB 1.1 · 1.2',exact:true}).waitFor();
   await page.screenshot({path:resolve(out,'task3-outline.png'),fullPage:true});
   await page.getByRole('button',{name:'Limits: graphs and tables CB 1.1 · 1.2',exact:true}).click();
   await page.getByRole('button',{name:'Add YouTube video',exact:true}).click();await page.getByLabel('Video 1 title').fill('Combined limits video');await page.getByLabel('YouTube URL',{exact:true}).fill('https://youtu.be/abcdefghijk');
   await page.getByRole('button',{name:'Save draft',exact:true}).click();await page.getByRole('status').filter({hasText:'Draft saved'}).waitFor();
   await page.getByLabel('Lesson title shown to students',{exact:true}).fill('Unsaved title');page.once('dialog',d=>d.dismiss());await page.getByRole('dialog').last().getByRole('button',{name:'Close',exact:true}).click();assert.equal(await page.getByLabel('Lesson title shown to students',{exact:true}).inputValue(),'Unsaved title');
   page.once('dialog',d=>d.accept());await page.getByRole('dialog').last().getByRole('button',{name:'Close',exact:true}).click();
   await page.getByRole('button',{name:'Limits: graphs and tables CB 1.1 · 1.2',exact:true}).click();
   page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Split into Topic rows',exact:true}).click();await page.getByRole('heading',{name:'Edit lesson',exact:true}).waitFor({state:'detached'});assert.equal(entries.length,2);
   console.log('PASS task3: clickable outline, merged title/Topic mapping, chosen content preview, draft save, dirty-close cancellation, split restores Topic rows');
   if(stage>=4){
     await page.getByRole('button',{name:'Manage videos',exact:true}).click();await page.getByRole('heading',{name:'Course videos',exact:true}).waitFor();
     await page.getByRole('button',{name:'Edit',exact:true}).click();await page.getByRole('heading',{name:'Edit Video',exact:true}).waitFor();
     await page.getByText('Editing this video affects these saved lessons:',{exact:true}).waitFor();
     await page.getByLabel('Transcript (JSON)',{exact:true}).fill('[invalid');await page.getByRole('button',{name:'Save Changes',exact:true}).click();await page.getByText('Fix the transcript JSON before saving.',{exact:true}).waitFor();
     await page.getByLabel('Transcript (JSON)',{exact:true}).fill('[{"s":0,"t":"Updated transcript"}]');await page.getByLabel('Subtitle/Unit',{exact:true}).fill('Combined Topic coverage');
     await page.screenshot({path:resolve(out,'task4-video-metadata.png'),fullPage:true});
     await page.getByRole('button',{name:'Save Changes',exact:true}).click();await page.getByRole('heading',{name:'Edit Video',exact:true}).waitFor({state:'detached'});
     await page.getByText('Combined Topic coverage',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Delete Combined limits video',exact:true}).isDisabled(),true);
     await page.getByLabel('Show videos',{exact:true}).selectOption('all');await page.getByLabel('Search videos',{exact:true}).fill('Combined');await page.screenshot({path:resolve(out,'task4-video-library.png'),fullPage:true});
     console.log('PASS task4: nested video library, shared impact, raw invalid transcript retained and blocked, metadata round trip, referenced deletion disabled, filters/search');
     if(stage>=5){
       const mergedId='44444444-4444-4444-8444-444444444444',draftId='55555555-5555-4555-8555-555555555555';
       entries=[{id:mergedId,entry_id:mergedId,code:'1.1 · 1.2',title:'Limits: graphs and tables',is_published:true,content_id:content.lesson_id,cb_topics:outline[0].topics.map(t=>({id:t.id,code:t.code,title:t.title}))},{id:draftId,entry_id:draftId,code:'1.3',title:'Unprepared Topic',is_published:false,cb_topics:[{id:draftId,code:'1.3',title:'Unprepared Topic'}]}];content.is_published=true;
       await context.route('https://www.youtube.com/iframe_api',r=>r.fulfill({contentType:'application/javascript',body:`window.YT={Player:class { constructor(el,config){ this.el=document.createElement('iframe');this.el.title='Synthetic YouTube player';this.el.src='https://www.youtube.com/embed/'+config.videoId;el.replaceWith(this.el);setTimeout(()=>config.events.onReady(),0); }getCurrentTime(){return 0}destroy(){this.el.remove()} }};window.onYouTubeIframeAPIReady?.();`}));
       await context.route('https://www.youtube.com/embed/**',r=>r.fulfill({contentType:'text/html',body:'Synthetic player fixture'}));
       await context.route(api+'/rest/v1/rpc/has_role',r=>r.fulfill({contentType:'application/json',body:'false'}));requests.length=0;
       await page.goto(app+'/courses?course='+course);await page.getByRole('heading',{name:'Unit 1: Synthetic Unit'}).waitFor();assert.equal(requests.filter(p=>p.endsWith('/get_course_outline_entry')).length,0);
       await page.getByText('Unprepared Topic',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:/Unprepared Topic/}).count(),0);
       await page.getByRole('button',{name:'1.1 · 1.2 · Limits: graphs and tables',exact:true}).click();await page.getByTitle('Synthetic YouTube player').waitFor();
       assert.equal(await page.getByText('Limits: graphs and tables',{exact:true}).count(),1);await page.getByText('CB 1.2: Practice for this topic is being prepared. Stay tuned.',{exact:true}).waitFor();
       await page.screenshot({path:resolve(out,'task5-student-desktop.png'),fullPage:true});
       await page.setViewportSize({width:390,height:844});await page.screenshot({path:resolve(out,'task5-student-mobile.png'),fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.setViewportSize({width:1280,height:960});
       await (await import('./course-practice-browser.acceptance.mjs')).verifyCoursePracticeBrowser({page,context,app,api,course,topic,other,entryId:mergedId,practiceName:'Practice CB 1.1'});
       await context.route(api+'/rest/v1/rpc/list_course_practice_topics',r=>r.fulfill({contentType:'application/json',body:JSON.stringify([{id:topic,question_count:1},{id:other,question_count:1}])}));await page.reload();await page.getByRole('link',{name:'Practice CB 1.2',exact:true}).waitFor();
       await (await import('./course-practice-browser.acceptance.mjs')).verifyCoursePracticeBrowser({page,context,app,api,course,topic:other,other:topic,entryId:mergedId,practiceName:'Practice CB 1.2'});
       await page.goto(app+'/courses?course='+course+'&topic='+other);await page.getByTitle('Synthetic YouTube player').waitFor();assert.equal(new URL(page.url()).searchParams.get('lesson'),mergedId);
       await page.goto(app+'/courses?course='+course+'&video='+content.videos[0].id);await page.getByTitle('Synthetic YouTube player').waitFor();assert.equal(new URL(page.url()).searchParams.get('lesson'),mergedId);
       console.log('PASS task5: original Unit layout, merged title once, CB labels, uncovered Topic retained, lazy player, mobile width, both canonical Topic practice submits return to original lesson, old Topic/video links');
     }

   }

 }

}catch(error){console.error(error);if(page){console.error((await page.locator('body').innerText()).slice(0,2200));await page.screenshot({path:resolve(out,'custom-failure.png'),fullPage:true}).catch(()=>{});}process.exitCode=1;}
finally{if(browser)await browser.close();vite.kill('SIGTERM');await new Promise(r=>vite.exitCode!==null?r():vite.once('exit',r));}
