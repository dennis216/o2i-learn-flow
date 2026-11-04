-- Limit Arena: the question bank stays on the server.
-- Clients never read these tables. They get one question at a time, without
-- its answer, and only see the answer and explanation after submitting.
-- Question rows are imported separately and must never be added to this repo.

CREATE TABLE public.arena_questions (
  id text PRIMARY KEY,
  unit smallint NOT NULL CHECK (unit BETWEEN 1 AND 10),
  tier smallint NOT NULL CHECK (tier BETWEEN 1 AND 3),
  topic text NOT NULL,
  stem text NOT NULL,
  -- options->0 is the correct answer; arena_next_question shuffles before sending.
  options jsonb NOT NULL CHECK (jsonb_typeof(options) = 'array' AND jsonb_array_length(options) = 4),
  explanation text NOT NULL,
  graph jsonb,
  table_html text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.arena_question_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  run_id uuid NOT NULL,
  question_id text NOT NULL REFERENCES public.arena_questions(id) ON DELETE CASCADE,
  -- option_order[n + 1] is the stored option shown at display position n.
  option_order smallint[] NOT NULL CHECK (cardinality(option_order) = 4),
  issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  selected_index smallint CHECK (selected_index BETWEEN 0 AND 3),
  is_correct boolean,
  answered_at timestamptz
);

CREATE INDEX arena_questions_unit_tier_idx ON public.arena_questions(unit, tier) WHERE active;
CREATE INDEX arena_question_issues_user_time_idx ON public.arena_question_issues(user_id, issued_at DESC);
CREATE INDEX arena_question_issues_user_question_idx ON public.arena_question_issues(user_id, question_id, issued_at DESC);

-- RLS with no policies, plus revoked grants: direct table access is refused for
-- anon and authenticated. Supabase grants new public tables to both by default.
ALTER TABLE public.arena_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arena_question_issues ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.arena_questions, public.arena_question_issues FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.arena_questions TO service_role;

CREATE FUNCTION public.arena_catalog() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sign in to play.'; END IF;
  RETURN jsonb_build_object('counts', coalesce((
    SELECT jsonb_object_agg(c.unit, c.total)
    FROM (SELECT unit, count(*) AS total FROM public.arena_questions WHERE active GROUP BY unit) c
  ), '{}'::jsonb));
END;
$$;

CREATE FUNCTION public.arena_next_question(
  _run_id uuid,
  _units integer[],
  _current_unit integer,
  _tier integer,
  _prefer_current boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  per_minute constant integer := 30;
  per_day constant integer := 300;
  last_minute integer;
  last_day integer;
  chosen public.arena_questions%ROWTYPE;
  shuffled smallint[];
  new_issue uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sign in to play.'; END IF;
  IF _run_id IS NULL OR _units IS NULL OR cardinality(_units) NOT BETWEEN 1 AND 10
     OR EXISTS (SELECT 1 FROM unnest(_units) u WHERE u IS NULL OR u NOT BETWEEN 1 AND 10)
     OR _tier IS NULL OR _tier NOT BETWEEN 1 AND 3 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid question request.';
  END IF;

  -- Serialize one account so concurrent requests cannot slip past the limits.
  PERFORM pg_advisory_xact_lock(hashtextextended('arena:' || uid::text, 0));
  SELECT count(*) FILTER (WHERE issued_at > clock_timestamp() - interval '1 minute'), count(*)
    INTO last_minute, last_day
    FROM public.arena_question_issues
    WHERE user_id = uid AND issued_at > clock_timestamp() - interval '1 day';
  IF last_minute >= per_minute OR last_day >= per_day THEN
    RETURN jsonb_build_object('status', 'rate_limited');
  END IF;

  -- Not yet seen this run, then the requested tier, then the current unit,
  -- then whatever this account has gone longest without seeing.
  SELECT q.* INTO chosen
  FROM public.arena_questions q
  LEFT JOIN LATERAL (
    SELECT max(i.issued_at) AS last_issued, bool_or(i.run_id = _run_id) AS in_run
    FROM public.arena_question_issues i
    WHERE i.user_id = uid AND i.question_id = q.id
  ) seen ON true
  WHERE q.active AND q.unit = ANY(_units)
  ORDER BY coalesce(seen.in_run, false),
    q.tier <> _tier,
    (coalesce(_prefer_current, false) AND q.unit IS DISTINCT FROM _current_unit),
    seen.last_issued ASC NULLS FIRST,
    random()
  LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'empty'); END IF;

  SELECT array_agg(n::smallint ORDER BY random()) INTO shuffled FROM generate_series(0, 3) n;
  INSERT INTO public.arena_question_issues(user_id, run_id, question_id, option_order)
    VALUES (uid, _run_id, chosen.id, shuffled)
    RETURNING id INTO new_issue;

  RETURN jsonb_build_object(
    'status', 'ok',
    'issue_id', new_issue,
    'unit', chosen.unit,
    'tier', chosen.tier,
    'topic', chosen.topic,
    'stem', chosen.stem,
    'opts', (SELECT jsonb_agg(chosen.options -> o.stored::integer ORDER BY o.position)
             FROM unnest(shuffled) WITH ORDINALITY o(stored, position)),
    'graph', chosen.graph,
    'table', chosen.table_html
  );
END;
$$;

CREATE FUNCTION public.arena_submit_answer(_issue_id uuid, _selected integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  issue public.arena_question_issues%ROWTYPE;
  solution text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sign in to play.'; END IF;
  IF _selected IS NULL OR _selected NOT BETWEEN 0 AND 3 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Choose one of the four options.';
  END IF;

  SELECT * INTO issue FROM public.arena_question_issues
    WHERE id = _issue_id AND user_id = uid FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not_found'); END IF;

  -- The first answer is final: retries return it, so options cannot be probed.
  IF issue.answered_at IS NULL THEN
    UPDATE public.arena_question_issues
      SET selected_index = _selected,
          is_correct = option_order[_selected + 1] = 0,
          answered_at = clock_timestamp()
      WHERE id = issue.id
      RETURNING * INTO issue;
  END IF;

  SELECT explanation INTO solution FROM public.arena_questions WHERE id = issue.question_id;
  RETURN jsonb_build_object(
    'status', 'ok',
    'correct', issue.is_correct,
    'correct_index', array_position(issue.option_order, 0::smallint) - 1,
    'explanation', solution
  );
END;
$$;

REVOKE ALL ON FUNCTION public.arena_catalog() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.arena_next_question(uuid, integer[], integer, integer, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.arena_submit_answer(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.arena_catalog() TO authenticated;
GRANT EXECUTE ON FUNCTION public.arena_next_question(uuid, integer[], integer, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.arena_submit_answer(uuid, integer) TO authenticated;
