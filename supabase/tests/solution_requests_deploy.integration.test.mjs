// Runs the generated production package (preflight → upgrade → verify) against a disposable local database.
// SR_TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/srtest npm run test:solution-requests:db
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { files } from '../../scripts/generate-solution-request-deploy.mjs';
import { files as closeFiles } from '../../scripts/generate-solution-request-close-deploy.mjs';

const url = process.env.SR_TEST_DATABASE_URL;
assert.ok(url, 'Set SR_TEST_DATABASE_URL to a disposable local database.');
assert.match(url, /127\.0\.0\.1|localhost/, 'Refusing to run against a non-local database.');
const run = (args, input) => execFileSync('psql', [url, '-qtAX', '-v', 'ON_ERROR_STOP=1', ...args], {
  encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'],
}).trim();
const sqlFile = name => run(['-f', '-'], files[name]);

test('committed packages match the generators', () => {
  for (const [name, text] of Object.entries(files)) {
    assert.equal(readFileSync(new URL(`../../docs/solution-requests/${name}`, import.meta.url), 'utf8'), text, `${name} is stale; run the generator`);
  }
  for (const [name, text] of Object.entries(closeFiles)) {
    assert.equal(readFileSync(new URL(`../../docs/solution-requests/close-direct-access/${name}`, import.meta.url), 'utf8'), text, `close-direct-access/${name} is stale; run the generator`);
  }
});

test('preflight, upgrade and verify succeed once; a second upgrade is refused', () => {
  run(['-c', 'DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA IF EXISTS storage CASCADE; DROP SCHEMA IF EXISTS supabase_migrations CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO PUBLIC;']);
  run(['-f', new URL('./fixtures/solution_requests_baseline.sql', import.meta.url).pathname]);
  run(['-c', 'CREATE SCHEMA supabase_migrations; CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY, name text, statements text[]);']);
  const preflight = JSON.parse(sqlFile('00_preflight_readonly.sql').split('\n')[0]);
  assert.equal(preflight.baseline_ok, true);
  // As pasted from a Windows clipboard: CRLF line ends and stray trailing spaces must still pass the fingerprint.
  run(['-f', '-'], files['10_upgrade.sql'].replaceAll('\n', ' \r\n'));
  const verify = JSON.parse(sqlFile('20_verify_readonly.sql'));
  assert.equal(verify.all_checks_pass, true, JSON.stringify(verify.checks));
  assert.equal(JSON.parse(sqlFile('00_preflight_readonly.sql').split('\n')[0]).baseline_ok, false);
  assert.throws(() => sqlFile('10_upgrade.sql'), e => /already registered/.test(String(e.stderr)));
});

test('a truncated paste is refused with the length it got, and changes nothing', () => {
  run(['-c', 'DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA IF EXISTS storage CASCADE; DROP SCHEMA IF EXISTS supabase_migrations CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO PUBLIC;']);
  run(['-f', new URL('./fixtures/solution_requests_baseline.sql', import.meta.url).pathname]);
  run(['-c', 'CREATE SCHEMA supabase_migrations; CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY, name text, statements text[]);']);
  const broken = files['10_upgrade.sql'].replace("NOTIFY pgrst,'reload schema';", '');
  assert.throws(() => run(['-f', '-'], broken), e => /does not match the repository migration \(got \d+ characters/.test(String(e.stderr)));
  assert.equal(JSON.parse(sqlFile('00_preflight_readonly.sql').split('\n')[0]).baseline_ok, true);
});

test('the close-direct-access package needs the first one, runs once and verifies', () => {
  const close = name => run(['-f', '-'], closeFiles[name]);
  assert.throws(() => close('10_upgrade.sql'), e => /Deploy 20261111000000/.test(String(e.stderr)));
  run(['-f', '-'], files['10_upgrade.sql']);
  const before = JSON.parse(close('00_preflight_readonly.sql'));
  assert.deepEqual([before.baseline_ok, before.anon_can_select], [true, true]);
  assert.equal(before.direct_policies.length, 2);
  run(['-f', '-'], closeFiles['10_upgrade.sql'].replaceAll('\n', '\r\n'));
  const verify = JSON.parse(close('20_verify_readonly.sql'));
  assert.equal(verify.all_checks_pass, true, JSON.stringify(verify.checks));
  assert.throws(() => close('10_upgrade.sql'), e => /Already registered/.test(String(e.stderr)));
});
