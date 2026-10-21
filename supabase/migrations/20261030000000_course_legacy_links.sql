CREATE FUNCTION public.resolve_course_video(_video_id uuid) RETURNS jsonb
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
