export function authReturnTo(value: string): string {
  if (/[\\\s]/.test(value)) return '/';
  return value === '/courses' || value.startsWith('/courses?') || value.startsWith('/quiz?') ? value : '/';
}
