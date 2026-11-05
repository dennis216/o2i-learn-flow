import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const paths=['supabase/migrations/20261105020000_question_bank_legacy_arena_source.sql',...['00_preflight_readonly.sql','10_source_deploy.sql','20_source_verify_readonly.sql'].map(p=>'docs/arena/legacy-import/'+p)];
const read=p=>readFileSync(new URL('../../../'+p,import.meta.url),'utf8');
test('source migration is reproducible and never updates historic content or adds version columns',()=>{
 const before=paths.map(read);
 execFileSync(process.execPath,['scripts/arena/legacy/generate-source-migration.mjs'],{cwd:new URL('../../../',import.meta.url),stdio:'pipe'});
 assert.deepEqual(paths.map(read),before);
 const migration=before[0];
 assert.ok(!/ADD COLUMN|UPDATE public\.question_versions SET (?!difficulty)/.test(migration));
 assert.ok(migration.includes("SET timezone='UTC'"));
 assert.ok(migration.includes('extensions.digest(to_jsonb(q)::text'));
 assert.ok(before[1].includes('target_absent'));
 assert.ok(before[2].includes('$legacy_source$'+migration+'$legacy_source$'));
});
