-- Games are private objects: publication, not possession of a URL, controls download.
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
