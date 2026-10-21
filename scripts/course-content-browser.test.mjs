// Browser UI/network fixtures only; database authorization is tested separately.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const { chromium } = await import(process.env.O2I_PLAYWRIGHT_MODULE ?? '/Users/mucenyao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const app='http://127.0.0.1:5194',api='http://127.0.0.1:55529';
const course='fccc7540-0c29-43be-8682-ae90ff2534cb',topic='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',uid='33333333-3333-4333-8333-333333333333';
const outline=[{id:other,unit_number:1,title:'Synthetic Unit',topics:[{id:topic,code:'1.1',title:'Synthetic Topic',is_published:false},{id:other,code:'1.2',title:'Synthetic Draft',is_published:false}]}];
let content={course_id:course,topic_id:topic,is_published:false,game_path:null,videos:[]},saved;
const anon=['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',Buffer.from(JSON.stringify({role:'anon'})).toString('base64url'),'synthetic'].join('.');
let browser, page;
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5194','--strictPort'],{env:{...process.env,VITE_LOCAL_SUPABASE_URL:api,VITE_LOCAL_SUPABASE_ANON_KEY:anon},stdio:'ignore'});
const out=resolve('node_modules/.cache/course-browser');mkdirSync(out,{recursive:true});
try{
 for(let n=0;;n++){try{if((await fetch(app)).ok)break;}catch{}if(n>150)throw new Error('Vite startup timeout');await new Promise(r=>setTimeout(r,200));}
 browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const context=await browser.newContext({viewport:{width:1280,height:960}});
 const requests=[];
 await context.route('**/*',async route=>{
   const u=new URL(route.request().url());requests.push(u.pathname);
   if(u.origin===api){
     let body=[];
     const fn=u.pathname.split('/').at(-1);
     if(fn==='has_role')body=true;
     else if(fn==='is_super_admin')body=false;
     else if(fn==='profiles')body={user_id:uid,full_name:'Synthetic admin'};
     else if(fn==='courses')body=[{id:course,title:'AP Calculus BC',practice_course_scope:'BC',category:'High School',subject:'AP Calc',is_published:true,level:'advanced',price:0,description:'Synthetic browser fixture'}];
     else if(fn==='get_course_outline')body=outline;
     else if(fn==='list_course_practice_topics')body=[{id:topic,question_count:1}];
     else if(fn==='get_course_topic')body=content;
     else if(fn==='save_course_topic'){
       saved=route.request().postDataJSON();
       content={...content,is_published:saved._is_published,game_path:saved._game_path,videos:saved._videos.map((v,n)=>({...v,id:v.id??other,course_id:course,order_index:n}))};
       outline[0].topics[0].is_published=saved._is_published;body=null;
     }
     else if(fn==='course_videos')body=content.videos;
     return route.fulfill({status:200,headers:{'access-control-allow-origin':app,'access-control-allow-headers':'*','access-control-allow-methods':'*'},contentType:'application/json',body:JSON.stringify(body)});
   }
   if(u.origin!==app)return route.abort();
   return route.continue();
 });
 const token=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:uid,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.synthetic';
 await context.addInitScript(({token,uid})=>{if(window.top!==window)return;localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:token,refresh_token:'synthetic',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user:{id:uid,aud:'authenticated',role:'authenticated',email:'synthetic@example.test',app_metadata:{provider:'email'},user_metadata:{}}}));},{token,uid});
 page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>console.error('PAGE',e.message));page.on('console',m=>{if(m.type()==='error')console.error('CONSOLE',m.text());});
 await page.goto(app+'/admin');await page.getByRole('heading',{name:'Course Content',exact:true}).waitFor();
 await page.getByLabel('Course',{exact:true}).selectOption(course);
 await page.getByLabel('Unit / Topic',{exact:true}).selectOption(topic);
 await page.getByRole('button',{name:'Add YouTube video',exact:true}).click();
 await page.getByLabel('Video 1 title').fill('Synthetic teaching video');await page.getByLabel('YouTube URL',{exact:true}).fill('https://evil.org/watch?v=abcdefghijk');
 await page.getByRole('button',{name:'Save lesson',exact:true}).click();await page.getByRole('alert').filter({hasText:'valid HTTPS YouTube'}).waitFor();assert.equal(saved,undefined);
 await page.getByLabel('YouTube URL',{exact:true}).fill('https://youtu.be/abcdefghijk');
 if(process.env.O2I_COURSE_GAME_BROWSER){await page.getByLabel('HTML game (optional)',{exact:true}).setInputFiles({name:'synthetic-game.html',mimeType:'text/html',buffer:Buffer.from('<html><body>Synthetic test game</body></html>')});await page.getByRole('status').filter({hasText:'Game uploaded'}).waitFor();}
 await page.getByLabel('Published (unchecked = Draft)').click();await page.getByRole('button',{name:'Save lesson',exact:true}).click();
 await page.getByRole('status').filter({hasText:'Published changes are visible immediately'}).waitFor();assert.equal(saved._topic_id,topic);assert.equal(saved._is_published,true);assert.equal(saved._videos.length,1);
 await page.screenshot({path:resolve(out,'admin.png'),fullPage:true});
 if(process.env.O2I_COURSE_GAME_BROWSER)assert.ok(saved._game_path.startsWith(`${course}/${topic}/`));
 if(process.env.O2I_COURSE_STUDENT_BROWSER){await (await import('./course-student-browser.acceptance.mjs')).verifyStudentCourse({page,context,app,api,course,topic,other,outline,content,requests,out});}
 console.log('PASS course admin browser: real form, invalid URL rejected without save, canonical Topic payload, publish/save acknowledgement');
}catch(error){console.error(error);if(page){console.error('URL',page.url());console.error((await page.locator('body').innerText()).slice(0,1800));await page.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});}process.exitCode=1;}
finally{if(browser)await browser.close();vite.kill('SIGTERM');await new Promise(r=>vite.exitCode!==null?r():vite.once('exit',r));}
