// Synthetic browser fixtures; real authorization is checked in the database suite.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
const { chromium } = await import(process.env.O2I_PLAYWRIGHT_MODULE ?? '/Users/mucenyao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const app='http://127.0.0.1:5195', api='http://127.0.0.1:55529';
const course='11111111-1111-4111-8111-111111111111', uid='22222222-2222-4222-8222-222222222222';
const token=['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',Buffer.from(JSON.stringify({sub:uid,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'synthetic'].join('.');
const session={access_token:token,refresh_token:'synthetic',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user:{id:uid,aud:'authenticated',role:'authenticated',email:'test@example.test',app_metadata:{provider:'email'},user_metadata:{}}};
const units=[3,4,10].map(n=>({id:`unit-${n}`,unit_number:n,title:`Synthetic Unit ${n}`,topics:[{id:`lesson-${n}`,entry_id:`lesson-${n}`,title:`Lesson in Unit ${n}`,is_published:true,cb_topics:[{id:`topic-${n}`,code:`${n}.1`,title:'Synthetic Topic'}]}]}));
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5195','--strictPort'],{env:{...process.env,VITE_LOCAL_SUPABASE_URL:api,VITE_LOCAL_SUPABASE_ANON_KEY:['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',Buffer.from(JSON.stringify({role:'anon'})).toString('base64url'),'synthetic'].join('.')},stdio:'ignore'});
let browser;
try {
 for(let n=0;;n++){try{if((await fetch(app)).ok)break;}catch{}if(n>100)throw new Error('Vite startup timeout');await new Promise(r=>setTimeout(r,200));}
 browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 for(const mobile of [false,true]){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:960}});
  let contentCalls=[];
  await context.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.origin===app)return route.continue();
   if(u.origin!==api)return route.abort();
   if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':app,'access-control-allow-headers':'*','access-control-allow-methods':'*'}});
   const fn=u.pathname.split('/').at(-1);
   let body=[];
   if(fn==='courses')body=[{id:course,title:'Synthetic Course',category:'High School',subject:'AP Calc',level:'advanced',description:'Login gate test',is_published:true,price:0}];
   if(fn==='get_course_outline_v2')body={revision:1,units};
   if(fn==='get_course_outline_entry'){const id=route.request().postDataJSON()._entry_id;contentCalls.push(id);body={course_id:course,entry_id:id,is_published:true,videos:[],game_path:null};}
   if(fn==='get_admin_access')body={courses:false,questions:false,playground:false,team:false,users:false};
   if(fn==='profiles')body={user_id:uid,full_name:'Synthetic Student'};
   if(fn==='token')body=session;
   if(fn==='logout')body={};
   if(fn==='resolve_course_video')body={course_id:course,entry_id:'lesson-4',topic_id:'topic-4'};
   await route.fulfill({status:200,headers:{'access-control-allow-origin':app,'access-control-allow-headers':'*'},contentType:'application/json',body:JSON.stringify(body)});
  });
  const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>console.error(e.message));
  const open=unit=>page.getByRole('button',{name:new RegExp(`Unit ${unit}.*Synthetic Unit ${unit}`)}).click();
  await page.goto(`${app}/courses?course=${course}`);
  await page.getByRole('dialog').waitFor();
  await open(3);await page.getByRole('button',{name:'3.1 · Lesson in Unit 3',exact:true}).click();
  await page.getByText('Practice for this topic is being prepared. Stay tuned.',{exact:true}).waitFor();
  assert.deepEqual(contentCalls,['lesson-3']);
  await open(4);await page.getByText('Log in to access more',{exact:true}).waitFor();
  assert.equal(await page.getByText('Lesson in Unit 4',{exact:true}).count(),0);
  await open(10);assert.equal(await page.getByText('Log in to access more',{exact:true}).count(),2);
  await page.goto(`${app}/courses?course=${course}&lesson=lesson-4`);
  await page.getByText('Log in to access more',{exact:true}).waitFor();
  assert.deepEqual(contentCalls,['lesson-3']);
  await page.getByRole('link',{name:'Log in',exact:true}).click();
  await page.locator('#signin-email').fill('test@example.test');await page.locator('#signin-password').fill('test-password');
  await page.getByRole('button',{name:'Sign In',exact:true}).click();
  await page.waitForURL(u=>u.pathname==='/courses'&&u.searchParams.get('lesson')==='lesson-4');
  await page.getByText('Practice for this topic is being prepared. Stay tuned.',{exact:true}).waitFor();
  assert.equal(contentCalls.at(-1),'lesson-4');
  await page.reload();await page.getByRole('button',{name:'4.1 · Lesson in Unit 4',exact:true}).waitFor();
  await page.getByText('Practice for this topic is being prepared. Stay tuned.',{exact:true}).waitFor();
  // Supabase broadcasts cross-tab sign-out; content must disappear without a reload.
  contentCalls=[];
  await page.evaluate(()=>{localStorage.removeItem('sb-127-auth-token');const channel=new BroadcastChannel('sb-127-auth-token');channel.postMessage({event:'SIGNED_OUT',session:null});channel.close();});
  await page.getByText('Log in to access more',{exact:true}).waitFor();assert.deepEqual(contentCalls,[]);
  await page.reload();await page.getByText('Log in to access more',{exact:true}).waitFor();assert.deepEqual(contentCalls,[]);
  await page.goto(`${app}/courses?video=33333333-3333-4333-8333-333333333333`);
  await page.getByText('Log in to access more',{exact:true}).waitFor();assert.deepEqual(contentCalls,[]);
  await context.close();
  console.log(`PASS course login browser: ${mobile?'mobile':'desktop'}, Unit 3/4/10, direct/legacy links, login return, restored session and logout gate`);
 }
} finally {await browser?.close();vite.kill();}
