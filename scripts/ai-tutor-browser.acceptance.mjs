// Synthetic UI fixtures only: no real accounts, AI calls, or database writes.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export async function verifyAiTutorHidden({browser,routeFixture,app,api,course,topic,uid,token,out}) {
  // Exercise the retained Study Hub as well as the currently routed lesson player.
  writeFileSync(resolve(out,'tutor-fixture.mjs'), `
    import { createElement } from 'react';
    import { createRoot } from 'react-dom/client';
    import { VideoPlayerWithTutor } from '/src/components/courses/VideoPlayerWithTutor.tsx';
    const container = document.createElement('section');
    container.id = 'retained-study-tools';
    document.body.append(container);
    createRoot(container).render(createElement(VideoPlayerWithTutor, {
      video: { id: '${topic}', course_id: '${course}', title: 'Synthetic retained lesson',
        video_url: 'https://youtu.be/abcdefghijk', description: '', duration: 60, order_index: 0,
        notes_url: '${app}/synthetic-notes.pdf', transcript: [{ s: 0, t: 'Synthetic transcript' }] },
      supabaseUrl: '${api}'
    }));
  `);
  const forbidden = /AI Tutor|Explain Current Scene|Ask more details|Ask AI about Notes|AI Summary|AI-powered study tools|Test AI|Generate Mock Test/i;
  for (const role of ['visitor','student','instructor','admin','super_admin']) {
    const context = await browser.newContext({viewport:{width:1440,height:1000}});
    const aiRequests = [], errors = [];
    try {
      await context.route('**/*',routeFixture);
      await context.route(api+'/**',async route=>{
        const fn = new URL(route.request().url()).pathname.split('/').at(-1);
        let body;
        if(fn==='has_role')body=role==='admin'||role==='super_admin';
        else if(fn==='is_super_admin')body=role==='super_admin';
        else if(fn==='profiles')body={user_id:uid,full_name:'Synthetic '+role,role};
        else return route.fallback();
        return route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
      });
      await context.addInitScript({content:`window.YT={Player:class { constructor(el,config){ this.el=document.createElement('iframe');this.el.title='Synthetic YouTube player';this.el.src='https://www.youtube.com/embed/'+config.videoId;el.append(this.el);setTimeout(()=>config.events.onReady(),0); }getCurrentTime(){return 0}seekTo(){}destroy(){this.el.remove()} }};`});
      await context.route('https://www.youtube.com/embed/**',r=>r.fulfill({contentType:'text/html',body:'Synthetic player fixture'}));
      if(role!=='visitor')await context.addInitScript(({token,uid,role})=>{
        if(window.top!==window)return;
        localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:token,refresh_token:'synthetic',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user:{id:uid,aud:'authenticated',role:'authenticated',email:role+'@example.test',app_metadata:{provider:'email'},user_metadata:{}}}));
      },{token,uid,role});
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      page.on('pageerror',e=>errors.push(e.message));
      page.on('request',r=>{if(/\/functions\/v1\/ai-tutor|\/rest\/v1\/ai_tutor_/.test(r.url()))aiRequests.push(r.url());});
      for(const width of [1440,390]) {
        await page.setViewportSize({width,height:1000});
        await page.goto(app+'/ai-tutor?legacy=1');
        await page.waitForURL(app+'/courses');
        await page.getByRole('heading',{name:'Math Courses',exact:true}).waitFor();
        // Wait for the actual auth/role state before checking the navigation.
        if(width===390)await page.getByRole('button',{name:'Open menu',exact:true}).click();
        const nav = page.getByRole('navigation').last();
        if(role==='visitor')await page.getByRole('link',{name:'Sign In / Sign Up',exact:true}).last().waitFor();
        else await page.getByRole('link',{name:'Profile',exact:true}).last().waitFor();
        if(role==='admin'||role==='super_admin')await nav.getByRole('link',{name:'Admin',exact:true}).waitFor();
        assert.equal(await page.locator('a[href="/ai-tutor"]').count(),0,role+' navigation');
        assert.doesNotMatch(await page.locator('body').innerText(),forbidden);
        if(width===390)await page.keyboard.press('Escape');
        await page.goto(app+`/courses?course=${course}&topic=${topic}`);
        await page.getByTitle('Synthetic YouTube player').waitFor();
        assert.doesNotMatch(await page.locator('body').innerText(),forbidden,role+' lesson');
        assert.equal(await page.locator('[data-panel-resize-handle-id]').count(),0);
        const player = page.getByTitle('Synthetic YouTube player');
        if(width===1440) {
          const panel=player.locator('xpath=ancestor::*[@data-panel-id][1]');
          const group=panel.locator('..');
          assert.equal(await group.locator(':scope > [data-panel-id]').count(),1);
          const sizes=await Promise.all([panel.boundingBox(),group.boundingBox()]);
          assert.ok(sizes[0].width>=sizes[1].width-2,'video must occupy the former sidebar width');
        }
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        await page.screenshot({path:resolve(out,`tutor-hidden-${role}-${width}.png`),fullPage:true});
      }
      if(role==='admin'||role==='super_admin') {
        await page.setViewportSize({width:1440,height:1000});
        await page.goto(app+'/admin');
        await page.getByRole('tab',{name:'Manage Videos',exact:true}).click();
        await page.getByRole('heading',{name:'All Videos',exact:true}).waitFor();
        await page.getByRole('button',{name:'Edit',exact:true}).first().waitFor();
        assert.doesNotMatch(await page.locator('body').innerText(),forbidden,role+' admin video management');
      }
      await page.setViewportSize({width:1440,height:1000});
      await page.goto(app+'/courses');
      await page.evaluate(()=>import('/node_modules/.cache/course-browser/tutor-fixture.mjs'));
      const fixture=page.locator('#retained-study-tools');
      await fixture.getByRole('tab',{name:'Notes & PDF',exact:true}).waitFor();
      assert.deepEqual(await fixture.getByRole('tab').allTextContents(),['Notes & PDF','Interactive Lab']);
      await fixture.getByTitle('Course Notes PDF').waitFor();
      assert.doesNotMatch(await fixture.innerText(),forbidden);
      assert.equal(await fixture.locator('input').count(),0);
      await fixture.getByRole('tab',{name:'Interactive Lab',exact:true}).click();
      await fixture.getByText('No Interactive Models',{exact:true}).waitFor();
      assert.deepEqual(aiRequests,[],role+' must not request AI endpoints or chat history');
      assert.deepEqual(errors,[],role+' page errors');
      console.log('PASS Tutor hidden: '+role+' desktop/mobile, legacy redirect, full-width video, retained PDF/lab'+((role==='admin'||role==='super_admin')?', admin test hidden':''));
    } finally {
      await context.close();
    }
  }
}
