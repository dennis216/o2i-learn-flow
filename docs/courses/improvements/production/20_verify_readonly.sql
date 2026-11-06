-- Use this final-state verification after deployment, not the superseded course package hashes.
WITH checks(name,ok) AS (
SELECT 'shared_check_1',(EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261031000000' AND name='course_shared_lessons' AND cardinality(statements)=1 AND md5(statements[1])='a665d2c1225e027f9356c02628492ba9'))
UNION ALL
SELECT 'shared_check_2',(coalesce((SELECT md5(prosrc)='56f3bdaecba52dfb613580c3afbdcc3a' AND prosecdef AND proconfig=ARRAY['search_path=public, extensions'] FROM pg_proc WHERE oid=to_regprocedure('public.course_topic_visible(uuid,uuid)')),false))
UNION ALL
SELECT 'shared_check_3',(coalesce((SELECT md5(prosrc)='668759737086a033ee6808a48b156a02' AND prosecdef AND proconfig=ARRAY['search_path=public, extensions'] FROM pg_proc WHERE oid=to_regprocedure('public.course_lesson_visible(uuid)')),false))
UNION ALL
SELECT 'shared_check_4',(coalesce((SELECT md5(prosrc)='ae9de477220e2f750834b24517d278cf' AND prosecdef AND proconfig=ARRAY['search_path=public, extensions'] FROM pg_proc WHERE oid=to_regprocedure('public.get_course_outline(uuid)')),false))
UNION ALL
SELECT 'shared_check_5',(coalesce((SELECT md5(prosrc)='3cf9b8c757bb1e7d3e3eab8ba6aa8f2e' AND prosecdef AND proconfig=ARRAY['search_path=public, extensions'] FROM pg_proc WHERE oid=to_regprocedure('public.get_course_topic(uuid,uuid)')),false))
UNION ALL
SELECT 'shared_check_6',(coalesce((SELECT md5(prosrc)='3d338fb4e4e8681a0add7db7da87818f' AND prosecdef AND proconfig=ARRAY['search_path=public, extensions'] FROM pg_proc WHERE oid=to_regprocedure('public.list_saved_course_lessons()')),false))
UNION ALL
SELECT 'shared_check_7',(coalesce((SELECT md5(prosrc)='9f1251318ac4c5167ccaee3c3d03d5ad' AND prosecdef AND proconfig=ARRAY['search_path=public, extensions'] FROM pg_proc WHERE oid=to_regprocedure('public.save_course_lesson(uuid,uuid,boolean,jsonb,text,bigint,uuid)')),false))
UNION ALL
SELECT 'shared_check_8',(coalesce((SELECT md5(prosrc)='2260362d24fe383a9aa8946b506ae1e2' AND prosecdef AND proconfig=ARRAY['search_path=public, extensions'] FROM pg_proc WHERE oid=to_regprocedure('public.save_course_topic(uuid,uuid,boolean,jsonb,text)')),false))
UNION ALL
SELECT 'shared_check_9',(coalesce((SELECT md5(prosrc)='e7bb9641115af1ef55c9752de1eed280' AND prosecdef AND proconfig=ARRAY['search_path=public, extensions'] FROM pg_proc WHERE oid=to_regprocedure('public.share_course_lesson(uuid,uuid,uuid,boolean,uuid,bigint,uuid,bigint)')),false))
UNION ALL
SELECT 'shared_check_10',(coalesce((SELECT md5(prosrc)='cce6e267676f0eba5fdff88aa226b497' AND prosecdef AND proconfig=ARRAY['search_path=public, extensions'] FROM pg_proc WHERE oid=to_regprocedure('public.restore_course_lesson(uuid,uuid,uuid,bigint,uuid,bigint)')),false))
UNION ALL
SELECT 'shared_check_11',(coalesce((SELECT md5(prosrc)='a5d8815e0479c61d8fa666c4b69e15e8' AND prosecdef AND proconfig=ARRAY['search_path=public, extensions'] FROM pg_proc WHERE oid=to_regprocedure('public.guard_published_course_video()')),false))
UNION ALL
SELECT 'shared_check_12',(coalesce((SELECT md5(prosrc)='d1d025fac528219d18854e24a58a8847' AND prosecdef AND proconfig=ARRAY['search_path=public, extensions'] FROM pg_proc WHERE oid=to_regprocedure('public.touch_video_lessons()')),false))
UNION ALL
SELECT 'shared_check_13',(coalesce((SELECT md5(prosrc)='c81ceeeefda5ab24342df86179f1bd1b' AND prosecdef AND proconfig=ARRAY['search_path=public, extensions'] FROM pg_proc WHERE oid=to_regprocedure('public.resolve_course_video(uuid)')),false))
UNION ALL
SELECT 'shared_check_14',(coalesce((SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.course_lessons')),false))
UNION ALL
SELECT 'shared_check_15',(NOT has_table_privilege('authenticated','public.course_lessons','INSERT,UPDATE,DELETE') AND NOT has_table_privilege('anon','public.course_lessons','INSERT,UPDATE,DELETE'))
UNION ALL
SELECT 'shared_check_16',(coalesce((SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.course_lesson_courses')),false))
UNION ALL
SELECT 'shared_check_17',(NOT has_table_privilege('authenticated','public.course_lesson_courses','INSERT,UPDATE,DELETE') AND NOT has_table_privilege('anon','public.course_lesson_courses','INSERT,UPDATE,DELETE'))
UNION ALL
SELECT 'shared_check_18',(coalesce((SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.course_lesson_videos')),false))
UNION ALL
SELECT 'shared_check_19',(NOT has_table_privilege('authenticated','public.course_lesson_videos','INSERT,UPDATE,DELETE') AND NOT has_table_privilege('anon','public.course_lesson_videos','INSERT,UPDATE,DELETE'))
UNION ALL
SELECT 'shared_check_20',(NOT has_function_privilege('anon','public.list_saved_course_lessons()','EXECUTE') AND has_function_privilege('authenticated','public.list_saved_course_lessons()','EXECUTE'))
UNION ALL
SELECT 'shared_check_21',(NOT has_function_privilege('anon','public.save_course_lesson(uuid,uuid,boolean,jsonb,text,bigint,uuid)','EXECUTE') AND has_function_privilege('authenticated','public.save_course_lesson(uuid,uuid,boolean,jsonb,text,bigint,uuid)','EXECUTE'))
UNION ALL
SELECT 'shared_check_22',(NOT has_function_privilege('anon','public.share_course_lesson(uuid,uuid,uuid,boolean,uuid,bigint,uuid,bigint)','EXECUTE') AND has_function_privilege('authenticated','public.share_course_lesson(uuid,uuid,uuid,boolean,uuid,bigint,uuid,bigint)','EXECUTE'))
UNION ALL
SELECT 'shared_check_23',(NOT has_function_privilege('anon','public.restore_course_lesson(uuid,uuid,uuid,bigint,uuid,bigint)','EXECUTE') AND has_function_privilege('authenticated','public.restore_course_lesson(uuid,uuid,uuid,bigint,uuid,bigint)','EXECUTE'))
UNION ALL
SELECT 'shared_check_24',(NOT has_function_privilege('authenticated','public.touch_video_lessons()','EXECUTE'))
UNION ALL
SELECT 'shared_check_25',(EXISTS(SELECT 1 FROM storage.buckets WHERE id='course-games' AND NOT public))
UNION ALL
SELECT 'shared_check_26',(NOT EXISTS(SELECT 1 FROM public.course_lesson_courses b JOIN public.course_lessons l ON l.id=b.lesson_id WHERE b.topic_id<>l.topic_id))
UNION ALL
SELECT 'shared_check_27',(NOT EXISTS(SELECT 1 FROM public.courses WHERE id='93124428-92f4-48d2-a6dc-e5f9e010248b' AND practice_course_scope='BC'))
UNION ALL
SELECT 'shared_check_28',(EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='course_lessons' AND policyname='lesson_read'))
UNION ALL
SELECT 'shared_check_29',(EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='course_lesson_courses' AND policyname='lesson_binding_read'))
UNION ALL
SELECT 'shared_check_30',(EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='course_lesson_videos' AND policyname='lesson_video_read'))
UNION ALL
SELECT 'shared_check_31',(EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='course_topic_content' AND policyname='course_content_read'))
UNION ALL
SELECT 'shared_check_32',(EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='course_topic_videos' AND policyname='course_video_mapping_read'))
UNION ALL
SELECT 'shared_check_33',(EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='course_videos' AND policyname='course_published_video_read'))
UNION ALL
SELECT 'shared_check_34',(EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='course_game_read'))
UNION ALL
SELECT 'shared_check_35',(EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='course_game_remove_unused'))
) SELECT bool_and(ok) AS all_checks_pass,jsonb_agg(jsonb_build_object('name',name,'ok',ok) ORDER BY name) AS checks FROM checks;
SELECT count(*) AS lessons,count(*) FILTER(WHERE NOT EXISTS(SELECT 1 FROM public.course_lesson_courses b WHERE b.lesson_id=l.id)) AS unlinked FROM public.course_lessons l;
