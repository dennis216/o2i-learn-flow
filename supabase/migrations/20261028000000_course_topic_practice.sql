-- Requires the deployed adaptation-v2 engine; the existing two-argument RPC stays compatible.
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
