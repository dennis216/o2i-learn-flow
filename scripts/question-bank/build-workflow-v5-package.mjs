import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { WORKFLOW_QUESTION_HEADERS, OPTION_HEADERS, parseQuestionBankWorkbook } from '../../src/lib/questionBankImport.ts';

const root=fileURLToPath(new URL('../../',import.meta.url));
const directory=join(root,'docs/question-bank/workflow-v5');
const guide='O2I_AI_ASSISTED_PRACTICE_PROBLEM_WORKFLOW_V5_ZH.md';
const htmlName='START_HERE_O2I_Practice_Workflow_V5.html';
const archive=join(root,'docs/question-bank/O2I_AI_PRACTICE_WORKFLOW_V5_PACKAGE.zip');
const reference=readFileSync(join(root,'docs/question-bank/O2I_CED_CODE_REFERENCE.md'),'utf8');
const tables=reference.slice(reference.indexOf('## Topics'));
assert.equal((tables.match(/^\| \d+\.\d+ \|/gm)||[]).length,111);
assert.equal((tables.match(/^\| \d\.[A-Z] \|/gm)||[]).length,23);
writeFileSync(join(directory,'input package/AP_CALCULUS_CED_TAXONOMY.md'),
 '# AP Calculus 标签说明\n\n主Topic选这道题主要考查的数学目标；Skill只选实际考查的能力，可以多个。代码存在还要核对含义，不按章节标题机械打标签。\n\n课程范围使用AB、BC或BOTH；BC-only为TRUE的Topic只能用于BC。easy/medium/hard是编辑难度，综合方法选择、概念要求与易错程度判断，不是College Board的难度标签，不按解析长短判断。\n\n以下111个Topic和23个Skill来自仓库现有规范配置。assessed为原配置标记，FALSE不代表禁止使用。网站上传时会再核对当前数据库中的代码。\n\n'+tables);
const md=readFileSync(join(directory,guide),'utf8');
assert.equal((md.match(/^```text$/gm)||[]).length,3);
const body=renderToStaticMarkup(React.createElement(Markdown,{remarkPlugins:[remarkGfm]},md));
const old=readFileSync(join(root,'docs/question-bank/START_HERE_O2I_Practice_Workflow_V4.html'),'utf8');
const style=old.match(/<style>([\s\S]*?)<\/style>/)[1];
const html=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>O2I 真实题整理与审核 V5</title><style>${style}</style></head><body>
<header class="hero"><h1>O2I 真实题整理与审核 · V5</h1><p>准备五个文件，按顺序复制三段提示词。</p></header>
<div class="layout"><nav class="toc" aria-label="目录"><h2>从这里开始</h2><div id="toc-links"></div><hr><a href="O2I_AI_ASSISTED_PRACTICE_PROBLEM_WORKFLOW_V5_ZH.md">流程说明</a><a href="O2I_HUMAN_REVIEW_SOP_ZH.md">审核卡怎么用</a><a href="input%20package/O2I_Question_Bank_Import_Template.xlsx">空白模板</a></nav><main id="content">${body}</main></div>
<script>
const main=document.getElementById('content'),toc=document.getElementById('toc-links');
main.querySelectorAll('h2').forEach((h,i)=>{h.id='step-'+i;const a=document.createElement('a');a.href='#'+h.id;a.textContent=h.textContent;toc.append(a)});
main.querySelectorAll('table').forEach(t=>{const w=document.createElement('div');w.className='table-wrap';t.before(w);w.append(t)});
main.querySelectorAll('pre').forEach((pre,i)=>{const w=document.createElement('div');w.className='prompt';const bar=document.createElement('div');bar.className='prompt-bar';const label=document.createElement('span');label.textContent=['Chat A','Chat B · 独立复核','Chat B · 审核卡与导出'][i];const button=document.createElement('button');button.type='button';button.className='copy';button.textContent='复制提示词';button.addEventListener('click',async()=>{try{if(!navigator.clipboard)throw new Error();await navigator.clipboard.writeText(pre.textContent)}catch{const box=document.createElement('textarea');box.value=pre.textContent;document.body.append(box);box.select();const copied=document.execCommand('copy');box.remove();if(!copied){button.textContent='请手动选中文字复制';return}}button.textContent='已复制';setTimeout(()=>button.textContent='复制提示词',1600)});bar.append(label,button);pre.before(w);w.append(bar,pre)});
</script></body></html>`;
writeFileSync(join(directory,htmlName),html);
const template=readFileSync(join(directory,'input package/O2I_Question_Bank_Import_Template.xlsx'));
const sheets=await parseQuestionBankWorkbook(template.buffer.slice(template.byteOffset,template.byteOffset+template.byteLength));
assert.deepEqual(sheets.map(s=>s.sheet),['Questions','Options','Instructions']);
assert.deepEqual(sheets[0].data,[Array.from(WORKFLOW_QUESTION_HEADERS)]);
assert.deepEqual(sheets[1].data,[Array.from(OPTION_HEADERS)]);
const files=[guide,htmlName,'O2I_HUMAN_REVIEW_SOP_ZH.md','input package/O2I_QUESTION_IMPORT_SCHEMA.md',
 'input package/O2I_Question_Bank_Import_Template.xlsx','input package/AP_CALCULUS_CED_TAXONOMY.md'];
assert.deepEqual(readdirSync(join(directory,'input package')).sort(),files.filter(f=>f.startsWith('input package/')).map(f=>f.split('/')[1]).sort());
for(const name of files)assert.ok(existsSync(join(directory,name)),name);
// A fresh archive prevents removed or incidental files from leaking into the handoff.
const output=execFileSync('python3',['-c',
 'import json,sys,zipfile; p,root,files=sys.argv[1:]; names=json.loads(files); z=zipfile.ZipFile(p,"w",zipfile.ZIP_DEFLATED); [z.write(root+"/"+n,n) for n in names]; z.close(); z=zipfile.ZipFile(p); assert z.testzip() is None; assert z.namelist()==names; print("ZIP verified")',
 archive,directory,JSON.stringify(files)],{encoding:'utf8'}).trim();
console.log(JSON.stringify({archive,files:6,input_files:3,columns:[26,6],prompts:3,topics:111,skills:23,result:output}));
