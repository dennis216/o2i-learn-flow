// Actual React UI with synthetic network/account fixtures. PostgreSQL authorization is tested separately.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
const {chromium}=await import(process.env.O2I_PLAYWRIGHT_MODULE??'/Users/mucenyao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const app='http://127.0.0.1:5197',api='http://127.0.0.1:55527',out='docs/admin-access/screenshots';mkdirSync(out,{recursive:true});
const uid=n=>`b0000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const roles=['super_admin','admin','course_admin','question_admin','student'];
const profiles=roles.map((role,i)=>({id:uid(i+20),user_id:uid(i+1),full_name:`Synthetic ${role}`,email:`${role}@example.test`,role:'student',created_at:'2026-10-24T12:00:00Z'}));
const permissions=role=>({courses:['super_admin','admin','course_admin'].includes(role),questions:['super_admin','admin','question_admin'].includes(role),playground:role!=='student',team:['super_admin','admin'].includes(role),users:role==='super_admin'});
const anon=['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',Buffer.from('{"role":"anon"}').toString('base64url'),'synthetic'].join('.');
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5197','--strictPort'],{env:{...process.env,VITE_LOCAL_SUPABASE_URL:api,VITE_LOCAL_SUPABASE_ANON_KEY:anon},stdio:'ignore'});
let browser;const passed=[];
try {
 for(let n=0;;n++){try{if((await fetch(app)).ok)break;}catch{}if(n>120)throw Error('Vite timeout');await new Promise(r=>setTimeout(r,250));}
 browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 for(const [i,role] of roles.entries()){
  const id=uid(i+1),profile=profiles[i],access=permissions(role),calls=[],assigned=new Map(roles.map((r,i)=>[uid(i+1),r]));
  const context=await browser.newContext({viewport:{width:1360,height:960}});
  const identity={id,email:profile.email,aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{full_name:profile.full_name}};
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url()),fn=url.pathname.split('/').at(-1);if(url.origin!==app&&url.origin!==api)return route.abort();if(url.origin===app)return route.continue();
   calls.push(fn);let body=[],status=200;
   if(url.pathname==='/auth/v1/user')body=identity;
   else if(fn==='get_admin_access')body=access;
   else if(fn==='has_admin_module')body=access[route.request().postDataJSON()._module]===true;
   else if(fn==='is_super_admin')body=access.users;
   else if(fn==='profiles')body=url.searchParams.has('user_id')?profile:profiles;
   else if(fn==='user_roles')body=[...assigned].map(([user_id,role])=>({user_id,role}));
   else if(fn==='courses')body=[{id:uid(10),title:'Synthetic AP Calculus course',subject:'AP Calc',category:'High School',level:'advanced',price:0,is_published:false,practice_course_scope:'AB'}];
   else if(fn==='subjects')body=[{id:uid(11),name:'AP Calc',category:'High School',order_index:0}];
   else if(fn==='set_account_role'){const data=route.request().postDataJSON();assert.equal(role,'super_admin');assigned.set(data._user_id,data._role);body=null;}
   else if(fn==='admin-invite-user'){assert.equal(role,'super_admin');assert.equal(route.request().postDataJSON().role,'question_admin');body={success:true};}
   else if(fn==='list_course_video_library')body=[];
   return route.fulfill({status,contentType:'application/json',headers:{'access-control-allow-origin':app,'access-control-allow-headers':'*','access-control-allow-methods':'*','access-control-expose-headers':'content-range','content-range':'*/0'},body:JSON.stringify(body)});
  });
  const token=Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:id,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.synthetic';
  await context.addInitScript(({token,identity})=>localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:token,refresh_token:'synthetic',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user:identity})),{token,identity});
  const page=await context.newPage();page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(app+'/admin');
  if(role==='student'){await page.waitForURL(app+'/');assert.equal(await page.getByRole('link',{name:'Admin',exact:true}).count(),0);passed.push('student denied admin route');await context.close();continue;}
  await page.getByRole('heading',{name:'Admin Dashboard',exact:true}).waitFor();
  const expected=['Courses','Question Bank','Playground','Team','Users'].filter((_,i)=>[access.courses,access.questions,access.playground,access.team,access.users][i]);
  assert.deepEqual(await page.getByRole('tab').allTextContents(),expected);
  if(role==='question_admin'){assert.equal(await page.getByRole('tab',{name:'Question Bank',exact:true}).getAttribute('data-state'),'active');assert.ok(!calls.includes('courses'));}
  if(['course_admin','question_admin'].includes(role))assert.ok(!calls.includes('team_members'));
  if(role==='question_admin'){await page.getByText('No saved drafts yet.',{exact:true}).waitFor();assert.equal(await page.getByRole('alert').count(),0);}
  await page.screenshot({path:`${out}/task3-${role}.png`,fullPage:true});
  if(role==='super_admin'){
   await page.getByRole('tab',{name:'Users',exact:true}).click();await page.getByText('Synthetic question_admin',{exact:true}).waitFor();
   await page.getByRole('combobox',{name:'Account type for student@example.test'}).click();page.once('dialog',d=>d.accept());await page.getByRole('option',{name:'Course Admin',exact:true}).click();
   await page.locator('li[role="status"]').filter({hasText:'Account type updated'}).waitFor();assert.equal(assigned.get(uid(5)),'course_admin');
   await page.locator('li[role="status"]').filter({hasText:'Account type updated'}).waitFor({state:'hidden'});
   await page.screenshot({path:`${out}/task3-users.png`,fullPage:true});
   await page.locator('#invite-name').fill('Synthetic invite');await page.locator('#invite-email').fill('invite@example.test');
   await page.getByRole('combobox').first().click();assert.deepEqual(await page.getByRole('option').allTextContents(),['Student','Full Admin','Course Admin','Question Admin']);
   await page.getByRole('option',{name:'Question Admin',exact:true}).click();await page.getByRole('button',{name:'Send invite',exact:true}).click();
   await page.locator('li[role="status"]').filter({hasText:'Invitation sent'}).waitFor();

  }
  assert.deepEqual(errors,[]);passed.push(`${role}: exact tabs, default page and no unauthorized module fetch`);
  await context.close();
 }
 writeFileSync('docs/admin-access/task3-browser-results.txt','Actual React UI; synthetic account/network fixtures, not live production acceptance.\n'+passed.map(s=>'PASS '+s).join('\n')+'\n');
 console.log(passed.join('\n'));
} finally {await browser?.close();vite.kill();}
