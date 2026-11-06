import {readFileSync,writeFileSync} from 'node:fs';
const releases=[['10_roles.sql','20261103000000','admin_module_role_values'],['20_permissions.sql','20261103010000','admin_module_permissions'],['30_deletion.sql','20261103020000','admin_user_deletion'],['40_account_data.sql','20261103030000','admin_account_data_guards']];
for(const [file,version,name] of releases){
 const source=readFileSync(`supabase/migrations/${version}_${name}.sql`,'utf8');
 const prerequisite=version==='20261103010000'?`IF to_regprocedure('public.get_course_outline_v2(uuid)') IS NULL OR to_regprocedure('public.question_bank_require_admin()') IS NULL OR to_regclass('public.playground_links') IS NULL THEN RAISE EXCEPTION 'Required course/question/playground baseline is missing. Stop and inspect.'; END IF;`:version==='20261103020000'||version==='20261103030000'?`IF to_regprocedure('public.has_admin_module(text)') IS NULL THEN RAISE EXCEPTION 'Module permissions must be installed first.'; END IF;`:'';
 const sql=`-- Controlled forward deployment. Run each numbered file separately, in order. Never use broad db push.\nBEGIN;\nDO $preflight$ BEGIN\n IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='${version}') THEN RAISE EXCEPTION 'This migration is already registered. Stop; use read-only verification.'; END IF;\n${prerequisite}\nEND $preflight$;\n${source}\nINSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('${version}','${name}',ARRAY[$admin_source$${source}$admin_source$]);\nCOMMIT;\n`;
 writeFileSync('docs/admin-access/production/'+file,sql);
}
