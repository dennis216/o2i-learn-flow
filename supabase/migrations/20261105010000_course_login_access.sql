-- Forward-only: published Units 1-3 remain public; later units require a session.
-- Shared assets remain public when any published Unit 1-3 uses them.
CREATE OR REPLACE FUNCTION public.course_topic_visible(_course_id uuid,_topic_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
 SELECT EXISTS(SELECT 1 FROM public.course_outline_entries e JOIN public.course_outline_topics m ON m.entry_id=e.id
 JOIN public.course_lessons l ON l.id=e.content_id JOIN public.courses c ON c.id=e.course_id JOIN public.curriculum_units u ON u.id=e.unit_id
 WHERE e.course_id=_course_id AND m.topic_id=_topic_id AND (auth.uid() IS NOT NULL OR u.unit_number <= 3) AND NOT e.archived AND c.is_published AND l.is_published AND public.course_topic_in_scope(c.id,m.topic_id));
$$;
CREATE OR REPLACE FUNCTION public.course_lesson_visible(_lesson_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
 SELECT EXISTS(SELECT 1 FROM public.course_outline_entries e JOIN public.courses c ON c.id=e.course_id JOIN public.curriculum_units u ON u.id=e.unit_id JOIN public.course_lessons l ON l.id=e.content_id WHERE e.content_id=_lesson_id AND (auth.uid() IS NOT NULL OR u.unit_number <= 3) AND NOT e.archived AND c.is_published AND l.is_published);
$$;

CREATE OR REPLACE FUNCTION public.get_course_outline_entry(_course_id uuid,_entry_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE e public.course_outline_entries%ROWTYPE; l public.course_lessons%ROWTYPE; result jsonb; anchor uuid;
BEGIN
 SELECT * INTO e FROM public.course_outline_entries WHERE course_id=_course_id AND id=_entry_id AND NOT archived;
 IF NOT FOUND THEN RAISE EXCEPTION 'Course lesson is not available.'; END IF;
 IF auth.uid() IS NULL AND NOT EXISTS(SELECT 1 FROM public.curriculum_units WHERE id=e.unit_id AND unit_number <= 3) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Log in to access more'; END IF;
 SELECT * INTO l FROM public.course_lessons WHERE id=e.content_id;
 IF NOT public.has_admin_module('courses') AND NOT(coalesce(l.is_published,false) AND EXISTS(SELECT 1 FROM public.courses WHERE id=_course_id AND is_published)) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Lesson content is not available.'; END IF;
 SELECT topic_id INTO anchor FROM public.course_outline_topics WHERE entry_id=e.id ORDER BY topic_id LIMIT 1;
 result:=jsonb_build_object('course_id',_course_id,'entry_id',e.id,'topic_id',coalesce(l.topic_id,anchor),'is_published',coalesce(l.is_published,false),'game_path',l.game_path,'videos',coalesce((SELECT jsonb_agg(jsonb_build_object('id',v.id,'course_id',_course_id,'title',v.title,'description',v.description,'video_url',v.video_url,'duration',v.duration,'transcript',v.transcript,'order_index',m.order_index) ORDER BY m.order_index) FROM public.course_lesson_videos m JOIN public.course_videos v ON v.id=m.video_id WHERE m.lesson_id=l.id),'[]'::jsonb));
 IF public.has_admin_module('courses') THEN
 result:=result||jsonb_build_object('lesson_id',l.id,'revision',coalesce(l.revision,0),'owner_course_id',coalesce(l.owner_course_id,_course_id),'linked_courses',coalesce((SELECT jsonb_agg(jsonb_build_object('id',x.id,'title',x.title)) FROM public.courses x WHERE EXISTS(SELECT 1 FROM public.course_outline_entries b WHERE b.content_id=l.id AND NOT b.archived AND b.course_id=x.id)),'[]'::jsonb),'shared_video_topics',coalesce((SELECT jsonb_agg(DISTINCT jsonb_build_object('video_id',v.video_id,'topic_code',t.topic_code)) FROM public.course_lesson_videos own JOIN public.course_lesson_videos v ON v.video_id=own.video_id AND v.lesson_id<>own.lesson_id JOIN public.course_outline_entries other_e ON other_e.content_id=v.lesson_id AND NOT other_e.archived JOIN public.course_outline_topics mt ON mt.entry_id=other_e.id JOIN public.curriculum_topics t ON t.id=mt.topic_id WHERE own.lesson_id=l.id),'[]'::jsonb));
 END IF;
 RETURN result;
END;
$$;
