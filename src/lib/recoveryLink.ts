export interface RecoveryLink {
  code: string | null;
  isRecovery: boolean;
  error: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  /** True only when the URL really came from a reset email (or an expired/invalid one). */
  hasCredentials: boolean;
}

/** Read a password-reset link from the URL query and hash; a plain visit has no credentials. */
export function parseRecoveryLink(search: string, hash: string): RecoveryLink {
  const query = new URLSearchParams(search);
  const fragment = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const code = query.get('code');
  const isRecovery = fragment.get('type') === 'recovery';
  // Expired links come back as #error_description=... (implicit flow) or ?error_description=... (PKCE).
  const error = query.get('error_description') ?? fragment.get('error_description');
  return {
    code,
    isRecovery,
    error,
    accessToken: fragment.get('access_token'),
    refreshToken: fragment.get('refresh_token'),
    hasCredentials: Boolean(code || isRecovery || error),
  };
}
