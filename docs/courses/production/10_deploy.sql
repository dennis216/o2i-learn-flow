-- Atomic forward release. No seeds, question publication, old migrations or database push.
BEGIN;
DO $release$ BEGIN
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
IF NOT (to_regclass('public.curriculum_topics') IS NOT NULL AND to_regclass('public.course_curriculum_units') IS NOT NULL AND to_regtype('public.question_course_scope') IS NOT NULL AND to_regclass('storage.objects') IS NOT NULL AND EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261026000000' AND name='question_practice_adaptation_v2' AND cardinality(statements)=1 AND md5(statements[1])='354934137b8be264f4b1b2cf58d36b2e') AND (coalesce((SELECT md5(prosrc)='86b03f6166861027f963df9712895e75' FROM pg_proc WHERE oid=to_regprocedure('public.question_practice_expected_seconds(public.question_difficulty)')),false) AND coalesce((SELECT md5(prosrc)='89c8704956cbf6a85fafb47063e1f9af' FROM pg_proc WHERE oid=to_regprocedure('public.question_practice_target(bigint,bigint)')),false) AND coalesce((SELECT md5(prosrc)='a18312b9fe60c31fbdde267d9241e6ae' FROM pg_proc WHERE oid=to_regprocedure('public.question_practice_signals()')),false) AND coalesce((SELECT md5(prosrc)='1162f028c31bdeab0a9fdd0e77b48089' FROM pg_proc WHERE oid=to_regprocedure('public.question_practice_snapshot(uuid)')),false) AND coalesce((SELECT md5(prosrc)='d4088db3fa9026ae6dd0017bc05e6295' FROM pg_proc WHERE oid=to_regprocedure('public.submit_question_practice_v2(uuid,uuid,uuid,integer,jsonb,boolean)')),false) AND coalesce((SELECT md5(prosrc)='3c38ab52a179bc0485a2026f5675b620' FROM pg_proc WHERE oid=to_regprocedure('public.start_question_practice(uuid,uuid)')),false))) THEN RAISE EXCEPTION 'Missing or mismatched prerequisite; stop and inspect adaptation-v2.'; END IF;
IF NOT (NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261027000000') AND NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261028000000') AND NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261029000000') AND NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261030000000')) THEN RAISE EXCEPTION 'Course migration already recorded; do not rerun.'; END IF;
IF to_regclass('public.course_topic_content') IS NOT NULL OR to_regprocedure('public.question_practice_snapshot_questions(uuid)') IS NOT NULL OR EXISTS(SELECT 1 FROM storage.buckets WHERE id='course-games') THEN RAISE EXCEPTION 'Unrecorded course objects; investigate partial deployment.'; END IF;
EXECUTE $course_sql$-- Forward-only: canonical curriculum stays intact; existing videos are never deleted.
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
$course_sql$;
INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261027000000','course_topic_content',ARRAY[$course_sql$-- Forward-only: canonical curriculum stays intact; existing videos are never deleted.
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
$course_sql$]);
EXECUTE $course_sql$-- Requires the deployed adaptation-v2 engine; the existing two-argument RPC stays compatible.
ALTER TABLE public.question_practice_sessions
 ADD COLUMN course_id uuid REFERENCES public.courses(id) ON DELETE RESTRICT,
 ADD COLUMN course_scope public.question_course_scope,
 ADD CONSTRAINT practice_course_context CHECK((course_id IS NULL)=(course_scope IS NULL));
ALTER FUNCTION public.question_practice_snapshot(uuid) RENAME TO question_practice_snapshot_questions;
CREATE FUNCTION public.question_practice_snapshot(_session_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE result jsonb:=public.question_practice_snapshot_questions(_session_id);
BEGIN
 RETURN result || (SELECT jsonb_build_object('course_id',course_id,'course_scope',course_scope) FROM public.question_practice_sessions WHERE id=_session_id);
END;
$$;

CREATE FUNCTION public.list_course_practice_topics(_course_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(counts)),'[]'::jsonb) FROM (
   SELECT t.id,count(*)::integer AS question_count FROM public.questions q
   JOIN public.question_versions v ON v.id=q.current_version_id AND v.question_id=q.id
   JOIN public.curriculum_topics t ON t.id=v.primary_topic_id JOIN public.courses c ON c.id=_course_id
   WHERE c.practice_course_scope IS NOT NULL AND public.course_topic_visible(c.id,t.id)
     AND q.status='approved' AND v.status='approved' AND v.question_type='mcq_single'
     AND (c.practice_course_scope='BC' OR v.course_scope IN ('AB','BOTH'))
   GROUP BY t.id ORDER BY t.id
 ) counts;
$$;
CREATE FUNCTION public.start_question_practice_in_scope(_session_id uuid,_topic_id uuid DEFAULT NULL,_course_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE uid uuid:=public.question_practice_require_user(); s public.question_practice_sessions%ROWTYPE; inserted integer;
  slot integer; candidate record; reasons jsonb:='[]'; fallback_count integer:=0; error_count integer:=0; slow_count integer:=0;
BEGIN
  IF _session_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Provide a practice session ID.'; END IF;
  IF _topic_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.curriculum_topics WHERE id=_topic_id) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Choose an existing canonical Topic.';
  END IF;
  PERFORM 1 FROM public.courses WHERE id=_course_id FOR SHARE;
  PERFORM 1 FROM public.course_topic_content WHERE course_id=_course_id AND topic_id=_topic_id FOR SHARE;
  IF _course_id IS NOT NULL AND (NOT public.course_topic_visible(_course_id,_topic_id)
    OR NOT EXISTS(SELECT 1 FROM public.courses WHERE id=_course_id AND practice_course_scope IS NOT NULL)) THEN
    -- A previously issued session remains readable even after the lesson is withdrawn.
    IF NOT EXISTS(SELECT 1 FROM public.question_practice_sessions WHERE id=_session_id AND user_id=uid AND course_id=_course_id AND topic_id=_topic_id) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Published course lesson is not available for practice.';
    END IF;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('question-practice:'||uid::text,0));
  INSERT INTO public.question_practice_sessions(id,user_id,topic_id,created_at,course_id,course_scope) VALUES(_session_id,uid,_topic_id,clock_timestamp(),_course_id,(SELECT practice_course_scope FROM public.courses WHERE id=_course_id)) ON CONFLICT(id) DO NOTHING;
  GET DIAGNOSTICS inserted=ROW_COUNT;
  SELECT * INTO s FROM public.question_practice_sessions WHERE id=_session_id FOR UPDATE;
  IF s.user_id IS DISTINCT FROM uid THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Practice session is not available to your account.'; END IF;
  IF _topic_id IS NOT NULL AND s.topic_id IS DISTINCT FROM _topic_id THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='This session belongs to a different Topic.'; END IF;
  IF s.course_id IS DISTINCT FROM _course_id THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='This session belongs to a different course scope.'; END IF;
  IF inserted=1 THEN
    FOR slot IN 1..5 LOOP
      WITH signals AS MATERIALIZED (SELECT * FROM public.question_practice_signals()), pool AS (
        SELECT q.id,v.id AS version_id,v.difficulty,v.primary_topic_id,v.representation_type,t.topic_code,
          history.last_sent,coalesce(target.difficulty,'medium') AS target_difficulty,
          signal.skill_code,signal.skill_description,coalesce(signal.n,0) AS signal_count,signal.last_signal,
          slot<=2 AND history.last_sent IS NULL AND signal.n>0 AS reinforced
        FROM public.questions q JOIN public.question_versions v ON v.id=q.current_version_id AND v.question_id=q.id
        JOIN public.curriculum_topics t ON t.id=v.primary_topic_id
        LEFT JOIN LATERAL(SELECT max(h.created_at) AS last_sent FROM public.question_practice_sessions h
          JOIN public.question_practice_items i ON i.session_id=h.id WHERE h.user_id=uid AND i.question_id=q.id) history ON true
        LEFT JOIN LATERAL(SELECT public.question_practice_target(g.sample_count,g.correct_count) AS difficulty
          FROM signals g WHERE g.topic_id=v.primary_topic_id LIMIT 1) target ON true
        LEFT JOIN LATERAL(
          SELECT g.skill_code,g.skill_description,count(*) AS n,max(g.submitted_at) AS last_signal
          FROM signals g WHERE slot<=2 AND g.topic_id=v.primary_topic_id AND g.representation_type=v.representation_type::text
            AND CASE slot WHEN 1 THEN NOT g.is_correct ELSE g.is_slow END
            AND EXISTS(SELECT 1 FROM public.question_practice_skills ps WHERE ps.question_version_id=v.id AND ps.practice_skill_id=g.skill_id)
          GROUP BY g.skill_code,g.skill_description ORDER BY count(*) DESC,max(g.submitted_at) DESC,g.skill_code LIMIT 1
        ) signal ON true
        WHERE q.status='approved' AND v.status='approved' AND v.question_type='mcq_single'
          AND (s.topic_id IS NULL OR v.primary_topic_id=s.topic_id)
          AND (s.course_id IS NULL OR s.course_scope='BC' OR v.course_scope IN ('AB','BOTH'))
          AND NOT EXISTS(SELECT 1 FROM public.question_practice_items i WHERE i.session_id=s.id AND i.question_id=q.id)
      )
      SELECT * INTO candidate FROM pool ORDER BY coalesce(reinforced,false) DESC,
        CASE WHEN reinforced THEN signal_count ELSE 0 END DESC,
        CASE WHEN reinforced THEN last_signal END DESC NULLS LAST,
        (last_sent IS NOT NULL),
        abs(array_position(ARRAY['easy','medium','hard'],difficulty::text)-array_position(ARRAY['easy','medium','hard'],target_difficulty)),
        array_position(ARRAY['easy','medium','hard'],difficulty::text),last_sent ASC NULLS FIRST,random() LIMIT 1;
      IF NOT FOUND THEN EXIT; END IF;
      -- Coordinate immutable issuance with concurrent publication/withdrawal just as the original selector does.
      PERFORM 1 FROM public.questions q WHERE q.id=candidate.id AND q.status='approved' AND q.current_version_id=candidate.version_id FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Published questions changed; retry this practice set.'; END IF;
      INSERT INTO public.question_practice_items(session_id,question_id,version_id,position) VALUES(s.id,candidate.id,candidate.version_id,slot);
      IF candidate.difficulty::text<>candidate.target_difficulty THEN fallback_count:=fallback_count+1; END IF;
      IF candidate.reinforced AND slot=1 THEN error_count:=1; END IF;
      IF candidate.reinforced AND slot=2 THEN slow_count:=1; END IF;
      reasons:=reasons||jsonb_build_array(jsonb_build_object('question_id',candidate.id,
        'kind',CASE WHEN candidate.reinforced THEN CASE slot WHEN 1 THEN 'error' ELSE 'slow' END ELSE 'regular' END,
        'topic_code',candidate.topic_code,'representation_type',candidate.representation_type,
        'skill_code',CASE WHEN candidate.reinforced THEN candidate.skill_code END,
        'skill_description',CASE WHEN candidate.reinforced THEN candidate.skill_description END,
        'signal_count',CASE WHEN candidate.reinforced THEN candidate.signal_count ELSE 0 END,
        'target_difficulty',candidate.target_difficulty));
    END LOOP;
    UPDATE public.question_practice_sessions SET selection_summary=jsonb_build_object('rule_version','practice-adaptation-v2',
      'error_count',error_count,'slow_count',slow_count,'fallback_count',fallback_count,'items',reasons) WHERE id=s.id;
  END IF;
  RETURN public.question_practice_snapshot(s.id);
END;
$$;


CREATE OR REPLACE FUNCTION public.start_question_practice(_session_id uuid,_topic_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.question_practice_sessions WHERE id=_session_id AND user_id=public.question_practice_require_user() AND course_id IS NOT NULL) THEN
   IF _topic_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.question_practice_sessions WHERE id=_session_id AND topic_id=_topic_id) THEN RAISE EXCEPTION 'This session belongs to a different Topic.'; END IF;
   RETURN public.question_practice_snapshot(_session_id);
 END IF;
 RETURN public.start_question_practice_in_scope(_session_id,_topic_id,NULL);
END;
$$;
CREATE FUNCTION public.start_course_question_practice(_session_id uuid,_course_id uuid,_topic_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
BEGIN
 IF _course_id IS NULL OR _topic_id IS NULL THEN RAISE EXCEPTION 'Choose a course and Topic.'; END IF;
 RETURN public.start_question_practice_in_scope(_session_id,_topic_id,_course_id);
END;
$$;
REVOKE ALL ON FUNCTION public.question_practice_snapshot_questions(uuid),public.question_practice_snapshot(uuid),public.start_question_practice_in_scope(uuid,uuid,uuid),public.start_course_question_practice(uuid,uuid,uuid),public.list_course_practice_topics(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.start_course_question_practice(uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_course_practice_topics(uuid) TO anon,authenticated;
NOTIFY pgrst,'reload schema';
$course_sql$;
INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261028000000','course_topic_practice',ARRAY[$course_sql$-- Requires the deployed adaptation-v2 engine; the existing two-argument RPC stays compatible.
ALTER TABLE public.question_practice_sessions
 ADD COLUMN course_id uuid REFERENCES public.courses(id) ON DELETE RESTRICT,
 ADD COLUMN course_scope public.question_course_scope,
 ADD CONSTRAINT practice_course_context CHECK((course_id IS NULL)=(course_scope IS NULL));
ALTER FUNCTION public.question_practice_snapshot(uuid) RENAME TO question_practice_snapshot_questions;
CREATE FUNCTION public.question_practice_snapshot(_session_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE result jsonb:=public.question_practice_snapshot_questions(_session_id);
BEGIN
 RETURN result || (SELECT jsonb_build_object('course_id',course_id,'course_scope',course_scope) FROM public.question_practice_sessions WHERE id=_session_id);
END;
$$;

CREATE FUNCTION public.list_course_practice_topics(_course_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(counts)),'[]'::jsonb) FROM (
   SELECT t.id,count(*)::integer AS question_count FROM public.questions q
   JOIN public.question_versions v ON v.id=q.current_version_id AND v.question_id=q.id
   JOIN public.curriculum_topics t ON t.id=v.primary_topic_id JOIN public.courses c ON c.id=_course_id
   WHERE c.practice_course_scope IS NOT NULL AND public.course_topic_visible(c.id,t.id)
     AND q.status='approved' AND v.status='approved' AND v.question_type='mcq_single'
     AND (c.practice_course_scope='BC' OR v.course_scope IN ('AB','BOTH'))
   GROUP BY t.id ORDER BY t.id
 ) counts;
$$;
CREATE FUNCTION public.start_question_practice_in_scope(_session_id uuid,_topic_id uuid DEFAULT NULL,_course_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE uid uuid:=public.question_practice_require_user(); s public.question_practice_sessions%ROWTYPE; inserted integer;
  slot integer; candidate record; reasons jsonb:='[]'; fallback_count integer:=0; error_count integer:=0; slow_count integer:=0;
BEGIN
  IF _session_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Provide a practice session ID.'; END IF;
  IF _topic_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.curriculum_topics WHERE id=_topic_id) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Choose an existing canonical Topic.';
  END IF;
  PERFORM 1 FROM public.courses WHERE id=_course_id FOR SHARE;
  PERFORM 1 FROM public.course_topic_content WHERE course_id=_course_id AND topic_id=_topic_id FOR SHARE;
  IF _course_id IS NOT NULL AND (NOT public.course_topic_visible(_course_id,_topic_id)
    OR NOT EXISTS(SELECT 1 FROM public.courses WHERE id=_course_id AND practice_course_scope IS NOT NULL)) THEN
    -- A previously issued session remains readable even after the lesson is withdrawn.
    IF NOT EXISTS(SELECT 1 FROM public.question_practice_sessions WHERE id=_session_id AND user_id=uid AND course_id=_course_id AND topic_id=_topic_id) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Published course lesson is not available for practice.';
    END IF;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('question-practice:'||uid::text,0));
  INSERT INTO public.question_practice_sessions(id,user_id,topic_id,created_at,course_id,course_scope) VALUES(_session_id,uid,_topic_id,clock_timestamp(),_course_id,(SELECT practice_course_scope FROM public.courses WHERE id=_course_id)) ON CONFLICT(id) DO NOTHING;
  GET DIAGNOSTICS inserted=ROW_COUNT;
  SELECT * INTO s FROM public.question_practice_sessions WHERE id=_session_id FOR UPDATE;
  IF s.user_id IS DISTINCT FROM uid THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Practice session is not available to your account.'; END IF;
  IF _topic_id IS NOT NULL AND s.topic_id IS DISTINCT FROM _topic_id THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='This session belongs to a different Topic.'; END IF;
  IF s.course_id IS DISTINCT FROM _course_id THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='This session belongs to a different course scope.'; END IF;
  IF inserted=1 THEN
    FOR slot IN 1..5 LOOP
      WITH signals AS MATERIALIZED (SELECT * FROM public.question_practice_signals()), pool AS (
        SELECT q.id,v.id AS version_id,v.difficulty,v.primary_topic_id,v.representation_type,t.topic_code,
          history.last_sent,coalesce(target.difficulty,'medium') AS target_difficulty,
          signal.skill_code,signal.skill_description,coalesce(signal.n,0) AS signal_count,signal.last_signal,
          slot<=2 AND history.last_sent IS NULL AND signal.n>0 AS reinforced
        FROM public.questions q JOIN public.question_versions v ON v.id=q.current_version_id AND v.question_id=q.id
        JOIN public.curriculum_topics t ON t.id=v.primary_topic_id
        LEFT JOIN LATERAL(SELECT max(h.created_at) AS last_sent FROM public.question_practice_sessions h
          JOIN public.question_practice_items i ON i.session_id=h.id WHERE h.user_id=uid AND i.question_id=q.id) history ON true
        LEFT JOIN LATERAL(SELECT public.question_practice_target(g.sample_count,g.correct_count) AS difficulty
          FROM signals g WHERE g.topic_id=v.primary_topic_id LIMIT 1) target ON true
        LEFT JOIN LATERAL(
          SELECT g.skill_code,g.skill_description,count(*) AS n,max(g.submitted_at) AS last_signal
          FROM signals g WHERE slot<=2 AND g.topic_id=v.primary_topic_id AND g.representation_type=v.representation_type::text
            AND CASE slot WHEN 1 THEN NOT g.is_correct ELSE g.is_slow END
            AND EXISTS(SELECT 1 FROM public.question_practice_skills ps WHERE ps.question_version_id=v.id AND ps.practice_skill_id=g.skill_id)
          GROUP BY g.skill_code,g.skill_description ORDER BY count(*) DESC,max(g.submitted_at) DESC,g.skill_code LIMIT 1
        ) signal ON true
        WHERE q.status='approved' AND v.status='approved' AND v.question_type='mcq_single'
          AND (s.topic_id IS NULL OR v.primary_topic_id=s.topic_id)
          AND (s.course_id IS NULL OR s.course_scope='BC' OR v.course_scope IN ('AB','BOTH'))
          AND NOT EXISTS(SELECT 1 FROM public.question_practice_items i WHERE i.session_id=s.id AND i.question_id=q.id)
      )
      SELECT * INTO candidate FROM pool ORDER BY coalesce(reinforced,false) DESC,
        CASE WHEN reinforced THEN signal_count ELSE 0 END DESC,
        CASE WHEN reinforced THEN last_signal END DESC NULLS LAST,
        (last_sent IS NOT NULL),
        abs(array_position(ARRAY['easy','medium','hard'],difficulty::text)-array_position(ARRAY['easy','medium','hard'],target_difficulty)),
        array_position(ARRAY['easy','medium','hard'],difficulty::text),last_sent ASC NULLS FIRST,random() LIMIT 1;
      IF NOT FOUND THEN EXIT; END IF;
      -- Coordinate immutable issuance with concurrent publication/withdrawal just as the original selector does.
      PERFORM 1 FROM public.questions q WHERE q.id=candidate.id AND q.status='approved' AND q.current_version_id=candidate.version_id FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Published questions changed; retry this practice set.'; END IF;
      INSERT INTO public.question_practice_items(session_id,question_id,version_id,position) VALUES(s.id,candidate.id,candidate.version_id,slot);
      IF candidate.difficulty::text<>candidate.target_difficulty THEN fallback_count:=fallback_count+1; END IF;
      IF candidate.reinforced AND slot=1 THEN error_count:=1; END IF;
      IF candidate.reinforced AND slot=2 THEN slow_count:=1; END IF;
      reasons:=reasons||jsonb_build_array(jsonb_build_object('question_id',candidate.id,
        'kind',CASE WHEN candidate.reinforced THEN CASE slot WHEN 1 THEN 'error' ELSE 'slow' END ELSE 'regular' END,
        'topic_code',candidate.topic_code,'representation_type',candidate.representation_type,
        'skill_code',CASE WHEN candidate.reinforced THEN candidate.skill_code END,
        'skill_description',CASE WHEN candidate.reinforced THEN candidate.skill_description END,
        'signal_count',CASE WHEN candidate.reinforced THEN candidate.signal_count ELSE 0 END,
        'target_difficulty',candidate.target_difficulty));
    END LOOP;
    UPDATE public.question_practice_sessions SET selection_summary=jsonb_build_object('rule_version','practice-adaptation-v2',
      'error_count',error_count,'slow_count',slow_count,'fallback_count',fallback_count,'items',reasons) WHERE id=s.id;
  END IF;
  RETURN public.question_practice_snapshot(s.id);
END;
$$;


CREATE OR REPLACE FUNCTION public.start_question_practice(_session_id uuid,_topic_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.question_practice_sessions WHERE id=_session_id AND user_id=public.question_practice_require_user() AND course_id IS NOT NULL) THEN
   IF _topic_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.question_practice_sessions WHERE id=_session_id AND topic_id=_topic_id) THEN RAISE EXCEPTION 'This session belongs to a different Topic.'; END IF;
   RETURN public.question_practice_snapshot(_session_id);
 END IF;
 RETURN public.start_question_practice_in_scope(_session_id,_topic_id,NULL);
END;
$$;
CREATE FUNCTION public.start_course_question_practice(_session_id uuid,_course_id uuid,_topic_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
BEGIN
 IF _course_id IS NULL OR _topic_id IS NULL THEN RAISE EXCEPTION 'Choose a course and Topic.'; END IF;
 RETURN public.start_question_practice_in_scope(_session_id,_topic_id,_course_id);
END;
$$;
REVOKE ALL ON FUNCTION public.question_practice_snapshot_questions(uuid),public.question_practice_snapshot(uuid),public.start_question_practice_in_scope(uuid,uuid,uuid),public.start_course_question_practice(uuid,uuid,uuid),public.list_course_practice_topics(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.start_course_question_practice(uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_course_practice_topics(uuid) TO anon,authenticated;
NOTIFY pgrst,'reload schema';
$course_sql$]);
EXECUTE $course_sql$-- Games are private objects: publication, not possession of a URL, controls download.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 VALUES('course-games','course-games',false,5242880,ARRAY['text/html'])
 ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types;
CREATE POLICY course_game_read ON storage.objects FOR SELECT TO anon,authenticated
 USING(bucket_id='course-games' AND (public.has_role(auth.uid(),'admin') OR EXISTS(
   SELECT 1 FROM public.course_topic_content l WHERE l.game_path=name AND public.course_topic_visible(l.course_id,l.topic_id))));
CREATE POLICY course_game_upload ON storage.objects FOR INSERT TO authenticated
 WITH CHECK(bucket_id='course-games' AND public.has_role(auth.uid(),'admin')
   AND name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.html$');
CREATE POLICY course_game_remove_unused ON storage.objects FOR DELETE TO authenticated
 USING(bucket_id='course-games' AND public.has_role(auth.uid(),'admin')
   AND NOT EXISTS(SELECT 1 FROM public.course_topic_content WHERE game_path=name));
-- No UPDATE policy: replacements get a new immutable path.
NOTIFY pgrst,'reload schema';
$course_sql$;
INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261029000000','course_html_games',ARRAY[$course_sql$-- Games are private objects: publication, not possession of a URL, controls download.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 VALUES('course-games','course-games',false,5242880,ARRAY['text/html'])
 ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types;
CREATE POLICY course_game_read ON storage.objects FOR SELECT TO anon,authenticated
 USING(bucket_id='course-games' AND (public.has_role(auth.uid(),'admin') OR EXISTS(
   SELECT 1 FROM public.course_topic_content l WHERE l.game_path=name AND public.course_topic_visible(l.course_id,l.topic_id))));
CREATE POLICY course_game_upload ON storage.objects FOR INSERT TO authenticated
 WITH CHECK(bucket_id='course-games' AND public.has_role(auth.uid(),'admin')
   AND name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.html$');
CREATE POLICY course_game_remove_unused ON storage.objects FOR DELETE TO authenticated
 USING(bucket_id='course-games' AND public.has_role(auth.uid(),'admin')
   AND NOT EXISTS(SELECT 1 FROM public.course_topic_content WHERE game_path=name));
-- No UPDATE policy: replacements get a new immutable path.
NOTIFY pgrst,'reload schema';
$course_sql$]);
EXECUTE $course_sql$CREATE FUNCTION public.resolve_course_video(_video_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
 SELECT jsonb_build_object('course_id',m.course_id,'topic_id',m.topic_id)
 FROM public.course_topic_videos m JOIN public.curriculum_topics t ON t.id=m.topic_id
 JOIN public.course_curriculum_units u ON u.course_id=m.course_id AND u.unit_id=t.unit_id
 WHERE m.video_id=_video_id AND public.course_topic_visible(m.course_id,m.topic_id)
 ORDER BY u.order_index,t.order_index,m.order_index LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.resolve_course_video(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_course_video(uuid) TO anon,authenticated;
NOTIFY pgrst,'reload schema';
$course_sql$;
INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261030000000','course_legacy_links',ARRAY[$course_sql$CREATE FUNCTION public.resolve_course_video(_video_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
 SELECT jsonb_build_object('course_id',m.course_id,'topic_id',m.topic_id)
 FROM public.course_topic_videos m JOIN public.curriculum_topics t ON t.id=m.topic_id
 JOIN public.course_curriculum_units u ON u.course_id=m.course_id AND u.unit_id=t.unit_id
 WHERE m.video_id=_video_id AND public.course_topic_visible(m.course_id,m.topic_id)
 ORDER BY u.order_index,t.order_index,m.order_index LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.resolve_course_video(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_course_video(uuid) TO anon,authenticated;
NOTIFY pgrst,'reload schema';
$course_sql$]);
END $release$;
COMMIT;
