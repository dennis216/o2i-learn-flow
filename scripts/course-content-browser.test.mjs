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
const anon=['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',Buffer.from(JSON.stringify({role:'anon'})).toString('base64url'),'synthetic'].join('.');
let browser, page;
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5194','--strictPort'],{env:{...process.env,VITE_LOCAL_SUPABASE_URL:api,VITE_LOCAL_SUPABASE_ANON_KEY:anon},stdio:'ignore'});
const out=resolve('node_modules/.cache/course-browser');mkdirSync(out,{recursive:true});
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
 page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>console.error('PAGE',e.message));page.on('console',m=>{if(m.type()==='error')console.error('CONSOLE',m.text());});
 await page.goto(app+'/admin');await page.getByRole('heading',{name:'Course Content',exact:true}).waitFor();
 await page.getByLabel('Course',{exact:true}).selectOption(course);
 await page.getByLabel('Unit / Topic',{exact:true}).selectOption(topic);
 await page.getByRole('button',{name:'Add YouTube video',exact:true}).click();
 await page.getByLabel('Video 1 title').fill('Synthetic teaching video');await page.getByLabel('YouTube URL',{exact:true}).fill('https://evil.org/watch?v=abcdefghijk');
 await page.getByRole('button',{name:'Save draft',exact:true}).click();await page.getByRole('alert').filter({hasText:'valid HTTPS YouTube'}).waitFor();assert.equal(saved,undefined);
 await page.getByLabel('YouTube URL',{exact:true}).fill('https://youtu.be/abcdefghijk');
 if(process.env.O2I_COURSE_GAME_BROWSER){await page.getByLabel('HTML game (optional)',{exact:true}).setInputFiles({name:'synthetic-game.html',mimeType:'text/html',buffer:Buffer.from('<html><body>Synthetic test game</body></html>')});await page.getByRole('status').filter({hasText:'Game uploaded'}).waitFor();}
 await page.getByRole('button',{name:'Save draft',exact:true}).click();await page.getByRole('status').filter({hasText:'Draft saved'}).waitFor();
 await page.reload();await page.getByLabel('Course',{exact:true}).selectOption(course);await page.getByRole('button',{name:/1.1.*Draft/}).click();await page.getByLabel('Video 1 title').waitFor();assert.equal(await page.getByLabel('Video 1 title').inputValue(),'Synthetic teaching video');
 await page.getByLabel('Published (unchecked = Draft)').click();await page.getByRole('button',{name:'Save and publish changes',exact:true}).click();
 await page.getByRole('status').filter({hasText:'Published changes are visible immediately'}).waitFor();assert.equal(saved._topic_id,topic);assert.equal(saved._is_published,true);assert.equal(saved._videos.length,1);
 await page.screenshot({path:resolve(out,'admin.png'),fullPage:true});
 if(process.env.O2I_COURSE_GAME_BROWSER)assert.ok(saved._game_path.startsWith(`${course}/${topic}/`));
 otherContent={...otherContent,lesson_id:uid,revision:3,videos:[{id:uid,title:'Different AB content',video_url:'https://youtu.be/12345678901'}]};
 await page.getByRole('button',{name:'Share with AP Calculus AB',exact:true}).click();await page.getByRole('dialog').getByRole('heading',{name:'Share AB and BC content'}).waitFor();await page.getByLabel('Content to keep in both courses').selectOption('current');await page.screenshot({path:resolve(out,'share-confirmation.png')});await page.getByRole('button',{name:'Confirm shared content',exact:true}).click();await page.getByText('Shared with AB and BC. Editing, publishing or withdrawing affects both courses.',{exact:true}).waitFor();await page.screenshot({path:resolve(out,'admin-shared.png'),fullPage:true});assert.equal(otherContent.lesson_id,content.lesson_id);
 // Course-page editor reuses the saved lesson, and refuses to discard edits without confirmation.
 await page.goto(app+'/courses?course='+course);await page.getByRole('button',{name:'Edit 1.1',exact:true}).click();await page.getByRole('heading',{name:'Edit lesson content',exact:true}).waitFor();await page.getByLabel('Video 1 title').fill('Unsaved draft');const backCancelled=new Promise(resolve=>page.once('dialog',async d=>{await d.dismiss();resolve();}));await page.evaluate(()=>history.back());await backCancelled;await page.waitForURL('**/courses?course='+course);assert.equal(await page.getByLabel('Video 1 title').inputValue(),'Unsaved draft');page.once('dialog',d=>d.dismiss());await page.getByRole('dialog').last().getByRole('button',{name:'Close',exact:true}).click();assert.equal(await page.getByLabel('Video 1 title').inputValue(),'Unsaved draft');page.once('dialog',d=>d.accept());await page.getByRole('dialog').last().getByRole('button',{name:'Close',exact:true}).click();await page.getByRole('heading',{name:'Edit lesson content',exact:true}).waitFor({state:'detached'});
 if(process.env.O2I_COURSE_STUDENT_BROWSER){await (await import('./course-student-browser.acceptance.mjs')).verifyStudentCourse({page,context,app,api,course,topic,other,outline,content,requests,out});}
 if(process.env.O2I_AI_TUTOR_BROWSER){await (await import('./ai-tutor-browser.acceptance.mjs')).verifyAiTutorHidden({browser,routeFixture,app,api,course,topic,uid,token,out});}
 if(process.env.O2I_REAL_COURSE_GAME && existsSync('node_modules/.cache/course-real/published-game.html')){const html=readFileSync(process.env.O2I_REAL_COURSE_GAME==='responsive' ? 'docs/courses/improvements/assets/1.1-game-responsive.html' : 'node_modules/.cache/course-real/published-game.html','utf8');await context.route(api+'/storage/v1/object/course-games/**',r=>r.fulfill({contentType:'text/html',body:html}));await page.setViewportSize({width:1180,height:820});await page.goto(app+'/courses?course='+course+'&topic='+topic);await page.getByRole('button',{name:'Start game',exact:true}).click();await page.frameLocator('iframe[title="Lesson game"]').locator('canvas#c').waitFor();await page.getByRole('button',{name:'Expand game',exact:true}).click();await page.frameLocator('iframe[title="Lesson game"]').locator('body').evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});await page.screenshot({path:resolve(out,process.env.O2I_REAL_COURSE_GAME==='responsive'?'real-game-responsive-tablet.png':'real-game-tablet.png')});const f=page.frameLocator('iframe[title="Lesson game"]');assert.ok(await page.getByTitle('Lesson game').evaluate(el=>document.elementFromPoint(innerWidth/2,innerHeight-24)===el));console.log('Real game dimensions',await f.locator('body').evaluate(el=>({width:el.scrollWidth,height:el.scrollHeight,viewport:innerHeight,canvas:document.querySelector('#c').getBoundingClientRect().toJSON(),controls:document.querySelector('.pads').getBoundingClientRect().toJSON()})));if(process.env.O2I_REAL_COURSE_GAME==='responsive'){assert.ok(await f.locator('.pads').evaluate(el=>el.getBoundingClientRect().bottom<=innerHeight));await f.getByRole('button',{name:'红帽向右',exact:true}).click();await page.screenshot({path:resolve(out,'real-game-responsive-interactive.png')});for(const size of [{width:1024,height:768},{width:820,height:1180},{width:390,height:844}]){await page.setViewportSize(size);await f.locator('body').evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));assert.ok(await f.locator('body').evaluate(el=>el.scrollWidth<=innerWidth+2));if(size.width===1024)assert.ok(await f.locator('.pads').evaluate(el=>el.getBoundingClientRect().bottom<=innerHeight));await page.screenshot({path:resolve(out,`real-game-${size.width}x${size.height}.png`)});}}}
 console.log('PASS course admin browser: real form, invalid URL rejected without save, canonical Topic payload, publish/save acknowledgement');
}catch(error){console.error(error);if(page){console.error('URL',page.url());console.error((await page.locator('body').innerText()).slice(0,1800));await page.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});}process.exitCode=1;}
finally{if(browser)await browser.close();vite.kill('SIGTERM');await new Promise(r=>vite.exitCode!==null?r():vite.once('exit',r));}
