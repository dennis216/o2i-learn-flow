-- Run this complete transaction once, only after its prerequisite is verified.
BEGIN;
DO $deploy$
DECLARE migration_sql text := $selection_migration$-- Additive: old clients ignore the summary; old sessions retain NULL rather than invented history.
ALTER TABLE public.question_practice_sessions ADD COLUMN selection_summary jsonb;
COMMENT ON COLUMN public.question_practice_sessions.selection_summary IS 'Server-selected difficulty rationale frozen at issuance; not a mastery estimate.';
CREATE OR REPLACE FUNCTION public.start_question_practice(_session_id uuid,_topic_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE uid uuid:=public.question_practice_require_user(); s public.question_practice_sessions%ROWTYPE; inserted integer; candidate record; position_no smallint:=0;
  sample_count integer:=0; correct_count integer:=0; target public.question_difficulty; fallback_count integer:=0;
BEGIN
  IF _session_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Provide a practice session ID.'; END IF;
  IF _topic_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.curriculum_topics WHERE id=_topic_id) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Choose an existing canonical Topic.';
  END IF;
  -- Serialize new sets for one account so concurrent requests see earlier issued questions.
  PERFORM pg_advisory_xact_lock(hashtextextended('question-practice:'||uid::text,0));
  INSERT INTO public.question_practice_sessions(id,user_id,topic_id,created_at) VALUES(_session_id,uid,_topic_id,clock_timestamp()) ON CONFLICT(id) DO NOTHING;
  GET DIAGNOSTICS inserted=ROW_COUNT;
  SELECT * INTO s FROM public.question_practice_sessions WHERE id=_session_id FOR UPDATE;
  IF s.user_id IS DISTINCT FROM uid THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Practice session is not available to your account.'; END IF;
  IF _topic_id IS NOT NULL AND s.topic_id IS DISTINCT FROM _topic_id THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='This session belongs to a different Topic.';
  END IF;
  IF inserted=1 THEN
    IF s.topic_id IS NOT NULL THEN
      -- Use issued-version Topic and latest result per question, never device time or localStorage.
      SELECT count(*)::integer,count(*) FILTER(WHERE recent.is_correct)::integer
        INTO sample_count,correct_count FROM (
        SELECT latest.is_correct FROM (
          SELECT DISTINCT ON (a.question_id) a.question_id,a.is_correct,a.submitted_at,a.id
          FROM public.question_practice_attempts a
          JOIN public.question_versions v ON v.id=a.version_id
          WHERE a.user_id=uid AND v.primary_topic_id=s.topic_id
          ORDER BY a.question_id,a.submitted_at DESC,a.id DESC
        ) latest ORDER BY latest.submitted_at DESC,latest.id DESC LIMIT 10
      ) recent;
      -- shortcut: initial difficulty thresholds are rules, not validated mastery estimates; calibrate after the pilot.
      target:=CASE WHEN sample_count<5 THEN 'medium' WHEN correct_count*2<sample_count THEN 'easy'
        WHEN correct_count*5>=sample_count*4 THEN 'hard' ELSE 'medium' END;
    END IF;
    -- Issued versions stay fixed; publication/withdrawal must wait for these shared locks.
    FOR candidate IN
      SELECT q.id,v.id AS version_id,v.difficulty
      FROM public.questions q
      JOIN public.question_versions v ON v.id=q.current_version_id AND v.question_id=q.id
      LEFT JOIN LATERAL (
        SELECT max(h.created_at) AS last_sent
        FROM public.question_practice_sessions h
        JOIN public.question_practice_items i ON i.session_id=h.id
        WHERE h.user_id=uid AND i.question_id=q.id
      ) history ON true
      WHERE q.status='approved' AND v.status='approved' AND v.question_type='mcq_single'
        AND (s.topic_id IS NULL OR v.primary_topic_id=s.topic_id)
      ORDER BY (history.last_sent IS NOT NULL),
        CASE WHEN target IS NULL THEN 0 ELSE abs(array_position(ARRAY['easy','medium','hard'],v.difficulty::text)-array_position(ARRAY['easy','medium','hard'],target::text)) END,
        CASE WHEN target IS NULL THEN 0 ELSE array_position(ARRAY['easy','medium','hard'],v.difficulty::text) END,
        history.last_sent ASC NULLS FIRST,random()
      LIMIT 5 FOR SHARE OF q
    LOOP
      position_no:=position_no+1;
      IF target IS NOT NULL AND candidate.difficulty<>target THEN fallback_count:=fallback_count+1; END IF;
      INSERT INTO public.question_practice_items(session_id,question_id,version_id,position)
        VALUES(s.id,candidate.id,candidate.version_id,position_no);
    END LOOP;
    UPDATE public.question_practice_sessions SET selection_summary=jsonb_build_object(
      'rule_version','topic-difficulty-v1','target_difficulty',target,'sample_count',sample_count,
      'correct_count',correct_count,'fallback_count',fallback_count) WHERE id=s.id;
  END IF;
  RETURN public.question_practice_snapshot(s.id);
END;
$$;
CREATE OR REPLACE FUNCTION public.question_practice_snapshot(_session_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE s public.question_practice_sessions%ROWTYPE;
BEGIN
  SELECT * INTO s FROM public.question_practice_sessions WHERE id=_session_id AND user_id=public.question_practice_require_user();
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Practice session is not available to your account.'; END IF;
  RETURN jsonb_build_object('id',s.id,'topic_id',s.topic_id,'created_at',s.created_at,'selection_summary',s.selection_summary,'questions',coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'question_id',i.question_id,'version_id',i.version_id,'position',i.position,
      'stem',v.stem,'image_url',v.image_url,'requires_figure',v.requires_figure,
      'difficulty',v.difficulty,'calculator_policy',v.calculator_policy,'course_scope',v.course_scope,
      'topic',jsonb_build_object('id',t.id,'code',t.topic_code,'title',t.title),
      'skills',coalesce((SELECT jsonb_agg(p.skill_code ORDER BY p.skill_code) FROM public.question_practice_skills ps JOIN public.curriculum_practice_skills p ON p.id=ps.practice_skill_id WHERE ps.question_version_id=v.id),'[]'::jsonb),
      'options',(SELECT jsonb_agg(jsonb_build_object('id',o.id,'key',o.option_key,'text',o.option_text) ORDER BY o.order_index,o.id) FROM public.question_options o WHERE o.question_version_id=v.id),
      'attempt',CASE WHEN a.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id',a.id,'selected_option_id',a.selected_option_id,'is_correct',a.is_correct,
        'submitted_at',a.submitted_at,'elapsed_seconds',a.elapsed_seconds,
        'correct_option_id',(SELECT o.id FROM public.question_options o WHERE o.question_version_id=i.version_id AND o.is_correct),
        'solution',v.solution) END
    ) ORDER BY i.position)
    FROM public.question_practice_items i JOIN public.question_versions v ON v.id=i.version_id
    JOIN public.curriculum_topics t ON t.id=v.primary_topic_id
    LEFT JOIN public.question_practice_attempts a ON a.session_id=i.session_id AND a.question_id=i.question_id AND a.user_id=s.user_id
    WHERE i.session_id=s.id),'[]'::jsonb));
END;
$$;
$selection_migration$;
BEGIN
  LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
  IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261024000000') THEN
    RAISE EXCEPTION 'Migration 20261024000000 already recorded; do not rerun.';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261023000000'
    AND name='question_practice_random_selection' AND cardinality(statements)=1 AND md5(statements[1])='463ff7e63c60ebf1b79a3ca34a9ebdc1') THEN
    RAISE EXCEPTION 'Prerequisite 20261023000000 ledger mismatch. Stop; do not rerun historical migrations.';
  END IF;
  EXECUTE migration_sql;
  INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261024000000','question_practice_topic_adaptation',ARRAY[migration_sql]);
END;
$deploy$;
COMMIT;
