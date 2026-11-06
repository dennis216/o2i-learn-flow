// Private, offline source/converted comparison. The solver input never contains old answers.
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { privateDirectory, sha256, verifySnapshot } from './snapshot.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
export function shuffledChoices(options, seed, id) {
 const ordered = options.map((text,index)=>({text,index,order:createHmac('sha256',seed).update(id+':'+index).digest('hex')})).sort((a,b)=>a.order.localeCompare(b.order));
 return { choices:ordered.map((o,i)=>({label:'ABCD'[i],text:o.text})), originalIndexes:ordered.map(o=>o.index), correctLabel:'ABCD'[ordered.findIndex(o=>o.index===0)] };
}
export function mathDefinitions(html) {
 const found=[];
 for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
  const file=ts.createSourceFile('legacy-game.js',script[1],ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  const visit=node=>{if(ts.isStringLiteralLike(node)&&node.text.includes('<defs')&&node.text.includes('MJX-TEX-'))found.push(node.text);ts.forEachChild(node,visit);};
  visit(file);
 }
 assert.equal(found.length,1,'Expected one inert MathJax symbol definition string.');
 assert.ok(!/<script|\bon\w+=|(?:href|src)=["'](?:https?:|javascript:)/i.test(found[0]));
 return '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" aria-hidden="true" style="position:absolute">'+found[0]+'</svg>';
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const [directory,conversionFile,batchId='pilot']=process.argv.slice(2);
 assert.ok(directory&&conversionFile,'Usage: node --experimental-strip-types review-pack.mjs <private-directory> <conversion-file> [batch-id]');
 const base=privateDirectory(directory),manifest=verifySnapshot(base);
 const snapshot=JSON.parse(readFileSync(resolve(base,'snapshot.json'),'utf8'));
 const conversion=JSON.parse(readFileSync(resolve(base,conversionFile),'utf8'));
 assert.equal(conversion.snapshot_sha256,manifest.snapshot_sha256);
 const batch=manifest.inventory.batches.find(b=>b.id===batchId);assert.ok(batch,'Unknown batch.');
 const reviewVersion=sha256(readFileSync(new URL(import.meta.url))).slice(0,8);
 const output=resolve(base,'review-'+batchId+'-'+conversion.conversion_version+'-'+reviewVersion);mkdirSync(output,{recursive:true,mode:0o700});
 const keyPath=resolve(output,'review-key.json');
 const seed=existsSync(keyPath)?JSON.parse(readFileSync(keyPath,'utf8')).seed:randomBytes(32).toString('hex');
 const key={seed,items:[]},input={instructions:'Independently solve every question and check all four choices. Original answers and explanations are deliberately absent. Compare source and converted display. Return uncertain rather than guessing.',topics:snapshot.topics,skills:snapshot.skills,items:[]};
 const defs=mathDefinitions(readFileSync(resolve(root,'public/games/limit-arena.html'),'utf8'));
 const cache=resolve(root,'node_modules/.cache/arena-legacy');mkdirSync(cache,{recursive:true});
 let renderer=readFileSync(resolve(root,'src/components/MarkdownWithMath.tsx'),'utf8');
 renderer=renderer.replace("import 'katex/dist/katex.min.css';",'').replace("'@/lib/questionBankMath'",JSON.stringify(pathToFileURL(resolve(root,'src/lib/questionBankMath.ts')).href));
 const modulePath=resolve(cache,'markdown-'+sha256(renderer).slice(0,12)+'.mjs');
 if(!existsSync(modulePath))writeFileSync(modulePath,ts.transpileModule(renderer,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText);
 const Component=(await import(pathToFileURL(modulePath).href)).default;
 const markdown=text=>renderToStaticMarkup(React.createElement(Component,{content:text,strictMath:true}));
 let css=readFileSync(resolve(root,'node_modules/katex/dist/katex.min.css'),'utf8');
 css=css.replace(/url\((fonts\/[^)]+)\)/g,(_,file)=>{assert.match(file,/^fonts\/[A-Za-z0-9_-]+\.(woff2?|ttf)$/);return `url(data:font/${file.endsWith('woff2')?'woff2':file.endsWith('woff')?'woff':'ttf'};base64,${readFileSync(resolve(root,'node_modules/katex/dist',file)).toString('base64')})`;});
 const {chromium}=await import(process.env.O2I_PLAYWRIGHT_MODULE??'/Users/mucenyao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
 const browser=await chromium.launch({headless:true,executablePath:process.env.O2I_CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try {
  const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:2});await context.route('**/*',route=>route.abort());
  const page=await context.newPage();
  for(const id of batch.source_ids) {
   const converted=conversion.items.find(q=>q.source_id===id);
   if(converted.status!=='converted_unreviewed')continue;
   const source=snapshot.rows.find(q=>q.source.id===id).source;
   const reviewId=createHmac('sha256',seed).update('review:'+id).digest('hex').slice(0,16);
   const shuffled=shuffledChoices(converted.options,seed,id);
   const image=converted.graph_svg?resolve(output,reviewId+'-graph.png'):null;
   if(image){
    await page.setContent(converted.graph_svg);
    await page.locator('svg').screenshot({path:image});chmodSync(image,0o600);
   }
   const figure=converted.graph_svg??'';
   const originalOptions=shuffled.originalIndexes.map((n,i)=>`<p><b>${'ABCD'[i]}.</b> ${source.options[n]}</p>`).join('');
   const newOptions=shuffled.choices.map(o=>`<section><b>${o.label}.</b>${markdown(o.text)}</section>`).join('');
   const markup=`<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:"><style>${css}\nbody{font:18px/1.6 Arial,sans-serif;color:#111;margin:24px}main{display:grid;grid-template-columns:1fr 1fr;gap:32px}article{min-width:0;border:1px solid #bbb;padding:20px}h2{font-size:18px}p{margin:10px 0}.m svg{vertical-align:middle}svg{max-width:100%}table{border-collapse:collapse;margin:16px 0}td,th{border:1px solid #777;padding:8px}.katex-display{overflow:auto}.math-content p{margin:8px 0}section{border-top:1px solid #ddd;padding:8px 0}</style>${defs}<h1>Review ${reviewId}</h1><p>Source text restored with original glyphs; graphs reconstructed from source plotting data.</p><main><article id="source"><h2>Source content</h2>${source.stem}${figure}${source.table_html??''}${originalOptions}</article><article id="converted"><h2>Converted display</h2>${markdown(converted.stem)}${figure}${newOptions}</article></main>`;
   await page.setContent(markup);await page.evaluate(()=>document.fonts.ready);
   assert.equal(await page.locator('#source use').evaluateAll(uses=>uses.filter(use=>document.getElementById(use.getAttribute('href')?.slice(1))?.namespaceURI!=='http://www.w3.org/2000/svg').length),0,'An original math glyph is unresolved.');
   const overflows=await page.locator('article').evaluateAll(articles=>articles.filter(a=>a.scrollWidth>a.clientWidth+1).map(a=>a.id));
   const reference=resolve(output,reviewId+'-comparison.png');await page.screenshot({path:reference,fullPage:true});chmodSync(reference,0o600);
   const review={review_id:reviewId,stem:converted.stem,options:shuffled.choices,graph_image:image,comparison_image:reference,display_overflow:overflows};
   input.items.push(review);
   key.items.push({review_id:reviewId,source_id:id,original_indexes:shuffled.originalIndexes,expected_correct_label:shuffled.correctLabel,legacy_solution:converted.solution});
  }
  assert.ok(input.items.length,'No converted questions in this batch.');
  const persist=(file,value)=>{const text=JSON.stringify(value,null,2)+'\n',path=resolve(output,file);if(existsSync(path))assert.equal(readFileSync(path,'utf8'),text,'Existing review package changed.');else writeFileSync(path,text,{flag:'wx',mode:0o600});};
  persist('review-key.json',key);persist('solver-input.json',input);
  console.log(JSON.stringify({batch:batchId,questions:input.items.length,display_overflows:input.items.filter(q=>q.display_overflow.length).length,solver_input:resolve(output,'solver-input.json'),solver_input_sha256:sha256(JSON.stringify(input)),old_answers_in_solver_input:false}));
 } finally {await browser.close();}
}
