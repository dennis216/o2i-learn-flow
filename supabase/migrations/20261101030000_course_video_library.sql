ALTER TABLE public.course_videos ADD COLUMN metadata_revision bigint NOT NULL DEFAULT 1;
CREATE FUNCTION public.advance_course_video_revision() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,extensions AS $$
BEGIN NEW.metadata_revision:=OLD.metadata_revision+1; RETURN NEW; END;
$$;
CREATE TRIGGER advance_course_video_revision BEFORE UPDATE ON public.course_videos FOR EACH ROW EXECUTE FUNCTION public.advance_course_video_revision();
CREATE OR REPLACE FUNCTION public.touch_video_lessons() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
BEGIN
 IF NEW IS DISTINCT FROM OLD THEN UPDATE public.course_lessons SET revision=revision+1,updated_at=clock_timestamp() WHERE id IN (SELECT lesson_id FROM public.course_lesson_videos WHERE video_id=NEW.id); END IF;
 RETURN NEW;
END;
$$;
CREATE FUNCTION public.list_course_video_library(_course_id uuid DEFAULT NULL,_filter text DEFAULT 'course') RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Content administrator access is required.'; END IF;
 IF _filter IS NULL OR _filter NOT IN ('course','all','unlinked') THEN RAISE EXCEPTION 'Choose a video library filter.'; END IF;
 RETURN coalesce((SELECT jsonb_agg(row ORDER BY row->>'title') FROM (
 SELECT to_jsonb(v)||jsonb_build_object('courses',jsonb_build_object('title',c.title),'reference_count',(SELECT count(*) FROM public.course_lesson_videos WHERE video_id=v.id),'usage',coalesce((SELECT jsonb_agg(jsonb_build_object('course_id',e.course_id,'course_title',used_c.title,'entry_id',e.id,'lesson_title',e.title,'archived',e.archived)) FROM public.course_lesson_videos m JOIN public.course_outline_entries e ON e.content_id=m.lesson_id JOIN public.courses used_c ON used_c.id=e.course_id WHERE m.video_id=v.id),'[]'::jsonb)) AS row
 FROM public.course_videos v LEFT JOIN public.courses c ON c.id=v.course_id
 WHERE _filter='all' OR (_filter='unlinked' AND NOT EXISTS(SELECT 1 FROM public.course_lesson_videos WHERE video_id=v.id)) OR (_filter='course' AND (_course_id IS NULL OR v.course_id=_course_id OR EXISTS(SELECT 1 FROM public.course_lesson_videos m JOIN public.course_outline_entries e ON e.content_id=m.lesson_id WHERE m.video_id=v.id AND e.course_id=_course_id AND NOT e.archived)))
 ) rows),'[]'::jsonb);
END;
$$;
CREATE FUNCTION public.save_course_video_metadata(_video_id uuid,_expected_revision bigint,_details jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE v public.course_videos%ROWTYPE; item jsonb; parsed_transcript jsonb:=nullif(_details->'transcript','null'::jsonb);
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Content administrator access is required.'; END IF;
 -- Match lesson editor lock order; metadata edits also advance lesson revisions.
 PERFORM 1 FROM public.courses ORDER BY id FOR UPDATE;
 SELECT * INTO v FROM public.course_videos WHERE id=_video_id FOR UPDATE;
 IF v.id IS NULL OR v.metadata_revision IS DISTINCT FROM _expected_revision THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Video changed. Reload before saving; your changes have not been saved.'; END IF;
 IF jsonb_typeof(_details) IS DISTINCT FROM 'object' OR nullif(btrim(_details->>'title'),'') IS NULL OR length(_details->>'title')>200 OR public.course_youtube_id(_details->>'video_url') IS NULL OR coalesce((_details->>'order_index')::integer,-1)<0 THEN RAISE EXCEPTION 'Provide a title, valid HTTPS YouTube URL and nonnegative order.'; END IF;
 IF parsed_transcript IS NOT NULL THEN
 IF jsonb_typeof(parsed_transcript) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Transcript must be an array.'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(parsed_transcript) LOOP
 IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR jsonb_typeof(item->'s') IS DISTINCT FROM 'number' OR (item->>'s')::numeric<0 OR jsonb_typeof(item->'t') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Each transcript entry needs nonnegative numeric s and string t.'; END IF;
 END LOOP;
 END IF;
 UPDATE public.course_videos SET title=btrim(_details->>'title'),subtitle=nullif(_details->>'subtitle',''),video_url='https://www.youtube.com/watch?v='||public.course_youtube_id(_details->>'video_url'),transcript=parsed_transcript,exam_tips=nullif(_details->>'exam_tips',''),notes_url=nullif(_details->>'notes_url',''),order_index=(_details->>'order_index')::integer WHERE id=v.id;
END;
$$;
REVOKE ALL ON FUNCTION public.advance_course_video_revision(),public.list_course_video_library(uuid,text),public.save_course_video_metadata(uuid,bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_course_video_library(uuid,text),public.save_course_video_metadata(uuid,bigint,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
