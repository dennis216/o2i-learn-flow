-- Production question-bank foundation for educator-reviewed single-answer MCQs.
-- Content uses Markdown with LaTeX delimiters. Approved versions are immutable.

CREATE TYPE public.question_status AS ENUM (
  'draft',
  'approved',
  'retired'
);

CREATE TYPE public.question_version_status AS ENUM (
  'draft',
  'review',
  'approved',
  'superseded'
);

CREATE TYPE public.question_type AS ENUM ('mcq_single');

CREATE TYPE public.question_difficulty AS ENUM (
  'easy',
  'medium',
  'hard'
);

CREATE TYPE public.question_course_scope AS ENUM (
  'AB',
  'BC',
  'BOTH'
);

CREATE TYPE public.question_representation_type AS ENUM (
  'analytical',
  'graphical',
  'numerical',
  'verbal',
  'mixed'
);

CREATE TYPE public.question_calculator_policy AS ENUM (
  'no_calculator',
  'calculator_allowed',
  'calculator_required'
);

CREATE TYPE public.question_source_type AS ENUM (
  'original',
  'licensed',
  'public_domain',
  'permission_granted'
);

CREATE TABLE public.questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text NOT NULL UNIQUE CHECK (btrim(external_id) <> ''),
  status public.question_status NOT NULL DEFAULT 'draft',
  current_version_id uuid,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT questions_lifecycle_pointer_check CHECK (
    (status = 'draft'::public.question_status AND current_version_id IS NULL)
    OR (status = 'approved'::public.question_status AND current_version_id IS NOT NULL)
    OR (status = 'retired'::public.question_status AND current_version_id IS NULL)
  )
);

CREATE TABLE public.question_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  version_number integer NOT NULL CHECK (version_number > 0),
  status public.question_version_status NOT NULL DEFAULT 'draft',
  question_type public.question_type NOT NULL DEFAULT 'mcq_single',
  stem text NOT NULL CHECK (btrim(stem) <> ''),
  solution text NOT NULL CHECK (btrim(solution) <> ''),
  difficulty public.question_difficulty NOT NULL,
  course_scope public.question_course_scope NOT NULL,
  primary_topic_id uuid NOT NULL REFERENCES public.curriculum_topics(id) ON DELETE RESTRICT,
  representation_type public.question_representation_type NOT NULL,
  calculator_policy public.question_calculator_policy NOT NULL,
  source_type public.question_source_type NOT NULL,
  source_document text NOT NULL CHECK (btrim(source_document) <> ''),
  source_page integer NOT NULL CHECK (source_page > 0),
  source_question_number text CHECK (
    source_question_number IS NULL OR btrim(source_question_number) <> ''
  ),
  source_locator text CHECK (
    source_locator IS NULL
    OR source_locator ~ '^p[0-9]{3,}-item[0-9]{2,}$'
  ),
  source_locator_verified boolean NOT NULL DEFAULT false,
  source_reference text,
  requires_figure boolean NOT NULL DEFAULT false,
  image_url text CHECK (image_url IS NULL OR btrim(image_url) <> ''),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT question_versions_question_version_unique
    UNIQUE (question_id, version_number),
  CONSTRAINT question_versions_id_question_unique
    UNIQUE (id, question_id),
  CONSTRAINT question_versions_source_identity_check CHECK (
    NULLIF(btrim(source_question_number), '') IS NOT NULL
    OR NULLIF(btrim(source_locator), '') IS NOT NULL
  ),
  CONSTRAINT question_versions_locator_verification_check CHECK (
    NOT source_locator_verified
    OR NULLIF(btrim(source_locator), '') IS NOT NULL
  ),
  CONSTRAINT question_versions_approval_audit_check CHECK (
    (
      status IN (
        'draft'::public.question_version_status,
        'review'::public.question_version_status
      )
      AND reviewed_by IS NULL
      AND approved_at IS NULL
    )
    OR (
      status IN (
        'approved'::public.question_version_status,
        'superseded'::public.question_version_status
      )
      AND reviewed_by IS NOT NULL
      AND approved_at IS NOT NULL
    )
  )
);

-- Add the circular relation only after both tables exist. The composite key
-- guarantees that a current version belongs to the same question row.
ALTER TABLE public.questions
ADD CONSTRAINT questions_current_version_belongs_to_question
FOREIGN KEY (current_version_id, id)
REFERENCES public.question_versions (id, question_id)
DEFERRABLE INITIALLY IMMEDIATE;

CREATE TABLE public.question_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_version_id uuid NOT NULL
    REFERENCES public.question_versions(id) ON DELETE CASCADE,
  option_key text NOT NULL CHECK (btrim(option_key) <> ''),
  option_text text NOT NULL CHECK (btrim(option_text) <> ''),
  order_index integer NOT NULL CHECK (order_index > 0),
  is_correct boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_version_id, option_key),
  UNIQUE (question_version_id, order_index)
);

-- A single-answer question can never have more than one correct option.
-- The approval validator below additionally requires exactly one.
CREATE UNIQUE INDEX question_options_one_correct_per_version
ON public.question_options (question_version_id)
WHERE is_correct;

CREATE TABLE public.question_practice_skills (
  question_version_id uuid NOT NULL
    REFERENCES public.question_versions(id) ON DELETE CASCADE,
  practice_skill_id uuid NOT NULL
    REFERENCES public.curriculum_practice_skills(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (question_version_id, practice_skill_id)
);

CREATE TABLE public.question_topics (
  question_version_id uuid NOT NULL
    REFERENCES public.question_versions(id) ON DELETE CASCADE,
  topic_id uuid NOT NULL
    REFERENCES public.curriculum_topics(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (question_version_id, topic_id)
);

CREATE TABLE public.misconceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (btrim(code) <> ''),
  name text NOT NULL CHECK (btrim(name) <> ''),
  description text NOT NULL CHECK (btrim(description) <> ''),
  framework_id uuid REFERENCES public.curriculum_frameworks(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.option_misconceptions (
  option_id uuid NOT NULL
    REFERENCES public.question_options(id) ON DELETE CASCADE,
  misconception_id uuid NOT NULL
    REFERENCES public.misconceptions(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (option_id, misconception_id)
);

CREATE TABLE public.question_course_videos (
  question_id uuid NOT NULL
    REFERENCES public.questions(id) ON DELETE CASCADE,
  course_video_id uuid NOT NULL
    REFERENCES public.course_videos(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (question_id, course_video_id)
);

-- UNIQUE constraints already provide indexes for external_id,
-- question_id/version_number, option lookup, and mapping lookup.
CREATE INDEX questions_status_idx
ON public.questions (status);

CREATE INDEX questions_current_version_idx
ON public.questions (current_version_id);

CREATE INDEX question_versions_primary_topic_idx
ON public.question_versions (primary_topic_id);

CREATE INDEX question_versions_status_idx
ON public.question_versions (status);

CREATE UNIQUE INDEX question_versions_one_working_revision
ON public.question_versions (question_id)
WHERE status IN (
  'draft'::public.question_version_status,
  'review'::public.question_version_status
);

CREATE UNIQUE INDEX question_versions_one_approved_version
ON public.question_versions (question_id)
WHERE status = 'approved'::public.question_version_status;

CREATE INDEX question_practice_skills_skill_idx
ON public.question_practice_skills (practice_skill_id);

CREATE INDEX question_topics_topic_idx
ON public.question_topics (topic_id);

CREATE INDEX misconceptions_framework_idx
ON public.misconceptions (framework_id);

CREATE INDEX option_misconceptions_misconception_idx
ON public.option_misconceptions (misconception_id);

CREATE INDEX question_course_videos_video_idx
ON public.question_course_videos (course_video_id);

CREATE TRIGGER update_questions_updated_at
BEFORE UPDATE ON public.questions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_misconceptions_updated_at
BEFORE UPDATE ON public.misconceptions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.validate_question_version_approval(
  _question_id uuid,
  _version_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  version_record public.question_versions%ROWTYPE;
  option_count integer;
  correct_count integer;
BEGIN
  IF _version_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Question approval rejected: version_id is required.';
  END IF;

  SELECT *
  INTO version_record
  FROM public.question_versions
  WHERE id = _version_id
    AND question_id = _question_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Question approval rejected: target version does not exist or belongs to another question.';
  END IF;

  IF version_record.status <> 'review'::public.question_version_status THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Question approval rejected: target version status must be review.';
  END IF;

  IF version_record.question_type <> 'mcq_single'::public.question_type THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Question approval rejected: target version must be mcq_single.';
  END IF;

  IF NULLIF(btrim(version_record.stem), '') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Question approval rejected: stem is required.';
  END IF;

  IF NULLIF(btrim(version_record.solution), '') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Question approval rejected: solution is required.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.curriculum_topics
    WHERE id = version_record.primary_topic_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Question approval rejected: primary curriculum Topic is invalid.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.question_topics
    WHERE question_version_id = version_record.id
      AND topic_id = version_record.primary_topic_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Question approval rejected: the primary Topic cannot also be stored as a secondary Topic.';
  END IF;

  SELECT count(*), count(*) FILTER (WHERE is_correct)
  INTO option_count, correct_count
  FROM public.question_options
  WHERE question_version_id = version_record.id;

  IF option_count < 2 OR option_count > 6 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format(
        'Question approval rejected: mcq_single requires 2-6 options; found %s.',
        option_count
      );
  END IF;

  IF correct_count <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format(
        'Question approval rejected: mcq_single requires exactly one correct option; found %s.',
        correct_count
      );
  END IF;

  IF NULLIF(btrim(version_record.source_document), '') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Question approval rejected: source_document is required.';
  END IF;

  IF version_record.source_page IS NULL OR version_record.source_page <= 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Question approval rejected: source_page must be a positive physical PDF page number.';
  END IF;

  IF NULLIF(btrim(version_record.source_question_number), '') IS NULL
     AND (
       NULLIF(btrim(version_record.source_locator), '') IS NULL
       OR NOT version_record.source_locator_verified
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Question approval rejected: provide a printed source_question_number or a verified source_locator.';
  END IF;

  IF version_record.requires_figure
     AND NULLIF(btrim(version_record.image_url), '') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Question approval rejected: image_url is required when requires_figure is true.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.question_options AS qo
    JOIN public.option_misconceptions AS om
      ON om.option_id = qo.id
    WHERE qo.question_version_id = version_record.id
      AND qo.is_correct
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Question approval rejected: the correct option cannot have a misconception mapping.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_question_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  lifecycle_context text := current_setting('o2i.question_lifecycle', true);
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft'::public.question_status
       OR NEW.current_version_id IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'New questions must begin as draft without a published current version.';
    END IF;

    RETURN NEW;
  END IF;

  IF OLD.status = 'retired'::public.question_status
     AND (
       NEW.status IS DISTINCT FROM OLD.status
       OR NEW.current_version_id IS DISTINCT FROM OLD.current_version_id
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'Retired questions cannot be republished in place.';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.current_version_id IS DISTINCT FROM OLD.current_version_id THEN
    IF lifecycle_context IS DISTINCT FROM 'approve_version'
       AND lifecycle_context IS DISTINCT FROM 'retire_question' THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'Question publication state can only change through a controlled lifecycle function.';
    END IF;
  END IF;

  IF lifecycle_context = 'approve_version' THEN
    IF NEW.status <> 'approved'::public.question_status
       OR NEW.current_version_id IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'Approval must leave the question approved with a current version.';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.question_versions
      WHERE id = NEW.current_version_id
        AND question_id = NEW.id
        AND status = 'approved'::public.question_version_status
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'Question current_version_id must reference its approved version.';
    END IF;
  ELSIF lifecycle_context = 'retire_question' THEN
    IF OLD.status <> 'approved'::public.question_status
       OR NEW.status <> 'retired'::public.question_status
       OR NEW.current_version_id IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'Retirement must hide an approved question and clear its published version pointer.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_question_lifecycle_trigger
BEFORE INSERT OR UPDATE ON public.questions
FOR EACH ROW
EXECUTE FUNCTION public.enforce_question_lifecycle();

CREATE OR REPLACE FUNCTION public.enforce_question_version_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  transition_context text := current_setting('o2i.question_version_transition', true);
  parent_status public.question_status;
  parent_current_version_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft'::public.question_version_status
       OR NEW.reviewed_by IS NOT NULL
       OR NEW.approved_at IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'New question versions must begin as unaudited drafts.';
    END IF;

    SELECT status, current_version_id
    INTO parent_status, parent_current_version_id
    FROM public.questions
    WHERE id = NEW.question_id
    FOR UPDATE;

    IF parent_status = 'retired'::public.question_status THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'Retired questions cannot receive new revisions.';
    END IF;

    IF parent_current_version_id IS NOT NULL
       AND transition_context IS DISTINCT FROM 'create_revision' THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'Use create_question_revision() to add a revision to a published question.';
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft'::public.question_version_status THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'Only draft versions may be deleted.';
    END IF;

    RETURN OLD;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.question_id IS DISTINCT FROM OLD.question_id
     OR NEW.version_number IS DISTINCT FROM OLD.version_number
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'Question-version identity and authorship fields are immutable.';
  END IF;

  IF OLD.status = 'draft'::public.question_version_status THEN
    IF NEW.status = 'draft'::public.question_version_status THEN
      RETURN NEW;
    END IF;

    IF NEW.status = 'review'::public.question_version_status
       AND transition_context = 'submit_review'
       AND (to_jsonb(NEW) - 'status') = (to_jsonb(OLD) - 'status') THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Draft versions can only enter review through submit_question_version_for_review().';
  END IF;

  IF OLD.status = 'review'::public.question_version_status THEN
    IF NEW.status = 'draft'::public.question_version_status
       AND transition_context = 'return_draft'
       AND (to_jsonb(NEW) - 'status') = (to_jsonb(OLD) - 'status') THEN
      RETURN NEW;
    END IF;

    IF NEW.status = 'approved'::public.question_version_status
       AND transition_context = 'approve_version'
       AND (
         to_jsonb(NEW) - ARRAY['status', 'reviewed_by', 'approved_at']
       ) = (
         to_jsonb(OLD) - ARRAY['status', 'reviewed_by', 'approved_at']
       ) THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'Review versions are read-only; explicitly return them to draft before editing.';
  END IF;

  IF OLD.status = 'approved'::public.question_version_status THEN
    IF NEW.status = 'superseded'::public.question_version_status
       AND transition_context IN ('approve_version', 'retire_question')
       AND (to_jsonb(NEW) - 'status') = (to_jsonb(OLD) - 'status') THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'Approved versions are immutable; create a new revision instead.';
  END IF;

  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = 'Superseded versions are immutable historical records.';
END;
$$;

CREATE TRIGGER enforce_question_version_lifecycle_trigger
BEFORE INSERT OR UPDATE OR DELETE ON public.question_versions
FOR EACH ROW
EXECUTE FUNCTION public.enforce_question_version_lifecycle();

CREATE OR REPLACE FUNCTION public.protect_non_draft_version_child()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  version_id uuid;
  version_status public.question_version_status;
BEGIN
  IF TG_OP = 'DELETE' THEN
    version_id := OLD.question_version_id;
  ELSE
    version_id := NEW.question_version_id;
  END IF;

  -- Serialize child writes with revision submission and approval, which lock
  -- this same version row before changing editorial status.
  SELECT status
  INTO version_status
  FROM public.question_versions
  WHERE id = version_id
  FOR UPDATE;

  -- A parent draft-version delete can cascade after the parent row is no
  -- longer visible to this child trigger.
  IF NOT FOUND AND TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  IF version_status IS DISTINCT FROM 'draft'::public.question_version_status THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'Only draft question-version content may be edited.';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_non_draft_question_options
BEFORE INSERT OR UPDATE OR DELETE ON public.question_options
FOR EACH ROW
EXECUTE FUNCTION public.protect_non_draft_version_child();

CREATE TRIGGER protect_non_draft_question_practice_skills
BEFORE INSERT OR UPDATE OR DELETE ON public.question_practice_skills
FOR EACH ROW
EXECUTE FUNCTION public.protect_non_draft_version_child();

CREATE TRIGGER protect_non_draft_question_topics
BEFORE INSERT OR UPDATE OR DELETE ON public.question_topics
FOR EACH ROW
EXECUTE FUNCTION public.protect_non_draft_version_child();

CREATE OR REPLACE FUNCTION public.reject_primary_topic_as_secondary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.question_versions
    WHERE id = NEW.question_version_id
      AND primary_topic_id = NEW.topic_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'question_topics stores secondary Topics only; do not duplicate primary_topic_id.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER reject_primary_topic_as_secondary_trigger
BEFORE INSERT OR UPDATE ON public.question_topics
FOR EACH ROW
EXECUTE FUNCTION public.reject_primary_topic_as_secondary();

CREATE OR REPLACE FUNCTION public.reject_secondary_topic_as_primary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.primary_topic_id IS DISTINCT FROM OLD.primary_topic_id
     AND EXISTS (
       SELECT 1
       FROM public.question_topics
       WHERE question_version_id = NEW.id
         AND topic_id = NEW.primary_topic_id
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'primary_topic_id cannot duplicate an existing secondary Topic mapping.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER reject_secondary_topic_as_primary_trigger
BEFORE UPDATE OF primary_topic_id ON public.question_versions
FOR EACH ROW
EXECUTE FUNCTION public.reject_secondary_topic_as_primary();

CREATE OR REPLACE FUNCTION public.protect_non_draft_option_misconception()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  target_option_id uuid;
  version_status public.question_version_status;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_option_id := OLD.option_id;
  ELSE
    target_option_id := NEW.option_id;
  END IF;

  SELECT qv.status
  INTO version_status
  FROM public.question_options AS qo
  JOIN public.question_versions AS qv
    ON qv.id = qo.question_version_id
  WHERE qo.id = target_option_id
  FOR UPDATE OF qv;

  IF NOT FOUND AND TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  IF version_status IS DISTINCT FROM 'draft'::public.question_version_status THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'Only draft question-version content may be edited.';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_non_draft_option_misconceptions
BEFORE INSERT OR UPDATE OR DELETE ON public.option_misconceptions
FOR EACH ROW
EXECUTE FUNCTION public.protect_non_draft_option_misconception();

CREATE OR REPLACE FUNCTION public.reject_correct_option_misconception()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.question_options
    WHERE id = NEW.option_id
      AND is_correct
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Correct options cannot have misconception mappings.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER reject_correct_option_misconception_trigger
BEFORE INSERT OR UPDATE ON public.option_misconceptions
FOR EACH ROW
EXECUTE FUNCTION public.reject_correct_option_misconception();

CREATE OR REPLACE FUNCTION public.reject_correct_option_with_misconception()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.is_correct
     AND EXISTS (
       SELECT 1
       FROM public.option_misconceptions
       WHERE option_id = NEW.id
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'An option with misconception mappings cannot be marked correct.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER reject_correct_option_with_misconception_trigger
BEFORE UPDATE OF is_correct ON public.question_options
FOR EACH ROW
EXECUTE FUNCTION public.reject_correct_option_with_misconception();

CREATE OR REPLACE FUNCTION public.prevent_approved_question_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF OLD.status IN (
    'approved'::public.question_status,
    'retired'::public.question_status
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'Approved or retired questions must be retained; use retired status instead of hard deletion.';
  END IF;

  RETURN OLD;
END;
$$;

CREATE TRIGGER prevent_approved_question_delete_trigger
BEFORE DELETE ON public.questions
FOR EACH ROW
EXECUTE FUNCTION public.prevent_approved_question_delete();

CREATE OR REPLACE FUNCTION public.assert_question_bank_admin()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Only an authenticated admin or super-admin may manage question revisions.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_question_revision(_question_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  question_record public.questions%ROWTYPE;
  source_version public.question_versions%ROWTYPE;
  new_version_id uuid;
  next_version_number integer;
  previous_transition_context text := current_setting(
    'o2i.question_version_transition',
    true
  );
BEGIN
  PERFORM public.assert_question_bank_admin();

  SELECT *
  INTO question_record
  FROM public.questions
  WHERE id = _question_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'Question revision rejected: question not found.';
  END IF;

  IF question_record.status <> 'approved'::public.question_status
     OR question_record.current_version_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Question revision rejected: an approved published version is required.';
  END IF;

  SELECT *
  INTO source_version
  FROM public.question_versions
  WHERE id = question_record.current_version_id
    AND question_id = question_record.id
    AND status = 'approved'::public.question_version_status
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Question revision rejected: current_version_id is not an approved version of this question.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.question_versions
    WHERE question_id = question_record.id
      AND status IN (
        'draft'::public.question_version_status,
        'review'::public.question_version_status
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'Question revision rejected: this question already has a draft or review version.';
  END IF;

  SELECT COALESCE(max(version_number), 0) + 1
  INTO next_version_number
  FROM public.question_versions
  WHERE question_id = question_record.id;

  PERFORM set_config('o2i.question_version_transition', 'create_revision', true);

  INSERT INTO public.question_versions (
    question_id,
    version_number,
    status,
    question_type,
    stem,
    solution,
    difficulty,
    course_scope,
    primary_topic_id,
    representation_type,
    calculator_policy,
    source_type,
    source_document,
    source_page,
    source_question_number,
    source_locator,
    source_locator_verified,
    source_reference,
    requires_figure,
    image_url,
    created_by
  ) VALUES (
    question_record.id,
    next_version_number,
    'draft'::public.question_version_status,
    source_version.question_type,
    source_version.stem,
    source_version.solution,
    source_version.difficulty,
    source_version.course_scope,
    source_version.primary_topic_id,
    source_version.representation_type,
    source_version.calculator_policy,
    source_version.source_type,
    source_version.source_document,
    source_version.source_page,
    source_version.source_question_number,
    source_version.source_locator,
    source_version.source_locator_verified,
    source_version.source_reference,
    source_version.requires_figure,
    source_version.image_url,
    auth.uid()
  )
  RETURNING id INTO new_version_id;

  INSERT INTO public.question_options (
    question_version_id,
    option_key,
    option_text,
    order_index,
    is_correct
  )
  SELECT
    new_version_id,
    option_key,
    option_text,
    order_index,
    is_correct
  FROM public.question_options
  WHERE question_version_id = source_version.id;

  INSERT INTO public.question_practice_skills (
    question_version_id,
    practice_skill_id
  )
  SELECT new_version_id, practice_skill_id
  FROM public.question_practice_skills
  WHERE question_version_id = source_version.id;

  INSERT INTO public.question_topics (
    question_version_id,
    topic_id
  )
  SELECT new_version_id, topic_id
  FROM public.question_topics
  WHERE question_version_id = source_version.id;

  INSERT INTO public.option_misconceptions (
    option_id,
    misconception_id
  )
  SELECT new_option.id, old_mapping.misconception_id
  FROM public.option_misconceptions AS old_mapping
  JOIN public.question_options AS old_option
    ON old_option.id = old_mapping.option_id
  JOIN public.question_options AS new_option
    ON new_option.question_version_id = new_version_id
   AND new_option.option_key = old_option.option_key
  WHERE old_option.question_version_id = source_version.id;

  PERFORM set_config(
    'o2i.question_version_transition',
    COALESCE(previous_transition_context, ''),
    true
  );

  RETURN new_version_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_question_version_for_review(
  _question_id uuid,
  _version_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  question_record public.questions%ROWTYPE;
  version_status public.question_version_status;
  previous_transition_context text := current_setting(
    'o2i.question_version_transition',
    true
  );
BEGIN
  PERFORM public.assert_question_bank_admin();

  SELECT *
  INTO question_record
  FROM public.questions
  WHERE id = _question_id
  FOR UPDATE;

  IF NOT FOUND OR question_record.status = 'retired'::public.question_status THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Review submission rejected: question is missing or retired.';
  END IF;

  SELECT status
  INTO version_status
  FROM public.question_versions
  WHERE id = _version_id
    AND question_id = _question_id
  FOR UPDATE;

  IF NOT FOUND OR version_status <> 'draft'::public.question_version_status THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Review submission rejected: target must be this question''s draft version.';
  END IF;

  PERFORM set_config('o2i.question_version_transition', 'submit_review', true);

  UPDATE public.question_versions
  SET status = 'review'::public.question_version_status
  WHERE id = _version_id;

  PERFORM set_config(
    'o2i.question_version_transition',
    COALESCE(previous_transition_context, ''),
    true
  );

  RETURN _version_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.return_question_version_to_draft(
  _question_id uuid,
  _version_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  question_record public.questions%ROWTYPE;
  version_status public.question_version_status;
  previous_transition_context text := current_setting(
    'o2i.question_version_transition',
    true
  );
BEGIN
  PERFORM public.assert_question_bank_admin();

  SELECT *
  INTO question_record
  FROM public.questions
  WHERE id = _question_id
  FOR UPDATE;

  IF NOT FOUND OR question_record.status = 'retired'::public.question_status THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Return to draft rejected: question is missing or retired.';
  END IF;

  SELECT status
  INTO version_status
  FROM public.question_versions
  WHERE id = _version_id
    AND question_id = _question_id
  FOR UPDATE;

  IF NOT FOUND OR version_status <> 'review'::public.question_version_status THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Return to draft rejected: target must be this question''s review version.';
  END IF;

  PERFORM set_config('o2i.question_version_transition', 'return_draft', true);

  UPDATE public.question_versions
  SET status = 'draft'::public.question_version_status
  WHERE id = _version_id;

  PERFORM set_config(
    'o2i.question_version_transition',
    COALESCE(previous_transition_context, ''),
    true
  );

  RETURN _version_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_question_version(
  _question_id uuid,
  _version_id uuid
)
RETURNS public.questions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  question_record public.questions%ROWTYPE;
  target_version public.question_versions%ROWTYPE;
  current_version_status public.question_version_status;
  previous_transition_context text := current_setting(
    'o2i.question_version_transition',
    true
  );
  previous_lifecycle_context text := current_setting(
    'o2i.question_lifecycle',
    true
  );
BEGIN
  PERFORM public.assert_question_bank_admin();

  SELECT *
  INTO question_record
  FROM public.questions
  WHERE id = _question_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'Question approval rejected: question not found.';
  END IF;

  IF question_record.status = 'retired'::public.question_status THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'Question approval rejected: retired questions cannot be republished in place.';
  END IF;

  SELECT *
  INTO target_version
  FROM public.question_versions
  WHERE id = _version_id
    AND question_id = question_record.id
  FOR UPDATE;

  IF NOT FOUND OR target_version.status <> 'review'::public.question_version_status THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Question approval rejected: target must be this question''s review version.';
  END IF;

  IF question_record.current_version_id IS NOT NULL THEN
    SELECT status
    INTO current_version_status
    FROM public.question_versions
    WHERE id = question_record.current_version_id
      AND question_id = question_record.id
    FOR UPDATE;

    IF NOT FOUND
       OR current_version_status <> 'approved'::public.question_version_status THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'Question approval rejected: current published version is invalid.';
    END IF;
  ELSIF question_record.status <> 'draft'::public.question_status THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Question approval rejected: only a draft question may receive its first published version.';
  END IF;

  PERFORM public.validate_question_version_approval(
    question_record.id,
    target_version.id
  );

  PERFORM set_config('o2i.question_version_transition', 'approve_version', true);
  PERFORM set_config('o2i.question_lifecycle', 'approve_version', true);

  IF question_record.current_version_id IS NOT NULL THEN
    UPDATE public.question_versions
    SET status = 'superseded'::public.question_version_status
    WHERE id = question_record.current_version_id;
  END IF;

  UPDATE public.question_versions
  SET status = 'approved'::public.question_version_status,
      reviewed_by = auth.uid(),
      approved_at = now()
  WHERE id = target_version.id;

  UPDATE public.questions
  SET status = 'approved'::public.question_status,
      current_version_id = target_version.id
  WHERE id = question_record.id
  RETURNING * INTO question_record;

  PERFORM set_config(
    'o2i.question_version_transition',
    COALESCE(previous_transition_context, ''),
    true
  );
  PERFORM set_config(
    'o2i.question_lifecycle',
    COALESCE(previous_lifecycle_context, ''),
    true
  );

  RETURN question_record;
END;
$$;

CREATE OR REPLACE FUNCTION public.retire_question(_question_id uuid)
RETURNS public.questions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  question_record public.questions%ROWTYPE;
  current_version_status public.question_version_status;
  previous_transition_context text := current_setting(
    'o2i.question_version_transition',
    true
  );
  previous_lifecycle_context text := current_setting(
    'o2i.question_lifecycle',
    true
  );
BEGIN
  PERFORM public.assert_question_bank_admin();

  SELECT *
  INTO question_record
  FROM public.questions
  WHERE id = _question_id
  FOR UPDATE;

  IF NOT FOUND
     OR question_record.status <> 'approved'::public.question_status
     OR question_record.current_version_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Question retirement rejected: an approved published question is required.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.question_versions
    WHERE question_id = question_record.id
      AND status IN (
        'draft'::public.question_version_status,
        'review'::public.question_version_status
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Question retirement rejected: delete or resolve the working revision first.';
  END IF;

  SELECT status
  INTO current_version_status
  FROM public.question_versions
  WHERE id = question_record.current_version_id
    AND question_id = question_record.id
  FOR UPDATE;

  IF NOT FOUND
     OR current_version_status <> 'approved'::public.question_version_status THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Question retirement rejected: current published version is invalid.';
  END IF;

  PERFORM set_config('o2i.question_version_transition', 'retire_question', true);
  PERFORM set_config('o2i.question_lifecycle', 'retire_question', true);

  UPDATE public.question_versions
  SET status = 'superseded'::public.question_version_status
  WHERE id = question_record.current_version_id;

  UPDATE public.questions
  SET status = 'retired'::public.question_status,
      current_version_id = NULL
  WHERE id = question_record.id
  RETURNING * INTO question_record;

  PERFORM set_config(
    'o2i.question_version_transition',
    COALESCE(previous_transition_context, ''),
    true
  );
  PERFORM set_config(
    'o2i.question_lifecycle',
    COALESCE(previous_lifecycle_context, ''),
    true
  );

  RETURN question_record;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_question_version_approval(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_question_lifecycle() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_question_version_lifecycle() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_non_draft_version_child() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_non_draft_option_misconception() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_primary_topic_as_secondary() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_secondary_topic_as_primary() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_correct_option_misconception() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_correct_option_with_misconception() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_approved_question_delete() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_question_bank_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_question_revision(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_question_version_for_review(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.return_question_version_to_draft(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_question_version(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.retire_question(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_question_revision(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_question_version_for_review(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.return_question_version_to_draft(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_question_version(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.retire_question(uuid) TO authenticated;

ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_practice_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.misconceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.option_misconceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_course_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage questions"
ON public.questions
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Authenticated users read approved questions"
ON public.questions
FOR SELECT
TO authenticated
USING (status = 'approved'::public.question_status);

CREATE POLICY "Admins manage question versions"
ON public.question_versions
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Authenticated users read current approved versions"
ON public.question_versions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.questions AS q
    WHERE q.id = question_versions.question_id
      AND q.status = 'approved'::public.question_status
      AND q.current_version_id = question_versions.id
      AND question_versions.status = 'approved'::public.question_version_status
  )
);

CREATE POLICY "Admins manage question options"
ON public.question_options
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Authenticated users read approved question options"
ON public.question_options
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.question_versions AS qv
    JOIN public.questions AS q
      ON q.id = qv.question_id
    WHERE qv.id = question_options.question_version_id
      AND q.status = 'approved'::public.question_status
      AND q.current_version_id = qv.id
      AND qv.status = 'approved'::public.question_version_status
  )
);

CREATE POLICY "Admins manage question practice skills"
ON public.question_practice_skills
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Authenticated users read approved question practice skills"
ON public.question_practice_skills
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.question_versions AS qv
    JOIN public.questions AS q
      ON q.id = qv.question_id
    WHERE qv.id = question_practice_skills.question_version_id
      AND q.status = 'approved'::public.question_status
      AND q.current_version_id = qv.id
      AND qv.status = 'approved'::public.question_version_status
  )
);

CREATE POLICY "Admins manage secondary question topics"
ON public.question_topics
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Authenticated users read approved secondary question topics"
ON public.question_topics
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.question_versions AS qv
    JOIN public.questions AS q
      ON q.id = qv.question_id
    WHERE qv.id = question_topics.question_version_id
      AND q.status = 'approved'::public.question_status
      AND q.current_version_id = qv.id
      AND qv.status = 'approved'::public.question_version_status
  )
);

CREATE POLICY "Admins manage misconceptions"
ON public.misconceptions
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Authenticated users read misconceptions for approved questions"
ON public.misconceptions
FOR SELECT
TO authenticated
USING (
  is_active
  AND EXISTS (
    SELECT 1
    FROM public.option_misconceptions AS om
    JOIN public.question_options AS qo
      ON qo.id = om.option_id
    JOIN public.question_versions AS qv
      ON qv.id = qo.question_version_id
    JOIN public.questions AS q
      ON q.id = qv.question_id
    WHERE om.misconception_id = misconceptions.id
      AND q.status = 'approved'::public.question_status
      AND q.current_version_id = qv.id
      AND qv.status = 'approved'::public.question_version_status
  )
);

CREATE POLICY "Admins manage option misconceptions"
ON public.option_misconceptions
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Authenticated users read approved option misconceptions"
ON public.option_misconceptions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.question_options AS qo
    JOIN public.question_versions AS qv
      ON qv.id = qo.question_version_id
    JOIN public.questions AS q
      ON q.id = qv.question_id
    WHERE qo.id = option_misconceptions.option_id
      AND q.status = 'approved'::public.question_status
      AND q.current_version_id = qv.id
      AND qv.status = 'approved'::public.question_version_status
  )
);

CREATE POLICY "Admins manage question course videos"
ON public.question_course_videos
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Authenticated users read approved question course videos"
ON public.question_course_videos
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.questions AS q
    WHERE q.id = question_course_videos.question_id
      AND q.status = 'approved'::public.question_status
  )
);

COMMENT ON TABLE public.questions IS
  'Stable question identities and publication lifecycle. current_version_id is the published approved version and is null for draft or retired questions.';
COMMENT ON TABLE public.question_versions IS
  'Versioned Markdown/LaTeX content, provenance, and taxonomy. Only drafts are editable; approved and superseded versions are immutable history.';
COMMENT ON COLUMN public.question_versions.status IS
  'Editorial state. One draft/review working revision is allowed while the current approved version remains published.';
COMMENT ON COLUMN public.question_versions.source_page IS
  'Positive physical PDF page number, not a printed book page number.';
COMMENT ON COLUMN public.question_versions.source_question_number IS
  'Only a question number actually printed in the source; never an O2I-generated locator.';
COMMENT ON COLUMN public.question_versions.source_locator IS
  'Deterministic O2I tracking metadata for an unnumbered source item, e.g. p012-item03.';
COMMENT ON COLUMN public.question_versions.source_locator_verified IS
  'Human confirmation that source_locator uniquely identifies the source question.';
COMMENT ON TABLE public.question_topics IS
  'Secondary CED Topic mappings only; primary Topic is question_versions.primary_topic_id.';
COMMENT ON TABLE public.option_misconceptions IS
  'Controlled mappings for wrong options. Database triggers reject correct-option mappings; application validation must reject them too.';
COMMENT ON TABLE public.question_course_videos IS
  'Optional placement after course videos; not a replacement for canonical CED Topic classification.';
COMMENT ON FUNCTION public.create_question_revision(uuid) IS
  'Admin-only revision creation. Clones the current approved version into one editable draft without changing publication.';
COMMENT ON FUNCTION public.submit_question_version_for_review(uuid, uuid) IS
  'Admin-only draft-to-review transition. Review content is read-only until explicitly returned to draft.';
COMMENT ON FUNCTION public.return_question_version_to_draft(uuid, uuid) IS
  'Admin-only review-to-draft transition used when edits are required.';
COMMENT ON FUNCTION public.approve_question_version(uuid, uuid) IS
  'Admin-only atomic publication switch. Supersedes the previous approved version and records reviewer metadata on the target version.';
COMMENT ON FUNCTION public.retire_question(uuid) IS
  'Admin-only retirement. Hides the question, clears its publication pointer, and retains immutable version history.';
