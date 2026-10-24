import {readFileSync} from 'node:fs';
// shortcut: legacy fixtures keep old role enums, new role matrix is tested with actual migrations in database.test.mjs.
export function legacyFixtureAccessSql() {
 const sql=readFileSync(new URL('../../supabase/migrations/20261103010000_admin_module_permissions.sql',import.meta.url),'utf8');
 return sql.slice(sql.indexOf('CREATE FUNCTION public.has_admin_module'),sql.indexOf('-- Never revive'))
  .replaceAll("role='course_admin'","role::text='course_admin'").replaceAll("role='question_admin'","role::text='question_admin'");
}
