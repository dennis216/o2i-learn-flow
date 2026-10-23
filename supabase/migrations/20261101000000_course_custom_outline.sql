-- Forward-only: course-specific outline and canonical Topic identities remain separate.
ALTER TABLE public.courses ADD COLUMN outline_revision bigint NOT NULL DEFAULT 0,
 ADD COLUMN outline_customized boolean NOT NULL DEFAULT false;
CREATE TABLE public.course_outline_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE RESTRICT,
 unit_id uuid NOT NULL REFERENCES public.curriculum_units(id) ON DELETE RESTRICT,
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 200),
 position integer NOT NULL CHECK(position>=0),
 content_id uuid REFERENCES public.course_lessons(id) ON DELETE RESTRICT,
 archived boolean NOT NULL DEFAULT false
);
CREATE INDEX course_outline_entry_course ON public.course_outline_entries(course_id,unit_id,position);
CREATE INDEX course_outline_entry_content ON public.course_outline_entries(content_id);
CREATE TABLE public.course_outline_topics (
 entry_id uuid NOT NULL REFERENCES public.course_outline_entries(id) ON DELETE CASCADE,
 topic_id uuid NOT NULL REFERENCES public.curriculum_topics(id) ON DELETE RESTRICT,
 PRIMARY KEY(entry_id,topic_id)
);
CREATE INDEX course_outline_topic_topic ON public.course_outline_topics(topic_id);
CREATE FUNCTION public.initialize_course_outline(_course_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE t record; eid uuid;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Content administrator access is required.'; END IF;
 PERFORM 1 FROM public.courses WHERE id=_course_id FOR UPDATE;
 FOR t IN SELECT ct.* FROM public.curriculum_topics ct WHERE public.course_topic_in_scope(_course_id,ct.id)
 AND NOT EXISTS(SELECT 1 FROM public.course_outline_topics m JOIN public.course_outline_entries e ON e.id=m.entry_id WHERE e.course_id=_course_id AND NOT e.archived AND m.topic_id=ct.id)
 LOOP
 INSERT INTO public.course_outline_entries(course_id,unit_id,title,position,content_id)
 VALUES(_course_id,t.unit_id,t.title,t.order_index*100,(SELECT lesson_id FROM public.course_lesson_courses WHERE course_id=_course_id AND topic_id=t.id)) RETURNING id INTO eid;
 INSERT INTO public.course_outline_topics VALUES(eid,t.id);
 END LOOP;
END;
$$;
-- Migration backfill runs as owner, without manufacturing an authenticated user.
WITH inserted AS (
 INSERT INTO public.course_outline_entries(course_id,unit_id,title,position,content_id)
 SELECT c.id,t.unit_id,t.title,t.order_index*100,b.lesson_id FROM public.courses c
 JOIN public.curriculum_topics t ON public.course_topic_in_scope(c.id,t.id)
 LEFT JOIN public.course_lesson_courses b ON b.course_id=c.id AND b.topic_id=t.id RETURNING *
) INSERT INTO public.course_outline_topics SELECT e.id,t.id FROM inserted e JOIN public.curriculum_topics t ON t.unit_id=e.unit_id AND t.order_index*100=e.position;

ALTER TABLE public.course_outline_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_outline_topics ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.course_outline_entries,public.course_outline_topics FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.course_outline_entries,public.course_outline_topics TO anon,authenticated;
CREATE POLICY outline_entry_read ON public.course_outline_entries FOR SELECT USING(public.has_role(auth.uid(),'admin') OR (NOT archived AND EXISTS(SELECT 1 FROM public.courses c WHERE c.id=course_id AND c.is_published)));
CREATE POLICY outline_topic_read ON public.course_outline_topics FOR SELECT USING(EXISTS(SELECT 1 FROM public.course_outline_entries e WHERE e.id=entry_id));
CREATE OR REPLACE FUNCTION public.course_topic_visible(_course_id uuid,_topic_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
 SELECT EXISTS(SELECT 1 FROM public.course_outline_entries e JOIN public.course_outline_topics m ON m.entry_id=e.id
 JOIN public.course_lessons l ON l.id=e.content_id JOIN public.courses c ON c.id=e.course_id
 WHERE e.course_id=_course_id AND m.topic_id=_topic_id AND NOT e.archived AND c.is_published AND l.is_published AND public.course_topic_in_scope(c.id,m.topic_id));
$$;
CREATE OR REPLACE FUNCTION public.course_lesson_visible(_lesson_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
 SELECT EXISTS(SELECT 1 FROM public.course_outline_entries e JOIN public.courses c ON c.id=e.course_id JOIN public.course_lessons l ON l.id=e.content_id WHERE e.content_id=_lesson_id AND NOT e.archived AND c.is_published AND l.is_published);
$$;
CREATE FUNCTION public.get_course_outline_v2(_course_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.courses WHERE id=_course_id AND (is_published OR public.has_role(auth.uid(),'admin'))) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Course is not available.'; END IF;
 RETURN jsonb_build_object('revision',(SELECT outline_revision FROM public.courses WHERE id=_course_id),'units',coalesce((SELECT jsonb_agg(jsonb_build_object('id',u.id,'unit_number',u.unit_number,'title',u.title,'ab_exam_weight_min',u.ab_exam_weight_min,'ab_exam_weight_max',u.ab_exam_weight_max,'bc_exam_weight_min',u.bc_exam_weight_min,'bc_exam_weight_max',u.bc_exam_weight_max,'topics',coalesce((
 SELECT jsonb_agg(jsonb_build_object('id',e.id,'entry_id',e.id,'code',(SELECT string_agg(t.topic_code,' · ' ORDER BY t.order_index) FROM public.course_outline_topics m JOIN public.curriculum_topics t ON t.id=m.topic_id WHERE m.entry_id=e.id),'title',e.title,'is_published',coalesce(l.is_published,false),'content_id',CASE WHEN public.has_role(auth.uid(),'admin') THEN e.content_id END,'cb_topics',(SELECT jsonb_agg(jsonb_build_object('id',t.id,'code',t.topic_code,'title',t.title,'is_bc_only',t.is_bc_only) ORDER BY t.order_index) FROM public.course_outline_topics m JOIN public.curriculum_topics t ON t.id=m.topic_id WHERE m.entry_id=e.id)) ORDER BY e.position,e.id)
 FROM public.course_outline_entries e LEFT JOIN public.course_lessons l ON l.id=e.content_id WHERE e.course_id=_course_id AND e.unit_id=u.id AND NOT e.archived),'[]'::jsonb)) ORDER BY cu.order_index)
 FROM public.course_curriculum_units cu JOIN public.curriculum_units u ON u.id=cu.unit_id WHERE cu.course_id=_course_id),'[]'::jsonb));
END;
$$;
CREATE FUNCTION public.get_course_outline_entry(_course_id uuid,_entry_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE e public.course_outline_entries%ROWTYPE; l public.course_lessons%ROWTYPE; result jsonb; anchor uuid;
BEGIN
 SELECT * INTO e FROM public.course_outline_entries WHERE course_id=_course_id AND id=_entry_id AND NOT archived;
 IF NOT FOUND THEN RAISE EXCEPTION 'Course lesson is not available.'; END IF;
 SELECT * INTO l FROM public.course_lessons WHERE id=e.content_id;
 IF NOT public.has_role(auth.uid(),'admin') AND NOT(coalesce(l.is_published,false) AND EXISTS(SELECT 1 FROM public.courses WHERE id=_course_id AND is_published)) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Lesson content is not available.'; END IF;
 SELECT topic_id INTO anchor FROM public.course_outline_topics WHERE entry_id=e.id ORDER BY topic_id LIMIT 1;
 result:=jsonb_build_object('course_id',_course_id,'entry_id',e.id,'topic_id',coalesce(l.topic_id,anchor),'is_published',coalesce(l.is_published,false),'game_path',l.game_path,'videos',coalesce((SELECT jsonb_agg(jsonb_build_object('id',v.id,'course_id',_course_id,'title',v.title,'description',v.description,'video_url',v.video_url,'duration',v.duration,'transcript',v.transcript,'order_index',m.order_index) ORDER BY m.order_index) FROM public.course_lesson_videos m JOIN public.course_videos v ON v.id=m.video_id WHERE m.lesson_id=l.id),'[]'::jsonb));
 IF public.has_role(auth.uid(),'admin') THEN
 result:=result||jsonb_build_object('lesson_id',l.id,'revision',coalesce(l.revision,0),'owner_course_id',coalesce(l.owner_course_id,_course_id),'linked_courses',coalesce((SELECT jsonb_agg(jsonb_build_object('id',x.id,'title',x.title)) FROM public.courses x WHERE EXISTS(SELECT 1 FROM public.course_outline_entries b WHERE b.content_id=l.id AND NOT b.archived AND b.course_id=x.id)),'[]'::jsonb),'shared_video_topics',coalesce((SELECT jsonb_agg(DISTINCT jsonb_build_object('video_id',v.video_id,'topic_code',t.topic_code)) FROM public.course_lesson_videos own JOIN public.course_lesson_videos v ON v.video_id=own.video_id AND v.lesson_id<>own.lesson_id JOIN public.course_outline_entries other_e ON other_e.content_id=v.lesson_id AND NOT other_e.archived JOIN public.course_outline_topics mt ON mt.entry_id=other_e.id JOIN public.curriculum_topics t ON t.id=mt.topic_id WHERE own.lesson_id=l.id),'[]'::jsonb));
 END IF;
 RETURN result;
END;
$$;
CREATE FUNCTION public.save_course_outline_content(_entry_id uuid,_is_published boolean,_videos jsonb,_game_path text,_expected_revision bigint,_expected_lesson_id uuid) RETURNS void
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
END;
$$;

-- Legacy reads resolve a canonical Topic to the first visible course-specific lesson.
ALTER FUNCTION public.get_course_topic(uuid,uuid) RENAME TO get_course_topic_before_outline;
CREATE FUNCTION public.get_course_topic(_course_id uuid,_topic_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE eid uuid;
BEGIN
 SELECT e.id INTO eid FROM public.course_outline_entries e JOIN public.course_outline_topics m ON m.entry_id=e.id LEFT JOIN public.course_lessons l ON l.id=e.content_id WHERE e.course_id=_course_id AND m.topic_id=_topic_id AND NOT e.archived AND (public.has_role(auth.uid(),'admin') OR l.is_published) ORDER BY coalesce(l.is_published,false) DESC,e.position,e.id LIMIT 1;
 IF eid IS NULL THEN RAISE EXCEPTION 'Lesson content is not available.'; END IF;
 RETURN public.get_course_outline_entry(_course_id,eid)||jsonb_build_object('topic_id',_topic_id);
END;
$$;
-- Keep the old student outline shape while allowing a staged frontend release.
CREATE OR REPLACE FUNCTION public.get_course_outline(_course_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
 SELECT coalesce(jsonb_agg((u-'topics')||jsonb_build_object('topics',(SELECT jsonb_agg((e-'entry_id'-'content_id'-'cb_topics')||jsonb_build_object('id',(e->'cb_topics'->0->>'id'))) FROM jsonb_array_elements(u->'topics') e))),'[]'::jsonb) FROM jsonb_array_elements(public.get_course_outline_v2(_course_id)->'units') u;
$$;
CREATE FUNCTION public.resolve_course_entry(_course_id uuid,_topic_id uuid DEFAULT NULL,_video_id uuid DEFAULT NULL) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
 SELECT e.id FROM public.course_outline_entries e JOIN public.courses c ON c.id=e.course_id LEFT JOIN public.course_lessons l ON l.id=e.content_id
 WHERE e.course_id=_course_id AND NOT e.archived AND (public.has_role(auth.uid(),'admin') OR (c.is_published AND l.is_published))
 AND (_topic_id IS NULL OR EXISTS(SELECT 1 FROM public.course_outline_topics m WHERE m.entry_id=e.id AND m.topic_id=_topic_id))
 AND (_video_id IS NULL OR EXISTS(SELECT 1 FROM public.course_lesson_videos v WHERE v.lesson_id=e.content_id AND v.video_id=_video_id))
 ORDER BY coalesce(l.is_published,false) DESC,e.position,e.id LIMIT 1;
$$;
CREATE OR REPLACE FUNCTION public.resolve_course_video(_video_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
 SELECT jsonb_build_object('course_id',e.course_id,'entry_id',e.id,'topic_id',(SELECT topic_id FROM public.course_outline_topics WHERE entry_id=e.id ORDER BY topic_id LIMIT 1)) FROM public.course_outline_entries e JOIN public.course_lesson_videos v ON v.lesson_id=e.content_id JOIN public.courses c ON c.id=e.course_id JOIN public.course_lessons l ON l.id=e.content_id JOIN public.course_curriculum_units cu ON cu.course_id=e.course_id AND cu.unit_id=e.unit_id WHERE v.video_id=_video_id AND NOT e.archived AND c.is_published AND l.is_published ORDER BY cu.order_index,e.position,e.course_id,e.id LIMIT 1;
$$;

CREATE FUNCTION public.edit_course_outline(_course_id uuid,_expected_revision bigint,_action text,_payload jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE e public.course_outline_entries%ROWTYPE; source public.course_outline_entries%ROWTYPE; cid uuid; eid uuid; tid uuid; unit uuid; ids uuid[]; topics uuid[]; n integer; content public.course_lessons%ROWTYPE;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Content administrator access is required.'; END IF;
 PERFORM 1 FROM public.courses ORDER BY id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM public.courses WHERE id=_course_id AND outline_revision=_expected_revision) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Outline changed. Reload before saving; your changes have not been saved.'; END IF;
 IF _action NOT IN ('save','merge','remove','restore','reorder','split') OR jsonb_typeof(_payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid outline operation.'; END IF;
 IF _action='reorder' THEN
 SELECT array_agg(value::uuid) INTO ids FROM jsonb_array_elements_text(_payload->'entry_ids');
 unit:=(_payload->>'unit_id')::uuid;
 IF ids IS NULL OR cardinality(ids)<>(SELECT count(DISTINCT x) FROM unnest(ids) x) OR cardinality(ids)<>(SELECT count(*) FROM public.course_outline_entries WHERE course_id=_course_id AND unit_id=unit AND NOT archived) OR EXISTS(SELECT 1 FROM unnest(ids) x WHERE NOT EXISTS(SELECT 1 FROM public.course_outline_entries WHERE id=x AND course_id=_course_id AND unit_id=unit AND NOT archived)) THEN RAISE EXCEPTION 'Reload the complete Unit before reordering.'; END IF;
 UPDATE public.course_outline_entries SET position=array_position(ids,id)*100 WHERE id=ANY(ids);
 ELSIF _action IN ('remove','restore','split') THEN
 SELECT * INTO e FROM public.course_outline_entries WHERE id=(_payload->>'entry_id')::uuid AND course_id=_course_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Course lesson is not available.'; END IF;
 UPDATE public.course_outline_entries SET archived=(_action IN ('remove','split')) WHERE id=e.id RETURNING id INTO eid;
 ELSE
 topics:=ARRAY(SELECT DISTINCT value::uuid FROM jsonb_array_elements_text(_payload->'topic_ids'));
 IF cardinality(topics)=0 OR jsonb_typeof(_payload->'topic_ids') IS DISTINCT FROM 'array' OR nullif(btrim(_payload->>'title'),'') IS NULL OR length(_payload->>'title')>200 THEN RAISE EXCEPTION 'Provide a lesson title and at least one CB Topic.'; END IF;
 SELECT unit_id INTO unit FROM public.curriculum_topics WHERE id=topics[1];
 IF EXISTS(SELECT 1 FROM unnest(topics) t WHERE NOT EXISTS(SELECT 1 FROM public.curriculum_topics ct WHERE ct.id=t AND ct.unit_id=unit AND public.course_topic_in_scope(_course_id,t))) THEN RAISE EXCEPTION 'Choose Topics from one Unit within this course.'; END IF;
 IF _action='merge' THEN
 ids:=ARRAY(SELECT DISTINCT value::uuid FROM jsonb_array_elements_text(_payload->'entry_ids'));
 IF cardinality(ids)<2 OR EXISTS(SELECT 1 FROM unnest(ids) x WHERE NOT EXISTS(SELECT 1 FROM public.course_outline_entries WHERE id=x AND course_id=_course_id AND unit_id=unit AND NOT archived)) THEN RAISE EXCEPTION 'Select at least two active lessons in the same Unit.'; END IF;
 IF topics IS DISTINCT FROM ARRAY(SELECT DISTINCT m.topic_id FROM public.course_outline_topics m WHERE m.entry_id=ANY(ids) ORDER BY m.topic_id) THEN
 -- Compare sets; UI sends topics in curriculum order.
 IF EXISTS(SELECT unnest(topics) EXCEPT SELECT topic_id FROM public.course_outline_topics WHERE entry_id=ANY(ids)) OR EXISTS(SELECT topic_id FROM public.course_outline_topics WHERE entry_id=ANY(ids) EXCEPT SELECT unnest(topics)) THEN RAISE EXCEPTION 'Merged Topics must match selected lessons.'; END IF;
 END IF;
 SELECT * INTO source FROM public.course_outline_entries WHERE id=(_payload->>'source_entry_id')::uuid AND id=ANY(ids);
 IF NOT FOUND THEN RAISE EXCEPTION 'Choose the lesson content to keep.'; END IF;
 SELECT * INTO content FROM public.course_lessons WHERE id=source.content_id;
 IF content.id IS NOT NULL THEN
 IF content.revision IS DISTINCT FROM (_payload->>'source_revision')::bigint THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Source content changed. Reload before merging.'; END IF;
 INSERT INTO public.course_lessons(topic_id,owner_course_id,is_published,game_path) VALUES(content.topic_id,content.owner_course_id,coalesce((_payload->>'keep_published')::boolean,false) AND content.is_published,content.game_path) RETURNING id INTO cid;
 DECLARE v record; copied uuid; BEGIN
 FOR v IN SELECT cv.*,m.order_index AS lesson_position FROM public.course_lesson_videos m JOIN public.course_videos cv ON cv.id=m.video_id WHERE m.lesson_id=content.id LOOP
 INSERT INTO public.course_videos(course_id,title,video_url,description,transcript,duration,order_index) VALUES(content.owner_course_id,v.title,v.video_url,v.description,v.transcript,v.duration,v.order_index) RETURNING id INTO copied;
 INSERT INTO public.course_lesson_videos VALUES(cid,copied,v.lesson_position);
 END LOOP;
 END;
 END IF;
 UPDATE public.course_outline_entries SET archived=true WHERE id=ANY(ids);
 ELSE
 SELECT * INTO e FROM public.course_outline_entries WHERE id=nullif(_payload->>'entry_id','')::uuid AND course_id=_course_id AND NOT archived;
 IF nullif(_payload->>'entry_id','') IS NOT NULL AND e.id IS NULL THEN RAISE EXCEPTION 'Course lesson is not available.'; END IF;
 IF e.id IS NOT NULL AND e.unit_id<>unit THEN RAISE EXCEPTION 'A lesson cannot move across Units.'; END IF;
 cid:=e.content_id;
 END IF;
 IF e.id IS NULL THEN
 INSERT INTO public.course_outline_entries(course_id,unit_id,title,position,content_id) VALUES(_course_id,unit,btrim(_payload->>'title'),coalesce((SELECT min(position) FROM public.course_outline_entries WHERE id=ANY(ids)),(SELECT coalesce(max(position),0)+100 FROM public.course_outline_entries WHERE course_id=_course_id AND unit_id=unit)),cid) RETURNING id INTO eid;
 ELSE
 eid:=e.id; UPDATE public.course_outline_entries SET title=btrim(_payload->>'title') WHERE id=eid;
 DELETE FROM public.course_outline_topics WHERE entry_id=eid;
 END IF;
 INSERT INTO public.course_outline_topics SELECT eid,unnest(topics);
 END IF;
 PERFORM public.initialize_course_outline(_course_id);
 UPDATE public.courses SET outline_revision=outline_revision+1,outline_customized=true WHERE id=_course_id;
 RETURN eid;
END;
$$;
-- Legacy editor operations remain usable only on uncustomized course outlines.
ALTER FUNCTION public.save_course_lesson(uuid,uuid,boolean,jsonb,text,bigint,uuid) RENAME TO save_course_lesson_before_outline;
CREATE FUNCTION public.save_course_lesson(_course_id uuid,_topic_id uuid,_is_published boolean,_videos jsonb,_game_path text,_expected_revision bigint,_expected_lesson_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Content administrator access is required.'; END IF;
 PERFORM 1 FROM public.courses ORDER BY id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.courses WHERE id=_course_id AND outline_customized) THEN RAISE EXCEPTION 'Refresh the application to edit this custom course outline.'; END IF;
 PERFORM public.save_course_lesson_before_outline(_course_id,_topic_id,_is_published,_videos,_game_path,_expected_revision,_expected_lesson_id);
END;
$$;
CREATE FUNCTION public.sync_legacy_outline() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.courses WHERE id=NEW.course_id AND outline_customized) THEN RAISE EXCEPTION 'Refresh the application to edit this custom course outline.'; END IF;
 UPDATE public.course_outline_entries e SET content_id=NEW.lesson_id WHERE e.course_id=NEW.course_id AND NOT e.archived AND EXISTS(SELECT 1 FROM public.course_outline_topics m WHERE m.entry_id=e.id AND m.topic_id=NEW.topic_id);
 RETURN NEW;
END;
$$;
CREATE TRIGGER sync_legacy_outline AFTER INSERT OR UPDATE ON public.course_lesson_courses FOR EACH ROW EXECUTE FUNCTION public.sync_legacy_outline();
-- Renamed functions lose direct client grants; only guarded entry points can invoke them.
REVOKE ALL ON FUNCTION public.save_course_lesson_before_outline(uuid,uuid,boolean,jsonb,text,bigint,uuid),public.get_course_topic_before_outline(uuid,uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.guard_published_course_video() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
BEGIN
 IF TG_OP='DELETE' AND EXISTS(SELECT 1 FROM public.course_lesson_videos WHERE video_id=OLD.id) THEN RAISE EXCEPTION 'Remove all saved lesson references before deleting this video.'; END IF;
 IF TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM public.course_lesson_videos m JOIN public.course_lessons l ON l.id=m.lesson_id WHERE m.video_id=OLD.id AND l.is_published) AND public.course_youtube_id(NEW.video_url) IS NULL THEN RAISE EXCEPTION 'Published lessons require a valid YouTube URL.'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.initialize_course_outline(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.initialize_course_outline(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_course_outline_v2(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_course_outline_v2(uuid) TO anon,authenticated;
REVOKE ALL ON FUNCTION public.get_course_outline_entry(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_course_outline_entry(uuid,uuid) TO anon,authenticated;
REVOKE ALL ON FUNCTION public.save_course_outline_content(uuid,boolean,jsonb,text,bigint,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_course_outline_content(uuid,boolean,jsonb,text,bigint,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_course_topic(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_course_topic(uuid,uuid) TO anon,authenticated;
REVOKE ALL ON FUNCTION public.get_course_outline(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_course_outline(uuid) TO anon,authenticated;
REVOKE ALL ON FUNCTION public.resolve_course_entry(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_course_entry(uuid,uuid,uuid) TO anon,authenticated;
REVOKE ALL ON FUNCTION public.edit_course_outline(uuid,bigint,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.edit_course_outline(uuid,bigint,text,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.save_course_lesson(uuid,uuid,boolean,jsonb,text,bigint,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_course_lesson(uuid,uuid,boolean,jsonb,text,bigint,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.sync_legacy_outline() FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';

CREATE FUNCTION public.link_course_outline_content(_entry_id uuid,_source_entry_id uuid,_expected_content_id uuid,_expected_revision bigint,_source_content_id uuid,_source_revision bigint,_independent boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE e public.course_outline_entries%ROWTYPE; other_e public.course_outline_entries%ROWTYPE; current_l public.course_lessons%ROWTYPE; source public.course_lessons%ROWTYPE; chosen uuid;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Content administrator access is required.'; END IF;
 PERFORM 1 FROM public.courses ORDER BY id FOR UPDATE;
 SELECT * INTO e FROM public.course_outline_entries WHERE id=_entry_id AND NOT archived;
 SELECT * INTO other_e FROM public.course_outline_entries WHERE id=_source_entry_id;
 IF e.id IS NULL OR other_e.id IS NULL THEN RAISE EXCEPTION 'Course lesson is not available.'; END IF;
 SELECT * INTO current_l FROM public.course_lessons WHERE id=e.content_id FOR UPDATE;
 SELECT * INTO source FROM public.course_lessons WHERE id=other_e.content_id FOR UPDATE;
 IF current_l.id IS DISTINCT FROM _expected_content_id OR coalesce(current_l.revision,0) IS DISTINCT FROM _expected_revision OR source.id IS DISTINCT FROM _source_content_id OR source.revision IS DISTINCT FROM _source_revision THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Content changed. Reload both lessons before linking.'; END IF;
 IF source.id IS NULL OR _independent IS NULL THEN RAISE EXCEPTION 'Choose saved content.'; END IF;
 IF e.course_id<>other_e.course_id AND (other_e.archived OR NOT EXISTS(SELECT 1 FROM public.courses a JOIN public.courses b ON b.id=other_e.course_id WHERE a.id=e.course_id AND ((a.practice_course_scope='AB' AND b.practice_course_scope='BC') OR (a.practice_course_scope='BC' AND b.practice_course_scope='AB'))) OR EXISTS(SELECT 1 FROM public.course_outline_topics m JOIN public.curriculum_topics t ON t.id=m.topic_id WHERE m.entry_id IN (e.id,other_e.id) AND t.is_bc_only)) THEN RAISE EXCEPTION 'Only matching AB and BC lessons can share content.'; END IF;
 IF EXISTS(SELECT topic_id FROM public.course_outline_topics WHERE entry_id=e.id EXCEPT SELECT topic_id FROM public.course_outline_topics WHERE entry_id=other_e.id) OR EXISTS(SELECT topic_id FROM public.course_outline_topics WHERE entry_id=other_e.id EXCEPT SELECT topic_id FROM public.course_outline_topics WHERE entry_id=e.id) THEN RAISE EXCEPTION 'Choose lessons covering the same CB Topics.'; END IF;
 chosen:=source.id;
 IF _independent THEN
 INSERT INTO public.course_lessons(topic_id,owner_course_id,game_path) VALUES(source.topic_id,source.owner_course_id,source.game_path) RETURNING id INTO chosen;
 -- Independent drafts also copy video records so edits do not mutate the source lesson.
 DECLARE v record; vid uuid; BEGIN
 FOR v IN SELECT cv.*,m.order_index AS lesson_position FROM public.course_lesson_videos m JOIN public.course_videos cv ON cv.id=m.video_id WHERE m.lesson_id=source.id LOOP
 INSERT INTO public.course_videos(course_id,title,video_url,description,transcript,duration,order_index) VALUES(source.owner_course_id,v.title,v.video_url,v.description,v.transcript,v.duration,v.order_index) RETURNING id INTO vid;
 INSERT INTO public.course_lesson_videos VALUES(chosen,vid,v.lesson_position);
 END LOOP;
 END;
 END IF;
 UPDATE public.course_outline_entries SET content_id=chosen WHERE id=e.id;
 UPDATE public.course_lessons SET revision=revision+1,updated_at=clock_timestamp() WHERE id=chosen;
 UPDATE public.courses SET outline_customized=true,outline_revision=outline_revision+1 WHERE id=e.course_id;
END;
$$;
REVOKE ALL ON FUNCTION public.link_course_outline_content(uuid,uuid,uuid,bigint,uuid,bigint,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.link_course_outline_content(uuid,uuid,uuid,bigint,uuid,bigint,boolean) TO authenticated;
NOTIFY pgrst,'reload schema';

CREATE FUNCTION public.list_course_outline_archive(_course_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Content administrator access is required.'; END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('entry_id',e.id,'title',e.title,'unit_id',e.unit_id,'content_id',e.content_id,'topic_ids',(SELECT jsonb_agg(topic_id) FROM public.course_outline_topics WHERE entry_id=e.id)) ORDER BY e.position,e.id) FROM public.course_outline_entries e WHERE e.course_id=_course_id AND e.archived),'[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.list_course_outline_archive(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_course_outline_archive(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
