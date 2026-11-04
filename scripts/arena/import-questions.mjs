// Upserts the private questions JSON into public.arena_questions.
// The service-role key bypasses all database security: pass it through the
// environment only, and never put it in this repo or in frontend code.
//
// SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... \
//   node scripts/arena/import-questions.mjs <questions.json>
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const [file] = process.argv.slice(2);
const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.ok(file && url && key, 'Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node import-questions.mjs <questions.json>');

const questions = JSON.parse(readFileSync(file, 'utf8'));
assert.ok(Array.isArray(questions) && questions.length > 0, 'No questions found.');
for (const q of questions) {
  assert.ok(q.id && q.stem && q.explanation && q.topic, `Question ${q.id ?? '?'} is incomplete.`);
  assert.ok(Number.isInteger(q.unit) && q.unit >= 1 && q.unit <= 10, `Question ${q.id} has a bad unit.`);
  assert.ok([1, 2, 3].includes(q.tier), `Question ${q.id} has a bad tier.`);
  assert.equal(q.options?.length, 4, `Question ${q.id} needs four options.`);
}

const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
const batchSize = 50;
for (let i = 0; i < questions.length; i += batchSize) {
  const response = await fetch(`${url}/rest/v1/arena_questions?on_conflict=id`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(questions.slice(i, i + batchSize)),
  });
  assert.ok(response.ok, `Import failed at question ${i}: ${response.status} ${await response.text()}`);
}

const check = await fetch(`${url}/rest/v1/arena_questions?select=id`, {
  method: 'HEAD',
  headers: { ...headers, Prefer: 'count=exact' },
});
assert.ok(check.ok, `Could not verify the import: ${check.status}`);
console.log(`Imported ${questions.length} questions. Table now holds ${check.headers.get('content-range')?.split('/')[1]}.`);
