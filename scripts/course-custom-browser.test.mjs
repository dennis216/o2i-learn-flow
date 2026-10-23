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
}catch(error){console.error(error);if(page){console.error((await page.locator('body').innerText()).slice(0,2200));await page.screenshot({path:resolve(out,'custom-failure.png'),fullPage:true}).catch(()=>{});}process.exitCode=1;}
finally{if(browser)await browser.close();vite.kill('SIGTERM');await new Promise(r=>vite.exitCode!==null?r():vite.once('exit',r));}
