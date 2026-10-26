// Isolated UI fixtures use the real shared components; no API or database writes.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const { chromium } = await import(process.env.O2I_PLAYWRIGHT_MODULE ?? '/Users/mucenyao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const cache = resolve('node_modules/.cache/dialog-scroll');
mkdirSync(cache, { recursive: true });
writeFileSync(resolve(cache, 'index.html'), '<html><body><div id="root"></div><script type="module" src="./fixture.tsx"></script></body></html>');
writeFileSync(resolve(cache, 'fixture.tsx'), `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogTrigger } from '/src/components/ui/dialog';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '/src/components/ui/sheet';
import '/src/index.css';
function Fixture() {
 const [open, setOpen] = useState(false), [full, setFull] = useState(false), [busy, setBusy] = useState(false), [dirty, setDirty] = useState(false);
 return <><button onClick={() => {setFull(false); setOpen(true);}}>Open long</button><button onClick={() => {setFull(true); setOpen(true);}}>Open full</button>
 <Dialog open={open} onOpenChange={next => {if (!busy && (!dirty || window.confirm('Discard?'))) setOpen(next);}}>
 <DialogContent scrollable className={full ? 'inset-0 left-0 top-0 h-[100dvh] max-h-[100dvh] max-w-none translate-x-0 translate-y-0 rounded-none p-3 sm:p-5' : 'max-w-2xl'}>
 <DialogHeader><DialogTitle>{'Long course heading '.repeat(5)}</DialogTitle></DialogHeader>
 <DialogBody><DialogDescription>{'Long description '.repeat(40)}</DialogDescription>
 <label><input type="checkbox" checked={busy} onChange={e => setBusy(e.target.checked)} />Busy</label>
 <label><input type="checkbox" checked={dirty} onChange={e => setDirty(e.target.checked)} />Unsaved</label>
 {Array.from({length: 50}, (_, n) => <label key={n}>Field {n}<input aria-label={'Field '+n} defaultValue={'Value '+n} className="block border" /></label>)}
 <Dialog><DialogTrigger>Open nested</DialogTrigger><DialogContent scrollable><DialogHeader><DialogTitle>Nested editor</DialogTitle></DialogHeader><DialogBody><DialogDescription>Nested details</DialogDescription>{Array.from({length:30},(_,n)=><p key={n}>Nested row {n}</p>)}</DialogBody></DialogContent></Dialog>
 <button onClick={() => setDirty(false)}>Save changes</button></DialogBody></DialogContent></Dialog>
 <Dialog><DialogTrigger>Open short</DialogTrigger><DialogContent><DialogHeader><DialogTitle>Short dialog</DialogTitle></DialogHeader><DialogDescription>Short description</DialogDescription></DialogContent></Dialog>
 <Sheet><SheetTrigger>Open side</SheetTrigger><SheetContent><SheetTitle>Side menu</SheetTitle></SheetContent></Sheet>
 <Dialog><DialogTrigger>Open player</DialogTrigger><DialogContent className="h-[85vh] max-w-5xl flex flex-col p-0"><DialogHeader className="p-4"><DialogTitle>Player</DialogTitle></DialogHeader><DialogDescription>Player description</DialogDescription><div className="flex-1" /></DialogContent></Dialog>
 </>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
`);
const app = 'http://127.0.0.1:5198';
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5198', '--strictPort'], { stdio: 'ignore' });
let browser;
try {
 for (let n = 0; ; n++) {
  try { if ((await fetch(app)).ok) break; } catch {}
  if (n > 100) throw new Error('Vite startup timeout');
  await new Promise(r => setTimeout(r, 200));
 }
 browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
 const page = await browser.newPage();
 const errors = [];
 page.on('pageerror', e => errors.push(e.message));
 const out = resolve('outputs/dialog-scroll'); mkdirSync(out, { recursive: true });
 for (const viewport of [{ width:1280,height:960 }, { width:375,height:667 }, { width:667,height:375 }]) {
  await page.setViewportSize(viewport);
  await page.goto(app + '/node_modules/.cache/dialog-scroll/index.html');
  for (const mode of ['long','full']) {
   await page.getByRole('button', { name:'Open '+mode, exact:true }).click();
   const dialog = page.getByRole('dialog'), body = dialog.locator(':scope > [data-dialog-body]');
   const header = dialog.locator(':scope > [data-dialog-header]'), close = dialog.getByRole('button', { name:'Close', exact:true });
   await header.waitFor(); await page.waitForTimeout(250);
   const before = { header:await header.boundingBox(), close:await close.boundingBox() };
   for (const fraction of [0.5, 1]) {
    await body.evaluate((el, f) => { el.scrollTop=(el.scrollHeight-el.clientHeight)*f; }, fraction);
    assert.ok(await body.evaluate(el => el.scrollTop > 0 && el.clientHeight > 0));
    const after = { header:await header.boundingBox(), close:await close.boundingBox() };
    assert.ok(Math.abs(before.header.y-after.header.y) < 1);
    assert.ok(Math.abs(before.close.y-after.close.y) < 1);
    assert.ok(after.close.y >= 0 && after.close.y+after.close.height <= viewport.height);
    assert.ok(await close.evaluate(el => {const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}));
   }
   assert.ok(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth));
   await dialog.getByRole('textbox', { name:'Field 49', exact:true }).focus();
   await dialog.getByRole('textbox', { name:'Field 49', exact:true }).fill('Kept value');
   await dialog.getByRole('button', { name:'Open nested', exact:true }).click();
   const nested = page.getByRole('dialog', { name:'Nested editor', exact:true });
   await nested.locator('[data-dialog-body]').evaluate(el => {el.scrollTop=el.scrollHeight;});
   await nested.getByRole('button', { name:'Close', exact:true }).click();
   await nested.waitFor({ state:'hidden' });
   assert.equal(await dialog.getByRole('button', { name:'Open nested',exact:true }).evaluate(el=>el===document.activeElement), true);
   assert.equal(await dialog.getByRole('textbox', { name:'Field 49', exact:true }).inputValue(), 'Kept value');
   await dialog.getByRole('button', { name:'Save changes', exact:true }).click();
   await page.screenshot({ path:resolve(out, viewport.width+'-'+mode+'.png') });
   await close.click(); await dialog.waitFor({ state:'hidden' });
  }
  await page.getByRole('button', { name:'Open long', exact:true }).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByRole('checkbox', { name:'Busy',exact:true }).check();
  await dialog.getByRole('button',{name:'Close',exact:true}).click(); assert.equal(await dialog.count(),1);
  await page.keyboard.press('Escape'); assert.equal(await dialog.count(),1);
  await dialog.getByRole('checkbox', { name:'Busy',exact:true }).uncheck();
  await dialog.getByRole('checkbox', { name:'Unsaved',exact:true }).check();
  page.once('dialog', prompt=>prompt.dismiss());
  await dialog.getByRole('button',{name:'Close',exact:true}).click(); assert.equal(await dialog.count(),1);
  page.once('dialog', prompt=>prompt.accept());
  await page.keyboard.press('Escape'); await dialog.waitFor({ state:'hidden' });
  for (const [name,display] of [['short','grid'],['side','block'],['player','flex']]) {
   await page.getByRole('button',{name:'Open '+name,exact:true}).click();
   const short=page.getByRole('dialog');
   assert.equal(await short.locator('[data-dialog-body]').count(),0);
   assert.equal(await short.evaluate(el=>getComputedStyle(el).display),display);
   await page.keyboard.press('Escape'); await short.waitFor({ state:'hidden' });
  }
 }
 assert.deepEqual(errors,[]);
 console.log('PASS fixed headings/X: desktop, phone, landscape, full-screen, nested close, focus, edits, guards, footer reachability, unchanged short/sheet/player layouts');
} finally { await browser?.close(); vite.kill(); }
