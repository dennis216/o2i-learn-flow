-- O2I production question-bank release package. Generated; do not edit migration bodies.
-- TARGET: lxoaeaewcrshjkigzyqe. This comment DOES NOT verify the connection.
-- Run the WHOLE file once in that project's Dashboard SQL Editor as postgres.
-- BLOCKED BY DEFAULT: confirm target + ledger evidence and explicitly accept no-full-backup risk.
-- No full backup exists. Atomic rollback protects pre-commit failure, NOT post-commit recovery.
-- No taxonomy, roles initialization, test fixtures, content import, or frontend deployment.
-- 20260926000000_question_bank_foundation.sql SHA256 e73b10c65d1d79283b548f693c517b57b2de1f5448a9d1d6cfbaf456d9cfe212
-- 20261004000000_question_bank_draft_import.sql SHA256 6fb4b1df0d9dc182d37bea38efadf496de1bcc6ca7cc957b1f9738ef2bc02b34
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
SET LOCAL search_path = public, extensions;

DO $o2i_release$
DECLARE
  -- Edit ONLY these gates in the SQL Editor copy, after the separate evidence review.
  confirmed_dashboard_project text := ''; -- must be lxoaeaewcrshjkigzyqe; manual attestation only
  accept_no_full_backup_risk boolean := false; -- explicit acceptance; NOT proof of backup or recovery
  production_ledger_evidence_confirmed boolean := false; -- requires 00_ledger_preflight_readonly.sql result
  foundation_sql constant text := $o2i_source$-- Production question-bank foundation for educator-reviewed single-answer MCQs.
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
$o2i_source$;
  draft_import_sql constant text := $o2i_source$-- Task 3B: atomic, admin-only XLSX intake into unpublished first-version drafts.
-- Unknown editorial facts remain NULL. Existing approved history stays immutable.

ALTER TABLE public.question_versions
  ALTER COLUMN calculator_policy DROP NOT NULL,
  ALTER COLUMN source_type DROP NOT NULL,
  ADD COLUMN import_evidence jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(import_evidence) = 'object');

ALTER TABLE public.question_options
  ADD COLUMN import_evidence jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(import_evidence) = 'object');

ALTER TABLE public.question_versions
  ADD CONSTRAINT question_versions_published_metadata_required CHECK (
    status NOT IN (
      'approved'::public.question_version_status,
      'superseded'::public.question_version_status
    ) OR (calculator_policy IS NOT NULL AND source_type IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION public.require_question_publication_metadata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.status = 'approved'::public.question_version_status
     AND (NEW.calculator_policy IS NULL OR NEW.source_type IS NULL) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Question approval rejected: calculator_policy and source_type must be established before publication.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER require_question_publication_metadata_trigger
BEFORE INSERT OR UPDATE ON public.question_versions
FOR EACH ROW
EXECUTE FUNCTION public.require_question_publication_metadata();

-- Keep import evidence when an approved version is cloned for a later revision.
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
  previous_transition_context text := current_setting('o2i.question_version_transition', true);
BEGIN
  PERFORM public.assert_question_bank_admin();

  SELECT * INTO question_record
  FROM public.questions WHERE id = _question_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Question revision rejected: question not found.';
  END IF;
  IF question_record.status <> 'approved'::public.question_status
     OR question_record.current_version_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Question revision rejected: an approved published version is required.';
  END IF;

  SELECT * INTO source_version FROM public.question_versions
  WHERE id = question_record.current_version_id AND question_id = question_record.id
    AND status = 'approved'::public.question_version_status FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Question revision rejected: current_version_id is not an approved version of this question.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.question_versions WHERE question_id = question_record.id
      AND status IN ('draft'::public.question_version_status, 'review'::public.question_version_status)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23505',
      MESSAGE = 'Question revision rejected: this question already has a draft or review version.';
  END IF;

  SELECT COALESCE(max(version_number), 0) + 1 INTO next_version_number
  FROM public.question_versions WHERE question_id = question_record.id;
  PERFORM set_config('o2i.question_version_transition', 'create_revision', true);

  INSERT INTO public.question_versions (
    question_id, version_number, status, question_type, stem, solution,
    difficulty, course_scope, primary_topic_id, representation_type,
    calculator_policy, source_type, source_document, source_page,
    source_question_number, source_locator, source_locator_verified,
    source_reference, requires_figure, image_url, import_evidence, created_by
  ) VALUES (
    question_record.id, next_version_number, 'draft'::public.question_version_status,
    source_version.question_type, source_version.stem, source_version.solution,
    source_version.difficulty, source_version.course_scope, source_version.primary_topic_id,
    source_version.representation_type, source_version.calculator_policy,
    source_version.source_type, source_version.source_document, source_version.source_page,
    source_version.source_question_number, source_version.source_locator,
    source_version.source_locator_verified, source_version.source_reference,
    source_version.requires_figure, source_version.image_url,
    source_version.import_evidence, auth.uid()
  ) RETURNING id INTO new_version_id;

  INSERT INTO public.question_options (
    question_version_id, option_key, option_text, order_index, is_correct, import_evidence
  )
  SELECT new_version_id, option_key, option_text, order_index, is_correct, import_evidence
  FROM public.question_options WHERE question_version_id = source_version.id;

  INSERT INTO public.question_practice_skills (question_version_id, practice_skill_id)
  SELECT new_version_id, practice_skill_id
  FROM public.question_practice_skills WHERE question_version_id = source_version.id;

  INSERT INTO public.question_topics (question_version_id, topic_id)
  SELECT new_version_id, topic_id
  FROM public.question_topics WHERE question_version_id = source_version.id;

  INSERT INTO public.option_misconceptions (option_id, misconception_id)
  SELECT new_option.id, old_mapping.misconception_id
  FROM public.option_misconceptions AS old_mapping
  JOIN public.question_options AS old_option ON old_option.id = old_mapping.option_id
  JOIN public.question_options AS new_option
    ON new_option.question_version_id = new_version_id
   AND new_option.option_key = old_option.option_key
  WHERE old_option.question_version_id = source_version.id;

  PERFORM set_config('o2i.question_version_transition', COALESCE(previous_transition_context, ''), true);
  RETURN new_version_id;
END;
$$;

-- One RPC call is one PostgreSQL transaction. Any raised error rolls back the
-- entire batch; the browser never writes individual question-bank tables.
CREATE OR REPLACE FUNCTION public.save_question_bank_drafts(_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  item jsonb;
  option_item jsonb;
  skill_code_value text;
  item_number integer := 0;
  external_id_value text;
  source_document_value text;
  source_page_text text;
  source_page_start integer;
  source_page_end integer;
  printed_number text;
  locator text;
  topic_id_value uuid;
  skill_id_value uuid;
  question_id_value uuid;
  version_id_value uuid;
  option_count integer;
  correct_count integer;
  option_number integer;
  saved jsonb := '[]'::jsonb;
BEGIN
  PERFORM public.assert_question_bank_admin();
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array'
     OR jsonb_array_length(_items) < 1 OR jsonb_array_length(_items) > 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'Draft save rejected: expected an array of 1-100 questions.';
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(_items) LOOP
    item_number := item_number + 1;
    external_id_value := NULLIF(btrim(item->>'external_id'), '');
    IF external_id_value IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = format('Draft save rejected at item %s: external_id is required.', item_number);
    END IF;
    IF EXISTS (SELECT 1 FROM public.questions WHERE external_id = external_id_value) THEN
      RAISE EXCEPTION USING ERRCODE = '23505',
        MESSAGE = format('Draft save rejected at item %s (%s): external_id already exists.', item_number, external_id_value);
    END IF;
    IF NULLIF(btrim(item->>'stem'), '') IS NULL OR NULLIF(btrim(item->>'solution'), '') IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = format('Draft save rejected at item %s (%s): stem and solution are required.', item_number, external_id_value);
    END IF;

    source_document_value := NULLIF(item->>'source_document', '');
    source_page_text := item->>'source_page';
    IF source_document_value IS NULL OR btrim(source_document_value) = ''
       OR source_document_value !~* '\.pdf$'
       OR source_page_text IS NULL OR source_page_text !~ '^[0-9]+(-[0-9]+)?$' THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = format('Draft save rejected at item %s (%s): source_document PDF and physical source_page are required.', item_number, external_id_value);
    END IF;
    source_page_start := split_part(source_page_text, '-', 1)::integer;
    source_page_end := COALESCE(NULLIF(split_part(source_page_text, '-', 2), '')::integer, source_page_start);
    IF source_page_start < 1 OR source_page_end < source_page_start THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = format('Draft save rejected at item %s (%s): source_page range is invalid.', item_number, external_id_value);
    END IF;
    printed_number := NULLIF(btrim(item->>'source_question_number'), '');
    locator := NULLIF(btrim(item->>'source_locator'), '');
    IF printed_number IS NULL AND locator IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = format('Draft save rejected at item %s (%s): printed question number or source_locator is required.', item_number, external_id_value);
    END IF;
    IF locator IS NOT NULL AND (locator !~ '^p[0-9]{3,}-item[0-9]{2,}$'
        OR substring(locator from '^p([0-9]+)-')::integer <> source_page_start) THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = format('Draft save rejected at item %s (%s): source_locator does not match the physical page.', item_number, external_id_value);
    END IF;

    SELECT id INTO topic_id_value FROM public.curriculum_topics
    WHERE topic_code = item->>'primary_topic_code';
    IF topic_id_value IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = format('Draft save rejected at item %s (%s): primary_topic_code is not canonical.', item_number, external_id_value);
    END IF;
    IF jsonb_typeof(item->'practice_skill_codes') IS DISTINCT FROM 'array'
       OR jsonb_array_length(item->'practice_skill_codes') = 0 THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = format('Draft save rejected at item %s (%s): practice_skill_codes are required.', item_number, external_id_value);
    END IF;
    IF jsonb_typeof(item->'requires_figure') IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = format('Draft save rejected at item %s (%s): requires_figure must be boolean.', item_number, external_id_value);
    END IF;
    IF item->>'requires_figure' = 'true' AND NULLIF(btrim(item->>'image_url'), '') IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = format('Draft save rejected at item %s (%s): figure requires image_url.', item_number, external_id_value);
    END IF;
    IF jsonb_typeof(item->'import_evidence') IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = format('Draft save rejected at item %s (%s): import_evidence must be an object.', item_number, external_id_value);
    END IF;
    IF jsonb_typeof(item->'options') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = format('Draft save rejected at item %s (%s): options must be an array.', item_number, external_id_value);
    END IF;
    option_count := jsonb_array_length(item->'options');
    IF option_count < 2 OR option_count > 6 THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = format('Draft save rejected at item %s (%s): 2-6 options are required.', item_number, external_id_value);
    END IF;
    SELECT count(*) INTO correct_count
    FROM jsonb_array_elements(item->'options') AS option_row(value)
    WHERE jsonb_typeof(value->'is_correct') = 'boolean' AND value->>'is_correct' = 'true';
    IF correct_count <> 1 THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = format('Draft save rejected at item %s (%s): exactly one correct option is required.', item_number, external_id_value);
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(item->'options') AS option_row(value)
      WHERE value->>'is_correct' = 'true'
        AND value->>'option_key' = item->>'correct_option_key'
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = format('Draft save rejected at item %s (%s): correct_option_key does not match the true option.', item_number, external_id_value);
    END IF;

    INSERT INTO public.questions (external_id, status, current_version_id, created_by)
    VALUES (external_id_value, 'draft'::public.question_status, NULL, auth.uid())
    RETURNING id INTO question_id_value;

    INSERT INTO public.question_versions (
      question_id, version_number, status, question_type, stem, solution,
      difficulty, course_scope, primary_topic_id, representation_type,
      calculator_policy, source_type, source_document, source_page,
      source_question_number, source_locator, source_locator_verified,
      source_reference, requires_figure, image_url, import_evidence, created_by
    ) VALUES (
      question_id_value, 1, 'draft'::public.question_version_status,
      'mcq_single'::public.question_type, item->>'stem', item->>'solution',
      (item->>'difficulty')::public.question_difficulty,
      (item->>'course_scope')::public.question_course_scope,
      topic_id_value, (item->>'representation_type')::public.question_representation_type,
      NULLIF(item->>'calculator_policy', '')::public.question_calculator_policy,
      NULL, source_document_value, source_page_start, printed_number, locator,
      false, CASE WHEN source_page_end > source_page_start THEN source_page_text ELSE NULL END,
      (item->>'requires_figure')::boolean, NULLIF(item->>'image_url', ''),
      item->'import_evidence', auth.uid()
    ) RETURNING id INTO version_id_value;

    option_number := 0;
    FOR option_item IN SELECT value FROM jsonb_array_elements(item->'options') LOOP
      option_number := option_number + 1;
      IF NULLIF(btrim(option_item->>'option_key'), '') IS NULL
         OR NULLIF(btrim(option_item->>'option_text'), '') IS NULL
         OR jsonb_typeof(option_item->'is_correct') IS DISTINCT FROM 'boolean'
         OR jsonb_typeof(option_item->'import_evidence') IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
          MESSAGE = format('Draft save rejected at item %s (%s), option %s: invalid choice or evidence.', item_number, external_id_value, option_number);
      END IF;
      INSERT INTO public.question_options (
        question_version_id, option_key, option_text, order_index, is_correct, import_evidence
      ) VALUES (
        version_id_value, option_item->>'option_key', option_item->>'option_text',
        option_number, (option_item->>'is_correct')::boolean, option_item->'import_evidence'
      );
    END LOOP;

    FOR skill_code_value IN SELECT value FROM jsonb_array_elements_text(item->'practice_skill_codes') LOOP
      SELECT id INTO skill_id_value FROM public.curriculum_practice_skills
      WHERE curriculum_practice_skills.skill_code = skill_code_value;
      IF skill_id_value IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
          MESSAGE = format('Draft save rejected at item %s (%s): unknown practice skill %s.', item_number, external_id_value, skill_code_value);
      END IF;
      INSERT INTO public.question_practice_skills (question_version_id, practice_skill_id)
      VALUES (version_id_value, skill_id_value);
    END LOOP;

    saved := saved || jsonb_build_array(jsonb_build_object(
      'external_id', external_id_value, 'question_id', question_id_value,
      'version_id', version_id_value
    ));
  END LOOP;
  RETURN saved;
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION USING
    ERRCODE = SQLSTATE,
    MESSAGE = format('Draft save failed at item %s (%s): %s',
      item_number, COALESCE(external_id_value, 'unknown external_id'), SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.require_question_publication_metadata() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_question_bank_drafts(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_question_bank_drafts(jsonb) TO authenticated;

COMMENT ON FUNCTION public.save_question_bank_drafts(jsonb) IS
  'Admin-only atomic first-version draft intake. Never approves or publishes XLSX content; failures roll back the whole batch.';
$o2i_source$;
  catalog_report jsonb;
  dependency text;
  actual_columns jsonb;
BEGIN
  IF confirmed_dashboard_project <> 'lxoaeaewcrshjkigzyqe' OR NOT production_ledger_evidence_confirmed THEN
    RAISE EXCEPTION 'STOP: confirm Dashboard target and production ledger evidence first.';
  END IF;
  IF accept_no_full_backup_risk IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'STOP: explicitly accept the no-full-backup risk; a transaction does not provide post-commit recovery.';
  END IF;
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'STOP: this package was reviewed for SQL Editor postgres execution only.';
  END IF;
  IF NOT pg_try_advisory_xact_lock(20260926, 20261004) THEN
    RAISE EXCEPTION 'STOP: another copy of this release is running.';
  END IF;
  IF to_regclass('supabase_migrations.schema_migrations') IS NULL THEN
    RAISE EXCEPTION 'STOP: migration ledger missing; do not create or guess its structure.';
  END IF;
  -- Exact six-column production shape confirmed by the user's readonly metadata.
  SELECT jsonb_agg(jsonb_build_array(a.attname, format_type(a.atttypid,a.atttypmod), a.attnotnull)
    ORDER BY a.attname) INTO actual_columns FROM pg_attribute a
  WHERE a.attrelid = 'supabase_migrations.schema_migrations'::regclass
    AND a.attnum > 0 AND NOT a.attisdropped;
  IF actual_columns IS DISTINCT FROM
    '[ ["created_by","text",false], ["idempotency_key","text",false], ["name","text",false],
       ["rollback","text[]",false], ["statements","text[]",false], ["version","text",true] ]'::jsonb
    OR EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'supabase_migrations.schema_migrations'::regclass
      AND attnum > 0 AND NOT attisdropped AND (attidentity <> '' OR attgenerated <> ''))
    OR EXISTS (SELECT 1 FROM pg_attrdef WHERE adrelid = 'supabase_migrations.schema_migrations'::regclass)
    OR (SELECT relrowsecurity FROM pg_class WHERE oid = 'supabase_migrations.schema_migrations'::regclass)
    OR EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'supabase_migrations.schema_migrations'::regclass AND NOT tgisinternal)
    OR (SELECT count(*) FROM pg_constraint WHERE conrelid = 'supabase_migrations.schema_migrations'::regclass) <> 2
    OR NOT EXISTS (SELECT 1 FROM pg_constraint c
      JOIN pg_index i ON i.indexrelid = c.conindid
      WHERE c.conrelid = 'supabase_migrations.schema_migrations'::regclass AND c.contype = 'p'
        AND c.conname = 'schema_migrations_pkey' AND c.convalidated
        AND NOT c.condeferrable AND NOT c.condeferred
        AND i.indisprimary AND i.indisunique AND i.indisvalid AND i.indisready
        AND i.indnatts = 1 AND i.indpred IS NULL AND i.indexprs IS NULL
        AND c.conkey = ARRAY[(SELECT attnum FROM pg_attribute
          WHERE attrelid = c.conrelid AND attname = 'version')]::smallint[])
    OR NOT EXISTS (SELECT 1 FROM pg_constraint c
      JOIN pg_index i ON i.indexrelid = c.conindid
      WHERE c.conrelid = 'supabase_migrations.schema_migrations'::regclass AND c.contype = 'u'
        AND c.conname = 'schema_migrations_idempotency_key_key' AND c.convalidated
        AND NOT c.condeferrable AND NOT c.condeferred
        AND i.indisunique AND i.indisvalid AND i.indisready AND NOT i.indnullsnotdistinct
        AND i.indnatts = 1 AND i.indpred IS NULL AND i.indexprs IS NULL
        AND c.conkey = ARRAY[(SELECT attnum FROM pg_attribute
          WHERE attrelid = c.conrelid AND attname = 'idempotency_key')]::smallint[])
    OR NOT (has_table_privilege(current_user, 'supabase_migrations.schema_migrations', 'SELECT')
      AND has_table_privilege(current_user, 'supabase_migrations.schema_migrations', 'INSERT')) THEN
    RAISE EXCEPTION 'STOP: ledger shape/access differs from the supported, reviewed shape. Return readonly metadata; do not bypass.';
  END IF;
  LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version IN ('20260926000000','20261004000000')) THEN
    RAISE EXCEPTION 'STOP: one or both target migrations are already recorded. No repeat or partial deployment.';
  END IF;
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations
    WHERE version IN ('20260920000000','20260920010000')) <> 2 THEN
    RAISE EXCEPTION 'STOP: required roles/taxonomy migration records are missing; do not replay them with this package.';
  END IF;
  FOREACH dependency IN ARRAY ARRAY['questions', 'question_versions', 'question_options', 'question_practice_skills', 'question_topics', 'misconceptions', 'option_misconceptions', 'question_course_videos'] LOOP
    IF to_regclass('public.' || dependency) IS NOT NULL THEN
      RAISE EXCEPTION 'STOP: public.% already exists; investigate partial deployment.', dependency;
    END IF;
  END LOOP;
  FOREACH dependency IN ARRAY ARRAY['question_status', 'question_version_status', 'question_type', 'question_difficulty', 'question_course_scope', 'question_representation_type', 'question_calculator_policy', 'question_source_type'] LOOP
    IF to_regtype('public.' || dependency) IS NOT NULL THEN
      RAISE EXCEPTION 'STOP: public.% type already exists; investigate partial deployment.', dependency;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('validate_question_version_approval', 'enforce_question_lifecycle', 'enforce_question_version_lifecycle', 'protect_non_draft_version_child', 'reject_primary_topic_as_secondary', 'reject_secondary_topic_as_primary', 'protect_non_draft_option_misconception', 'reject_correct_option_misconception', 'reject_correct_option_with_misconception', 'prevent_approved_question_delete', 'assert_question_bank_admin', 'create_question_revision', 'submit_question_version_for_review', 'return_question_version_to_draft', 'approve_question_version', 'retire_question', 'require_question_publication_metadata', 'save_question_bank_drafts')) THEN
    RAISE EXCEPTION 'STOP: question-bank function already exists; investigate partial deployment.';
  END IF;
  FOREACH dependency IN ARRAY ARRAY['auth.users','public.user_roles','public.courses','public.course_videos',
    'public.curriculum_frameworks','public.curriculum_units','public.curriculum_topics',
    'public.curriculum_practices','public.curriculum_practice_skills','public.practice_problems'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = to_regclass(dependency) AND relkind = 'r') THEN
      RAISE EXCEPTION 'STOP: required existing table % missing.', dependency;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'extensions')
    OR to_regprocedure('auth.uid()') IS NULL OR to_regprocedure('auth.role()') IS NULL
    OR to_regprocedure('gen_random_uuid()') IS NULL
    OR (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon','authenticated')) <> 2
    OR (SELECT count(*) FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
      JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='app_role'
        AND e.enumlabel IN ('admin','super_admin','student','instructor')) <> 4 THEN
    RAISE EXCEPTION 'STOP: auth, UUID, role, or schema dependencies are incomplete.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('public.has_role(uuid, public.app_role)', 'b6a4c82ad51a3997410a4bc37975e05f', true),
      ('public.is_super_admin(uuid)', 'debcc4a5a880088e40f8ad55ed073614', true),
      ('public.update_updated_at_column()', 'a3a8dcc15e232b73d3f5c4abfa43f3d8', false)
    ) e(signature, body_hash, definer) LEFT JOIN pg_proc p ON p.oid = to_regprocedure(e.signature)
    WHERE p.oid IS NULL OR p.prosecdef IS DISTINCT FROM e.definer
      OR md5(regexp_replace(p.prosrc,'[[:space:]]','','g')) IS DISTINCT FROM e.body_hash
  ) THEN
    RAISE EXCEPTION 'STOP: required role/updated_at function differs from the reviewed repository.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.curriculum_topics)
    OR NOT EXISTS (SELECT 1 FROM public.curriculum_practice_skills) THEN
    RAISE EXCEPTION 'STOP: canonical Topic/Skill catalogs are empty.';
  END IF;

  EXECUTE foundation_sql;
  EXECUTE draft_import_sql;

  WITH expected_tables(name) AS (VALUES
  ('questions'),
  ('question_versions'),
  ('question_options'),
  ('question_practice_skills'),
  ('question_topics'),
  ('misconceptions'),
  ('option_misconceptions'),
  ('question_course_videos')
), expected_functions(signature, body_hash, definer, return_type, argument_names) AS (VALUES
  ('public.validate_question_version_approval(uuid, uuid)', '45e5ed7585026f55e810f1acbff94555', true, 'void', ARRAY['_question_id','_version_id']::text[]),
  ('public.enforce_question_lifecycle()', 'e7f8d34ac2492a1fce7ead5f73f0880b', true, 'trigger', ARRAY[]::text[]),
  ('public.enforce_question_version_lifecycle()', 'a3f8b115a46fb425640cf19b711c2a6b', true, 'trigger', ARRAY[]::text[]),
  ('public.protect_non_draft_version_child()', '8dfd627fabeea7d88246b510fc517281', true, 'trigger', ARRAY[]::text[]),
  ('public.reject_primary_topic_as_secondary()', '053c04d309b2ab4aa4bcc7532a0db15d', true, 'trigger', ARRAY[]::text[]),
  ('public.reject_secondary_topic_as_primary()', '9f4a112bf6c5eaaddce2b32204769e70', true, 'trigger', ARRAY[]::text[]),
  ('public.protect_non_draft_option_misconception()', '450724421924aa5c21e59bb630e8c30d', true, 'trigger', ARRAY[]::text[]),
  ('public.reject_correct_option_misconception()', '371661c1cadf945a79258e4ed6022cdb', true, 'trigger', ARRAY[]::text[]),
  ('public.reject_correct_option_with_misconception()', '944bc1bcb25c7826990ff62301ac783a', true, 'trigger', ARRAY[]::text[]),
  ('public.prevent_approved_question_delete()', '2a812c2c0af81b72a6be75a3fade01c0', true, 'trigger', ARRAY[]::text[]),
  ('public.assert_question_bank_admin()', 'db723134f0718668986d106b6689e375', true, 'void', ARRAY[]::text[]),
  ('public.create_question_revision(uuid)', 'acc2690cba4c5c3087b12297248631ec', true, 'uuid', ARRAY['_question_id']::text[]),
  ('public.submit_question_version_for_review(uuid, uuid)', '1658956fe0598859003c1cd2a52c0206', true, 'uuid', ARRAY['_question_id','_version_id']::text[]),
  ('public.return_question_version_to_draft(uuid, uuid)', 'b09dac9c077364e28425ffaa395ca755', true, 'uuid', ARRAY['_question_id','_version_id']::text[]),
  ('public.approve_question_version(uuid, uuid)', '030241308b6522d7a8cd77d3531f8a7a', true, 'public.questions', ARRAY['_question_id','_version_id']::text[]),
  ('public.retire_question(uuid)', 'f077f74c363cfdf03586961e1d143abb', true, 'public.questions', ARRAY['_question_id']::text[]),
  ('public.require_question_publication_metadata()', '476ca3529520281ee087e914932c8d9d', true, 'trigger', ARRAY[]::text[]),
  ('public.save_question_bank_drafts(jsonb)', '17ac2a83f0fd26e59a11e0c12c803390', true, 'jsonb', ARRAY['_items']::text[])
), expected_policies(table_name, name, command) AS (VALUES
  ('questions', 'Admins manage questions', '*'),
  ('questions', 'Authenticated users read approved questions', 'r'),
  ('question_versions', 'Admins manage question versions', '*'),
  ('question_versions', 'Authenticated users read current approved versions', 'r'),
  ('question_options', 'Admins manage question options', '*'),
  ('question_options', 'Authenticated users read approved question options', 'r'),
  ('question_practice_skills', 'Admins manage question practice skills', '*'),
  ('question_practice_skills', 'Authenticated users read approved question practice skills', 'r'),
  ('question_topics', 'Admins manage secondary question topics', '*'),
  ('question_topics', 'Authenticated users read approved secondary question topics', 'r'),
  ('misconceptions', 'Admins manage misconceptions', '*'),
  ('misconceptions', 'Authenticated users read misconceptions for approved questions', 'r'),
  ('option_misconceptions', 'Admins manage option misconceptions', '*'),
  ('option_misconceptions', 'Authenticated users read approved option misconceptions', 'r'),
  ('question_course_videos', 'Admins manage question course videos', '*'),
  ('question_course_videos', 'Authenticated users read approved question course videos', 'r')
), expected_triggers(table_name, name, signature) AS (VALUES
  ('questions', 'update_questions_updated_at', 'public.update_updated_at_column()'),
  ('misconceptions', 'update_misconceptions_updated_at', 'public.update_updated_at_column()'),
  ('questions', 'enforce_question_lifecycle_trigger', 'public.enforce_question_lifecycle()'),
  ('question_versions', 'enforce_question_version_lifecycle_trigger', 'public.enforce_question_version_lifecycle()'),
  ('question_options', 'protect_non_draft_question_options', 'public.protect_non_draft_version_child()'),
  ('question_practice_skills', 'protect_non_draft_question_practice_skills', 'public.protect_non_draft_version_child()'),
  ('question_topics', 'protect_non_draft_question_topics', 'public.protect_non_draft_version_child()'),
  ('question_topics', 'reject_primary_topic_as_secondary_trigger', 'public.reject_primary_topic_as_secondary()'),
  ('question_versions', 'reject_secondary_topic_as_primary_trigger', 'public.reject_secondary_topic_as_primary()'),
  ('option_misconceptions', 'protect_non_draft_option_misconceptions', 'public.protect_non_draft_option_misconception()'),
  ('option_misconceptions', 'reject_correct_option_misconception_trigger', 'public.reject_correct_option_misconception()'),
  ('question_options', 'reject_correct_option_with_misconception_trigger', 'public.reject_correct_option_with_misconception()'),
  ('questions', 'prevent_approved_question_delete_trigger', 'public.prevent_approved_question_delete()'),
  ('question_versions', 'require_question_publication_metadata_trigger', 'public.require_question_publication_metadata()')
), table_checks AS (
  SELECT e.name, c.oid, c.relrowsecurity,
    c.relkind = 'r' AND c.relrowsecurity
      AND has_schema_privilege('authenticated', 'public', 'USAGE')
      AND (SELECT bool_and(has_table_privilege('authenticated', c.oid, privilege))
        FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) privilege)
      AND (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) = 2
      AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid
        AND p.polroles <> ARRAY[(SELECT oid FROM pg_roles WHERE rolname = 'authenticated')])
      AS ok
  FROM expected_tables e LEFT JOIN pg_class c ON c.oid = to_regclass('public.' || e.name)
), function_checks AS (
  SELECT e.signature, p.oid IS NOT NULL AS exists,
    p.prosecdef = e.definer AND p.prorettype = to_regtype(e.return_type)
      AND COALESCE(p.proargnames, ARRAY[]::text[]) = e.argument_names
      AND md5(regexp_replace(p.prosrc, '[[:space:]]', '', 'g')) = e.body_hash
      AND 'search_path=public, extensions' = ANY(p.proconfig) AS ok,
    has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute
  FROM expected_functions e LEFT JOIN pg_proc p ON p.oid = to_regprocedure(e.signature)
), policy_checks AS (
  SELECT e.table_name, e.name,
    p.polcmd::text = e.command AND p.polpermissive
      AND p.polroles = ARRAY[(SELECT oid FROM pg_roles WHERE rolname = 'authenticated')] AS ok,
    pg_get_expr(p.polqual, p.polrelid) AS using_expression,
    pg_get_expr(p.polwithcheck, p.polrelid) AS check_expression
  FROM expected_policies e LEFT JOIN pg_policy p
    ON p.polrelid = to_regclass('public.' || e.table_name) AND p.polname = e.name
), trigger_checks AS (
  SELECT e.table_name, e.name,
    t.tgfoid = to_regprocedure(e.signature) AND t.tgenabled = 'O' AS ok
  FROM expected_triggers e LEFT JOIN pg_trigger t
    ON t.tgrelid = to_regclass('public.' || e.table_name) AND t.tgname = e.name
), key_constraints(name, table_name, kind, keys) AS (VALUES
  ('questions_current_version_belongs_to_question', 'questions', 'f', ARRAY['current_version_id','id']),
  ('question_versions_question_version_unique', 'question_versions', 'u', ARRAY['question_id','version_number']),
  ('question_versions_id_question_unique', 'question_versions', 'u', ARRAY['id','question_id']),
  ('question_versions_source_identity_check', 'question_versions', 'c', NULL),
  ('question_versions_approval_audit_check', 'question_versions', 'c', NULL),
  ('question_versions_published_metadata_required', 'question_versions', 'c', NULL),
  ('questions_lifecycle_pointer_check', 'questions', 'c', NULL)
), constraint_checks AS (
  SELECT e.name, c.contype::text = e.kind AND c.convalidated
    AND (e.keys IS NULL OR e.keys = ARRAY(SELECT a.attname::text
      FROM unnest(c.conkey) WITH ORDINALITY k(attnum, ord)
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum ORDER BY k.ord))
    AND (e.kind <> 'f' OR (c.confrelid = to_regclass('public.question_versions')
      AND c.condeferrable AND ARRAY['id','question_id'] = ARRAY(SELECT a.attname::text
        FROM unnest(c.confkey) WITH ORDINALITY k(attnum, ord)
        JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.attnum ORDER BY k.ord))) AS ok
  FROM key_constraints e LEFT JOIN pg_constraint c
    ON c.conrelid = to_regclass('public.' || e.table_name) AND c.conname = e.name
), index_checks AS (
  SELECT n.name, i.indisunique AND i.indisvalid AND i.indpred IS NOT NULL AS ok,
    pg_get_indexdef(i.indexrelid) AS definition
  FROM (VALUES ('question_options_one_correct_per_version'),
    ('question_versions_one_working_revision'), ('question_versions_one_approved_version')) n(name)
  LEFT JOIN pg_index i ON i.indexrelid = to_regclass('public.' || n.name)
), column_checks AS (
  SELECT e.table_name, e.name,
    a.attnotnull = e.not_null AND format_type(a.atttypid, a.atttypmod) = e.type AS ok,
    pg_get_expr(d.adbin, d.adrelid) AS default_expression
  FROM (VALUES
    ('question_versions','calculator_policy','question_calculator_policy',false),
    ('question_versions','source_type','question_source_type',false),
    ('question_versions','import_evidence','jsonb',true),
    ('question_options','import_evidence','jsonb',true),
    ('question_versions','source_page','integer',true),
    ('question_versions','source_question_number','text',false),
    ('question_versions','source_locator','text',false),
    ('questions','status','question_status',true),
    ('question_versions','status','question_version_status',true)
  ) e(table_name,name,type,not_null)
  LEFT JOIN pg_attribute a ON a.attrelid = to_regclass('public.' || e.table_name)
    AND a.attname = e.name AND a.attnum > 0 AND NOT a.attisdropped
  LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
), rpc_checks AS (
  SELECT bool_and(COALESCE(has_function_privilege('authenticated', to_regprocedure(signature), 'EXECUTE'), false)) AS authenticated_execute,
    NOT COALESCE(has_function_privilege('anon', to_regprocedure('public.save_question_bank_drafts(jsonb)'), 'EXECUTE'), true) AS anon_save_denied
  FROM (VALUES ('public.save_question_bank_drafts(jsonb)'), ('public.create_question_revision(uuid)'),
    ('public.submit_question_version_for_review(uuid, uuid)'), ('public.return_question_version_to_draft(uuid, uuid)'),
    ('public.approve_question_version(uuid, uuid)'), ('public.retire_question(uuid)')) r(signature)
)
SELECT jsonb_build_object(
  'all_catalog_checks_pass',
    (SELECT bool_and(COALESCE(ok,false)) FROM table_checks)
    AND (SELECT bool_and(COALESCE(ok,false)) FROM function_checks)
    AND (SELECT bool_and(COALESCE(ok,false)) FROM policy_checks)
    AND (SELECT bool_and(COALESCE(ok,false)) FROM trigger_checks)
    AND (SELECT bool_and(COALESCE(ok,false)) FROM constraint_checks)
    AND (SELECT bool_and(COALESCE(ok,false)) FROM index_checks)
    AND (SELECT bool_and(COALESCE(ok,false)) FROM column_checks)
    AND (SELECT authenticated_execute AND anon_save_denied FROM rpc_checks),
  'tables', (SELECT jsonb_agg(to_jsonb(t) - 'oid') FROM table_checks t),
  'functions', (SELECT jsonb_agg(to_jsonb(f)) FROM function_checks f),
  'policies', (SELECT jsonb_agg(to_jsonb(p)) FROM policy_checks p),
  'triggers', (SELECT jsonb_agg(to_jsonb(t)) FROM trigger_checks t),
  'key_constraints', (SELECT jsonb_agg(to_jsonb(c)) FROM constraint_checks c),
  'partial_indexes', (SELECT jsonb_agg(to_jsonb(i)) FROM index_checks i),
  'draft_columns', (SELECT jsonb_agg(to_jsonb(c)) FROM column_checks c),
  'rpc_grants', (SELECT to_jsonb(r) FROM rpc_checks r),
  'all_constraints', (SELECT jsonb_agg(jsonb_build_object('table', e.name,
    'name', c.conname, 'definition', pg_get_constraintdef(c.oid)))
    FROM expected_tables e JOIN pg_constraint c ON c.conrelid = to_regclass('public.' || e.name)),
  'warning', 'Catalog checks are NOT an administrator session, REST cache, or real XLSX acceptance test.'
) INTO catalog_report;
  IF NOT COALESCE((catalog_report->>'all_catalog_checks_pass')::boolean, false) THEN
    RAISE EXCEPTION 'STOP: post-DDL catalog verification failed; both migrations will roll back.';
  END IF;
  -- Only now record success, still INSIDE the same transaction as both migrations.
  -- No ON CONFLICT, no repair of unrelated ledger versions.
  -- Leave optional created_by, idempotency_key, rollback NULL; invent no audit facts.
  INSERT INTO supabase_migrations.schema_migrations(version, name, statements) VALUES
    ('20260926000000','question_bank_foundation',ARRAY[foundation_sql]),
    ('20261004000000','question_bank_draft_import',ARRAY[draft_import_sql]);
END;
$o2i_release$;
COMMIT;
-- Do not infer success from an isolated statement. Require no errors AND file 20 verification.
