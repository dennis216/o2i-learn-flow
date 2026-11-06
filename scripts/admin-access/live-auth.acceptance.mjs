// Real cached GoTrue + PostgREST and installed Supabase SDK; all accounts live only in the disposable DB.
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import {handleDeleteUser} from '../../supabase/functions/admin-delete-user/handler.ts';
const secret='o2i-local-admin-verification-secret-2026-only';
const token=role=>{const head=Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),body=Buffer.from(JSON.stringify({role,iss:'supabase',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');return head+'.'+body+'.'+createHmac('sha256',secret).update(head+'.'+body).digest('base64url');};
export async function startLocalAuth({docker,sql,name}) {
 sql("ALTER ROLE supabase_auth_admin PASSWORD 'o2i-local-only';ALTER ROLE authenticator PASSWORD 'o2i-local-only';");
 const auth=name+'-auth';
 docker(['run','--pull','never','-d','--name',auth,'--network','container:'+name,
  '-e','API_EXTERNAL_URL=http://127.0.0.1:55997','-e','GOTRUE_API_HOST=0.0.0.0','-e','GOTRUE_API_PORT=9999',
  '-e','GOTRUE_SITE_URL=http://127.0.0.1:5198','-e','GOTRUE_DB_DRIVER=postgres','-e','GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:o2i-local-only@127.0.0.1:5432/postgres',
  '-e',`GOTRUE_JWT_SECRET=${secret}`,'-e','GOTRUE_JWT_ADMIN_ROLES=service_role','-e','GOTRUE_JWT_AUD=authenticated','-e','GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated',
  '-e','GOTRUE_EXTERNAL_EMAIL_ENABLED=true','-e','GOTRUE_MAILER_AUTOCONFIRM=true','-e','GOTRUE_DISABLE_SIGNUP=false',
  'public.ecr.aws/supabase/gotrue:v2.197.0']);
 for(let i=0;;i++){try{if((await fetch('http://127.0.0.1:55997/health')).ok)break;}catch{}if(i>120){throw Error('Local Auth startup failed: '+docker(['logs',auth]));}await new Promise(r=>setTimeout(r,250));}
 return auth;
}
export async function verifyLiveAuth({docker,sql,name,superId}) {
 const rest=name+'-rest',api='http://127.0.0.1:55999',key=token('anon'),serviceKey=token('service_role');
 let server,browser,vite;
 const notes=[];const record=message=>{notes.push(message);console.log('PASS live: '+message);};
 try {
  docker(['run','--pull','never','-d','--name',rest,'--network','container:'+name,'-e','PGRST_DB_URI=postgres://authenticator:o2i-local-only@127.0.0.1:5432/postgres',
   '-e','PGRST_DB_SCHEMAS=public','-e','PGRST_DB_ANON_ROLE=anon','-e',`PGRST_JWT_SECRET=${secret}`,'-e','PGRST_SERVER_PORT=3000','public.ecr.aws/supabase/postgrest:v16.4']);
  for(let i=0;;i++){try{if((await fetch('http://127.0.0.1:55996/')).ok)break;}catch{}if(i>120)throw Error('PostgREST startup failed: '+docker(['logs',rest]));await new Promise(r=>setTimeout(r,250));}
  const service=createClient(api,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  server=createServer(async(req,res)=>{
   const cors={'Access-Control-Allow-Origin':req.headers.origin??'*','Access-Control-Allow-Credentials':'true','Access-Control-Allow-Headers':req.headers['access-control-request-headers']??'authorization,apikey,x-client-info,content-type,prefer,range,x-supabase-api-version','Access-Control-Allow-Methods':'GET,POST,PUT,PATCH,DELETE,OPTIONS','Access-Control-Expose-Headers':'content-range'};
   if(req.method==='OPTIONS'){res.writeHead(204,cors);res.end();return;}
   try {
    const chunks=[];for await(const chunk of req)chunks.push(chunk);const data=Buffer.concat(chunks);
    let response;
    if(req.url==='/functions/v1/admin-delete-user'){
     const caller=createClient(api,key,{global:{headers:{Authorization:req.headers.authorization??''}},auth:{persistSession:false,autoRefreshToken:false}});
     response=await handleDeleteUser(new Request(api+req.url,{method:req.method,headers:req.headers,body:data.length?data:undefined}),caller,service);
    }else{
     const upstream=req.url.startsWith('/auth/v1/')?'http://127.0.0.1:55997'+req.url.slice(8):'http://127.0.0.1:55996'+req.url.replace(/^\/rest\/v1/,'');
     const headers={...req.headers};delete headers.host;delete headers['content-length'];
     response=await fetch(upstream,{method:req.method,headers,body:data.length?data:undefined});
    }
    const responseHeaders=Object.fromEntries(response.headers);for(const key of Object.keys(responseHeaders))if(key.startsWith('access-control-')||['content-length','content-encoding','transfer-encoding'].includes(key))delete responseHeaders[key];
    res.writeHead(response.status,{...responseHeaders,...cors});res.end(Buffer.from(await response.arrayBuffer()));
   }catch(e){res.writeHead(500,cors);res.end(JSON.stringify({error:e.message}));}
  });
  await new Promise(r=>server.listen(55999,'127.0.0.1',r));
  sql(`DELETE FROM public.user_roles WHERE user_id='${superId}' AND role='super_admin';`);
  const password='Synthetic-local-only-2026!';const accounts=[];
  for(const role of ['super_admin','admin','course_admin','question_admin','student']){
   const email=`live-${role}@example.test`,created=await service.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:`Local verified ${role}`}});assert.ifError(created.error);
   const id=created.data.user.id;sql(`INSERT INTO public.user_roles(user_id,role) VALUES('${id}','${role}')`);
   const client=createClient(api,key,{auth:{persistSession:false,autoRefreshToken:false}}),signed=await client.auth.signInWithPassword({email,password});assert.ifError(signed.error);assert.ok(signed.data.session);
   accounts.push({role,email,id,client,session:signed.data.session});
  }
  const [owner,full,course,question,target]=accounts;
  record('five real local Auth accounts sign in; PostgreSQL roles are read through actual JWT/PostgREST');
  for(const account of accounts){const {data,error}=await account.client.rpc('get_admin_access');assert.ifError(error);assert.equal(data.users,account.role==='super_admin');assert.equal(data.courses,['super_admin','admin','course_admin'].includes(account.role));assert.equal(data.questions,['super_admin','admin','question_admin'].includes(account.role));}
  const call=(account,action,email)=>fetch(api+'/functions/v1/admin-delete-user',{method:'POST',headers:{Authorization:'Bearer '+account.session.access_token,'Content-Type':'application/json'},body:JSON.stringify({userId:target.id,action,email})});
  for(const account of [full,course,question,target])assert.equal((await call(account,'delete',target.email)).status,403);
  assert.ok((await service.auth.admin.deleteUser(target.id)).error);assert.ifError((await target.client.auth.getUser()).error);
  record('real HTTP rejects non-owner deletion and unconfirmed direct Auth Admin deletion without removing target');
  const blocked=await course.client.rpc('set_account_role',{_user_id:target.id,_role:'admin'});assert.ok(blocked.error);
  const changed=await owner.client.rpc('set_account_role',{_user_id:target.id,_role:'question_admin'});assert.ifError(changed.error);assert.equal((await target.client.rpc('has_admin_module',{_module:'questions'})).data,true);
  assert.ifError((await owner.client.rpc('set_account_role',{_user_id:target.id,_role:'student'})).error);assert.equal((await target.client.rpc('has_admin_module',{_module:'questions'})).data,false);
  record('real active session gains and loses module access after atomic role changes');
  const {chromium}=await import(process.env.O2I_PLAYWRIGHT_MODULE??'/Users/mucenyao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
  vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5198','--strictPort'],{env:{...process.env,VITE_LOCAL_SUPABASE_URL:api,VITE_LOCAL_SUPABASE_ANON_KEY:key},stdio:'ignore'});
  for(let i=0;;i++){try{if((await fetch('http://127.0.0.1:5198')).ok)break;}catch{}if(i>120)throw Error('Live browser Vite timeout');await new Promise(r=>setTimeout(r,250));}
  browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  for(const account of [course,question,owner]){
   const context=await browser.newContext({viewport:{width:1360,height:1000}});
   // Only block external resources. Auth, RPCs, database and deletion are real local services.
   await context.route('**/*',route=>['http://127.0.0.1:5198',api].includes(new URL(route.request().url()).origin)?route.continue():route.abort());
   await context.addInitScript(session=>localStorage.setItem('sb-127-auth-token',JSON.stringify(session)),account.session);
   const page=await context.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('requestfailed',r=>errors.push(r.url()+' '+r.failure()?.errorText));await page.goto('http://127.0.0.1:5198/admin');
   try{await page.getByRole('heading',{name:'Admin Dashboard',exact:true}).waitFor();}catch{await page.screenshot({path:'docs/admin-access/screenshots/task5-live-failure.png',fullPage:true});throw Error('Live UI failed: '+errors.join('; ')+' '+(await page.locator('body').innerText()).slice(0,600));}
   if(account.role==='question_admin')await page.getByText('Saved drafts',{exact:false}).first().waitFor();
   assert.deepEqual(await page.getByRole('tab').allTextContents(),account.role==='course_admin'?['Courses','Playground']:account.role==='question_admin'?['Question Bank','Playground']:['Courses','Question Bank','Playground','Team','Users']);
   if(account===owner){
    await page.getByRole('tab',{name:'Users',exact:true}).click();await page.getByRole('button',{name:`Delete ${target.email}`,exact:true}).waitFor();
    await page.getByRole('button',{name:`Delete ${target.email}`,exact:true}).click();await page.getByLabel(`Type ${target.email} to confirm`).fill(target.email);
    await page.screenshot({path:'docs/admin-access/screenshots/task5-live-delete-confirm.png',fullPage:true});
    await page.getByRole('button',{name:'Delete permanently',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
    assert.equal(await page.locator('tr').filter({hasText:target.email}).count(),0);
   }
   await page.screenshot({path:`docs/admin-access/screenshots/task5-live-${account.role}.png`,fullPage:true});await context.close();
  }
  record('actual React UI with real local JWT, Auth, database RPC and user deletion passes; screenshots saved');
  assert.equal(sql(`SELECT count(*) FROM auth.users WHERE id='${target.id}'`),'0');assert.equal(sql(`SELECT count(*) FROM auth.sessions WHERE user_id='${target.id}'`),'0');
  assert.ok((await target.client.auth.getUser()).error);assert.ok((await target.client.auth.refreshSession({refresh_token:target.session.refresh_token})).error);
  assert.equal(sql(`SELECT count(*) FROM public.admin_user_deletion_audit WHERE target_user_id='${target.id}' AND outcome='deleted'`),'1');
  assert.equal(sql(`SELECT count(*) FROM public.courses`)!=='0',true);
  record('deleted real account has no Auth user/sessions; old access token and refresh token rejected; one success audit retained');
  writeFileSync('docs/admin-access/task5-live-results.txt','LOCAL ONLY: cached GoTrue + PostgREST + PostgreSQL + installed SDK + actual React UI. No production access or real users.\nThe deployed Deno gateway and email delivery are not exercised.\n'+notes.map(n=>'PASS '+n).join('\n')+'\n');
 } finally {await browser?.close();vite?.kill();if(server)await new Promise(r=>server.close(r));try{docker(['rm','-f',rest]);}catch{}}
}
