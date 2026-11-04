-- Continuous practice: the server issues one question at a time until the student ends the session.
-- Five-question sets keep their existing selector. Evidence of "can do" uses first attempts only.
ALTER TABLE public.question_practice_sessions
  ADD COLUMN mode text NOT NULL DEFAULT 'set' CHECK(mode IN ('set','continuous')),
  ADD COLUMN ended_at timestamptz,
  ADD CONSTRAINT practice_end_requires_continuous CHECK(ended_at IS NULL OR mode='continuous');
ALTER TABLE public.question_practice_items DROP CONSTRAINT question_practice_items_position_check;
ALTER TABLE public.question_practice_items
  ADD CONSTRAINT question_practice_items_position_check CHECK(position BETWEEN 1 AND 100),
  ADD COLUMN issued_at timestamptz,
  ADD COLUMN selection_reason jsonb;
CREATE INDEX question_practice_attempts_user_question ON public.question_practice_attempts(user_id,question_id,submitted_at,id);
COMMENT ON COLUMN public.question_practice_items.selection_reason IS 'Server rule and reason frozen at issuance (continuous-v1); not a mastery estimate.';
COMMENT ON COLUMN public.question_practice_items.issued_at IS 'Server issue time; an upper bound for device-reported duration. NULL for legacy items.';

-- An ended session keeps its unanswered questions as "not answered"; they never become attempts.
CREATE FUNCTION public.question_practice_reject_ended() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,extensions AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.question_practice_sessions WHERE id=NEW.session_id AND ended_at IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='This practice session has ended.';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER question_practice_reject_ended BEFORE INSERT ON public.question_practice_attempts
  FOR EACH ROW EXECUTE FUNCTION public.question_practice_reject_ended();

-- Topic status from the six most recent first attempts. A wrong repeat of a question first answered
-- correctly returns the Topic to needs_practice until four newer first attempts exist.
-- shortcut: thresholds (6 recent, 4 minimum, 75%) are initial rules; calibrate with real attempts.
CREATE FUNCTION public.question_practice_topic_status(_uid uuid) RETURNS TABLE(topic_id uuid,sample_count integer,correct_count integer,status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
  WITH attempts AS (
    SELECT a.id,a.question_id,a.is_correct,a.submitted_at,v.primary_topic_id AS topic_id,
      row_number() OVER(PARTITION BY a.question_id ORDER BY a.submitted_at,a.id) AS n,
      first_value(a.is_correct) OVER(PARTITION BY a.question_id ORDER BY a.submitted_at,a.id) AS first_correct
    FROM public.question_practice_attempts a JOIN public.question_versions v ON v.id=a.version_id
    WHERE a.user_id=_uid
  ), firsts AS (
    SELECT *,row_number() OVER(PARTITION BY topic_id ORDER BY submitted_at DESC,id DESC) AS recent FROM attempts WHERE n=1
  ), lapses AS (
    SELECT l.topic_id FROM (SELECT topic_id,max(submitted_at) AS at FROM attempts WHERE n>1 AND first_correct AND NOT is_correct GROUP BY topic_id) l
    WHERE (SELECT count(*) FROM firsts f WHERE f.topic_id=l.topic_id AND f.submitted_at>l.at)<4
  )
  SELECT f.topic_id,count(*)::integer,count(*) FILTER(WHERE f.is_correct)::integer,
    CASE WHEN f.topic_id IN (SELECT topic_id FROM lapses) THEN 'needs_practice'
      WHEN count(*)<4 THEN 'insufficient'
      WHEN count(*) FILTER(WHERE f.is_correct)*4>=count(*)*3 THEN 'stable' ELSE 'needs_practice' END
  FROM firsts f WHERE f.recent<=6 GROUP BY f.topic_id;
$$;

-- Current approved questions in the session scope that this session has not issued.
CREATE FUNCTION public.question_practice_continuous_pool(_session_id uuid) RETURNS TABLE(
  question_id uuid,version_id uuid,topic_id uuid,topic_code text,level integer,is_new boolean,review_ready boolean,last_answered timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
  SELECT q.id,v.id,v.primary_topic_id,t.topic_code,array_position(ARRAY['easy','medium','hard'],v.difficulty::text),
    h.first_at IS NULL,coalesce(h.first_correct AND h.last_correct AND h.last_at<=clock_timestamp()-interval '3 days',false),h.last_at
  FROM public.question_practice_sessions s
  JOIN public.questions q ON q.status='approved'
  JOIN public.question_versions v ON v.id=q.current_version_id AND v.question_id=q.id
  JOIN public.curriculum_topics t ON t.id=v.primary_topic_id
  LEFT JOIN LATERAL(
    SELECT min(a.submitted_at) AS first_at,max(a.submitted_at) AS last_at,
      (array_agg(a.is_correct ORDER BY a.submitted_at,a.id))[1] AS first_correct,
      (array_agg(a.is_correct ORDER BY a.submitted_at DESC,a.id DESC))[1] AS last_correct
    FROM public.question_practice_attempts a WHERE a.user_id=s.user_id AND a.question_id=q.id
  ) h ON true
  WHERE s.id=_session_id AND v.status='approved' AND v.question_type='mcq_single'
    AND (s.topic_id IS NULL OR v.primary_topic_id=s.topic_id)
    AND (s.course_id IS NULL OR s.course_scope='BC' OR v.course_scope IN ('AB','BOTH'))
    AND NOT EXISTS(SELECT 1 FROM public.question_practice_items i WHERE i.session_id=s.id AND i.question_id=q.id);
$$;

-- Issues the next question, or returns why none was issued. Caller holds the account lock.
CREATE FUNCTION public.question_practice_issue_next(_session_id uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE s public.question_practice_sessions%ROWTYPE; issued integer; candidate record; item record;
  topic uuid; topic_status text; last_topic uuid; last_correct boolean; last_version uuid; run_length integer:=0;
  target_level integer; streak integer:=0; stepped boolean:=false; seen_in_topic boolean:=false; kind text;
BEGIN
  SELECT * INTO s FROM public.question_practice_sessions WHERE id=_session_id FOR UPDATE;
  IF s.ended_at IS NOT NULL THEN RETURN 'ended'; END IF;
  -- Idempotent: a refresh or repeated request returns the question already waiting.
  IF EXISTS(SELECT 1 FROM public.question_practice_items i WHERE i.session_id=s.id
    AND NOT EXISTS(SELECT 1 FROM public.question_practice_attempts a WHERE a.session_id=i.session_id AND a.question_id=i.question_id)) THEN
    RETURN 'issued';
  END IF;
  SELECT count(*) INTO issued FROM public.question_practice_items WHERE session_id=s.id;
  IF issued>=100 THEN RETURN 'limit'; END IF;

  -- Every fifth question checks retention: first and latest answers correct, last answered at least three days ago.
  IF (issued+1)%5=0 THEN
    SELECT p.* INTO candidate FROM public.question_practice_continuous_pool(s.id) p
      LEFT JOIN public.question_practice_topic_status(s.user_id) st ON st.topic_id=p.topic_id
      WHERE p.review_ready ORDER BY (st.status='stable') DESC NULLS LAST,p.last_answered,random() LIMIT 1;
    IF FOUND THEN kind:='review'; topic:=candidate.topic_id; target_level:=candidate.level; END IF;
  END IF;

  IF kind IS NULL THEN
    -- Most recent regular (non-review) answer and the length of its same-Topic run.
    FOR item IN SELECT v.primary_topic_id AS topic_id,a.is_correct,i.version_id
      FROM public.question_practice_items i JOIN public.question_practice_attempts a ON a.session_id=i.session_id AND a.question_id=i.question_id
      JOIN public.question_versions v ON v.id=i.version_id
      WHERE i.session_id=s.id AND i.selection_reason->>'kind' IS DISTINCT FROM 'review' ORDER BY i.position DESC
    LOOP
      IF last_topic IS NULL THEN last_topic:=item.topic_id; last_correct:=item.is_correct; END IF;
      EXIT WHEN item.topic_id<>last_topic;
      run_length:=run_length+1;
    END LOOP;
    IF s.topic_id IS NOT NULL THEN
      topic:=s.topic_id;
      IF NOT EXISTS(SELECT 1 FROM public.question_practice_continuous_pool(s.id) p WHERE p.is_new) THEN RETURN 'topic_exhausted'; END IF;
    ELSE
      -- Stay after a wrong answer or for up to five questions; otherwise needs_practice, then insufficient, then stable.
      SELECT p.topic_id INTO topic FROM public.question_practice_continuous_pool(s.id) p
        LEFT JOIN public.question_practice_topic_status(s.user_id) st ON st.topic_id=p.topic_id
        WHERE p.is_new GROUP BY p.topic_id,p.topic_code,st.status
        ORDER BY coalesce(p.topic_id=last_topic AND (NOT last_correct OR run_length<5),false) DESC,
          coalesce(p.topic_id=last_topic,false),
          CASE coalesce(st.status,'insufficient') WHEN 'needs_practice' THEN 1 WHEN 'insufficient' THEN 2 ELSE 3 END,
          p.topic_code LIMIT 1;
      IF topic IS NULL THEN RETURN 'all_exhausted'; END IF;
    END IF;

    SELECT coalesce((SELECT st.status FROM public.question_practice_topic_status(s.user_id) st WHERE st.topic_id=topic),'insufficient') INTO topic_status;
    -- Start at medium (easy when the Topic needs practice); wrong steps down, three correct in a row step up.
    target_level:=CASE WHEN topic_status='needs_practice' THEN 1 ELSE 2 END;
    FOR item IN SELECT a.is_correct,i.version_id
      FROM public.question_practice_items i JOIN public.question_practice_attempts a ON a.session_id=i.session_id AND a.question_id=i.question_id
      JOIN public.question_versions v ON v.id=i.version_id
      WHERE i.session_id=s.id AND v.primary_topic_id=topic AND i.selection_reason->>'kind' IS DISTINCT FROM 'review' ORDER BY i.position
    LOOP
      seen_in_topic:=true; stepped:=false; last_version:=item.version_id; last_correct:=item.is_correct;
      IF item.is_correct THEN
        streak:=streak+1;
        IF streak=3 THEN target_level:=least(3,target_level+1); streak:=0; stepped:=true; END IF;
      ELSE target_level:=greatest(1,target_level-1); streak:=0;
      END IF;
    END LOOP;
    kind:=CASE WHEN NOT seen_in_topic THEN CASE WHEN issued=0 THEN 'start' ELSE 'new_topic' END
      WHEN NOT last_correct THEN 'easier_after_error' WHEN stepped THEN 'step_up' ELSE 'continue' END;

    -- Closest difficulty to the target, then a shared Skill after an error, then easier, then random.
    SELECT p.* INTO candidate FROM public.question_practice_continuous_pool(s.id) p
      WHERE p.is_new AND p.topic_id=topic
      ORDER BY abs(p.level-target_level),
        (kind='easier_after_error' AND EXISTS(SELECT 1 FROM public.question_practice_skills a JOIN public.question_practice_skills b ON b.practice_skill_id=a.practice_skill_id
          WHERE a.question_version_id=p.version_id AND b.question_version_id=last_version)) DESC,
        p.level,random() LIMIT 1;
    IF NOT FOUND THEN RETURN CASE WHEN s.topic_id IS NULL THEN 'all_exhausted' ELSE 'topic_exhausted' END; END IF;
  END IF;

  -- Coordinate immutable issuance with concurrent publication/withdrawal as the set selector does.
  PERFORM 1 FROM public.questions q WHERE q.id=candidate.question_id AND q.status='approved' AND q.current_version_id=candidate.version_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Published questions changed; retry this practice.'; END IF;
  INSERT INTO public.question_practice_items(session_id,question_id,version_id,position,issued_at,selection_reason)
    VALUES(s.id,candidate.question_id,candidate.version_id,issued+1,clock_timestamp(),jsonb_build_object(
      'rule_version','continuous-v1','kind',kind,'topic_code',candidate.topic_code,
      'target_difficulty',(ARRAY['easy','medium','hard'])[target_level],
      'topic_status',coalesce(topic_status,(SELECT st.status FROM public.question_practice_topic_status(s.user_id) st WHERE st.topic_id=candidate.topic_id),'insufficient')));
  RETURN 'issued';
END;
$$;

-- Reasons, the four-wrong prompt and the recap. Called only after the owner check in the snapshot.
CREATE FUNCTION public.question_practice_continuous_state(_session_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE s public.question_practice_sessions%ROWTYPE; item record; run_topic uuid; run_length integer:=0;
BEGIN
  SELECT * INTO s FROM public.question_practice_sessions WHERE id=_session_id;
  -- Trailing wrong regular answers in one Topic; prompt at 4, 8, ... so continuing resets the count.
  FOR item IN SELECT v.primary_topic_id AS topic_id,a.is_correct
    FROM public.question_practice_items i JOIN public.question_practice_attempts a ON a.session_id=i.session_id AND a.question_id=i.question_id
    JOIN public.question_versions v ON v.id=i.version_id
    WHERE i.session_id=s.id AND i.selection_reason->>'kind' IS DISTINCT FROM 'review' ORDER BY i.position DESC
  LOOP
    EXIT WHEN item.is_correct OR (run_topic IS NOT NULL AND item.topic_id<>run_topic);
    run_topic:=item.topic_id; run_length:=run_length+1;
  END LOOP;
  RETURN jsonb_build_object('rule_version','continuous-v1','stuck',run_length>0 AND run_length%4=0,
    'items',coalesce((SELECT jsonb_agg(jsonb_build_object('question_id',i.question_id,'reason',i.selection_reason) ORDER BY i.position)
      FROM public.question_practice_items i WHERE i.session_id=s.id),'[]'::jsonb),
    'recap',(WITH answered AS (
        SELECT a.*,v.primary_topic_id AS topic_id,NOT EXISTS(SELECT 1 FROM public.question_practice_attempts e WHERE e.user_id=a.user_id AND e.question_id=a.question_id
          AND (e.submitted_at,e.id)<(a.submitted_at,a.id)) AS is_first
        FROM public.question_practice_attempts a JOIN public.question_versions v ON v.id=a.version_id WHERE a.session_id=s.id
      ), touched AS (
        SELECT t.id AS topic_id,t.topic_code,t.title AS topic_title,coalesce(st.status,'insufficient') AS status,
          coalesce(st.sample_count,0) AS sample_count,coalesce(st.correct_count,0) AS correct_count
        FROM public.curriculum_topics t LEFT JOIN public.question_practice_topic_status(s.user_id) st ON st.topic_id=t.id
        WHERE t.id IN (SELECT topic_id FROM answered)
      )
      SELECT jsonb_build_object('answered_count',(SELECT count(*) FROM answered),
        'new_count',(SELECT count(*) FROM answered WHERE is_first),
        'new_correct_count',(SELECT count(*) FROM answered WHERE is_first AND is_correct),
        'timed_seconds',(SELECT sum(elapsed_seconds) FROM answered WHERE timing_complete),
        'topics',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.topic_code) FROM touched t),'[]'::jsonb),
        'suggestion',(SELECT jsonb_build_object('topic_id',t.topic_id,'topic_code',t.topic_code,'topic_title',t.topic_title) FROM touched t
          WHERE t.status<>'stable' ORDER BY t.status='insufficient',t.topic_code LIMIT 1))));
END;
$$;

CREATE OR REPLACE FUNCTION public.question_practice_snapshot(_session_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE result jsonb:=public.question_practice_snapshot_questions(_session_id); s public.question_practice_sessions%ROWTYPE;
BEGIN
  SELECT * INTO s FROM public.question_practice_sessions WHERE id=_session_id;
  result:=result||jsonb_build_object('course_id',s.course_id,'course_scope',s.course_scope,'mode',s.mode,'ended_at',s.ended_at);
  IF s.mode='continuous' THEN result:=result||jsonb_build_object('continuous',public.question_practice_continuous_state(s.id)); END IF;
  RETURN result;
END;
$$;

CREATE FUNCTION public.start_continuous_question_practice(_session_id uuid,_topic_id uuid DEFAULT NULL,_course_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE uid uuid:=public.question_practice_require_user(); s public.question_practice_sessions%ROWTYPE; next_result text;
BEGIN
  IF _session_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Provide a practice session ID.'; END IF;
  IF _course_id IS NOT NULL AND _topic_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Course practice requires a canonical Topic.'; END IF;
  IF _topic_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.curriculum_topics WHERE id=_topic_id) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Choose an existing canonical Topic.';
  END IF;
  IF _course_id IS NOT NULL THEN
    PERFORM 1 FROM public.courses WHERE id=_course_id FOR SHARE;
    PERFORM 1 FROM public.course_topic_content WHERE course_id=_course_id AND topic_id=_topic_id FOR SHARE;
    IF (NOT public.course_topic_visible(_course_id,_topic_id) OR NOT EXISTS(SELECT 1 FROM public.courses WHERE id=_course_id AND practice_course_scope IS NOT NULL))
      AND NOT EXISTS(SELECT 1 FROM public.question_practice_sessions WHERE id=_session_id AND user_id=uid AND course_id=_course_id AND topic_id=_topic_id) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Published course lesson is not available for practice.';
    END IF;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('question-practice:'||uid::text,0));
  INSERT INTO public.question_practice_sessions(id,user_id,topic_id,created_at,course_id,course_scope,mode)
    VALUES(_session_id,uid,_topic_id,clock_timestamp(),_course_id,(SELECT practice_course_scope FROM public.courses WHERE id=_course_id),'continuous')
    ON CONFLICT(id) DO NOTHING;
  SELECT * INTO s FROM public.question_practice_sessions WHERE id=_session_id FOR UPDATE;
  IF s.user_id IS DISTINCT FROM uid THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Practice session is not available to your account.'; END IF;
  IF s.mode<>'continuous' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='This session is a five-question set.'; END IF;
  IF s.topic_id IS DISTINCT FROM _topic_id THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='This session belongs to a different Topic.'; END IF;
  IF s.course_id IS DISTINCT FROM _course_id THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='This session belongs to a different course scope.'; END IF;
  next_result:=public.question_practice_issue_next(s.id);
  RETURN public.question_practice_snapshot(s.id)||jsonb_build_object('next_result',next_result);
END;
$$;

CREATE FUNCTION public.next_continuous_question_practice(_session_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE uid uuid:=public.question_practice_require_user(); next_result text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('question-practice:'||uid::text,0));
  IF NOT EXISTS(SELECT 1 FROM public.question_practice_sessions WHERE id=_session_id AND user_id=uid AND mode='continuous') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Continuous practice session is not available to your account.';
  END IF;
  next_result:=public.question_practice_issue_next(_session_id);
  RETURN public.question_practice_snapshot(_session_id)||jsonb_build_object('next_result',next_result);
END;
$$;

CREATE FUNCTION public.end_continuous_question_practice(_session_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE uid uuid:=public.question_practice_require_user();
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('question-practice:'||uid::text,0));
  UPDATE public.question_practice_sessions SET ended_at=coalesce(ended_at,clock_timestamp())
    WHERE id=_session_id AND user_id=uid AND mode='continuous';
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Continuous practice session is not available to your account.'; END IF;
  RETURN public.question_practice_snapshot(_session_id);
END;
$$;

-- Latest unfinished continuous session with at least one answer in the last seven days.
CREATE FUNCTION public.get_open_continuous_question_practice() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE uid uuid:=public.question_practice_require_user();
BEGIN
  RETURN (SELECT to_jsonb(r) FROM (
    SELECT s.id,s.topic_id,s.course_id,s.created_at,t.topic_code,t.title AS topic_title,
      (SELECT count(*) FROM public.question_practice_attempts a WHERE a.session_id=s.id)::integer AS answered_count
    FROM public.question_practice_sessions s LEFT JOIN public.curriculum_topics t ON t.id=s.topic_id
    WHERE s.user_id=uid AND s.mode='continuous' AND s.ended_at IS NULL AND s.created_at>clock_timestamp()-interval '7 days'
      AND EXISTS(SELECT 1 FROM public.question_practice_attempts a WHERE a.session_id=s.id)
    ORDER BY s.created_at DESC,s.id LIMIT 1) r);
END;
$$;

REVOKE ALL ON FUNCTION public.question_practice_reject_ended(),public.question_practice_topic_status(uuid),public.question_practice_continuous_pool(uuid),
  public.question_practice_issue_next(uuid),public.question_practice_continuous_state(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.start_continuous_question_practice(uuid,uuid,uuid),public.next_continuous_question_practice(uuid),
  public.end_continuous_question_practice(uuid),public.get_open_continuous_question_practice() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.start_continuous_question_practice(uuid,uuid,uuid),public.next_continuous_question_practice(uuid),
  public.end_continuous_question_practice(uuid),public.get_open_continuous_question_practice() TO authenticated;
NOTIFY pgrst,'reload schema';
