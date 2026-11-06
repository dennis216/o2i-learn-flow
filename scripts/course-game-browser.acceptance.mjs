import assert from 'node:assert/strict';
import { resolve } from 'node:path';
export async function verifyCourseGame({page,context,api,course,topic,requests,out}) {
  let downloads=0;
  await context.route(api+'/storage/v1/object/course-games/**',r=>{
    downloads++;
    return r.fulfill({contentType:'text/html',body:`<!doctype html><html><body><h1>Synthetic lesson game</h1><button id="play">Play test game</button><p id="result"></p><script>
      document.getElementById('play').onclick=()=>document.getElementById('result').textContent='Game interaction works';
      try{parent.document.body.dataset.gameEscaped='yes'}catch{document.body.dataset.parentBlocked='yes'}
      try{localStorage.setItem('gameEscape','yes')}catch{document.body.dataset.storageBlocked='yes'}
      fetch('https://example.invalid/exfiltrate').catch(()=>document.body.dataset.networkBlocked='yes');
    </script></body></html>`});
  });
  assert.equal(downloads,0);await page.getByRole('button',{name:'Start game',exact:true}).click();
  const frame=page.frameLocator('iframe[title="Lesson game"]');
  await frame.getByRole('heading',{name:'Synthetic lesson game'}).waitFor();
  await page.getByTitle('Lesson game').scrollIntoViewIfNeeded();
  await frame.getByRole('button',{name:'Play test game'}).click();
  assert.equal(await frame.locator('#result').textContent(),'Game interaction works');
  assert.equal(downloads,1);
  await page.getByRole('button',{name:'Expand game',exact:true}).click();assert.equal(await frame.locator('#result').textContent(),'Game interaction works');assert.equal(downloads,1);
  const expanded=await page.getByTitle('Lesson game').boundingBox();assert.ok(expanded.width>1000 && expanded.height>650);await page.screenshot({path:resolve(out,'student-game-expanded.png')});
  await page.getByRole('button',{name:'Exit expanded game',exact:true}).click();assert.equal(await frame.locator('#result').textContent(),'Game interaction works');assert.equal(downloads,1);
  assert.equal(await page.getByTitle('Lesson game').getAttribute('sandbox'),'allow-scripts');
  assert.equal(await page.evaluate(()=>document.body.dataset.gameEscaped),undefined);
  assert.equal(await frame.locator('body').getAttribute('data-parent-blocked'),'yes');
  assert.equal(await frame.locator('body').getAttribute('data-storage-blocked'),'yes');
  await frame.locator('body[data-network-blocked="yes"]').waitFor();
  await page.screenshot({path:resolve(out,'student-game.png')});
  await page.getByRole('button',{name:'Close game',exact:true}).click();await page.getByTitle('Lesson game').waitFor({state:'detached'});
  console.log('PASS HTML game browser: deferred download, runnable inline script, parent/storage isolation, blocked fetch and unload on close');
}
