// Screenshot of actual saved evidence, not an application acceptance screenshot.
import { readFileSync } from 'node:fs';
const { chromium } = await import(process.env.O2I_PLAYWRIGHT_MODULE ?? '/Users/mucenyao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const [source,output]=process.argv.slice(2);
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try {
 const page=await browser.newPage({viewport:{width:1200,height:900}});
 const text=readFileSync(source,'utf8');
 await page.setContent('<html><head><meta charset="utf-8"><style>body{font:18px/1.65 system-ui;padding:36px;background:#f3f5f8;color:#162339}pre{white-space:pre-wrap;font:inherit;background:white;padding:28px;border-radius:12px}h1{font-size:26px}</style></head><body><h1>O2I · 本地证据报告 / 非线上验收</h1><pre></pre></body></html>');
 await page.locator('pre').textContent();
 await page.locator('pre').evaluate((el,value)=>el.textContent=value,text);
 await page.screenshot({path:output,fullPage:true});
} finally {await browser.close();}
