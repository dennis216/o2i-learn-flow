// Public-key probes only: no account creation, role changes, email or deletion.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
const source = readFileSync(new URL('../../src/integrations/supabase/client.ts', import.meta.url), 'utf8');
const url = source.match(/PUBLISHED_SUPABASE_URL = "([^"]+)"/)?.[1];
const key = source.match(/PUBLISHED_SUPABASE_ANON_KEY = "([^"]+)"/)?.[1];
assert.ok(url && key, 'Published Supabase configuration was not found');
const headers = { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
const results = [];
const record = (check, details) => { results.push({ check, ...details }); console.log('PASS ' + check); };
for (const [name, args] of [
  ['get_admin_access', {}],
  ['has_admin_module', { _module: 'courses' }],
  ['set_account_role', { _user_id: '00000000-0000-4000-8000-000000000000', _role: 'student' }],
  ['preview_user_deletion', { _user_id: '00000000-0000-4000-8000-000000000000' }],
  ['prepare_user_deletion', { _user_id: '00000000-0000-4000-8000-000000000000', _email: 'nonexistent@example.invalid' }],
]) {
  const response = await fetch(url + '/rest/v1/rpc/' + name, { method: 'POST', headers, body: JSON.stringify(args), signal: AbortSignal.timeout(15000) });
  const body = await response.json();
  if (name === 'has_admin_module') assert.ok(response.ok && body === false, 'Anonymous access must remain denied');
  else if (name === 'get_admin_access' && response.ok) {
    assert.ok(['courses', 'questions', 'playground', 'team', 'users'].every(module => body[module] === false), 'Anonymous users must have no modules');
  } else assert.ok([401, 403].includes(response.status) && body.code === '42501', name + ' must exist and deny anonymous execution: ' + JSON.stringify(body));
  record(name + ': installed and anonymous access denied', { status: response.status });
}
for (const name of ['admin-invite-user', 'admin-delete-user']) {
  const endpoint = url + '/functions/v1/' + name;
  const preflight = await fetch(endpoint, { method: 'OPTIONS', headers: { Origin: 'https://o2iinstitute.org', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' }, signal: AbortSignal.timeout(15000) });
  assert.ok(preflight.ok, name + ' CORS preflight failed: ' + preflight.status);
  const response = await fetch(endpoint, { method: 'POST', headers, body: '{}', signal: AbortSignal.timeout(15000) });
  assert.ok([401, 403].includes(response.status), name + ' must reject anonymous requests: ' + response.status);
  record(name + ': deployed, CORS works, anonymous request denied', { preflight: preflight.status, anonymous: response.status });
}
for (const origin of ['https://o2iinstitute.org', 'https://www.o2iinstitute.org']) {
  const response = await fetch(origin + '/admin', { signal: AbortSignal.timeout(20000) });
  assert.ok(response.ok, origin + ' admin page is unreachable');
  record(origin + '/admin: reachable', { status: response.status, finalUrl: response.url });
}
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify({ checkedAt: new Date().toISOString(), scope: 'Public API availability and denied anonymous access; authenticated acceptance is separate.', results }, null, 2) + '\n');
