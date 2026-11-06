// A private, offline, read-only artifact for the owner's concrete content review.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { privateDirectory, sha256, verifySnapshot } from './snapshot.mjs';
import { batchPlan } from './import-batch.mjs';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const [directory,batchFile]=process.argv.slice(2);
assert.ok(directory&&batchFile,'Usage: human-review.mjs <private-directory> <prepared-batch.json>');
const base=privateDirectory(directory),manifest=verifySnapshot(base);
const raw=readFileSync(resolve(base,batchFile),'utf8'),batch=JSON.parse(raw),snapshot=JSON.parse(readFileSync(resolve(base,'snapshot.json'),'utf8'));
assert.equal(batch.snapshot_sha256,manifest.snapshot_sha256);batchPlan(batch,{topics:snapshot.topics,skills:snapshot.skills});
const cache=resolve(root,'node_modules/.cache/arena-legacy');mkdirSync(cache,{recursive:true});
const renderer=readFileSync(resolve(root,'src/components/MarkdownWithMath.tsx'),'utf8').replace("import 'katex/dist/katex.min.css';",'').replace("'@/lib/questionBankMath'",JSON.stringify(pathToFileURL(resolve(root,'src/lib/questionBankMath.ts')).href));
const modulePath=resolve(cache,'markdown-'+sha256(renderer).slice(0,12)+'.mjs');
writeFileSync(modulePath,ts.transpileModule(renderer,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText);
const Component=(await import(pathToFileURL(modulePath).href)).default;
const markdown=content=>renderToStaticMarkup(React.createElement(Component,{content,strictMath:true}));
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let css=readFileSync(resolve(root,'node_modules/katex/dist/katex.min.css'),'utf8');
css=css.replace(/url\((fonts\/[^)]+)\)/g,(_,file)=>{assert.match(file,/^fonts\/[A-Za-z0-9_-]+\.(woff2?|ttf)$/);return `url(data:font/woff2;base64,${readFileSync(resolve(root,'node_modules/katex/dist',file)).toString('base64')})`;});
const rows=batch.questions.map((q,index)=>{
 const topic=snapshot.topics.find(t=>t.topic_code===q.primary_topic_code);
 const image=q.image_url?batch.assets.find(a=>q.image_url.endsWith('/'+a.path)):null;
 const figure=image?`<img alt="Question graph" src="data:image/png;base64,${readFileSync(resolve(base,image.file)).toString('base64')}">`:'';
 const options=batch.options.filter(o=>o.question_external_id===q.external_id);
 return `<article id="q${index+1}"><h2>${index+1}. ${escape(q.external_id)}</h2><p class="meta">Topic ${escape(q.primary_topic_code)} · ${escape(topic.title)}<br>Skills: ${escape(q.practice_skill_codes)} · ${escape(q.difficulty)} · ${escape(q.course_scope)} · non-calculator</p>${markdown(q.stem)}${figure}<ol type="A">${options.map(o=>`<li>${markdown(o.option_text)}</li>`).join('')}</ol><details open><summary>答案与解析：${escape(q.correct_option_key)}</summary>${markdown(q.solution)}</details><a href="#top">返回目录</a></article>`;
}).join('\n');
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:"><title>旧 Arena ${escape(batch.batch_id)} 人工审核</title><style>${css}body{font:17px/1.7 system-ui,sans-serif;color:#17202a;max-width:980px;margin:0 auto;padding:24px;overflow-wrap:anywhere}article{margin:32px 0;padding:24px;border:1px solid #aaa;border-radius:12px;overflow-wrap:anywhere}h1{font-size:26px}h2{font-size:21px}.meta{background:#eef2f6;padding:12px}li{padding:6px}img{max-width:100%;height:auto}table{border-collapse:collapse}th,td{border:1px solid #888;padding:8px}.math-content{max-width:100%;overflow-x:auto}.katex-display{overflow:auto}summary{font-weight:600}a{color:#164c9b}.hash{font:12px monospace;overflow-wrap:anywhere}</style><main id="top"><h1>旧 Arena · ${escape(batch.batch_id)} · ${batch.questions.length} 题审核包</h1><p>这是待审核内容，尚未发布。请检查题干、四选项、答案、解析、图表和分类。独立 AI 检查不代替你的发布确认。所有题均为 non-calculator。</p><p class="hash">内容包 SHA-256：${sha256(raw)}</p><nav>${batch.questions.map((q,i)=>`<a href="#q${i+1}">${i+1}</a>`).join(' · ')}</nav>${rows}<h2>本批排除 ${batch.excluded.length} 题</h2><ul>${batch.excluded.map(e=>`<li>${escape(e.source_id)}：${escape(e.reasons.join('; '))}</li>`).join('')}</ul></main></html>`;
const output=resolve(base,batchFile.replace(/\.json$/,`-review-${sha256(raw).slice(0,12)}.html`));
writeFileSync(output,html,{mode:0o600});console.log(JSON.stringify({questions:batch.questions.length,html:output,batch_sha256:sha256(raw),human_review_status:'pending'}));
