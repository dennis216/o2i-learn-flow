import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const version = '20261104000000';
const name = 'question_practice_continuous';

test('November 4 merged migrations have unique versions and preserve Arena', () => {
  const files = readdirSync(new URL('../supabase/migrations/', import.meta.url)).filter(f => f.startsWith('20261104'));
  assert.equal(new Set(files.map(f => f.split('_')[0])).size, files.length);
  assert.ok(files.includes('20261104000100_arena_game.sql'));
  assert.ok(files.includes(`${version}_${name}.sql`));
});

test('continuous release, generator and database acceptance agree with the synchronized version', () => {
  const source = read(`supabase/migrations/${version}_${name}.sql`);
  const hash = createHash('md5').update(source).digest('hex');
  for (const file of ['00_preflight_readonly.sql', '10_deploy.sql', '20_verify_readonly.sql']) {
    const sql = read('docs/question-bank/production/continuous-practice/' + file);
    assert.ok(sql.includes(version), file);
    assert.ok(!sql.includes('20261104010000'), file);
  }
  const deploy = read('docs/question-bank/production/continuous-practice/10_deploy.sql');
  assert.ok(deploy.includes(`$continuous$${source}$continuous$`));
  assert.ok(deploy.includes(`VALUES('${version}','${name}',ARRAY[migration_sql])`));
  assert.ok(read('docs/question-bank/production/continuous-practice/20_verify_readonly.sql').includes(hash));
  for (const file of ['scripts/generate-continuous-practice-deploy.mjs', 'scripts/continuous-practice-db.acceptance.mjs']) {
    assert.ok(read(file).includes(version), file);
    assert.ok(!read(file).includes('20261104010000'), file);
  }
});
