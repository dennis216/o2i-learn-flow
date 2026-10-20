-- Authenticated, version-bound practice. No existing question, answer, policy or evidence is changed.
CREATE TABLE public.question_practice_sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic_id uuid REFERENCES public.curriculum_topics(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id,user_id)
);
CREATE INDEX question_practice_sessions_user ON public.question_practice_sessions(user_id,created_at DESC);
CREATE TABLE public.question_practice_items (
  session_id uuid NOT NULL REFERENCES public.question_practice_sessions(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  version_id uuid NOT NULL,
  position smallint NOT NULL CHECK(position BETWEEN 1 AND 5),
  PRIMARY KEY(session_id,question_id),
  UNIQUE(session_id,position),
  UNIQUE(session_id,question_id,version_id),
  FOREIGN KEY(version_id,question_id) REFERENCES public.question_versions(id,question_id) ON DELETE RESTRICT
);
CREATE TABLE public.question_practice_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  question_id uuid NOT NULL,
  version_id uuid NOT NULL,
  selected_option_id uuid NOT NULL REFERENCES public.question_options(id) ON DELETE RESTRICT,
  is_correct boolean NOT NULL,
  elapsed_seconds integer CHECK(elapsed_seconds BETWEEN 0 AND 86400),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id,question_id),
  FOREIGN KEY(session_id,user_id) REFERENCES public.question_practice_sessions(id,user_id) ON DELETE CASCADE,
  FOREIGN KEY(session_id,question_id,version_id) REFERENCES public.question_practice_items(session_id,question_id,version_id) ON DELETE CASCADE
);
CREATE INDEX question_practice_attempts_user ON public.question_practice_attempts(user_id,submitted_at DESC,id);
ALTER TABLE public.question_practice_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_practice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_practice_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read own practice sessions" ON public.question_practice_sessions FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY "Read own issued questions" ON public.question_practice_items FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.question_practice_sessions s WHERE s.id=session_id AND s.user_id=auth.uid()));
CREATE POLICY "Read own practice attempts" ON public.question_practice_attempts FOR SELECT TO authenticated USING(user_id=auth.uid());
REVOKE ALL ON public.question_practice_sessions,public.question_practice_items,public.question_practice_attempts FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.question_practice_sessions,public.question_practice_items,public.question_practice_attempts TO authenticated;

CREATE FUNCTION public.question_practice_require_user() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Sign in to practice.';
  END IF;
  RETURN auth.uid();
END;
$$;

-- Private projection: never expose raw row JSON or import evidence, even to the session owner.
CREATE FUNCTION public.question_practice_snapshot(_session_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE s public.question_practice_sessions%ROWTYPE;
BEGIN
  SELECT * INTO s FROM public.question_practice_sessions WHERE id=_session_id AND user_id=public.question_practice_require_user();
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Practice session is not available to your account.'; END IF;
  RETURN jsonb_build_object('id',s.id,'topic_id',s.topic_id,'created_at',s.created_at,'questions',coalesce((
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
CREATE FUNCTION public.get_question_practice(_session_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
  SELECT public.question_practice_snapshot(_session_id);
$$;
CREATE FUNCTION public.list_question_practice_topics() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
BEGIN
  PERFORM public.question_practice_require_user();
  RETURN coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.code) FROM (
    SELECT c.id,c.topic_code AS code,c.title,count(*)::integer AS question_count
    FROM public.questions q JOIN public.question_versions v ON v.id=q.current_version_id AND v.question_id=q.id
    JOIN public.curriculum_topics c ON c.id=v.primary_topic_id
    WHERE q.status='approved' AND v.status='approved' AND v.question_type='mcq_single'
    GROUP BY c.id,c.topic_code,c.title) t),'[]'::jsonb);
END;
$$;
CREATE FUNCTION public.start_question_practice(_session_id uuid,_topic_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE uid uuid:=public.question_practice_require_user(); s public.question_practice_sessions%ROWTYPE; inserted integer;
BEGIN
  IF _session_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Provide a practice session ID.'; END IF;
  IF _topic_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.curriculum_topics WHERE id=_topic_id) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Choose an existing canonical Topic.';
  END IF;
  INSERT INTO public.question_practice_sessions(id,user_id,topic_id) VALUES(_session_id,uid,_topic_id) ON CONFLICT(id) DO NOTHING;
  GET DIAGNOSTICS inserted=ROW_COUNT;
  SELECT * INTO s FROM public.question_practice_sessions WHERE id=_session_id FOR UPDATE;
  IF s.user_id IS DISTINCT FROM uid THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Practice session is not available to your account.'; END IF;
  IF _topic_id IS NOT NULL AND s.topic_id IS DISTINCT FROM _topic_id THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='This session belongs to a different Topic.';
  END IF;
  IF inserted=1 THEN
    -- Locks coordinate with publication/withdrawal; retries retain the originally issued versions.
    INSERT INTO public.question_practice_items(session_id,question_id,version_id,position)
    SELECT s.id,p.id,p.version_id,row_number() OVER(ORDER BY p.id)::smallint FROM (
      SELECT q.id,v.id AS version_id FROM public.questions q
      JOIN public.question_versions v ON v.id=q.current_version_id AND v.question_id=q.id
      WHERE q.status='approved' AND v.status='approved' AND v.question_type='mcq_single'
        AND (s.topic_id IS NULL OR v.primary_topic_id=s.topic_id)
      ORDER BY q.id LIMIT 5 FOR SHARE OF q
    ) p;
  END IF;
  RETURN public.question_practice_snapshot(s.id);
END;
$$;
CREATE FUNCTION public.submit_question_practice(_session_id uuid,_question_id uuid,_option_id uuid,_elapsed_seconds integer DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE uid uuid:=public.question_practice_require_user(); item public.question_practice_items%ROWTYPE;
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
  SELECT * INTO selected FROM public.question_options WHERE id=_option_id AND question_version_id=item.version_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Select a valid option from the issued version.'; END IF;
  IF (SELECT count(*) FROM public.question_options WHERE question_version_id=item.version_id AND is_correct)<>1 THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='The issued version has no unique correct answer.';
  END IF;
  INSERT INTO public.question_practice_attempts(user_id,session_id,question_id,version_id,selected_option_id,is_correct,elapsed_seconds)
    VALUES(uid,item.session_id,item.question_id,item.version_id,selected.id,selected.is_correct,_elapsed_seconds);
  RETURN public.question_practice_snapshot(item.session_id);
END;
$$;
CREATE FUNCTION public.list_question_practice_attempts() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE uid uuid:=public.question_practice_require_user();
BEGIN
  RETURN coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.submitted_at DESC,r.id) FROM (
    SELECT a.id,a.session_id,a.question_id,a.version_id,a.selected_option_id,a.is_correct,a.submitted_at,a.elapsed_seconds,
      t.topic_code AS topic_code,t.title AS topic_title
    FROM public.question_practice_attempts a JOIN public.question_versions v ON v.id=a.version_id
    JOIN public.curriculum_topics t ON t.id=v.primary_topic_id WHERE a.user_id=uid ORDER BY a.submitted_at DESC,a.id LIMIT 10
  ) r),'[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.question_practice_require_user(),public.question_practice_snapshot(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.list_question_practice_topics(),public.start_question_practice(uuid,uuid),public.get_question_practice(uuid),public.submit_question_practice(uuid,uuid,uuid,integer),public.list_question_practice_attempts() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_question_practice_topics(),public.start_question_practice(uuid,uuid),public.get_question_practice(uuid),public.submit_question_practice(uuid,uuid,uuid,integer),public.list_question_practice_attempts() TO authenticated;
COMMENT ON COLUMN public.question_practice_attempts.elapsed_seconds IS 'Untrusted device-reported duration. Never used for grading.';
COMMENT ON TABLE public.question_practice_items IS 'Issued immutable version bindings; an existing session may finish a retained version after revision or withdrawal. New sessions use current approved questions only.';
