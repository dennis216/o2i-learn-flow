import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseRecoveryLink } from './recoveryLink.ts';

test('a plain visit (for example by a signed-in user) is not a reset link', () => {
  assert.equal(parseRecoveryLink('', '').hasCredentials, false);
});
test('legacy hash link is recognised', () => {
  const link = parseRecoveryLink('', '#access_token=a&refresh_token=r&type=recovery');
  assert.deepEqual([link.hasCredentials, link.isRecovery, link.accessToken, link.refreshToken], [true, true, 'a', 'r']);
});
test('PKCE link with a code is recognised', () => {
  const link = parseRecoveryLink('?code=abc', '');
  assert.deepEqual([link.hasCredentials, link.code], [true, 'abc']);
});
test('expired links report the error from the hash or the query', () => {
  assert.equal(parseRecoveryLink('', '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired').error, 'Email link is invalid or has expired');
  assert.equal(parseRecoveryLink('?error_description=expired', '').hasCredentials, true);
});
test('a normal login hash is not a reset link', () => {
  assert.equal(parseRecoveryLink('', '#access_token=a&refresh_token=r&type=magiclink').hasCredentials, false);
});
