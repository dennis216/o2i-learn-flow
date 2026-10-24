-- 在生产 SQL editor 只读执行；不含账号修改。
SELECT role, count(*) FROM public.user_roles GROUP BY role ORDER BY role;
SELECT p.full_name,p.email,r.role FROM public.user_roles r
LEFT JOIN public.profiles p ON p.user_id=r.user_id
WHERE r.role::text IN ('instructor','admin','super_admin') ORDER BY r.role,p.email;
SELECT schemaname,tablename,policyname,cmd,qual,with_check FROM pg_policies
WHERE schemaname IN ('public','storage') ORDER BY schemaname,tablename,policyname;
SELECT c.conrelid::regclass AS dependent_table,c.conname,c.confrelid::regclass AS parent_table,
 pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c
WHERE c.contype='f' AND c.confrelid IN ('auth.users'::regclass,'public.profiles'::regclass)
ORDER BY dependent_table::text,c.conname;
