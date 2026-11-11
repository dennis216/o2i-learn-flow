// Only these local paths may be a post-login destination; anything else goes home (no open redirects).
const EXACT = ['/courses', '/practice', '/arena', '/solution-requests', '/profile'];
const THREAD = /^\/solution-requests\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function authReturnTo(value: string): string {
  if (/[\\\s]/.test(value)) return '/';
  return EXACT.includes(value) || value.startsWith('/courses?') || value.startsWith('/quiz?') || THREAD.test(value) ? value : '/';
}
