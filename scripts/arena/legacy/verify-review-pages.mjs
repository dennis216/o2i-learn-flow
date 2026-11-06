// Offline browser checks for every exact prepared-content hash, including phone width.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { privateDirectory, sha256, verifySnapshot } from './snapshot.mjs';
const [directory]=process.argv.slice(2);assert.ok(directory,'Usage: verify-review-pages.mjs <private-directory>');
const base=privateDirectory(directory),manifest=verifySnapshot(base);
const {chromium}=await import(process.env.O2I_PLAYWRIGHT_MODULE??'/Users/mucenyao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const browser=await chromium.launch({headless:true,executablePath:process.env.O2I_CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),results=[];
try {
 const page=await browser.newPage();await page.route('http://**',route=>route.abort());await page.route('https://**',route=>route.abort());
 for(const batch of manifest.inventory.batches) {
  const folder=resolve(base,`review-${batch.id}-svg-v1-0f2356a45d6a-37102041`),raw=readFileSync(resolve(folder,'prepared-batch.json'),'utf8'),prepared=JSON.parse(raw);
  await page.goto(pathToFileURL(resolve(folder,'prepared-batch-review-'+sha256(raw).slice(0,12)+'.html')).href);await page.evaluate(()=>document.fonts.ready);
  for(const width of [1280,390]) {
   await page.setViewportSize({width,height:900});
   const result=await page.evaluate(()=>({questions:document.querySelectorAll('article').length,errors:document.querySelectorAll('.katex-error').length,
    images:[...document.images].every(i=>i.complete&&i.naturalWidth>0),overflow:document.documentElement.scrollWidth>innerWidth}));
   assert.equal(result.questions,prepared.questions.length);assert.ok(!result.errors&&result.images&&!result.overflow,JSON.stringify({batch:batch.id,width,...result}));
   results.push({batch_id:batch.id,width,...result});
  }
  console.log('PASS '+batch.id);
 }
 writeFileSync(resolve(base,'review-pages-verified.json'),JSON.stringify({at:new Date().toISOString(),results},null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify({batches:manifest.inventory.batches.length,all_checks_pass:true}));
}finally{await browser.close();}
