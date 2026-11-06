-- Forward-only: canonical curriculum stays intact; existing videos are never deleted.
ALTER TABLE public.courses ADD COLUMN practice_course_scope public.question_course_scope;
UPDATE public.courses SET practice_course_scope=CASE id
  WHEN '93124428-92f4-48d2-a6dc-e5f9e010248b'::uuid THEN 'AB'::public.question_course_scope
  WHEN 'fccc7540-0c29-43be-8682-ae90ff2534cb'::uuid THEN 'BC'::public.question_course_scope END
WHERE id IN ('93124428-92f4-48d2-a6dc-e5f9e010248b','fccc7540-0c29-43be-8682-ae90ff2534cb');

CREATE TABLE public.course_topic_content (
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  topic_id uuid NOT NULL REFERENCES public.curriculum_topics(id) ON DELETE RESTRICT,
  is_published boolean NOT NULL DEFAULT false,
  game_path text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(course_id,topic_id),
  CHECK(game_path IS NULL OR game_path LIKE course_id::text||'/'||topic_id::text||'/%')
);
ALTER TABLE public.course_videos ADD CONSTRAINT course_videos_id_course_unique UNIQUE(id,course_id);
CREATE TABLE public.course_topic_videos (
  course_id uuid NOT NULL,
  topic_id uuid NOT NULL,
  video_id uuid NOT NULL,
  order_index integer NOT NULL CHECK(order_index>=0),
  PRIMARY KEY(course_id,topic_id,video_id),
  UNIQUE(course_id,topic_id,order_index),
  FOREIGN KEY(course_id,topic_id) REFERENCES public.course_topic_content(course_id,topic_id) ON DELETE CASCADE,
  FOREIGN KEY(video_id,course_id) REFERENCES public.course_videos(id,course_id) ON DELETE CASCADE
);
CREATE INDEX course_topic_videos_video_idx ON public.course_topic_videos(video_id);

CREATE FUNCTION public.course_youtube_id(_url text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=public,extensions AS $$
 SELECT CASE WHEN (SELECT count(*) FROM regexp_matches(_url,'[?&]v=','g'))>1 THEN NULL ELSE coalesce(
   substring(_url FROM '^https://(?:www\.|m\.)?youtube\.com/watch\?(?:[^#]*&)?v=([A-Za-z0-9_-]{11})(?:[&#].*)?$'),
   substring(_url FROM '^https://youtu\.be/([A-Za-z0-9_-]{11})(?:[?&#].*)?$'),
   substring(_url FROM '^https://(?:www\.|m\.)?youtube\.com/(?:shorts|embed)/([A-Za-z0-9_-]{11})(?:[?&#].*)?$')
 ) END;
$$;
CREATE FUNCTION public.course_topic_in_scope(_course_id uuid,_topic_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
 SELECT EXISTS(SELECT 1 FROM public.courses c JOIN public.course_curriculum_units m ON m.course_id=c.id
   JOIN public.curriculum_topics t ON t.unit_id=m.unit_id WHERE c.id=_course_id AND t.id=_topic_id
   AND (c.practice_course_scope IS NULL OR c.practice_course_scope='BC' OR NOT t.is_bc_only));
$$;
CREATE FUNCTION public.course_topic_visible(_course_id uuid,_topic_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
 SELECT EXISTS(SELECT 1 FROM public.course_topic_content l JOIN public.courses c ON c.id=l.course_id
   WHERE l.course_id=_course_id AND l.topic_id=_topic_id AND c.is_published AND l.is_published
   AND public.course_topic_in_scope(l.course_id,l.topic_id));
$$;
CREATE FUNCTION public.validate_course_topic_content() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,extensions AS $$
BEGIN
 IF NOT public.course_topic_in_scope(NEW.course_id,NEW.topic_id) THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Topic is outside this course curriculum.';
 END IF;
 NEW.updated_at:=now(); RETURN NEW;
END;
$$;
CREATE TRIGGER validate_course_topic BEFORE INSERT OR UPDATE ON public.course_topic_content
FOR EACH ROW EXECUTE FUNCTION public.validate_course_topic_content();

-- Exact foreign keys only. Imported associations remain Draft until an administrator publishes.
INSERT INTO public.course_topic_content(course_id,topic_id)
 SELECT DISTINCT course_id,curriculum_topic_id FROM public.course_videos
 WHERE curriculum_topic_id IS NOT NULL AND public.course_topic_in_scope(course_id,curriculum_topic_id);
INSERT INTO public.course_topic_videos(course_id,topic_id,video_id,order_index)
 SELECT v.course_id,v.curriculum_topic_id,v.id,row_number() OVER(PARTITION BY v.course_id,v.curriculum_topic_id ORDER BY v.order_index,v.id)-1
 FROM public.course_videos v JOIN public.course_topic_content l ON l.course_id=v.course_id AND l.topic_id=v.curriculum_topic_id;

ALTER TABLE public.course_topic_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_topic_videos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.course_topic_content,public.course_topic_videos FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.course_topic_content,public.course_topic_videos TO anon,authenticated;
CREATE POLICY course_content_read ON public.course_topic_content FOR SELECT TO anon,authenticated
 USING(public.has_role(auth.uid(),'admin') OR public.course_topic_visible(course_id,topic_id));
CREATE POLICY course_video_mapping_read ON public.course_topic_videos FOR SELECT TO anon,authenticated
 USING(public.has_role(auth.uid(),'admin') OR public.course_topic_visible(course_id,topic_id));
DROP POLICY IF EXISTS "Visible course videos are publicly readable" ON public.course_videos;
DROP POLICY IF EXISTS "Anyone can view course videos" ON public.course_videos;
CREATE POLICY course_published_video_read ON public.course_videos FOR SELECT TO anon,authenticated
 USING(public.has_role(auth.uid(),'admin') OR EXISTS(SELECT 1 FROM public.course_topic_videos m
   WHERE m.video_id=course_videos.id AND public.course_topic_visible(m.course_id,m.topic_id)));

CREATE FUNCTION public.get_course_outline(_course_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.courses WHERE id=_course_id AND (is_published OR public.has_role(auth.uid(),'admin'))) THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Course is not available.';
 END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',u.id,'unit_number',u.unit_number,'title',u.title,'ab_exam_weight_min',u.ab_exam_weight_min,'ab_exam_weight_max',u.ab_exam_weight_max,'bc_exam_weight_min',u.bc_exam_weight_min,'bc_exam_weight_max',u.bc_exam_weight_max,'topics',
   coalesce((SELECT jsonb_agg(jsonb_build_object('id',t.id,'code',t.topic_code,'title',t.title,'big_idea',t.big_idea,'is_bc_only',t.is_bc_only,
     'is_published',coalesce(l.is_published,false)) ORDER BY t.order_index)
     FROM public.curriculum_topics t LEFT JOIN public.course_topic_content l ON l.course_id=_course_id AND l.topic_id=t.id
     WHERE t.unit_id=u.id AND public.course_topic_in_scope(_course_id,t.id)),'[]'::jsonb)) ORDER BY m.order_index)
   FROM public.course_curriculum_units m JOIN public.curriculum_units u ON u.id=m.unit_id WHERE m.course_id=_course_id),'[]'::jsonb);
END;
$$;
CREATE FUNCTION public.get_course_topic(_course_id uuid,_topic_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE l public.course_topic_content%ROWTYPE;
BEGIN
 IF NOT public.course_topic_in_scope(_course_id,_topic_id) OR NOT (public.course_topic_visible(_course_id,_topic_id) OR public.has_role(auth.uid(),'admin')) THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Lesson content is not available.';
 END IF;
 SELECT * INTO l FROM public.course_topic_content WHERE course_id=_course_id AND topic_id=_topic_id;
 RETURN jsonb_build_object('course_id',_course_id,'topic_id',_topic_id,'is_published',coalesce(l.is_published,false),
   'game_path',l.game_path,'videos',coalesce((SELECT jsonb_agg(jsonb_build_object('id',v.id,'course_id',v.course_id,
   'title',v.title,'description',v.description,'video_url',v.video_url,'duration',v.duration,'order_index',m.order_index,
   'transcript',v.transcript) ORDER BY m.order_index)
   FROM public.course_topic_videos m JOIN public.course_videos v ON v.id=m.video_id
   WHERE m.course_id=_course_id AND m.topic_id=_topic_id),'[]'::jsonb));
END;
$$;

CREATE FUNCTION public.save_course_topic(_course_id uuid,_topic_id uuid,_is_published boolean,_videos jsonb,_game_path text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE item jsonb; vid uuid; n integer:=0; seen uuid[]:='{}';
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Content administrator access is required.'; END IF;
 PERFORM 1 FROM public.courses WHERE id=_course_id FOR UPDATE;
 IF NOT public.course_topic_in_scope(_course_id,_topic_id) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Topic is outside this course curriculum.'; END IF;
 IF _is_published IS NULL OR jsonb_typeof(_videos) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid lesson configuration.'; END IF;
 IF jsonb_array_length(_videos)>30 OR (_is_published AND jsonb_array_length(_videos)=0) THEN RAISE EXCEPTION 'Publish requires a video; maximum 30 videos per lesson.'; END IF;
 IF _game_path IS NOT NULL AND NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='course-games' AND name=_game_path) THEN RAISE EXCEPTION 'Upload the game before saving.'; END IF;
 INSERT INTO public.course_topic_content(course_id,topic_id) VALUES(_course_id,_topic_id) ON CONFLICT DO NOTHING;
 DELETE FROM public.course_topic_videos WHERE course_id=_course_id AND topic_id=_topic_id;
 FOR item IN SELECT value FROM jsonb_array_elements(_videos) LOOP
   IF jsonb_typeof(item)<>'object' OR nullif(btrim(item->>'title'),'') IS NULL OR length(item->>'title')>200 OR public.course_youtube_id(item->>'video_url') IS NULL THEN RAISE EXCEPTION 'Each video needs a title and valid HTTPS YouTube URL.'; END IF;
   vid:=coalesce(nullif(item->>'id','')::uuid,gen_random_uuid());
   IF vid=ANY(seen) THEN RAISE EXCEPTION 'A video may only appear once in a lesson.'; END IF;
   IF EXISTS(SELECT 1 FROM public.course_videos WHERE id=vid AND course_id<>_course_id) THEN RAISE EXCEPTION 'Video belongs to another course.'; END IF;
   INSERT INTO public.course_videos(id,course_id,title,video_url,order_index) VALUES(vid,_course_id,btrim(item->>'title'),'https://www.youtube.com/watch?v='||public.course_youtube_id(item->>'video_url'),n)
   ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,video_url=EXCLUDED.video_url;
   INSERT INTO public.course_topic_videos VALUES(_course_id,_topic_id,vid,n);
   n:=n+1;seen:=array_append(seen,vid);
 END LOOP;
 UPDATE public.course_topic_content SET is_published=_is_published,game_path=_game_path WHERE course_id=_course_id AND topic_id=_topic_id;
END;
$$;
-- Old video forms cannot invalidate published lessons or delete a shared published video.
CREATE FUNCTION public.guard_published_course_video() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.course_topic_videos m JOIN public.course_topic_content l USING(course_id,topic_id) WHERE m.video_id=OLD.id AND l.is_published) THEN
   IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Remove published lesson associations before deleting this video.'; END IF;
   IF public.course_youtube_id(NEW.video_url) IS NULL THEN RAISE EXCEPTION 'Published lessons require a valid YouTube URL.'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END;
$$;
CREATE TRIGGER guard_course_video BEFORE UPDATE OR DELETE ON public.course_videos FOR EACH ROW EXECUTE FUNCTION public.guard_published_course_video();

REVOKE ALL ON FUNCTION public.validate_course_topic_content(),public.guard_published_course_video(),public.save_course_topic(uuid,uuid,boolean,jsonb,text),public.get_course_outline(uuid),public.get_course_topic(uuid,uuid),public.course_topic_in_scope(uuid,uuid),public.course_topic_visible(uuid,uuid),public.course_youtube_id(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.course_topic_in_scope(uuid,uuid),public.course_topic_visible(uuid,uuid),public.course_youtube_id(text),public.get_course_outline(uuid),public.get_course_topic(uuid,uuid) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_course_topic(uuid,uuid,boolean,jsonb,text) TO authenticated;
NOTIFY pgrst,'reload schema';
