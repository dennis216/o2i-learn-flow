-- Continuous practice keeps going after every in-scope question has been answered once (#44).
-- Unseen questions still come first under the continuous-v1 rules. When none is left, it repeats
-- answered questions not yet issued in this session: last answer incorrect first, then the least
-- recently answered. The reason keeps kind 'continue' (understood by the deployed frontend) and adds
-- repeat='incorrect'|'oldest'. Exhausted is returned only once this session has issued every question.
CREATE OR REPLACE FUNCTION public.question_practice_issue_next(_session_id uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE s public.question_practice_sessions%ROWTYPE; issued integer; candidate record; item record;
  topic uuid; topic_status text; last_topic uuid; last_correct boolean; last_version uuid; run_length integer:=0;
  target_level integer; streak integer:=0; stepped boolean:=false; seen_in_topic boolean:=false; kind text; repeat_kind text;
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
      IF EXISTS(SELECT 1 FROM public.question_practice_continuous_pool(s.id) p WHERE p.is_new) THEN topic:=s.topic_id; END IF;
    ELSE
      -- Stay after a wrong answer or for up to five questions; otherwise needs_practice, then insufficient, then stable.
      SELECT p.topic_id INTO topic FROM public.question_practice_continuous_pool(s.id) p
        LEFT JOIN public.question_practice_topic_status(s.user_id) st ON st.topic_id=p.topic_id
        WHERE p.is_new GROUP BY p.topic_id,p.topic_code,st.status
        ORDER BY coalesce(p.topic_id=last_topic AND (NOT last_correct OR run_length<5),false) DESC,
          coalesce(p.topic_id=last_topic,false),
          CASE coalesce(st.status,'insufficient') WHEN 'needs_practice' THEN 1 WHEN 'insufficient' THEN 2 ELSE 3 END,
          p.topic_code LIMIT 1;
    END IF;

    IF topic IS NOT NULL THEN
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
    IF NOT FOUND THEN kind:=NULL; END IF;
    END IF;

    -- No unseen question left in scope: repeat answered ones not yet issued in this session,
    -- last answer incorrect first, then the least recently answered.
    IF kind IS NULL THEN
      SELECT p.*,coalesce(NOT l.is_correct,false) AS incorrect INTO candidate FROM public.question_practice_continuous_pool(s.id) p
        LEFT JOIN LATERAL(SELECT a.is_correct FROM public.question_practice_attempts a WHERE a.user_id=s.user_id AND a.question_id=p.question_id
          ORDER BY a.submitted_at DESC,a.id DESC LIMIT 1) l ON true
        ORDER BY coalesce(NOT l.is_correct,false) DESC,p.last_answered NULLS FIRST,random() LIMIT 1;
      IF NOT FOUND THEN RETURN CASE WHEN s.topic_id IS NULL THEN 'all_exhausted' ELSE 'topic_exhausted' END; END IF;
      kind:='continue'; repeat_kind:=CASE WHEN candidate.incorrect THEN 'incorrect' ELSE 'oldest' END;
      target_level:=candidate.level; topic_status:=NULL;
    END IF;
  END IF;

  -- Coordinate immutable issuance with concurrent publication/withdrawal as the set selector does.
  PERFORM 1 FROM public.questions q WHERE q.id=candidate.question_id AND q.status='approved' AND q.current_version_id=candidate.version_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Published questions changed; retry this practice.'; END IF;
  INSERT INTO public.question_practice_items(session_id,question_id,version_id,position,issued_at,selection_reason)
    VALUES(s.id,candidate.question_id,candidate.version_id,issued+1,clock_timestamp(),jsonb_build_object(
      'rule_version','continuous-v1','kind',kind,'topic_code',candidate.topic_code,
      'target_difficulty',(ARRAY['easy','medium','hard'])[target_level],
      'topic_status',coalesce(topic_status,(SELECT st.status FROM public.question_practice_topic_status(s.user_id) st WHERE st.topic_id=candidate.topic_id),'insufficient'))
      ||CASE WHEN repeat_kind IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('repeat',repeat_kind) END);
  RETURN 'issued';
END;
$$;
