-- One forward data repair; no historical migration replay or content publication.
BEGIN;
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
DO $release$ DECLARE before_content text; BEGIN
IF NOT (coalesce((SELECT md5(prosrc)='fbca4bbb02099956d2138eefe7cd4792' FROM pg_proc WHERE oid=to_regprocedure('public.link_course_outline_content(uuid,uuid,uuid,bigint,uuid,bigint,boolean)')),false) AND EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261101030000' AND cardinality(statements)=1 AND md5(statements[1])='f169bd75041c4b3accf0d0c437b83d4b') AND EXISTS(SELECT 1 FROM public.courses WHERE id='93124428-92f4-48d2-a6dc-e5f9e010248b' AND practice_course_scope IN ('AB','BC')) AND EXISTS(SELECT 1 FROM public.courses WHERE id='fccc7540-0c29-43be-8682-ae90ff2534cb' AND practice_course_scope='BC')) OR NOT (NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261102000000')) THEN RAISE EXCEPTION 'Course availability prerequisite mismatch or already applied.'; END IF;
SELECT md5(jsonb_build_object('lessons',(SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM public.course_lessons l),'videos',(SELECT jsonb_agg(to_jsonb(v) ORDER BY id) FROM public.course_videos v),'bindings',(SELECT jsonb_agg(to_jsonb(b) ORDER BY course_id,topic_id) FROM public.course_lesson_courses b))::text) INTO before_content;
EXECUTE $migration$-- Repair the canonical AB course without deleting content or canonical Topics.
DO $$
DECLARE ab uuid := '93124428-92f4-48d2-a6dc-e5f9e010248b'; scope public.question_course_scope; archived_count integer;
BEGIN
 SELECT practice_course_scope INTO scope FROM public.courses WHERE id=ab FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 IF scope IS NULL OR scope NOT IN ('AB','BC') THEN RAISE EXCEPTION 'Unexpected AB course scope; inspect before repair.'; END IF;
 IF EXISTS (
  SELECT 1 FROM public.course_outline_entries e WHERE e.course_id=ab AND NOT e.archived
  AND EXISTS(SELECT 1 FROM public.course_outline_topics m JOIN public.curriculum_topics t ON t.id=m.topic_id WHERE m.entry_id=e.id AND t.is_bc_only)
  AND (e.content_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.course_outline_topics m JOIN public.curriculum_topics t ON t.id=m.topic_id WHERE m.entry_id=e.id AND NOT t.is_bc_only))
 ) THEN RAISE EXCEPTION 'AB has prepared or mixed BC-only lessons; inspect before repair.'; END IF;
 UPDATE public.course_outline_entries e SET archived=true WHERE e.course_id=ab AND NOT e.archived AND e.content_id IS NULL
 AND EXISTS(SELECT 1 FROM public.course_outline_topics m JOIN public.curriculum_topics t ON t.id=m.topic_id WHERE m.entry_id=e.id AND t.is_bc_only);
 GET DIAGNOSTICS archived_count = ROW_COUNT;
 UPDATE public.courses SET practice_course_scope='AB',outline_revision=outline_revision+1 WHERE id=ab AND (scope<>'AB' OR archived_count>0);
END;
$$;

CREATE OR REPLACE FUNCTION public.link_course_outline_content(_entry_id uuid,_source_entry_id uuid,_expected_content_id uuid,_expected_revision bigint,_source_content_id uuid,_source_revision bigint,_independent boolean) RETURNS void
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
 INSERT INTO public.course_videos(course_id,title,video_url,description,transcript,duration,order_index,subtitle,exam_tips,notes_url) VALUES(source.owner_course_id,v.title,v.video_url,v.description,v.transcript,v.duration,v.order_index,v.subtitle,v.exam_tips,v.notes_url) RETURNING id INTO vid;
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

-- Scope checks must also run when a shared lesson's Topic mapping is edited or restored.
CREATE OR REPLACE FUNCTION public.guard_course_outline_bc_only() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE e public.course_outline_entries%ROWTYPE;
BEGIN
 IF TG_TABLE_NAME='course_outline_topics' THEN
  IF NOT EXISTS(SELECT 1 FROM public.curriculum_topics WHERE id=NEW.topic_id AND is_bc_only) THEN RETURN NEW; END IF;
  SELECT * INTO e FROM public.course_outline_entries WHERE id=NEW.entry_id AND NOT archived;
 ELSE
  IF NEW.archived THEN RETURN NEW; END IF;
  e:=NEW;
  IF NOT EXISTS(SELECT 1 FROM public.course_outline_topics m JOIN public.curriculum_topics t ON t.id=m.topic_id WHERE m.entry_id=e.id AND t.is_bc_only) THEN RETURN NEW; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM public.courses WHERE id=e.course_id AND practice_course_scope='AB') OR EXISTS(
  SELECT 1 FROM public.course_outline_entries other_e JOIN public.courses c ON c.id=other_e.course_id
  WHERE other_e.content_id=e.content_id AND NOT other_e.archived AND c.practice_course_scope='AB'
 ) THEN RAISE EXCEPTION 'BC-only Topics cannot be used in AB. Create a BC-only draft before adding these Topics.'; END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_course_outline_bc_only() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE TRIGGER course_outline_topic_bc_only BEFORE INSERT OR UPDATE ON public.course_outline_topics FOR EACH ROW EXECUTE FUNCTION public.guard_course_outline_bc_only();
CREATE OR REPLACE TRIGGER course_outline_entry_bc_only BEFORE INSERT OR UPDATE ON public.course_outline_entries FOR EACH ROW EXECUTE FUNCTION public.guard_course_outline_bc_only();
NOTIFY pgrst,'reload schema';
$migration$;
IF before_content IS DISTINCT FROM (SELECT md5(jsonb_build_object('lessons',(SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM public.course_lessons l),'videos',(SELECT jsonb_agg(to_jsonb(v) ORDER BY id) FROM public.course_videos v),'bindings',(SELECT jsonb_agg(to_jsonb(b) ORDER BY course_id,topic_id) FROM public.course_lesson_courses b))::text)) OR NOT (EXISTS(SELECT 1 FROM public.courses WHERE id='93124428-92f4-48d2-a6dc-e5f9e010248b' AND practice_course_scope='AB') AND EXISTS(SELECT 1 FROM public.courses WHERE id='fccc7540-0c29-43be-8682-ae90ff2534cb' AND practice_course_scope='BC') AND NOT EXISTS(SELECT 1 FROM public.course_outline_entries e JOIN public.course_outline_topics m ON m.entry_id=e.id JOIN public.curriculum_topics t ON t.id=m.topic_id WHERE e.course_id='93124428-92f4-48d2-a6dc-e5f9e010248b' AND NOT e.archived AND t.is_bc_only) AND coalesce((SELECT md5(prosrc)='048a786eb72bf45bc306d9c9a6f1b81f' FROM pg_proc WHERE oid=to_regprocedure('public.link_course_outline_content(uuid,uuid,uuid,bigint,uuid,bigint,boolean)')),false) AND coalesce((SELECT md5(prosrc)='18634ff98184893eb0edac0b3f5ac0cd' FROM pg_proc WHERE oid=to_regprocedure('public.guard_course_outline_bc_only()')),false) AND (SELECT count(*)=2 FROM pg_trigger WHERE tgname IN ('course_outline_topic_bc_only','course_outline_entry_bc_only') AND NOT tgisinternal AND tgenabled='O')) THEN RAISE EXCEPTION 'Course repair verification failed; rolled back.'; END IF;
INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261102000000','course_lesson_availability',ARRAY[$migration$-- Repair the canonical AB course without deleting content or canonical Topics.
DO $$
DECLARE ab uuid := '93124428-92f4-48d2-a6dc-e5f9e010248b'; scope public.question_course_scope; archived_count integer;
BEGIN
 SELECT practice_course_scope INTO scope FROM public.courses WHERE id=ab FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 IF scope IS NULL OR scope NOT IN ('AB','BC') THEN RAISE EXCEPTION 'Unexpected AB course scope; inspect before repair.'; END IF;
 IF EXISTS (
  SELECT 1 FROM public.course_outline_entries e WHERE e.course_id=ab AND NOT e.archived
  AND EXISTS(SELECT 1 FROM public.course_outline_topics m JOIN public.curriculum_topics t ON t.id=m.topic_id WHERE m.entry_id=e.id AND t.is_bc_only)
  AND (e.content_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.course_outline_topics m JOIN public.curriculum_topics t ON t.id=m.topic_id WHERE m.entry_id=e.id AND NOT t.is_bc_only))
 ) THEN RAISE EXCEPTION 'AB has prepared or mixed BC-only lessons; inspect before repair.'; END IF;
 UPDATE public.course_outline_entries e SET archived=true WHERE e.course_id=ab AND NOT e.archived AND e.content_id IS NULL
 AND EXISTS(SELECT 1 FROM public.course_outline_topics m JOIN public.curriculum_topics t ON t.id=m.topic_id WHERE m.entry_id=e.id AND t.is_bc_only);
 GET DIAGNOSTICS archived_count = ROW_COUNT;
 UPDATE public.courses SET practice_course_scope='AB',outline_revision=outline_revision+1 WHERE id=ab AND (scope<>'AB' OR archived_count>0);
END;
$$;

CREATE OR REPLACE FUNCTION public.link_course_outline_content(_entry_id uuid,_source_entry_id uuid,_expected_content_id uuid,_expected_revision bigint,_source_content_id uuid,_source_revision bigint,_independent boolean) RETURNS void
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
 INSERT INTO public.course_videos(course_id,title,video_url,description,transcript,duration,order_index,subtitle,exam_tips,notes_url) VALUES(source.owner_course_id,v.title,v.video_url,v.description,v.transcript,v.duration,v.order_index,v.subtitle,v.exam_tips,v.notes_url) RETURNING id INTO vid;
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

-- Scope checks must also run when a shared lesson's Topic mapping is edited or restored.
CREATE OR REPLACE FUNCTION public.guard_course_outline_bc_only() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE e public.course_outline_entries%ROWTYPE;
BEGIN
 IF TG_TABLE_NAME='course_outline_topics' THEN
  IF NOT EXISTS(SELECT 1 FROM public.curriculum_topics WHERE id=NEW.topic_id AND is_bc_only) THEN RETURN NEW; END IF;
  SELECT * INTO e FROM public.course_outline_entries WHERE id=NEW.entry_id AND NOT archived;
 ELSE
  IF NEW.archived THEN RETURN NEW; END IF;
  e:=NEW;
  IF NOT EXISTS(SELECT 1 FROM public.course_outline_topics m JOIN public.curriculum_topics t ON t.id=m.topic_id WHERE m.entry_id=e.id AND t.is_bc_only) THEN RETURN NEW; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM public.courses WHERE id=e.course_id AND practice_course_scope='AB') OR EXISTS(
  SELECT 1 FROM public.course_outline_entries other_e JOIN public.courses c ON c.id=other_e.course_id
  WHERE other_e.content_id=e.content_id AND NOT other_e.archived AND c.practice_course_scope='AB'
 ) THEN RAISE EXCEPTION 'BC-only Topics cannot be used in AB. Create a BC-only draft before adding these Topics.'; END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_course_outline_bc_only() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE TRIGGER course_outline_topic_bc_only BEFORE INSERT OR UPDATE ON public.course_outline_topics FOR EACH ROW EXECUTE FUNCTION public.guard_course_outline_bc_only();
CREATE OR REPLACE TRIGGER course_outline_entry_bc_only BEFORE INSERT OR UPDATE ON public.course_outline_entries FOR EACH ROW EXECUTE FUNCTION public.guard_course_outline_bc_only();
NOTIFY pgrst,'reload schema';
$migration$]);
END $release$;
COMMIT;
