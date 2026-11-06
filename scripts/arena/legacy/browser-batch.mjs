// Embed checked PNGs into the existing private batch for the signed-in admin upload UI.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { privateDirectory, sha256, verifySnapshot } from './snapshot.mjs';
import { parseLegacyArenaBatch } from '../../../src/lib/questionBankLegacyBatch.ts';

export async function browserBatch(base,batch) {
 const output={...batch,assets:batch.assets.map(asset=>{
  const file=realpathSync(resolve(base,asset.file)),path=relative(realpathSync(base),file);
  assert.ok(path&&!path.startsWith('../')&&path!=='..','Image escapes the private batch directory');
  const bytes=readFileSync(file);assert.equal(sha256(bytes),asset.sha256);
  return {path:asset.path,sha256:asset.sha256,base64:bytes.toString('base64')};
 })};
 await parseLegacyArenaBatch(output,'https://lxoaeaewcrshjkigzyqe.supabase.co/storage/v1/object/public/practice-images/');
 return output;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const [directory,batchFile]=process.argv.slice(2);assert.ok(directory&&batchFile,'Usage: browser-batch.mjs <private-directory> <prepared-batch.json>');
 const base=privateDirectory(directory),manifest=verifySnapshot(base),batch=JSON.parse(readFileSync(resolve(base,batchFile),'utf8'));
 assert.equal(batch.snapshot_sha256,manifest.snapshot_sha256);
 const payload=JSON.stringify(await browserBatch(base,batch),null,2)+'\n',file=resolve(base,batchFile.replace(/\.json$/,`-browser-${sha256(payload).slice(0,12)}.json`));
 if(existsSync(file))assert.equal(readFileSync(file,'utf8'),payload);else writeFileSync(file,payload,{mode:0o600,flag:'wx'});
 console.log(JSON.stringify({file,questions:batch.questions.length,assets:batch.assets.length,sha256:sha256(payload),human_review_status:'pending'}));
}
