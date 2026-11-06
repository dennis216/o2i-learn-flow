-- Run after deployment. all_checks_pass must be true; compare counts to preflight.
WITH checks(name,ok) AS (
SELECT 'custom_check_1',(EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261101000000' AND name='course_custom_outline' AND cardinality(statements)=1 AND md5(statements[1])='bb5330126a8bfcdcc6887a740c68425e'))
UNION ALL
SELECT 'custom_check_2',(EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261101010000' AND name='managed_course_creation' AND cardinality(statements)=1 AND md5(statements[1])='7b1be5590f376625235de8598976bbca'))
UNION ALL
SELECT 'custom_check_3',(EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261101020000' AND name='course_outline_editor_guard' AND cardinality(statements)=1 AND md5(statements[1])='83346d302c6806e82245c0747a48349a'))
UNION ALL
SELECT 'custom_check_4',(EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261101030000' AND name='course_video_library' AND cardinality(statements)=1 AND md5(statements[1])='f169bd75041c4b3accf0d0c437b83d4b'))
UNION ALL
SELECT 'custom_check_5',(coalesce((SELECT md5(prosrc)='ab492415c5b2ef220edcaa8105a61265' AND prosecdef AND proconfig=ARRAY['search_path=public, extensions'] FROM pg_proc WHERE oid=to_regprocedure('public.get_course_outline_v2(uuid)')),false))
UNION ALL
SELECT 'custom_check_6',(coalesce((SELECT md5(prosrc)='e6da93ac99594609211847d58e80652f' AND prosecdef AND proconfig=ARRAY['search_path=public, extensions'] FROM pg_proc WHERE oid=to_regprocedure('public.get_course_outline_entry(uuid,uuid)')),false))
UNION ALL
SELECT 'custom_check_7',(coalesce((SELECT md5(prosrc)='37b190612110944d770020a29b6acd3c' AND prosecdef AND proconfig=ARRAY['search_path=public, extensions'] FROM pg_proc WHERE oid=to_regprocedure('public.save_course_outline_content(uuid,boolean,jsonb,text,bigint,uuid)')),false))
UNION ALL
SELECT 'custom_check_8',(coalesce((SELECT md5(prosrc)='0d46e058364aa032e8ffadc4b1c800d2' AND prosecdef AND proconfig=ARRAY['search_path=public, extensions'] FROM pg_proc WHERE oid=to_regprocedure('public.edit_course_outline(uuid,bigint,text,jsonb)')),false))
UNION ALL
SELECT 'custom_check_9',(coalesce((SELECT md5(prosrc)='2aa8cbf5a95fee4512d406e16546ac1a' AND prosecdef AND proconfig=ARRAY['search_path=public, extensions'] FROM pg_proc WHERE oid=to_regprocedure('public.resolve_course_entry(uuid,uuid,uuid)')),false))
UNION ALL
SELECT 'custom_check_10',(coalesce((SELECT md5(prosrc)='f3c65a3a3f84ddf99f3c363e09cd2028' AND prosecdef AND proconfig=ARRAY['search_path=public, extensions'] FROM pg_proc WHERE oid=to_regprocedure('public.resolve_course_video(uuid)')),false))
UNION ALL
SELECT 'custom_check_11',(coalesce((SELECT md5(prosrc)='44aaac6ba1b3d5fe8c03c17b6bb7d6c7' AND prosecdef AND proconfig=ARRAY['search_path=public, extensions'] FROM pg_proc WHERE oid=to_regprocedure('public.get_course_topic(uuid,uuid)')),false))
UNION ALL
SELECT 'custom_check_12',(coalesce((SELECT md5(prosrc)='14469fba0cd8a79980f06508276926f5' AND prosecdef AND proconfig=ARRAY['search_path=public, extensions'] FROM pg_proc WHERE oid=to_regprocedure('public.save_course_lesson(uuid,uuid,boolean,jsonb,text,bigint,uuid)')),false))
UNION ALL
SELECT 'custom_check_13',(coalesce((SELECT md5(prosrc)='1992229273bcb3f5d82ac918b26153e9' AND prosecdef AND proconfig=ARRAY['search_path=public, extensions'] FROM pg_proc WHERE oid=to_regprocedure('public.create_managed_course(jsonb,public.question_course_scope)')),false))
UNION ALL
SELECT 'custom_check_14',(coalesce((SELECT md5(prosrc)='278571c18d9cdba4dcbaa50b9a0840b1' AND prosecdef AND proconfig=ARRAY['search_path=public, extensions'] FROM pg_proc WHERE oid=to_regprocedure('public.list_course_video_library(uuid,text)')),false))
UNION ALL
SELECT 'custom_check_15',(coalesce((SELECT md5(prosrc)='332f114923cdb3e13106e0626b8e0094' AND prosecdef AND proconfig=ARRAY['search_path=public, extensions'] FROM pg_proc WHERE oid=to_regprocedure('public.save_course_video_metadata(uuid,bigint,jsonb)')),false))
UNION ALL
SELECT 'custom_check_16',(coalesce((SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.course_outline_entries')),false))
UNION ALL
SELECT 'custom_check_17',(NOT has_table_privilege('authenticated','public.course_outline_entries','INSERT,UPDATE,DELETE') AND NOT has_table_privilege('anon','public.course_outline_entries','INSERT,UPDATE,DELETE'))
UNION ALL
SELECT 'custom_check_18',(coalesce((SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.course_outline_topics')),false))
UNION ALL
SELECT 'custom_check_19',(NOT has_table_privilege('authenticated','public.course_outline_topics','INSERT,UPDATE,DELETE') AND NOT has_table_privilege('anon','public.course_outline_topics','INSERT,UPDATE,DELETE'))
UNION ALL
SELECT 'custom_check_20',(NOT has_function_privilege('anon','public.edit_course_outline(uuid,bigint,text,jsonb)','EXECUTE') AND has_function_privilege('authenticated','public.edit_course_outline(uuid,bigint,text,jsonb)','EXECUTE'))
UNION ALL
SELECT 'custom_check_21',(NOT has_function_privilege('anon','public.save_course_outline_content(uuid,boolean,jsonb,text,bigint,uuid)','EXECUTE') AND has_function_privilege('authenticated','public.save_course_outline_content(uuid,boolean,jsonb,text,bigint,uuid)','EXECUTE'))
UNION ALL
SELECT 'custom_check_22',(NOT has_function_privilege('anon','public.create_managed_course(jsonb,public.question_course_scope)','EXECUTE') AND has_function_privilege('authenticated','public.create_managed_course(jsonb,public.question_course_scope)','EXECUTE'))
UNION ALL
SELECT 'custom_check_23',(NOT has_function_privilege('anon','public.save_course_video_metadata(uuid,bigint,jsonb)','EXECUTE') AND has_function_privilege('authenticated','public.save_course_video_metadata(uuid,bigint,jsonb)','EXECUTE'))
UNION ALL
SELECT 'custom_check_24',(NOT EXISTS(SELECT 1 FROM public.course_lesson_courses b WHERE NOT EXISTS(SELECT 1 FROM public.course_outline_entries e JOIN public.course_outline_topics m ON m.entry_id=e.id WHERE e.course_id=b.course_id AND e.content_id=b.lesson_id AND m.topic_id=b.topic_id AND NOT e.archived)))
UNION ALL
SELECT 'custom_check_25',(NOT EXISTS(SELECT 1 FROM public.course_outline_entries e WHERE NOT e.archived AND NOT EXISTS(SELECT 1 FROM public.course_outline_topics m WHERE m.entry_id=e.id)))
UNION ALL
SELECT 'custom_check_26',(NOT EXISTS(SELECT 1 FROM public.course_outline_topics m JOIN public.course_outline_entries e ON e.id=m.entry_id JOIN public.curriculum_topics t ON t.id=m.topic_id WHERE t.unit_id<>e.unit_id OR NOT public.course_topic_in_scope(e.course_id,m.topic_id)))
) SELECT bool_and(ok) AS all_checks_pass,jsonb_agg(jsonb_build_object('name',name,'ok',ok) ORDER BY name) AS checks FROM checks;
SELECT count(*) AS courses FROM public.courses;
SELECT count(*) AS lessons FROM public.course_lessons;
SELECT count(*) AS lesson_bindings FROM public.course_lesson_courses;
SELECT count(*) AS videos FROM public.course_videos;
SELECT count(*) AS outline_entries,count(*) FILTER(WHERE archived) AS archived_entries FROM public.course_outline_entries;
