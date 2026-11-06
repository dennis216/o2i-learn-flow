// Render actual local verification output; this is a test report, never product UI evidence.
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('Usage: node scripts/capture-course-task-report.mjs report.json screenshot.png');
const report = JSON.parse(readFileSync(input, 'utf8'));
const { chromium } = await import(process.env.O2I_PLAYWRIGHT_MODULE ?? '/Users/mucenyao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const browser = await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try {
 const page = await browser.newPage({viewport:{width:1200,height:850}});
 await page.setContent('<main><h1>Course management — local verification</h1><p>Disposable test database / synthetic fixtures. NOT production acceptance.</p><pre></pre></main><style>body{font:18px system-ui;background:#101827;color:#e5edf8;padding:32px}main{max-width:1060px;margin:auto}h1{color:#92baff}pre{font:17px/1.65 ui-monospace;white-space:pre-wrap;background:#1c293d;border-radius:12px;padding:25px}p{color:#bdc8d8}</style>');
 await page.locator('pre').textContent();
 await page.locator('pre').evaluate((el, text)=>{el.textContent=text},JSON.stringify(report,null,2));
 mkdirSync(dirname(resolve(output)),{recursive:true});
 await page.screenshot({path:resolve(output),fullPage:true});
} finally {await browser.close();}
