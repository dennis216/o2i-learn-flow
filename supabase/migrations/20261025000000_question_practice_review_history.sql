-- Filter before LIMIT so Review finds wrong answers outside the latest ten submissions.
CREATE FUNCTION public.list_question_practice_attempts(_incorrect_only boolean) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE uid uuid:=public.question_practice_require_user();
BEGIN
  IF _incorrect_only IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Incorrect-only filter must be a boolean.';
  END IF;
  RETURN coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.submitted_at DESC,r.id) FROM (
    SELECT a.id,a.session_id,a.question_id,a.version_id,a.selected_option_id,a.is_correct,a.submitted_at,a.elapsed_seconds,
      t.topic_code AS topic_code,t.title AS topic_title
    FROM public.question_practice_attempts a JOIN public.question_versions v ON v.id=a.version_id
    JOIN public.curriculum_topics t ON t.id=v.primary_topic_id
    WHERE a.user_id=uid AND (NOT _incorrect_only OR NOT a.is_correct)
    ORDER BY a.submitted_at DESC,a.id LIMIT 10
  ) r),'[]'::jsonb);
END;
$$;

-- Keep existing no-argument clients and catalog checks compatible.
CREATE OR REPLACE FUNCTION public.list_question_practice_attempts() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
  SELECT public.list_question_practice_attempts(false);
$$;
REVOKE ALL ON FUNCTION public.list_question_practice_attempts(),public.list_question_practice_attempts(boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_question_practice_attempts(),public.list_question_practice_attempts(boolean) TO authenticated;
NOTIFY pgrst,'reload schema';
