-- Execute once only after explicit authorization and a fresh preflight. Never replay legacy Arena.
BEGIN;
DO $deploy$
DECLARE migration_sql text := $arena_source$-- Forward-only. Legacy Arena questions/issues are retained; no answer backfill is inferred.
ALTER TABLE public.question_practice_sessions
 ADD COLUMN source text NOT NULL DEFAULT 'practice' CHECK(source IN ('practice','arena')),
 ADD CONSTRAINT arena_practice_context CHECK(source<>'arena' OR (mode='set' AND topic_id IS NULL AND course_id IS NULL));
COMMENT ON COLUMN public.question_practice_sessions.source IS 'Server-assigned learning origin. Arena answers are visible in history, but excluded from normal practice adaptation.';

CREATE TABLE public.arena_practice_issues (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 session_id uuid NOT NULL,
 question_id uuid NOT NULL,
 version_id uuid NOT NULL,
 option_order uuid[] NOT NULL CHECK(cardinality(option_order)=4),
 issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(session_id,question_id),
 FOREIGN KEY(session_id,question_id,version_id) REFERENCES public.question_practice_items(session_id,question_id,version_id) ON DELETE CASCADE
);
CREATE INDEX arena_practice_issues_time ON public.arena_practice_issues(issued_at);
ALTER TABLE public.arena_practice_issues ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.arena_practice_issues FROM PUBLIC,anon,authenticated;

-- Private, shared eligibility for both the catalog and issuance. Never return answer keys to clients.
CREATE FUNCTION public.arena_practice_pool() RETURNS TABLE(question_id uuid,version_id uuid,unit integer,tier integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
 SELECT q.id,v.id,u.unit_number::integer,array_position(ARRAY['easy','medium','hard'],v.difficulty::text)
 FROM public.questions q JOIN public.question_versions v ON v.id=q.current_version_id AND v.question_id=q.id
 JOIN public.curriculum_topics t ON t.id=v.primary_topic_id JOIN public.curriculum_units u ON u.id=t.unit_id
 WHERE q.status='approved' AND v.status='approved' AND v.question_type='mcq_single'
   AND u.unit_number BETWEEN 1 AND 10 AND btrim(coalesce(v.stem,''))<>'' AND btrim(coalesce(v.solution,''))<>''
   AND (NOT v.requires_figure OR coalesce(v.image_url,'') ~ '^https?://[^[:space:]]+$')
   AND (v.image_url IS NULL OR v.image_url ~ '^https?://[^[:space:]]+$')
   AND (SELECT count(*)=4 AND count(*) FILTER(WHERE o.is_correct)=1 AND bool_and(btrim(coalesce(o.option_text,''))<>'')
        FROM public.question_options o WHERE o.question_version_id=v.id);
$$;

CREATE FUNCTION public.arena_practice_payload(_issue_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
 SELECT jsonb_build_object('status','ok','issue_id',i.id,'unit',u.unit_number,
   'tier',array_position(ARRAY['easy','medium','hard'],v.difficulty::text),'topic',t.topic_code||' · '||t.title,
   'stem',v.stem,'image_url',v.image_url,
   'opts',(SELECT jsonb_agg(o.option_text ORDER BY ord.position) FROM unnest(i.option_order) WITH ORDINALITY ord(option_id,position)
     JOIN public.question_options o ON o.id=ord.option_id AND o.question_version_id=i.version_id),'graph',NULL,'table',NULL)
 FROM public.arena_practice_issues i JOIN public.question_versions v ON v.id=i.version_id
 JOIN public.curriculum_topics t ON t.id=v.primary_topic_id JOIN public.curriculum_units u ON u.id=t.unit_id
 WHERE i.id=_issue_id;
$$;

CREATE FUNCTION public.arena_practice_catalog() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
BEGIN
 PERFORM public.question_practice_require_user();
 RETURN jsonb_build_object('counts',coalesce((SELECT jsonb_object_agg(unit,total) FROM (
   SELECT unit,count(*) AS total FROM public.arena_practice_pool() GROUP BY unit) c),'{}'::jsonb));
END;
$$;

CREATE FUNCTION public.arena_practice_next_question(_run_id uuid,_units integer[],_current_unit integer,_tier integer,_prefer_current boolean DEFAULT true) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE uid uuid:=public.question_practice_require_user(); s public.question_practice_sessions%ROWTYPE;
 chosen record; issue uuid; shuffled uuid[]; issued integer;
BEGIN
 IF _run_id IS NULL OR _units IS NULL OR cardinality(_units) NOT BETWEEN 1 AND 10
   OR EXISTS(SELECT 1 FROM unnest(_units) u WHERE u IS NULL OR u NOT BETWEEN 1 AND 10)
   OR _tier IS NULL OR _tier NOT BETWEEN 1 AND 3 OR _current_unit IS NULL OR NOT (_current_unit=ANY(_units)) THEN
   RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid Arena question request.';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('arena:'||uid::text,0));
 SELECT * INTO s FROM public.question_practice_sessions WHERE id=_run_id FOR UPDATE;
 IF FOUND AND (s.user_id IS DISTINCT FROM uid OR s.source<>'arena') THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Arena run is not available to your account.';
 END IF;
 -- A duplicate request cannot issue extra questions or bypass the waiting question.
 SELECT i.id INTO issue FROM public.arena_practice_issues i
 WHERE i.session_id=_run_id AND NOT EXISTS(SELECT 1 FROM public.question_practice_attempts a WHERE a.session_id=i.session_id AND a.question_id=i.question_id)
 ORDER BY i.issued_at LIMIT 1;
 IF FOUND THEN RETURN public.arena_practice_payload(issue); END IF;
 SELECT count(*) INTO issued FROM public.question_practice_items WHERE session_id=_run_id;
 IF issued>=100 THEN RETURN jsonb_build_object('status','empty'); END IF;
 IF (SELECT count(*)>=30 FROM public.arena_practice_issues i JOIN public.question_practice_sessions h ON h.id=i.session_id
       WHERE h.user_id=uid AND i.issued_at>clock_timestamp()-interval '1 minute')
   OR (SELECT count(*)>=300 FROM public.arena_practice_issues i JOIN public.question_practice_sessions h ON h.id=i.session_id
       WHERE h.user_id=uid AND i.issued_at>clock_timestamp()-interval '1 day') THEN
   RETURN jsonb_build_object('status','rate_limited');
 END IF;
 SELECT p.* INTO chosen FROM public.arena_practice_pool() p
 LEFT JOIN LATERAL(SELECT max(i.issued_at) AS last_issued FROM public.arena_practice_issues i JOIN public.question_practice_sessions h ON h.id=i.session_id
   WHERE h.user_id=uid AND i.question_id=p.question_id) seen ON true
 WHERE p.unit=ANY(_units) AND NOT EXISTS(SELECT 1 FROM public.question_practice_items i WHERE i.session_id=_run_id AND i.question_id=p.question_id)
 ORDER BY p.tier<>_tier,(coalesce(_prefer_current,false) AND p.unit<>_current_unit),seen.last_issued ASC NULLS FIRST,random() LIMIT 1;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','empty'); END IF;
 PERFORM 1 FROM public.questions q WHERE q.id=chosen.question_id AND q.status='approved' AND q.current_version_id=chosen.version_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Published questions changed; retry Arena.'; END IF;
 INSERT INTO public.question_practice_sessions(id,user_id,source) VALUES(_run_id,uid,'arena') ON CONFLICT(id) DO NOTHING;
 -- Also rejects an ID concurrently claimed by a different practice entry point.
 SELECT * INTO s FROM public.question_practice_sessions WHERE id=_run_id FOR UPDATE;
 IF s.user_id IS DISTINCT FROM uid OR s.source<>'arena' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Arena run is not available to your account.'; END IF;
 INSERT INTO public.question_practice_items(session_id,question_id,version_id,position) VALUES(s.id,chosen.question_id,chosen.version_id,issued+1);
 SELECT array_agg(id ORDER BY random()) INTO shuffled FROM public.question_options WHERE question_version_id=chosen.version_id;
 INSERT INTO public.arena_practice_issues(session_id,question_id,version_id,option_order) VALUES(s.id,chosen.question_id,chosen.version_id,shuffled) RETURNING id INTO issue;
 RETURN public.arena_practice_payload(issue);
END;
$$;

CREATE FUNCTION public.arena_practice_submit_answer(_issue_id uuid,_selected integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE uid uuid:=public.question_practice_require_user(); issue public.arena_practice_issues%ROWTYPE;
 saved public.question_practice_attempts%ROWTYPE; correct_option uuid; solution text;
BEGIN
 IF _selected IS NULL OR _selected NOT BETWEEN 0 AND 3 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Choose one of the four options.'; END IF;
 SELECT i.* INTO issue FROM public.arena_practice_issues i JOIN public.question_practice_sessions s ON s.id=i.session_id
   WHERE i.id=_issue_id AND s.user_id=uid AND s.source='arena' FOR UPDATE OF i;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','not_found'); END IF;
 SELECT * INTO saved FROM public.question_practice_attempts WHERE session_id=issue.session_id AND question_id=issue.question_id;
 IF NOT FOUND THEN
   -- Freeze against ordinary Practice submissions too; both entry points lock this same issued item.
   PERFORM 1 FROM public.question_practice_items WHERE session_id=issue.session_id AND question_id=issue.question_id FOR UPDATE;
   SELECT * INTO saved FROM public.question_practice_attempts WHERE session_id=issue.session_id AND question_id=issue.question_id;
   IF NOT FOUND THEN
     PERFORM public.submit_question_practice_v2(issue.session_id,issue.question_id,issue.option_order[_selected+1],NULL,NULL,false);
     SELECT * INTO saved FROM public.question_practice_attempts WHERE session_id=issue.session_id AND question_id=issue.question_id;
   END IF;
 END IF;
 SELECT o.id INTO correct_option FROM public.question_options o WHERE o.question_version_id=issue.version_id AND o.is_correct;
 SELECT v.solution INTO solution FROM public.question_versions v WHERE v.id=issue.version_id;
 RETURN jsonb_build_object('status','ok','correct',saved.is_correct,'selected_index',array_position(issue.option_order,saved.selected_option_id)-1,
   'correct_index',array_position(issue.option_order,correct_option)-1,'explanation',solution);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_question_practice_statistics(_user_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE uid uuid:=public.question_practice_require_user(); result jsonb;
BEGIN
 IF _user_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Provide an account ID.'; END IF;
 WITH sources AS (
   SELECT origin AS source,count(DISTINCT s.id) AS "sessionCount",count(a.id) AS "attemptCount",count(a.id) FILTER(WHERE a.is_correct) AS "correctCount"
   FROM unnest(ARRAY['practice','arena']) origin
   LEFT JOIN public.question_practice_sessions s ON s.source=origin AND s.user_id=uid AND s.user_id=_user_id
   LEFT JOIN public.question_practice_attempts a ON a.session_id=s.id AND a.user_id=uid GROUP BY origin
 ) SELECT jsonb_build_object('sessionCount',sum("sessionCount"),'attemptCount',sum("attemptCount"),'correctCount',sum("correctCount"),
   'sources',jsonb_agg(to_jsonb(sources) ORDER BY source)) INTO result FROM sources;
 RETURN result;
END;
$$;

-- Preserve existing practice behavior while separating game learning signals.
CREATE OR REPLACE FUNCTION public.question_practice_signals() RETURNS TABLE(
  question_id uuid,topic_id uuid,is_correct boolean,is_slow boolean,submitted_at timestamptz,
  representation_type text,skill_id uuid,skill_code text,skill_description text,sample_count bigint,correct_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
  WITH latest AS (
    SELECT DISTINCT ON(a.question_id,v.primary_topic_id) a.* ,v.primary_topic_id,v.representation_type,v.difficulty
    FROM public.question_practice_attempts a JOIN public.question_versions v ON v.id=a.version_id
    JOIN public.question_practice_sessions h ON h.id=a.session_id AND h.source='practice'
    WHERE a.user_id=public.question_practice_require_user()
    ORDER BY a.question_id,v.primary_topic_id,a.submitted_at DESC,a.id DESC
  ), ranked AS (
    SELECT *,row_number() OVER(PARTITION BY primary_topic_id ORDER BY submitted_at DESC,id DESC) AS n FROM latest
  ), recent AS (
    SELECT *,count(*) OVER(PARTITION BY primary_topic_id) AS sample,
      count(*) FILTER(WHERE is_correct) OVER(PARTITION BY primary_topic_id) AS correct FROM ranked WHERE n<=10
  )
  SELECT r.question_id,r.primary_topic_id,r.is_correct,
    r.is_correct AND r.timing_complete AND r.elapsed_seconds*5>public.question_practice_expected_seconds(r.difficulty)*6,
    r.submitted_at,r.representation_type::text,p.id,p.skill_code,p.description,r.sample,r.correct
  FROM recent r JOIN public.question_practice_skills s ON s.question_version_id=r.version_id
    JOIN public.curriculum_practice_skills p ON p.id=s.practice_skill_id;
$$;

CREATE OR REPLACE FUNCTION public.submit_question_practice_v2(_session_id uuid,_question_id uuid,_option_id uuid,_elapsed_seconds integer DEFAULT NULL,_selection_trajectory jsonb DEFAULT NULL,_timing_complete boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE uid uuid:=public.question_practice_require_user(); item public.question_practice_items%ROWTYPE;
  step jsonb; step_option uuid; step_time integer; last_time integer:=0; last_option uuid;
  previous public.question_practice_attempts%ROWTYPE; selected public.question_options%ROWTYPE;
BEGIN
  SELECT i.* INTO item FROM public.question_practice_items i JOIN public.question_practice_sessions s ON s.id=i.session_id
    WHERE i.session_id=_session_id AND i.question_id=_question_id AND s.user_id=uid FOR UPDATE OF i;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='This question was not issued to your account in this session.'; END IF;
  -- Game time/selection capture is not a normal practice speed measurement.
  IF EXISTS(SELECT 1 FROM public.question_practice_sessions WHERE id=item.session_id AND source='arena') THEN
    _elapsed_seconds:=NULL; _selection_trajectory:=NULL; _timing_complete:=false;
  END IF;
  SELECT * INTO previous FROM public.question_practice_attempts WHERE session_id=item.session_id AND question_id=item.question_id;
  IF FOUND THEN
    IF previous.selected_option_id IS DISTINCT FROM _option_id THEN RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='An answer is already saved. Reload the saved result.'; END IF;
    RETURN public.question_practice_snapshot(item.session_id);
  END IF;
  IF _timing_complete IS NULL OR (_timing_complete AND (_elapsed_seconds IS NULL OR _selection_trajectory IS NULL)) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Complete timing requires a duration and selection trajectory.';
  END IF;
  IF _selection_trajectory IS NOT NULL THEN
    IF jsonb_typeof(_selection_trajectory)<>'array' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid selection trajectory.'; END IF;
    IF jsonb_array_length(_selection_trajectory) NOT BETWEEN 1 AND 256 OR _elapsed_seconds IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid selection trajectory length or duration.';
    END IF;
    FOR step IN SELECT value FROM jsonb_array_elements(_selection_trajectory) LOOP
      IF jsonb_typeof(step)<>'object' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid selection step.'; END IF;
      IF (SELECT count(*) FROM jsonb_object_keys(step))<>2 OR jsonb_typeof(step->'option_id') IS DISTINCT FROM 'string'
        OR jsonb_typeof(step->'elapsed_seconds') IS DISTINCT FROM 'number' OR (step->>'elapsed_seconds') !~ '^[0-9]+$' THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Invalid selection step.';
      END IF;
      step_option:=(step->>'option_id')::uuid; step_time:=(step->>'elapsed_seconds')::integer;
      IF step_time<last_time OR step_time>_elapsed_seconds OR step_option IS NOT DISTINCT FROM last_option
        OR NOT EXISTS(SELECT 1 FROM public.question_options WHERE id=step_option AND question_version_id=item.version_id) THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Selection step does not match this issued question or duration.';
      END IF;
      last_time:=step_time;last_option:=step_option;
    END LOOP;
    IF last_option IS DISTINCT FROM _option_id THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Final selection does not match the trajectory.'; END IF;
  END IF;
  SELECT * INTO selected FROM public.question_options WHERE id=_option_id AND question_version_id=item.version_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Select a valid option from the issued version.'; END IF;
  IF (SELECT count(*) FROM public.question_options WHERE question_version_id=item.version_id AND is_correct)<>1 THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='The issued version has no unique correct answer.';
  END IF;
  INSERT INTO public.question_practice_attempts(user_id,session_id,question_id,version_id,selected_option_id,is_correct,elapsed_seconds,selection_trajectory,timing_complete)
    VALUES(uid,item.session_id,item.question_id,item.version_id,selected.id,selected.is_correct,_elapsed_seconds,_selection_trajectory,_timing_complete);
  RETURN public.question_practice_snapshot(item.session_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.start_question_practice_in_scope(_session_id uuid,_topic_id uuid DEFAULT NULL,_course_id uuid DEFAULT NULL) RETURNS jsonb
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
  IF s.source='arena' THEN
    IF _topic_id IS NOT NULL OR _course_id IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Arena history has no course or Topic session scope.'; END IF;
    RETURN public.question_practice_snapshot(s.id);
  END IF;
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
          JOIN public.question_practice_items i ON i.session_id=h.id WHERE h.user_id=uid AND h.source='practice' AND i.question_id=q.id) history ON true
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

CREATE OR REPLACE FUNCTION public.question_practice_topic_status(_uid uuid) RETURNS TABLE(topic_id uuid,sample_count integer,correct_count integer,status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
  WITH attempts AS (
    SELECT a.id,a.question_id,a.is_correct,a.submitted_at,v.primary_topic_id AS topic_id,
      row_number() OVER(PARTITION BY a.question_id ORDER BY a.submitted_at,a.id) AS n,
      first_value(a.is_correct) OVER(PARTITION BY a.question_id ORDER BY a.submitted_at,a.id) AS first_correct
    FROM public.question_practice_attempts a JOIN public.question_versions v ON v.id=a.version_id
    JOIN public.question_practice_sessions h ON h.id=a.session_id AND h.source='practice'
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

CREATE OR REPLACE FUNCTION public.question_practice_continuous_pool(_session_id uuid) RETURNS TABLE(
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
    FROM public.question_practice_attempts a JOIN public.question_practice_sessions h ON h.id=a.session_id AND h.source='practice' WHERE a.user_id=s.user_id AND a.question_id=q.id
  ) h ON true
  WHERE s.id=_session_id AND v.status='approved' AND v.question_type='mcq_single'
    -- A malformed question would block the student (no Skip), so never issue one: needs a stem, 2-6 options, one correct.
    AND btrim(coalesce(v.stem,''))<>''
    AND (SELECT count(*) BETWEEN 2 AND 6 AND count(*) FILTER(WHERE o.is_correct)=1 FROM public.question_options o WHERE o.question_version_id=v.id)
    AND (s.topic_id IS NULL OR v.primary_topic_id=s.topic_id)
    AND (s.course_id IS NULL OR s.course_scope='BC' OR v.course_scope IN ('AB','BOTH'))
    AND NOT EXISTS(SELECT 1 FROM public.question_practice_items i WHERE i.session_id=s.id AND i.question_id=q.id);
$$;

CREATE OR REPLACE FUNCTION public.question_practice_continuous_state(_session_id uuid) RETURNS jsonb
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
        SELECT a.*,v.primary_topic_id AS topic_id,NOT EXISTS(SELECT 1 FROM public.question_practice_attempts e JOIN public.question_practice_sessions h ON h.id=e.session_id AND h.source='practice' WHERE e.user_id=a.user_id AND e.question_id=a.question_id
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
  result:=result||jsonb_build_object('course_id',s.course_id,'course_scope',s.course_scope,'mode',s.mode,'ended_at',s.ended_at,'source',s.source);
  IF s.mode='continuous' THEN result:=result||jsonb_build_object('continuous',public.question_practice_continuous_state(s.id)); END IF;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_question_practice_attempts(_incorrect_only boolean) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE uid uuid:=public.question_practice_require_user();
BEGIN
  IF _incorrect_only IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Incorrect-only filter must be a boolean.';
  END IF;
  RETURN coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.submitted_at DESC,r.id) FROM (
    SELECT a.id,a.session_id,a.question_id,a.version_id,a.selected_option_id,a.is_correct,a.submitted_at,a.elapsed_seconds,s.source,
      t.topic_code AS topic_code,t.title AS topic_title
    FROM public.question_practice_attempts a JOIN public.question_versions v ON v.id=a.version_id
    JOIN public.curriculum_topics t ON t.id=v.primary_topic_id
    JOIN public.question_practice_sessions s ON s.id=a.session_id
    WHERE a.user_id=uid AND (NOT _incorrect_only OR NOT a.is_correct)
    ORDER BY a.submitted_at DESC,a.id LIMIT 10
  ) r),'[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.arena_practice_pool(),public.arena_practice_payload(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.arena_practice_catalog(),public.arena_practice_next_question(uuid,integer[],integer,integer,boolean),
 public.arena_practice_submit_answer(uuid,integer),public.get_question_practice_statistics(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.arena_practice_catalog(),public.arena_practice_next_question(uuid,integer[],integer,integer,boolean),
 public.arena_practice_submit_answer(uuid,integer),public.get_question_practice_statistics(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
$arena_source$;
BEGIN
 LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
 IF NOT (NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261105000000') AND to_regclass('public.arena_practice_issues') IS NULL AND NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='question_practice_sessions' AND column_name='source') AND to_regprocedure('public.arena_practice_pool()') IS NULL AND to_regprocedure('public.arena_practice_payload(uuid)') IS NULL AND to_regprocedure('public.arena_practice_catalog()') IS NULL AND to_regprocedure('public.arena_practice_next_question(uuid,integer[],integer,integer,boolean)') IS NULL AND to_regprocedure('public.arena_practice_submit_answer(uuid,integer)') IS NULL AND to_regprocedure('public.get_question_practice_statistics(uuid)') IS NULL) THEN RAISE EXCEPTION 'Arena integration already recorded or partially present; stop without replay.'; END IF;
 IF NOT (EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261025000000' AND name='question_practice_review_history' AND cardinality(statements)=1 AND md5(statements[1])='dbb06ac25eebc2319a3543505c1dff36') AND EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261026000000' AND name='question_practice_adaptation_v2' AND cardinality(statements)=1 AND md5(statements[1])='354934137b8be264f4b1b2cf58d36b2e') AND EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261028000000' AND name='course_topic_practice' AND cardinality(statements)=1 AND md5(statements[1])='f8d0fd626747b1dd42fd6f03cf285591') AND EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261104000000' AND name='question_practice_continuous' AND cardinality(statements)=1 AND md5(statements[1])='5812dd9d82c6474144ed67d24d83da65')) OR NOT (coalesce((SELECT md5(prosrc)='a18312b9fe60c31fbdde267d9241e6ae' FROM pg_proc WHERE oid=to_regprocedure('public.question_practice_signals()')),false) AND coalesce((SELECT md5(prosrc)='d4088db3fa9026ae6dd0017bc05e6295' FROM pg_proc WHERE oid=to_regprocedure('public.submit_question_practice_v2(uuid,uuid,uuid,integer,jsonb,boolean)')),false) AND coalesce((SELECT md5(prosrc)='d44924032760bb633e96c245b4269b7b' FROM pg_proc WHERE oid=to_regprocedure('public.start_question_practice_in_scope(uuid,uuid,uuid)')),false) AND coalesce((SELECT md5(prosrc)='87bfa6d1ad3249b4e5158346fc19c08e' FROM pg_proc WHERE oid=to_regprocedure('public.question_practice_topic_status(uuid)')),false) AND coalesce((SELECT md5(prosrc)='f86fc1b913213860973bcde5bc70308f' FROM pg_proc WHERE oid=to_regprocedure('public.question_practice_continuous_pool(uuid)')),false) AND coalesce((SELECT md5(prosrc)='5765991cdb57155b535bed5bb3a5259e' FROM pg_proc WHERE oid=to_regprocedure('public.question_practice_continuous_state(uuid)')),false) AND coalesce((SELECT md5(prosrc)='75620c466e8819f8f4ae007d71e034cc' FROM pg_proc WHERE oid=to_regprocedure('public.question_practice_snapshot(uuid)')),false) AND coalesce((SELECT md5(prosrc)='affd424769333db5be07a9e96f247ca4' FROM pg_proc WHERE oid=to_regprocedure('public.list_question_practice_attempts(boolean)')),false)) THEN RAISE EXCEPTION 'Practice prerequisite mismatch; stop without replaying migrations.'; END IF;
 EXECUTE migration_sql;
 INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261105000000','arena_practice_integration',ARRAY[migration_sql]);
END;
$deploy$;
COMMIT;
