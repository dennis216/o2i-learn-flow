export const ACCOUNT_ROLES = ['student', 'admin', 'course_admin', 'question_admin'] as const;
export type ManagedAccountRole = typeof ACCOUNT_ROLES[number];
export const ACCOUNT_ROLE_LABELS = { student: 'Student', admin: 'Full Admin', course_admin: 'Course Admin', question_admin: 'Question Admin', super_admin: 'Super Admin' };
export type AdminAccess = { courses: boolean; questions: boolean; playground: boolean; team: boolean; users: boolean };
export const NO_ADMIN_ACCESS: AdminAccess = { courses: false, questions: false, playground: false, team: false, users: false };
export function parseAdminAccess(value: unknown): AdminAccess {
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return Object.fromEntries(Object.keys(NO_ADMIN_ACCESS).map(key => [key, data[key] === true])) as AdminAccess;
}
export function canAccessAdminTab(access: AdminAccess, tab: string): boolean {
  if (['manage-courses', 'courses', 'course-content', 'subjects', 'manage', 'videos'].includes(tab)) return access.courses;
  if (tab === 'question-bank') return access.questions;
  return tab === 'playground' ? access.playground : tab === 'team' ? access.team : tab === 'users' && access.users;
}
export function defaultAdminTab(access: AdminAccess): string {
  return access.courses ? 'manage-courses' : access.questions ? 'question-bank' : access.playground ? 'playground' : access.team ? 'team' : 'users';
}
