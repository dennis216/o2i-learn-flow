import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSupabaseClientConfig } from './clientConfig.ts';

const published = { url: 'https://example.supabase.co', anonKey: 'published-public-key' };
const fakeJwt = (role) => `header.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;

test('production retains its published client even when local values exist', () => {
  assert.deepEqual(resolveSupabaseClientConfig(published, false, 'http://127.0.0.1:54321', fakeJwt('anon')), published);
});

test('development uses only a complete loopback URL and anon key pair', () => {
  const key = fakeJwt('anon');
  assert.deepEqual(resolveSupabaseClientConfig(published, true, 'http://127.0.0.1:54321/', key), {
    url: 'http://127.0.0.1:54321', anonKey: key,
  });
  assert.throws(() => resolveSupabaseClientConfig(published, true, 'http://127.0.0.1:54321'), /both/);
});

test('development rejects remote URLs and privileged browser keys', () => {
  assert.throws(() => resolveSupabaseClientConfig(published, true, 'https://example.supabase.co', fakeJwt('anon')), /loopback/);
  assert.throws(() => resolveSupabaseClientConfig(published, true, 'http://127.0.0.1:54321', fakeJwt('service_role')), /anon JWT/);
  assert.throws(() => resolveSupabaseClientConfig(published, true, 'http://127.0.0.1:54321', 'sb_secret_example'), /anon JWT/);
});
