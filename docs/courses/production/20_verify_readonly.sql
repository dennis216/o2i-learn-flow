WITH checks(name,ok) AS (
SELECT '20261027000000',EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261027000000' AND name='course_topic_content' AND cardinality(statements)=1 AND md5(statements[1])='52526c1ea3928dc3d09c46151fc56444')
UNION ALL SELECT 'content_rls',coalesce((SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.course_topic_content')),false)
UNION ALL SELECT 'student_content_readonly',NOT has_table_privilege('authenticated','public.course_topic_content','INSERT,UPDATE,DELETE')
) SELECT bool_and(ok) AS all_checks_pass,jsonb_agg(jsonb_build_object('name',name,'ok',ok)) AS checks FROM checks;
