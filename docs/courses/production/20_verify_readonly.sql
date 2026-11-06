-- Exact migration/function checks; no student/account content.
WITH checks(name,ok) AS (
SELECT 'retained_snapshot_body',coalesce((SELECT md5(prosrc)='1162f028c31bdeab0a9fdd0e77b48089' FROM pg_proc WHERE oid=to_regprocedure('public.question_practice_snapshot_questions(uuid)')),false)
UNION ALL
SELECT '20261027000000',EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261027000000' AND name='course_topic_content' AND cardinality(statements)=1 AND md5(statements[1])='fcec56f3aa75dae989c9b8dd4afb9ab2')
UNION ALL
SELECT '20261028000000',EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261028000000' AND name='course_topic_practice' AND cardinality(statements)=1 AND md5(statements[1])='f8d0fd626747b1dd42fd6f03cf285591')
UNION ALL
SELECT '20261029000000',EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261029000000' AND name='course_html_games' AND cardinality(statements)=1 AND md5(statements[1])='e895306287717adabf7e04da5c46b1d8')
UNION ALL
SELECT '20261030000000',EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261030000000' AND name='course_legacy_links' AND cardinality(statements)=1 AND md5(statements[1])='a2276460fd2247c87bb072bee8defac3')
UNION ALL
SELECT 'course_youtube_id_body',coalesce((SELECT md5(prosrc)='1d48fbb0860ab94286ad51dcd03d5f7f' AND proconfig=ARRAY['search_path=public, extensions'] FROM pg_proc WHERE oid=to_regprocedure('public.course_youtube_id(text)')),false)
UNION ALL
SELECT 'course_topic_in_scope_body',coalesce((SELECT md5(prosrc)='7cf72a34582c08a4e1d2314e2fb06fb5' AND proconfig=ARRAY['search_path=public, extensions'] FROM pg_proc WHERE oid=to_regprocedure('public.course_topic_in_scope(uuid,uuid)')),false)
UNION ALL
SELECT 'course_topic_visible_body',coalesce((SELECT md5(prosrc)='1f84e00c07b216e3635bd1531eb18c5f' AND proconfig=ARRAY['search_path=public, extensions'] FROM pg_proc WHERE oid=to_regprocedure('public.course_topic_visible(uuid,uuid)')),false)
UNION ALL
SELECT 'validate_course_topic_content_body',coalesce((SELECT md5(prosrc)='c536b40fdd287a731d20b7352c79ba06' AND proconfig=ARRAY['search_path=public, extensions'] FROM pg_proc WHERE oid=to_regprocedure('public.validate_course_topic_content()')),false)
UNION ALL
SELECT 'get_course_outline_body',coalesce((SELECT md5(prosrc)='3d6c6579b69b6a3f66821982946f2a16' AND proconfig=ARRAY['search_path=public, extensions'] FROM pg_proc WHERE oid=to_regprocedure('public.get_course_outline(uuid)')),false)
UNION ALL
SELECT 'get_course_topic_body',coalesce((SELECT md5(prosrc)='2e37ea29641f3b34e50ff69c642cd773' AND proconfig=ARRAY['search_path=public, extensions'] FROM pg_proc WHERE oid=to_regprocedure('public.get_course_topic(uuid,uuid)')),false)
UNION ALL
SELECT 'save_course_topic_body',coalesce((SELECT md5(prosrc)='0a4d7a055519f528e6c64fb949364698' AND proconfig=ARRAY['search_path=public, extensions'] FROM pg_proc WHERE oid=to_regprocedure('public.save_course_topic(uuid,uuid,boolean,jsonb,text)')),false)
UNION ALL
SELECT 'guard_published_course_video_body',coalesce((SELECT md5(prosrc)='9aed4a1fe4b81f05771f66c3fea8ab3a' AND proconfig=ARRAY['search_path=public, extensions'] FROM pg_proc WHERE oid=to_regprocedure('public.guard_published_course_video()')),false)
UNION ALL
SELECT 'question_practice_snapshot_body',coalesce((SELECT md5(prosrc)='b597437f72084d46ad2c4caf85256984' AND proconfig=ARRAY['search_path=public, extensions'] FROM pg_proc WHERE oid=to_regprocedure('public.question_practice_snapshot(uuid)')),false)
UNION ALL
SELECT 'list_course_practice_topics_body',coalesce((SELECT md5(prosrc)='62bcdb9aa407f623f93e9e355cd07129' AND proconfig=ARRAY['search_path=public, extensions'] FROM pg_proc WHERE oid=to_regprocedure('public.list_course_practice_topics(uuid)')),false)
UNION ALL
SELECT 'start_question_practice_in_scope_body',coalesce((SELECT md5(prosrc)='d44924032760bb633e96c245b4269b7b' AND proconfig=ARRAY['search_path=public, extensions'] FROM pg_proc WHERE oid=to_regprocedure('public.start_question_practice_in_scope(uuid,uuid,uuid)')),false)
UNION ALL
SELECT 'start_question_practice_body',coalesce((SELECT md5(prosrc)='0467f5c7e6d1e78144ecaacce8fd066e' AND proconfig=ARRAY['search_path=public, extensions'] FROM pg_proc WHERE oid=to_regprocedure('public.start_question_practice(uuid,uuid)')),false)
UNION ALL
SELECT 'start_course_question_practice_body',coalesce((SELECT md5(prosrc)='ce8740b0a9e7269408347b0311ba050a' AND proconfig=ARRAY['search_path=public, extensions'] FROM pg_proc WHERE oid=to_regprocedure('public.start_course_question_practice(uuid,uuid,uuid)')),false)
UNION ALL
SELECT 'resolve_course_video_body',coalesce((SELECT md5(prosrc)='84c2812e270a0c99f1281f5d99d971e7' AND proconfig=ARRAY['search_path=public, extensions'] FROM pg_proc WHERE oid=to_regprocedure('public.resolve_course_video(uuid)')),false)
UNION ALL
SELECT 'course_topic_content_rls',coalesce((SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.course_topic_content')),false)
UNION ALL
SELECT 'course_topic_videos_rls',coalesce((SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.course_topic_videos')),false)
UNION ALL
SELECT 'course_videos_rls',coalesce((SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.course_videos')),false)
UNION ALL
SELECT 'course_topic_content_readonly',NOT has_table_privilege('authenticated','public.course_topic_content','INSERT,UPDATE,DELETE') AND NOT has_table_privilege('anon','public.course_topic_content','INSERT,UPDATE,DELETE')
UNION ALL
SELECT 'course_topic_videos_readonly',NOT has_table_privilege('authenticated','public.course_topic_videos','INSERT,UPDATE,DELETE') AND NOT has_table_privilege('anon','public.course_topic_videos','INSERT,UPDATE,DELETE')
UNION ALL
SELECT 'game_bucket_private',EXISTS(SELECT 1 FROM storage.buckets WHERE id='course-games' AND NOT public AND file_size_limit=5242880 AND allowed_mime_types=ARRAY['text/html'])
UNION ALL
SELECT 'game_policies',(SELECT count(*)=3 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname IN ('course_game_read','course_game_upload','course_game_remove_unused'))
UNION ALL
SELECT 'no_extra_public_video_reader',NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='course_videos' AND cmd IN ('SELECT','ALL') AND policyname<>'course_published_video_read' AND ('anon'=ANY(roles) OR 'public'=ANY(roles)))
UNION ALL
SELECT 'internal_selector_private',NOT has_function_privilege('authenticated','public.start_question_practice_in_scope(uuid,uuid,uuid)','EXECUTE') AND NOT has_function_privilege('anon','public.start_question_practice_in_scope(uuid,uuid,uuid)','EXECUTE')
UNION ALL
SELECT 'course_practice_authenticated',has_function_privilege('authenticated','public.start_course_question_practice(uuid,uuid,uuid)','EXECUTE') AND NOT has_function_privilege('anon','public.start_course_question_practice(uuid,uuid,uuid)','EXECUTE')
) SELECT bool_and(ok) AS all_checks_pass,jsonb_agg(jsonb_build_object('name',name,'ok',ok) ORDER BY name) AS checks FROM checks;
