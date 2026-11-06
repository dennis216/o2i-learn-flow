-- New content editors must not be overwritten by an old Topic-based client.
CREATE OR REPLACE FUNCTION public.save_course_outline_content(_entry_id uuid,_is_published boolean,_videos jsonb,_game_path text,_expected_revision bigint,_expected_lesson_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE e public.course_outline_entries%ROWTYPE; _course_id uuid; _topic_id uuid; l public.course_lessons%ROWTYPE; item jsonb; vid uuid; n integer:=0; seen uuid[]:='{}';
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Content administrator access is required.'; END IF;
 -- shortcut: serialize the small admin catalog with course locks; scope locks if editing concurrency grows.
 PERFORM 1 FROM public.courses ORDER BY id FOR UPDATE;
 SELECT * INTO e FROM public.course_outline_entries WHERE id=_entry_id AND NOT archived FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Course lesson is not available.'; END IF;
 _course_id:=e.course_id;
 SELECT topic_id INTO _topic_id FROM public.course_outline_topics WHERE entry_id=e.id ORDER BY topic_id LIMIT 1;
 SELECT * INTO l FROM public.course_lessons WHERE id=e.content_id FOR UPDATE;
 _topic_id:=coalesce(l.topic_id,_topic_id);
 IF _expected_revision IS NULL OR coalesce(l.revision,0)<>_expected_revision OR l.id IS DISTINCT FROM _expected_lesson_id THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Lesson changed. Reload before saving; your changes have not been saved.'; END IF;

 IF _is_published IS NULL OR jsonb_typeof(_videos) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid lesson configuration.'; END IF;
 IF jsonb_array_length(_videos)>30 OR (_is_published AND jsonb_array_length(_videos)=0) THEN RAISE EXCEPTION 'Publish requires a video; maximum 30 videos per lesson.'; END IF;
 IF _game_path IS NOT NULL AND (_game_path NOT LIKE coalesce(l.owner_course_id,_course_id)::text||'/'||_topic_id::text||'/%' AND _game_path IS DISTINCT FROM l.game_path OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='course-games' AND name=_game_path)) THEN RAISE EXCEPTION 'Upload the game to this lesson before saving.'; END IF;
 IF l.id IS NULL THEN
 INSERT INTO public.course_lessons(topic_id,owner_course_id) VALUES(_topic_id,_course_id) RETURNING * INTO l;
 UPDATE public.course_outline_entries SET content_id=l.id WHERE id=e.id;
 END IF;

 FOR item IN SELECT value FROM jsonb_array_elements(_videos) LOOP
 IF EXISTS(SELECT 1 FROM public.course_videos WHERE id=nullif(item->>'id','')::uuid AND course_id<>l.owner_course_id) AND NOT EXISTS(SELECT 1 FROM public.course_lesson_videos WHERE video_id=nullif(item->>'id','')::uuid AND lesson_id=l.id) THEN RAISE EXCEPTION 'Video belongs to another course.'; END IF;
 END LOOP;
 DELETE FROM public.course_lesson_videos WHERE lesson_id=l.id;
 FOR item IN SELECT value FROM jsonb_array_elements(_videos) LOOP
 IF jsonb_typeof(item)<>'object' OR nullif(btrim(item->>'title'),'') IS NULL OR length(item->>'title')>200 OR public.course_youtube_id(item->>'video_url') IS NULL THEN RAISE EXCEPTION 'Each video needs a title and valid HTTPS YouTube URL.'; END IF;
 vid:=coalesce(nullif(item->>'id','')::uuid,gen_random_uuid());
 IF vid=ANY(seen) THEN RAISE EXCEPTION 'A video may only appear once in a lesson.'; END IF;

 INSERT INTO public.course_videos(id,course_id,title,video_url,order_index) VALUES(vid,l.owner_course_id,btrim(item->>'title'),'https://www.youtube.com/watch?v='||public.course_youtube_id(item->>'video_url'),n)
 ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,video_url=EXCLUDED.video_url WHERE course_videos.title IS DISTINCT FROM EXCLUDED.title OR course_videos.video_url IS DISTINCT FROM EXCLUDED.video_url;
 INSERT INTO public.course_lesson_videos VALUES(l.id,vid,n) ON CONFLICT(lesson_id,video_id) DO UPDATE SET order_index=EXCLUDED.order_index;n:=n+1;seen:=array_append(seen,vid);
 END LOOP;
 UPDATE public.course_lessons SET is_published=_is_published,game_path=_game_path,revision=revision+1,updated_at=clock_timestamp() WHERE id=l.id;
 UPDATE public.courses SET outline_customized=true,outline_revision=outline_revision+1 WHERE id=_course_id;
END;
$$;

NOTIFY pgrst,'reload schema';
