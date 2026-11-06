-- Forward-only: retain all legacy rows and assets; no content is merged automatically.
CREATE TABLE public.course_lessons (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 topic_id uuid NOT NULL REFERENCES public.curriculum_topics(id),
 owner_course_id uuid NOT NULL REFERENCES public.courses(id),
 is_published boolean NOT NULL DEFAULT false,
 game_path text,
 revision bigint NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(id,topic_id)
);
CREATE TABLE public.course_lesson_courses (
 course_id uuid NOT NULL REFERENCES public.courses(id),
 topic_id uuid NOT NULL REFERENCES public.curriculum_topics(id),
 lesson_id uuid NOT NULL,
 PRIMARY KEY(course_id,topic_id),
 FOREIGN KEY(lesson_id,topic_id) REFERENCES public.course_lessons(id,topic_id)
);
CREATE INDEX course_lesson_courses_lesson_idx ON public.course_lesson_courses(lesson_id);
CREATE TABLE public.course_lesson_videos (
 lesson_id uuid NOT NULL REFERENCES public.course_lessons(id),
 video_id uuid NOT NULL REFERENCES public.course_videos(id),
 order_index integer NOT NULL CHECK(order_index>=0),
 PRIMARY KEY(lesson_id,video_id), UNIQUE(lesson_id,order_index)
);
CREATE INDEX course_lesson_videos_video_idx ON public.course_lesson_videos(video_id);
DO $$ DECLARE r record; lid uuid; BEGIN
 FOR r IN SELECT * FROM public.course_topic_content LOOP
  INSERT INTO public.course_lessons(topic_id,owner_course_id,is_published,game_path,updated_at)
   VALUES(r.topic_id,r.course_id,r.is_published,r.game_path,r.updated_at) RETURNING id INTO lid;
  INSERT INTO public.course_lesson_courses VALUES(r.course_id,r.topic_id,lid);
  INSERT INTO public.course_lesson_videos SELECT lid,video_id,order_index FROM public.course_topic_videos WHERE course_id=r.course_id AND topic_id=r.topic_id;
 END LOOP;
END $$;
-- The course-wide selector previously allowed accidentally changing AB into BC.
UPDATE public.courses SET practice_course_scope='AB' WHERE id='93124428-92f4-48d2-a6dc-e5f9e010248b' AND practice_course_scope='BC';

CREATE OR REPLACE FUNCTION public.course_topic_visible(_course_id uuid,_topic_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
 SELECT EXISTS(SELECT 1 FROM public.course_lesson_courses b JOIN public.course_lessons l ON l.id=b.lesson_id JOIN public.courses c ON c.id=b.course_id
 WHERE b.course_id=_course_id AND b.topic_id=_topic_id AND c.is_published AND l.is_published AND public.course_topic_in_scope(c.id,b.topic_id));
$$;
CREATE FUNCTION public.course_lesson_visible(_lesson_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
 SELECT EXISTS(SELECT 1 FROM public.course_lesson_courses b WHERE b.lesson_id=_lesson_id AND public.course_topic_visible(b.course_id,b.topic_id));
$$;
ALTER TABLE public.course_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_lesson_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_lesson_videos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.course_lessons,public.course_lesson_courses,public.course_lesson_videos FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.course_lessons,public.course_lesson_courses,public.course_lesson_videos TO anon,authenticated;
CREATE POLICY lesson_read ON public.course_lessons FOR SELECT USING(public.has_role(auth.uid(),'admin') OR public.course_lesson_visible(id));
CREATE POLICY lesson_binding_read ON public.course_lesson_courses FOR SELECT USING(public.has_role(auth.uid(),'admin') OR public.course_topic_visible(course_id,topic_id));
CREATE POLICY lesson_video_read ON public.course_lesson_videos FOR SELECT USING(public.has_role(auth.uid(),'admin') OR public.course_lesson_visible(lesson_id));
DROP POLICY course_content_read ON public.course_topic_content;
CREATE POLICY course_content_read ON public.course_topic_content FOR SELECT USING(public.has_role(auth.uid(),'admin'));
DROP POLICY course_video_mapping_read ON public.course_topic_videos;
CREATE POLICY course_video_mapping_read ON public.course_topic_videos FOR SELECT USING(public.has_role(auth.uid(),'admin'));
DROP POLICY course_published_video_read ON public.course_videos;
CREATE POLICY course_published_video_read ON public.course_videos FOR SELECT USING(public.has_role(auth.uid(),'admin') OR EXISTS(SELECT 1 FROM public.course_lesson_videos v WHERE v.video_id=course_videos.id AND public.course_lesson_visible(v.lesson_id)));
DROP POLICY course_game_read ON storage.objects;
CREATE POLICY course_game_read ON storage.objects FOR SELECT USING(bucket_id='course-games' AND (public.has_role(auth.uid(),'admin') OR EXISTS(SELECT 1 FROM public.course_lessons l WHERE l.game_path=name AND public.course_lesson_visible(l.id))));
DROP POLICY course_game_remove_unused ON storage.objects;
CREATE POLICY course_game_remove_unused ON storage.objects FOR DELETE USING(bucket_id='course-games' AND public.has_role(auth.uid(),'admin') AND NOT EXISTS(SELECT 1 FROM public.course_lessons WHERE game_path=name) AND NOT EXISTS(SELECT 1 FROM public.course_topic_content WHERE game_path=name));

CREATE OR REPLACE FUNCTION public.get_course_outline(_course_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.courses WHERE id=_course_id AND (is_published OR public.has_role(auth.uid(),'admin'))) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Course is not available.'; END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',u.id,'unit_number',u.unit_number,'title',u.title,'ab_exam_weight_min',u.ab_exam_weight_min,'ab_exam_weight_max',u.ab_exam_weight_max,'bc_exam_weight_min',u.bc_exam_weight_min,'bc_exam_weight_max',u.bc_exam_weight_max,'topics',
 coalesce((SELECT jsonb_agg(jsonb_build_object('id',t.id,'code',t.topic_code,'title',t.title,'big_idea',t.big_idea,'is_bc_only',t.is_bc_only,'is_published',coalesce(l.is_published,false)) ORDER BY t.order_index)
 FROM public.curriculum_topics t LEFT JOIN public.course_lesson_courses b ON b.course_id=_course_id AND b.topic_id=t.id LEFT JOIN public.course_lessons l ON l.id=b.lesson_id
 WHERE t.unit_id=u.id AND public.course_topic_in_scope(_course_id,t.id)),'[]'::jsonb)) ORDER BY m.order_index)
 FROM public.course_curriculum_units m JOIN public.curriculum_units u ON u.id=m.unit_id WHERE m.course_id=_course_id),'[]'::jsonb);
END;
$$;
CREATE OR REPLACE FUNCTION public.get_course_topic(_course_id uuid,_topic_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE l public.course_lessons%ROWTYPE; result jsonb;
BEGIN
 IF NOT public.course_topic_in_scope(_course_id,_topic_id) OR NOT (public.course_topic_visible(_course_id,_topic_id) OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Lesson content is not available.'; END IF;
 SELECT x.* INTO l FROM public.course_lesson_courses b JOIN public.course_lessons x ON x.id=b.lesson_id WHERE b.course_id=_course_id AND b.topic_id=_topic_id;
 result:=jsonb_build_object('course_id',_course_id,'topic_id',_topic_id,'is_published',coalesce(l.is_published,false),'game_path',l.game_path,'videos',coalesce((SELECT jsonb_agg(jsonb_build_object('id',v.id,'course_id',_course_id,'title',v.title,'description',v.description,'video_url',v.video_url,'duration',v.duration,'transcript',v.transcript,'order_index',m.order_index) ORDER BY m.order_index) FROM public.course_lesson_videos m JOIN public.course_videos v ON v.id=m.video_id WHERE m.lesson_id=l.id),'[]'::jsonb));
 IF public.has_role(auth.uid(),'admin') THEN
 result:=result||jsonb_build_object('lesson_id',l.id,'revision',coalesce(l.revision,0),'owner_course_id',coalesce(l.owner_course_id,_course_id),'shared_video_topics',coalesce((SELECT jsonb_agg(DISTINCT jsonb_build_object('video_id',m.video_id,'topic_code',t.topic_code)) FROM public.course_lesson_videos own JOIN public.course_lesson_videos m ON m.video_id=own.video_id AND m.lesson_id<>own.lesson_id JOIN public.course_lessons other_l ON other_l.id=m.lesson_id JOIN public.curriculum_topics t ON t.id=other_l.topic_id WHERE own.lesson_id=l.id),'[]'::jsonb),'linked_courses',coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'title',c.title)) FROM public.course_lesson_courses b JOIN public.courses c ON c.id=b.course_id WHERE b.lesson_id=l.id),'[]'::jsonb));
 END IF;
 RETURN result;
END;
$$;
CREATE FUNCTION public.list_saved_course_lessons() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Content administrator access is required.'; END IF;
 RETURN coalesce((SELECT jsonb_agg(x ORDER BY x->>'updated_at' DESC) FROM (
 SELECT jsonb_build_object('lesson_id',l.id,'topic_id',l.topic_id,'topic_code',t.topic_code,'topic_title',t.title,'is_published',l.is_published,'revision',l.revision,'owner_course_id',l.owner_course_id,'owner_course_title',c.title,'updated_at',l.updated_at,'archived',NOT EXISTS(SELECT 1 FROM public.course_lesson_courses b WHERE b.lesson_id=l.id),'courses',coalesce((SELECT jsonb_agg(jsonb_build_object('id',cc.id,'title',cc.title)) FROM public.course_lesson_courses b JOIN public.courses cc ON cc.id=b.course_id WHERE b.lesson_id=l.id),'[]'::jsonb)) AS x
 FROM public.course_lessons l JOIN public.curriculum_topics t ON t.id=l.topic_id JOIN public.courses c ON c.id=l.owner_course_id) rows),'[]'::jsonb);
END;
$$;
CREATE FUNCTION public.save_course_lesson(_course_id uuid,_topic_id uuid,_is_published boolean,_videos jsonb,_game_path text,_expected_revision bigint,_expected_lesson_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE l public.course_lessons%ROWTYPE; item jsonb; vid uuid; n integer:=0; seen uuid[]:='{}';
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Content administrator access is required.'; END IF;
 -- shortcut: serialize the small admin catalog with course locks; scope locks if editing concurrency grows.
 PERFORM 1 FROM public.courses ORDER BY id FOR UPDATE;
 SELECT x.* INTO l FROM public.course_lesson_courses b JOIN public.course_lessons x ON x.id=b.lesson_id WHERE b.course_id=_course_id AND b.topic_id=_topic_id FOR UPDATE OF x;
 IF _expected_revision IS NULL OR coalesce(l.revision,0)<>_expected_revision OR l.id IS DISTINCT FROM _expected_lesson_id THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Lesson changed. Reload before saving; your changes have not been saved.'; END IF;
 IF NOT public.course_topic_in_scope(_course_id,_topic_id) THEN RAISE EXCEPTION 'Topic is outside this course curriculum.'; END IF;
 IF _is_published IS NULL OR jsonb_typeof(_videos) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid lesson configuration.'; END IF;
 IF jsonb_array_length(_videos)>30 OR (_is_published AND jsonb_array_length(_videos)=0) THEN RAISE EXCEPTION 'Publish requires a video; maximum 30 videos per lesson.'; END IF;
 IF _game_path IS NOT NULL AND (_game_path NOT LIKE coalesce(l.owner_course_id,_course_id)::text||'/'||_topic_id::text||'/%' AND _game_path IS DISTINCT FROM l.game_path OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='course-games' AND name=_game_path)) THEN RAISE EXCEPTION 'Upload the game to this lesson before saving.'; END IF;
 IF l.id IS NULL THEN
 INSERT INTO public.course_lessons(topic_id,owner_course_id) VALUES(_topic_id,_course_id) RETURNING * INTO l;
 INSERT INTO public.course_lesson_courses VALUES(_course_id,_topic_id,l.id);
 END IF;
 DELETE FROM public.course_lesson_videos WHERE lesson_id=l.id;
 FOR item IN SELECT value FROM jsonb_array_elements(_videos) LOOP
 IF jsonb_typeof(item)<>'object' OR nullif(btrim(item->>'title'),'') IS NULL OR length(item->>'title')>200 OR public.course_youtube_id(item->>'video_url') IS NULL THEN RAISE EXCEPTION 'Each video needs a title and valid HTTPS YouTube URL.'; END IF;
 vid:=coalesce(nullif(item->>'id','')::uuid,gen_random_uuid());
 IF vid=ANY(seen) THEN RAISE EXCEPTION 'A video may only appear once in a lesson.'; END IF;
 IF EXISTS(SELECT 1 FROM public.course_videos WHERE id=vid AND course_id<>l.owner_course_id) AND NOT EXISTS(SELECT 1 FROM public.course_lesson_videos WHERE video_id=vid AND lesson_id=l.id) THEN RAISE EXCEPTION 'Video belongs to another course.'; END IF;
 INSERT INTO public.course_videos(id,course_id,title,video_url,order_index) VALUES(vid,l.owner_course_id,btrim(item->>'title'),'https://www.youtube.com/watch?v='||public.course_youtube_id(item->>'video_url'),n)
 ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,video_url=EXCLUDED.video_url WHERE course_videos.title IS DISTINCT FROM EXCLUDED.title OR course_videos.video_url IS DISTINCT FROM EXCLUDED.video_url;
 INSERT INTO public.course_lesson_videos VALUES(l.id,vid,n);n:=n+1;seen:=array_append(seen,vid);
 END LOOP;
 UPDATE public.course_lessons SET is_published=_is_published,game_path=_game_path,revision=revision+1,updated_at=clock_timestamp() WHERE id=l.id;
END;
$$;
-- Legacy callers remain functional; new callers must supply a revision and lesson identity.
CREATE OR REPLACE FUNCTION public.save_course_topic(_course_id uuid,_topic_id uuid,_is_published boolean,_videos jsonb,_game_path text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE l public.course_lessons%ROWTYPE;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Content administrator access is required.'; END IF;
 PERFORM 1 FROM public.courses ORDER BY id FOR UPDATE;
 SELECT x.* INTO l FROM public.course_lesson_courses b JOIN public.course_lessons x ON x.id=b.lesson_id WHERE b.course_id=_course_id AND b.topic_id=_topic_id FOR UPDATE OF x;
 PERFORM public.save_course_lesson(_course_id,_topic_id,_is_published,_videos,_game_path,coalesce(l.revision,0),l.id);
END;
$$;
CREATE FUNCTION public.share_course_lesson(_course_id uuid,_topic_id uuid,_other_course_id uuid,_use_other boolean,_expected_lesson_id uuid,_expected_revision bigint,_expected_other_lesson_id uuid,_expected_other_revision bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE current_l public.course_lessons%ROWTYPE; other_l public.course_lessons%ROWTYPE; chosen uuid;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Content administrator access is required.'; END IF;
 PERFORM 1 FROM public.courses ORDER BY id FOR UPDATE;
 IF _course_id=_other_course_id OR NOT public.course_topic_in_scope(_course_id,_topic_id) OR NOT public.course_topic_in_scope(_other_course_id,_topic_id) OR NOT EXISTS(SELECT 1 FROM public.courses a JOIN public.courses b ON b.id=_other_course_id WHERE a.id=_course_id AND ((a.practice_course_scope='AB' AND b.practice_course_scope='BC') OR (a.practice_course_scope='BC' AND b.practice_course_scope='AB'))) OR EXISTS(SELECT 1 FROM public.curriculum_topics WHERE id=_topic_id AND is_bc_only) THEN RAISE EXCEPTION 'Only matching AB and BC Topics can share content.'; END IF;
 SELECT l.* INTO current_l FROM public.course_lesson_courses b JOIN public.course_lessons l ON l.id=b.lesson_id WHERE b.course_id=_course_id AND b.topic_id=_topic_id FOR UPDATE OF l;
 SELECT l.* INTO other_l FROM public.course_lesson_courses b JOIN public.course_lessons l ON l.id=b.lesson_id WHERE b.course_id=_other_course_id AND b.topic_id=_topic_id FOR UPDATE OF l;
 IF current_l.id IS DISTINCT FROM _expected_lesson_id OR coalesce(current_l.revision,0) IS DISTINCT FROM _expected_revision OR other_l.id IS DISTINCT FROM _expected_other_lesson_id OR coalesce(other_l.revision,0) IS DISTINCT FROM _expected_other_revision THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Lesson changed. Reload both lessons before sharing.'; END IF;
 chosen:=CASE WHEN _use_other THEN other_l.id ELSE current_l.id END;
 IF chosen IS NULL THEN RAISE EXCEPTION 'Save a lesson before sharing it.'; END IF;
 INSERT INTO public.course_lesson_courses VALUES(_course_id,_topic_id,chosen),(_other_course_id,_topic_id,chosen) ON CONFLICT(course_id,topic_id) DO UPDATE SET lesson_id=EXCLUDED.lesson_id;
 UPDATE public.course_lessons SET revision=revision+1,updated_at=clock_timestamp() WHERE id=chosen;
END;
$$;
CREATE FUNCTION public.restore_course_lesson(_course_id uuid,_topic_id uuid,_source_lesson_id uuid,_source_revision bigint,_expected_lesson_id uuid,_expected_revision bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE source public.course_lessons%ROWTYPE; current_l public.course_lessons%ROWTYPE; new_id uuid; v record; new_vid uuid;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Content administrator access is required.'; END IF;
 PERFORM 1 FROM public.courses ORDER BY id FOR UPDATE;
 SELECT * INTO source FROM public.course_lessons WHERE id=_source_lesson_id FOR UPDATE;
 SELECT l.* INTO current_l FROM public.course_lesson_courses b JOIN public.course_lessons l ON l.id=b.lesson_id WHERE b.course_id=_course_id AND b.topic_id=_topic_id FOR UPDATE OF l;
 IF source.id IS NULL OR source.topic_id<>_topic_id OR NOT public.course_topic_in_scope(_course_id,_topic_id) THEN RAISE EXCEPTION 'Saved lesson is outside this Topic.'; END IF;
 IF source.revision IS DISTINCT FROM _source_revision OR current_l.id IS DISTINCT FROM _expected_lesson_id OR coalesce(current_l.revision,0) IS DISTINCT FROM _expected_revision THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Lesson changed. Reload before restoring a draft.'; END IF;
 INSERT INTO public.course_lessons(topic_id,owner_course_id,game_path) VALUES(_topic_id,_course_id,source.game_path) RETURNING id INTO new_id;
 FOR v IN SELECT cv.*,m.order_index AS lesson_order FROM public.course_lesson_videos m JOIN public.course_videos cv ON cv.id=m.video_id WHERE m.lesson_id=source.id LOOP
 new_vid:=gen_random_uuid();INSERT INTO public.course_videos(id,course_id,title,video_url,description,transcript,duration,order_index) VALUES(new_vid,_course_id,v.title,v.video_url,v.description,v.transcript,v.duration,v.lesson_order);
 INSERT INTO public.course_lesson_videos VALUES(new_id,new_vid,v.lesson_order);
 END LOOP;
 INSERT INTO public.course_lesson_courses VALUES(_course_id,_topic_id,new_id) ON CONFLICT(course_id,topic_id) DO UPDATE SET lesson_id=EXCLUDED.lesson_id;
END;
$$;
CREATE OR REPLACE FUNCTION public.guard_published_course_video() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.course_lesson_videos m JOIN public.course_lessons l ON l.id=m.lesson_id WHERE m.video_id=OLD.id AND l.is_published) THEN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Remove published lesson associations before deleting this video.'; END IF;
 IF public.course_youtube_id(NEW.video_url) IS NULL THEN RAISE EXCEPTION 'Published lessons require a valid YouTube URL.'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END;
$$;
CREATE FUNCTION public.touch_video_lessons() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
BEGIN
 IF NEW.title IS DISTINCT FROM OLD.title OR NEW.video_url IS DISTINCT FROM OLD.video_url THEN UPDATE public.course_lessons SET revision=revision+1,updated_at=clock_timestamp() WHERE id IN (SELECT lesson_id FROM public.course_lesson_videos WHERE video_id=NEW.id); END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER touch_video_lessons AFTER UPDATE ON public.course_videos FOR EACH ROW EXECUTE FUNCTION public.touch_video_lessons();
CREATE OR REPLACE FUNCTION public.resolve_course_video(_video_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
 SELECT jsonb_build_object('course_id',b.course_id,'topic_id',b.topic_id) FROM public.course_lesson_videos v JOIN public.course_lesson_courses b ON b.lesson_id=v.lesson_id JOIN public.curriculum_topics t ON t.id=b.topic_id JOIN public.course_curriculum_units u ON u.course_id=b.course_id AND u.unit_id=t.unit_id WHERE v.video_id=_video_id AND public.course_topic_visible(b.course_id,b.topic_id) ORDER BY u.order_index,t.order_index,b.course_id LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.course_lesson_visible(uuid),public.list_saved_course_lessons(),public.save_course_lesson(uuid,uuid,boolean,jsonb,text,bigint,uuid),public.share_course_lesson(uuid,uuid,uuid,boolean,uuid,bigint,uuid,bigint),public.restore_course_lesson(uuid,uuid,uuid,bigint,uuid,bigint),public.touch_video_lessons() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.course_lesson_visible(uuid) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_saved_course_lessons(),public.save_course_lesson(uuid,uuid,boolean,jsonb,text,bigint,uuid),public.share_course_lesson(uuid,uuid,uuid,boolean,uuid,bigint,uuid,bigint),public.restore_course_lesson(uuid,uuid,uuid,bigint,uuid,bigint) TO authenticated;
NOTIFY pgrst,'reload schema';
