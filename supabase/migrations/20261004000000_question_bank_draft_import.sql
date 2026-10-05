-- Task 3B: atomic, admin-only XLSX intake into unpublished first-version drafts.
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
