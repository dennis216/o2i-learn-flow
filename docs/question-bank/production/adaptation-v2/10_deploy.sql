-- Execute once after preflight. No seeds, question publication or historical migration replay.
BEGIN;
DO $deploy$
DECLARE migration_sql text:=$adaptation_v2$-- Selection telemetry is device-reported, never a grading input. Existing attempts retain unknown telemetry.
ALTER TABLE public.question_practice_sessions ADD COLUMN IF NOT EXISTS selection_summary jsonb;
ALTER TABLE public.question_practice_attempts
  ADD COLUMN selection_trajectory jsonb,
  ADD COLUMN timing_complete boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.question_practice_attempts.timing_complete IS 'Client-reported continuous capture; excludes legacy/incomplete timing from speed signals and averages.';

CREATE FUNCTION public.question_practice_expected_seconds(_difficulty public.question_difficulty) RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path=public,extensions AS $$
  SELECT CASE _difficulty WHEN 'easy' THEN 120 WHEN 'medium' THEN 240 WHEN 'hard' THEN 360 END;
$$;
CREATE FUNCTION public.question_practice_target(_sample bigint,_correct bigint) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=public,extensions AS $$
  SELECT CASE WHEN _sample<5 THEN 'medium' WHEN _correct*2<_sample THEN 'easy' WHEN _correct*5>=_sample*4 THEN 'hard' ELSE 'medium' END;
$$;
-- Private common signal source for selection and personal analysis. Latest result, ten distinct per Topic.
CREATE FUNCTION public.question_practice_signals() RETURNS TABLE(
  question_id uuid,topic_id uuid,is_correct boolean,is_slow boolean,submitted_at timestamptz,
  representation_type text,skill_id uuid,skill_code text,skill_description text,sample_count bigint,correct_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
  WITH latest AS (
    SELECT DISTINCT ON(a.question_id,v.primary_topic_id) a.* ,v.primary_topic_id,v.representation_type,v.difficulty
    FROM public.question_practice_attempts a JOIN public.question_versions v ON v.id=a.version_id
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
CREATE OR REPLACE FUNCTION public.question_practice_snapshot(_session_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE s public.question_practice_sessions%ROWTYPE;
BEGIN
  SELECT * INTO s FROM public.question_practice_sessions WHERE id=_session_id AND user_id=public.question_practice_require_user();
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Practice session is not available to your account.'; END IF;
  RETURN jsonb_build_object('id',s.id,'topic_id',s.topic_id,'created_at',s.created_at,'selection_summary',CASE WHEN s.selection_summary->>'rule_version'='practice-adaptation-v2' THEN NULL ELSE s.selection_summary END,
    'adaptation_summary',CASE WHEN s.selection_summary->>'rule_version'='practice-adaptation-v2' THEN s.selection_summary ELSE NULL END,'questions',coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'question_id',i.question_id,'version_id',i.version_id,'position',i.position,
      'stem',v.stem,'image_url',v.image_url,'requires_figure',v.requires_figure,
      'difficulty',v.difficulty,'calculator_policy',v.calculator_policy,'course_scope',v.course_scope,
      'topic',jsonb_build_object('id',t.id,'code',t.topic_code,'title',t.title),
      'representation_type',v.representation_type,'skill_descriptions',coalesce((SELECT jsonb_agg(p.description ORDER BY p.skill_code) FROM public.question_practice_skills ps JOIN public.curriculum_practice_skills p ON p.id=ps.practice_skill_id WHERE ps.question_version_id=v.id),'[]'::jsonb),
      'skills',coalesce((SELECT jsonb_agg(p.skill_code ORDER BY p.skill_code) FROM public.question_practice_skills ps JOIN public.curriculum_practice_skills p ON p.id=ps.practice_skill_id WHERE ps.question_version_id=v.id),'[]'::jsonb),
      'options',(SELECT jsonb_agg(jsonb_build_object('id',o.id,'key',o.option_key,'text',o.option_text) ORDER BY o.order_index,o.id) FROM public.question_options o WHERE o.question_version_id=v.id),
      'attempt',CASE WHEN a.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id',a.id,'selected_option_id',a.selected_option_id,'is_correct',a.is_correct,
        'submitted_at',a.submitted_at,'elapsed_seconds',a.elapsed_seconds,
        'selection_trajectory',a.selection_trajectory,'timing_complete',a.timing_complete,
        'correct_option_id',(SELECT o.id FROM public.question_options o WHERE o.question_version_id=i.version_id AND o.is_correct),
        'solution',v.solution) END
    ) ORDER BY i.position)
    FROM public.question_practice_items i JOIN public.question_versions v ON v.id=i.version_id
    JOIN public.curriculum_topics t ON t.id=v.primary_topic_id
    LEFT JOIN public.question_practice_attempts a ON a.session_id=i.session_id AND a.question_id=i.question_id AND a.user_id=s.user_id
    WHERE i.session_id=s.id),'[]'::jsonb));
END;
$$;
CREATE FUNCTION public.submit_question_practice_v2(_session_id uuid,_question_id uuid,_option_id uuid,_elapsed_seconds integer DEFAULT NULL,_selection_trajectory jsonb DEFAULT NULL,_timing_complete boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE uid uuid:=public.question_practice_require_user(); item public.question_practice_items%ROWTYPE;
  step jsonb; step_option uuid; step_time integer; last_time integer:=0; last_option uuid;
  previous public.question_practice_attempts%ROWTYPE; selected public.question_options%ROWTYPE;
BEGIN
  SELECT i.* INTO item FROM public.question_practice_items i JOIN public.question_practice_sessions s ON s.id=i.session_id
    WHERE i.session_id=_session_id AND i.question_id=_question_id AND s.user_id=uid FOR UPDATE OF i;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='This question was not issued to your account in this session.'; END IF;
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

CREATE OR REPLACE FUNCTION public.submit_question_practice(_session_id uuid,_question_id uuid,_option_id uuid,_elapsed_seconds integer DEFAULT NULL) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=public,extensions AS $$
  SELECT public.submit_question_practice_v2(_session_id,_question_id,_option_id,_elapsed_seconds,NULL,false);
$$;

CREATE OR REPLACE FUNCTION public.start_question_practice(_session_id uuid,_topic_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE uid uuid:=public.question_practice_require_user(); s public.question_practice_sessions%ROWTYPE; inserted integer;
  slot integer; candidate record; reasons jsonb:='[]'; fallback_count integer:=0; error_count integer:=0; slow_count integer:=0;
BEGIN
  IF _session_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Provide a practice session ID.'; END IF;
  IF _topic_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.curriculum_topics WHERE id=_topic_id) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Choose an existing canonical Topic.';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('question-practice:'||uid::text,0));
  INSERT INTO public.question_practice_sessions(id,user_id,topic_id,created_at) VALUES(_session_id,uid,_topic_id,clock_timestamp()) ON CONFLICT(id) DO NOTHING;
  GET DIAGNOSTICS inserted=ROW_COUNT;
  SELECT * INTO s FROM public.question_practice_sessions WHERE id=_session_id FOR UPDATE;
  IF s.user_id IS DISTINCT FROM uid THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Practice session is not available to your account.'; END IF;
  IF _topic_id IS NOT NULL AND s.topic_id IS DISTINCT FROM _topic_id THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='This session belongs to a different Topic.'; END IF;
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

CREATE FUNCTION public.get_question_practice_analysis(_from timestamptz DEFAULT NULL,_to timestamptz DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE uid uuid:=public.question_practice_require_user(); result jsonb;
BEGIN
  IF _from IS NOT NULL AND _to IS NOT NULL AND _from>=_to THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Choose a valid time period.'; END IF;
  WITH selected AS MATERIALIZED (
    SELECT a.*,v.primary_topic_id,t.topic_code,t.title AS topic_title,u.id AS unit_id,u.unit_number,u.title AS unit_title
    FROM public.question_practice_attempts a JOIN public.question_versions v ON v.id=a.version_id
      JOIN public.curriculum_topics t ON t.id=v.primary_topic_id JOIN public.curriculum_units u ON u.id=t.unit_id
    WHERE a.user_id=uid AND (_from IS NULL OR a.submitted_at>=_from) AND (_to IS NULL OR a.submitted_at<_to)
  ), totals AS (
    SELECT count(*) AS attempt_count,count(DISTINCT question_id) AS distinct_count,count(*) FILTER(WHERE is_correct) AS correct_count,
      count(*) FILTER(WHERE timing_complete AND elapsed_seconds IS NOT NULL) AS timing_count,
      avg(elapsed_seconds) FILTER(WHERE timing_complete) AS average_seconds FROM selected
  ), topic_totals AS (
    SELECT unit_id,unit_number,unit_title,primary_topic_id AS topic_id,topic_code,topic_title,count(*) AS attempt_count,
      count(DISTINCT question_id) AS distinct_count,count(*) FILTER(WHERE is_correct) AS correct_count
    FROM selected GROUP BY unit_id,unit_number,unit_title,primary_topic_id,topic_code,topic_title
  ), unit_totals AS (
    SELECT unit_id,unit_number,unit_title,count(*) AS attempt_count,count(DISTINCT question_id) AS distinct_count,
      count(*) FILTER(WHERE is_correct) AS correct_count FROM selected GROUP BY unit_id,unit_number,unit_title
  )
  SELECT jsonb_build_object('totals',(SELECT to_jsonb(totals) FROM totals),
    'units',coalesce((SELECT jsonb_agg(to_jsonb(u) ORDER BY unit_number,unit_id) FROM unit_totals u),'[]'::jsonb),
    'topics',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY topic_code,topic_id) FROM topic_totals t),'[]'::jsonb),
    'signals',coalesce((SELECT jsonb_agg(to_jsonb(g) ORDER BY kind,signal_count DESC,last_signal DESC,topic_code,skill_code) FROM (
      SELECT s.topic_id,t.topic_code,t.title AS topic_title,s.representation_type,s.skill_code,s.skill_description,
        CASE WHEN NOT s.is_correct THEN 'error' ELSE 'slow' END AS kind,count(*) AS signal_count,max(s.submitted_at) AS last_signal
      FROM public.question_practice_signals() s JOIN public.curriculum_topics t ON t.id=s.topic_id
      WHERE (NOT s.is_correct OR s.is_slow) GROUP BY s.topic_id,t.topic_code,t.title,s.representation_type,s.skill_code,s.skill_description,
        CASE WHEN NOT s.is_correct THEN 'error' ELSE 'slow' END
    ) g),'[]'::jsonb)) INTO result;
  RETURN result;
END;
$$;
CREATE FUNCTION public.get_question_practice_admin_statistics(_question_id uuid,_version_id uuid DEFAULT NULL,_from timestamptz DEFAULT NULL,_to timestamptz DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE uid uuid:=public.question_practice_require_user(); vid uuid; result jsonb;
BEGIN
  IF NOT (public.has_role(uid,'admin') OR public.is_super_admin(uid)) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Administrator access is required.'; END IF;
  IF _from IS NOT NULL AND _to IS NOT NULL AND _from>=_to THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Choose a valid time period.'; END IF;
  SELECT coalesce(_version_id,q.current_version_id) INTO vid FROM public.questions q WHERE q.id=_question_id;
  IF vid IS NULL OR NOT EXISTS(SELECT 1 FROM public.question_versions WHERE id=vid AND question_id=_question_id) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Choose an existing version of this question.';
  END IF;
  SELECT jsonb_build_object('version_id',vid,'versions',(SELECT jsonb_agg(jsonb_build_object('id',v.id,'version_number',v.version_number,'is_current',v.id=q.current_version_id) ORDER BY v.version_number DESC)
      FROM public.question_versions v JOIN public.questions q ON q.id=v.question_id WHERE v.question_id=_question_id),
    'attempt_count',count(*),'correct_count',count(*) FILTER(WHERE a.is_correct),'student_count',count(DISTINCT a.user_id),
    'timing_count',count(*) FILTER(WHERE a.timing_complete AND a.elapsed_seconds IS NOT NULL),
    'average_seconds',avg(a.elapsed_seconds) FILTER(WHERE a.timing_complete),
    'median_seconds',percentile_cont(0.5) WITHIN GROUP(ORDER BY a.elapsed_seconds) FILTER(WHERE a.timing_complete)) INTO result
  FROM public.question_practice_attempts a WHERE a.question_id=_question_id AND a.version_id=vid
    AND (_from IS NULL OR a.submitted_at>=_from) AND (_to IS NULL OR a.submitted_at<_to);
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.question_practice_expected_seconds(public.question_difficulty),public.question_practice_target(bigint,bigint),public.question_practice_signals() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.submit_question_practice_v2(uuid,uuid,uuid,integer,jsonb,boolean),public.get_question_practice_analysis(timestamptz,timestamptz),public.get_question_practice_admin_statistics(uuid,uuid,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.submit_question_practice_v2(uuid,uuid,uuid,integer,jsonb,boolean),public.get_question_practice_analysis(timestamptz,timestamptz),public.get_question_practice_admin_statistics(uuid,uuid,timestamptz,timestamptz) TO authenticated;
NOTIFY pgrst,'reload schema';
$adaptation_v2$;
BEGIN
 LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
 IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261026000000') THEN RAISE EXCEPTION 'Migration 20261026000000 already recorded; do not rerun.'; END IF;
 IF NOT (EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261021000000' AND name='question_bank_student_practice' AND cardinality(statements)=1 AND md5(statements[1])='bc92e36429c448b7d1523432f1250115') AND EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261023000000' AND name='question_practice_random_selection' AND cardinality(statements)=1 AND md5(statements[1])='463ff7e63c60ebf1b79a3ca34a9ebdc1')) OR NOT (NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261024000000') OR EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261024000000' AND name='question_practice_topic_adaptation' AND cardinality(statements)=1 AND md5(statements[1])='9c1230b2f870d1feb1e583b3423aadbd')) THEN RAISE EXCEPTION 'Prerequisite ledger mismatch; stop without replaying migrations.'; END IF;
 IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='question_practice_attempts' AND column_name='selection_trajectory') OR to_regprocedure('public.submit_question_practice_v2(uuid,uuid,uuid,integer,jsonb,boolean)') IS NOT NULL THEN RAISE EXCEPTION 'Unrecorded v2 objects; investigate partial deployment.'; END IF;
 EXECUTE migration_sql;
 INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261026000000','question_practice_adaptation_v2',ARRAY[migration_sql]);
END;
$deploy$;
COMMIT;
