-- Run this complete transaction once, only after its prerequisite is verified.
BEGIN;
DO $deploy$
DECLARE migration_sql text := $selection_migration$-- Prefer never-issued questions, then least recently issued; randomize ties.
CREATE OR REPLACE FUNCTION public.start_question_practice(_session_id uuid,_topic_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE uid uuid:=public.question_practice_require_user(); s public.question_practice_sessions%ROWTYPE; inserted integer; candidate record; position_no smallint:=0;
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
    -- Issued versions stay fixed; publication/withdrawal must wait for these shared locks.
    FOR candidate IN
      SELECT q.id,v.id AS version_id
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
      ORDER BY history.last_sent ASC NULLS FIRST,random()
      LIMIT 5 FOR SHARE OF q
    LOOP
      position_no:=position_no+1;
      INSERT INTO public.question_practice_items(session_id,question_id,version_id,position)
        VALUES(s.id,candidate.id,candidate.version_id,position_no);
    END LOOP;
  END IF;
  RETURN public.question_practice_snapshot(s.id);
END;
$$;
$selection_migration$;
BEGIN
  LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
  IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261023000000') THEN
    RAISE EXCEPTION 'Migration 20261023000000 already recorded; do not rerun.';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261021000000'
    AND name='question_bank_student_practice' AND cardinality(statements)=1 AND md5(statements[1])='bc92e36429c448b7d1523432f1250115') THEN
    RAISE EXCEPTION 'Prerequisite 20261021000000 ledger mismatch. Stop; do not rerun historical migrations.';
  END IF;
  EXECUTE migration_sql;
  INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261023000000','question_practice_random_selection',ARRAY[migration_sql]);
END;
$deploy$;
COMMIT;
