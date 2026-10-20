import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { QUESTION_HEADERS, OPTION_HEADERS, parseQuestionBankWorkbook } from '../../src/lib/questionBankImport.ts';

const root=fileURLToPath(new URL('../../',import.meta.url));
const docs=join(root,'docs/question-bank');
const guide='O2I_AI_PRACTICE_WORKFLOW_V4_ZH.md';
const htmlName='START_HERE_O2I_Practice_Workflow_V4.html';
const packageName='O2I_AI_PRACTICE_WORKFLOW_V4_PACKAGE.zip';
const source='supabase/migrations/20260920010000_ap_calculus_ced_framework.sql';
const sql=readFileSync(join(root,source),'utf8');
const hash=value=>createHash('sha256').update(value).digest('hex');
const unquote=value=>value.replaceAll("''", "'");
// Parse only the fixed canonical seed shape; fail closed if its format or inventory changes.
const topics=[...sql.matchAll(/^  \((\d+), '([0-9]+\.[0-9]+)', '((?:''|[^'])*)', '(CHA|LIM|FUN)', (true|false), (\d+)\)/gm)];
const skills=[...sql.matchAll(/^  \((\d), '([1-4]\.[A-Z])', '((?:''|[^'])*)', (true|false)\)/gm)];
assert.equal(topics.length,111,'Recheck the canonical Topic seed before rebuilding');
assert.equal(skills.length,23,'Recheck the canonical Skill seed before rebuilding');
assert.equal(new Set(topics.map(t=>t[2])).size,111);
assert.equal(new Set(skills.map(s=>s[2])).size,23);
const reference=`# O2I Topic / Practice Skill代码快照\n\n生成依据：仓库规范迁移 \`${source}\`。\n\n源文件SHA-256：\`${hash(sql)}\`。这是仓库快照，未查询生产数据库，未重新核验外部CED版本；Admin保存时以实际规范数据为准。共111个Topic、23个Skill。\n\nBC-only为TRUE的Topic只用于BC；FALSE表示该Topic不是BC专属，不自动决定每题的AB/BC/BOTH。主Topic按实际数学目标选择，Skills按实际考查能力选择；代码存在不证明语义匹配。assessed为种子数据中的标记，FALSE不等于导入器禁止使用。\n\n## Topics\n\n| Code | Title | Big Idea | BC-only |\n| --- | --- | --- | --- |\n${topics.map(t=>`| ${t[2]} | ${unquote(t[3])} | ${t[4]} | ${t[5].toUpperCase()} |`).join('\n')}\n\n## Practice Skills\n\n| Code | Description | Assessed |\n| --- | --- | --- |\n${skills.map(s=>`| ${s[2]} | ${unquote(s[3])} | ${s[4].toUpperCase()} |`).join('\n')}\n`;
writeFileSync(join(docs,'O2I_CED_CODE_REFERENCE.md'),reference);

const markdown=readFileSync(join(docs,guide),'utf8');
assert.equal((markdown.match(/^```text$/gm)||[]).length,4,'Expected batch form and three prompts');
const body=renderToStaticMarkup(React.createElement(Markdown,{remarkPlugins:[remarkGfm]},markdown));
const old=readFileSync(join(docs,'START_HERE_O2I_Practice_Workflow_V2.html'),'utf8');
assert.match(old,/<main id="content">[\s\S]*?<\/main>/);
let html=old.replace(/<main id="content">[\s\S]*?<\/main>/,()=>`<main id="content">${body}</main>`)
  .replaceAll('V2','V4').replace('四步流程','两个Chat · 三个Prompt')
  .replace("label.textContent='可复制 Prompt '+(index+1)","label.textContent=index===0?'批次说明':'Prompt '+index");
assert.equal((html.match(/<pre>/g)||[]).length,4);
assert.ok(!html.includes('逐关卡审核证据保存'),'Historical instructions leaked into V4 HTML');
writeFileSync(join(docs,htmlName),html);

const template=readFileSync(join(docs,'templates/O2I_Question_Bank_Import_Template.xlsx'));
const sheets=await parseQuestionBankWorkbook(template.buffer.slice(template.byteOffset,template.byteOffset+template.byteLength));
assert.deepEqual(sheets.map(s=>s.sheet),['Questions','Options','Instructions']);
assert.deepEqual(sheets[0].data,[Array.from(QUESTION_HEADERS)]);
assert.deepEqual(sheets[1].data,[Array.from(OPTION_HEADERS)]);
assert.equal(QUESTION_HEADERS.length,28);
assert.equal(OPTION_HEADERS.length,6);
assert.ok(JSON.stringify(sheets[2].data).includes('v4导出五项审核pending'));
const files=[guide,htmlName,'O2I_AI_QUESTION_WORKFLOW_ZH.md','O2I_QUESTION_PROCESSING_PROMPT_ZH.md',
  'O2I_QUESTION_IMPORT_SCHEMA.md','O2I_HUMAN_REVIEW_SOP_ZH.md','O2I_CED_CODE_REFERENCE.md',
  'templates/O2I_Question_Bank_Import_Template.xlsx','WORKFLOW_V4_VALIDATION.md'];
for(const name of files.filter(f=>f.endsWith('.md'))){
  for(const [,target] of readFileSync(join(docs,name),'utf8').matchAll(/\]\(([^)]+)\)/g)){
    if(target.startsWith('#')||/^https?:/.test(target))continue;
    const file=decodeURIComponent(target.split('#')[0]);
    assert.ok(files.includes(file),`Unpackaged link: ${name} -> ${file}`);
    assert.ok(existsSync(join(docs,file)),`Missing link: ${file}`);
  }
}
const stage=mkdtempSync(join(tmpdir(),'o2i-workflow-v4-package-'));
try{
  const manifest={version:4,source,source_sha256:hash(sql),topics:111,skills:23,question_columns:28,option_columns:6,
    files:Object.fromEntries(files.map(name=>[name,hash(readFileSync(join(docs,name)))]))};
  for(const name of files){mkdirSync(dirname(join(stage,name)),{recursive:true});copyFileSync(join(docs,name),join(stage,name));}
  writeFileSync(join(stage,'MANIFEST.json'),JSON.stringify(manifest,null,2)+'\n');
  execFileSync('zip',['-q','-X',join(stage,packageName),...files,'MANIFEST.json'],{cwd:stage});
  execFileSync('unzip',['-t',join(stage,packageName)],{stdio:'pipe'});
  copyFileSync(join(stage,packageName),join(docs,packageName));
  console.log(JSON.stringify({package:packageName,files:files.length+1,topics:111,skills:23,question_columns:28,option_columns:6,checks:'passed'}));
}finally{rmSync(stage,{recursive:true,force:true});}
