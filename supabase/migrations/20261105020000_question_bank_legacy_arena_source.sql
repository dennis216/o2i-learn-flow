-- Verified legacy Arena provenance uses the existing evidence object. No new version columns,
-- no historical row updates, and no invalidation of existing PDF review fingerprints.
CREATE FUNCTION public.question_bank_legacy_arena_source(_evidence jsonb,_external_id text DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions SET timezone='UTC' AS $$
 SELECT coalesce(jsonb_typeof(_evidence->'legacy_arena')='object'
  AND jsonb_typeof(_evidence->'legacy_arena'->'source_id')='string'
  AND (_evidence->'legacy_arena'->>'source_sha256') ~ '^[a-f0-9]{64}$'
  AND nullif(btrim(_evidence->'legacy_arena'->>'batch_id'),'') IS NOT NULL
  AND nullif(btrim(_evidence->'legacy_arena'->>'conversion_version'),'') IS NOT NULL
  AND (_external_id IS NULL OR _external_id='arena_legacy_'||(_evidence->'legacy_arena'->>'source_id'))
  AND EXISTS(SELECT 1 FROM public.arena_questions q WHERE q.id=_evidence->'legacy_arena'->>'source_id'
   AND encode(extensions.digest(to_jsonb(q)::text,'sha256'),'hex')=_evidence->'legacy_arena'->>'source_sha256'),false);
$$;
REVOKE ALL ON FUNCTION public.question_bank_legacy_arena_source(jsonb,text) FROM PUBLIC,anon,authenticated;

ALTER TABLE public.question_versions ALTER COLUMN source_page DROP NOT NULL;
ALTER TABLE public.question_versions DROP CONSTRAINT question_versions_source_identity_check;
ALTER TABLE public.question_versions ADD CONSTRAINT question_versions_source_identity_check CHECK (
 nullif(btrim(source_question_number),'') IS NOT NULL OR nullif(btrim(source_locator),'') IS NOT NULL
 OR (import_evidence ? 'legacy_arena' AND public.question_bank_legacy_arena_source(import_evidence)));
ALTER TABLE public.question_versions ADD CONSTRAINT question_versions_source_page_kind CHECK (
 CASE WHEN import_evidence ? 'legacy_arena' THEN source_page IS NULL
  AND source_document='Legacy Arena bank' AND source_question_number IS NULL AND source_locator IS NULL
  AND source_reference IS NOT DISTINCT FROM 'arena:'||(import_evidence->'legacy_arena'->>'source_id')
  AND public.question_bank_legacy_arena_source(import_evidence)
 ELSE source_page IS NOT NULL AND source_page>0 END);

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

    IF item->'import_evidence' ? 'legacy_arena' THEN
      IF NOT public.question_bank_legacy_arena_source(item->'import_evidence',external_id_value)
       OR item->>'source_document' IS DISTINCT FROM 'Legacy Arena bank'
       OR nullif(item->>'source_page','') IS NOT NULL
       OR nullif(item->>'source_question_number','') IS NOT NULL
       OR nullif(item->>'source_locator','') IS NOT NULL THEN
        RAISE EXCEPTION 'Draft save rejected: invalid or changed legacy Arena source.' USING ERRCODE='23514';
      END IF;
      source_document_value:='Legacy Arena bank';source_page_start:=NULL;source_page_end:=NULL;
      printed_number:=NULL;locator:=NULL;
    ELSE
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
      false, CASE WHEN item->'import_evidence' ? 'legacy_arena' THEN 'arena:'||(item->'import_evidence'->'legacy_arena'->>'source_id') WHEN source_page_end > source_page_start THEN source_page_text ELSE NULL END,
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

CREATE OR REPLACE FUNCTION public.update_question_bank_draft_metadata(
  _question_id uuid, _version_id uuid, _expected_fingerprint text, _metadata jsonb
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  q public.questions%ROWTYPE; v public.question_versions%ROWTYPE;
  target_topic_id uuid; skill_ids uuid[]; codes text[]; page_start integer; page_end integer;
  page_text text; locator text; before_values jsonb; after_values jsonb; changed_fields text[];
  gates jsonb; audit jsonb; old_evidence jsonb; next_reference text;
BEGIN
  PERFORM public.assert_question_bank_admin();
  SELECT * INTO q FROM public.questions WHERE id = _question_id FOR UPDATE;
  IF NOT FOUND OR q.status = 'retired' THEN
    RAISE EXCEPTION 'Draft update rejected: question is missing or retired.' USING ERRCODE = '55000';
  END IF;
  SELECT * INTO v FROM public.question_versions WHERE id = _version_id AND question_id = q.id FOR UPDATE;
  IF NOT FOUND OR v.status <> 'draft' OR q.current_version_id = v.id THEN
    RAISE EXCEPTION 'Draft update rejected: only an unpublished draft is editable; return review versions to draft first.' USING ERRCODE = '55000';
  END IF;
  IF _expected_fingerprint IS DISTINCT FROM public.question_bank_draft_fingerprint(q.id, v.id) THEN
    RAISE EXCEPTION 'Draft changed since it was opened. Reload before saving; your changes have not been written.' USING ERRCODE = '40001';
  END IF;
  IF _metadata IS NULL OR jsonb_typeof(_metadata) <> 'object'
    OR (SELECT count(*) FROM jsonb_object_keys(_metadata)) <> 8
    OR NOT _metadata ?& ARRAY['difficulty','calculator_policy','course_scope','representation_type',
      'primary_topic_code','practice_skill_codes','source_page','source_locator']
    OR EXISTS (SELECT 1 FROM jsonb_each(_metadata) e WHERE e.key NOT IN ('calculator_policy','source_locator','practice_skill_codes','source_page')
      AND jsonb_typeof(e.value) <> 'string')
    OR jsonb_typeof(_metadata->'calculator_policy') NOT IN ('string','null')
    OR jsonb_typeof(_metadata->'source_locator') NOT IN ('string','null')
    OR jsonb_typeof(_metadata->'source_page') NOT IN ('string','null') THEN
    RAISE EXCEPTION 'Draft update rejected: only the eight allowed metadata fields may be supplied.' USING ERRCODE = '22023';
  END IF;
  -- Enum casts reject unknown/blank required values, never supply invented defaults.
  IF (_metadata->>'difficulty')::public.question_difficulty IS NULL
    OR (_metadata->>'course_scope')::public.question_course_scope IS NULL
    OR (_metadata->>'representation_type')::public.question_representation_type IS NULL THEN
    RAISE EXCEPTION 'Draft update rejected: required controlled metadata is missing.' USING ERRCODE = '23514';
  END IF;
  PERFORM NULLIF(_metadata->>'calculator_policy','')::public.question_calculator_policy;
  SELECT id INTO target_topic_id FROM public.curriculum_topics WHERE topic_code = _metadata->>'primary_topic_code' FOR KEY SHARE;
  IF target_topic_id IS NULL THEN
    RAISE EXCEPTION 'Draft update rejected: primary_topic_code is not canonical.' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public.question_topics WHERE question_version_id = v.id AND question_topics.topic_id = target_topic_id) THEN
    RAISE EXCEPTION 'Draft update rejected: primary Topic is already a secondary Topic; resolve that mapping separately.' USING ERRCODE = '23514';
  END IF;
  IF jsonb_typeof(_metadata->'practice_skill_codes') IS DISTINCT FROM 'array'
    OR jsonb_array_length(_metadata->'practice_skill_codes') = 0
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(_metadata->'practice_skill_codes') c WHERE jsonb_typeof(c) <> 'string') THEN
    RAISE EXCEPTION 'Draft update rejected: canonical Practice Skills are required.' USING ERRCODE = '23514';
  END IF;
  SELECT array_agg(code ORDER BY code) INTO codes FROM jsonb_array_elements_text(_metadata->'practice_skill_codes') code;
  IF cardinality(codes) <> (SELECT count(DISTINCT c) FROM unnest(codes) c) THEN
    RAISE EXCEPTION 'Draft update rejected: duplicate Practice Skill codes.' USING ERRCODE = '23514';
  END IF;
  PERFORM 1 FROM public.curriculum_practice_skills WHERE skill_code = ANY(codes) ORDER BY id FOR KEY SHARE;
  SELECT array_agg(id ORDER BY id) INTO skill_ids FROM public.curriculum_practice_skills WHERE skill_code = ANY(codes);
  IF coalesce(cardinality(skill_ids),0) <> cardinality(codes) THEN
    RAISE EXCEPTION 'Draft update rejected: a Practice Skill code is not canonical.' USING ERRCODE = '23514';
  END IF;
  IF v.import_evidence ? 'legacy_arena' THEN
    IF NOT public.question_bank_legacy_arena_source(v.import_evidence,q.external_id)
      OR nullif(_metadata->>'source_page','') IS NOT NULL OR nullif(_metadata->>'source_locator','') IS NOT NULL THEN
      RAISE EXCEPTION 'Draft update rejected: legacy Arena provenance is read-only or changed.' USING ERRCODE='23514';
    END IF;
    page_start:=NULL;page_end:=NULL;page_text:=NULL;locator:=NULL;
  ELSE
  page_text := _metadata->>'source_page';
  IF page_text IS NULL OR page_text !~ '^[0-9]+(-[0-9]+)?$' THEN
    RAISE EXCEPTION 'Draft update rejected: invalid physical PDF page or page range.' USING ERRCODE = '23514';
  END IF;
  page_start := split_part(page_text,'-',1)::integer;
  page_end := coalesce(nullif(split_part(page_text,'-',2),'')::integer,page_start);
  IF page_start < 1 OR page_end < page_start THEN
    RAISE EXCEPTION 'Draft update rejected: physical PDF pages must be positive and ordered.' USING ERRCODE = '23514';
  END IF;
  locator := nullif(_metadata->>'source_locator','');
  IF locator IS NOT NULL AND (locator !~ '^p[0-9]{3,}-item[0-9]{2,}$'
    OR substring(locator FROM '^p([0-9]+)-')::integer <> page_start) THEN
    RAISE EXCEPTION 'Draft update rejected: source_locator must match the first physical PDF page.' USING ERRCODE = '23514';
  END IF;
  IF v.source_question_number IS NULL AND locator IS NULL THEN
    RAISE EXCEPTION 'Draft update rejected: an unnumbered question requires source_locator.' USING ERRCODE = '23514';
  END IF;
  END IF;
  before_values := jsonb_build_object('difficulty',v.difficulty,'calculator_policy',v.calculator_policy,
    'course_scope',v.course_scope,'representation_type',v.representation_type,
    'primary_topic_code',(SELECT topic_code FROM public.curriculum_topics WHERE id=v.primary_topic_id),
    'practice_skill_codes',(SELECT coalesce(jsonb_agg(s.skill_code ORDER BY s.skill_code),'[]')
      FROM public.question_practice_skills m JOIN public.curriculum_practice_skills s ON s.id=m.practice_skill_id WHERE m.question_version_id=v.id),
    'source_page',CASE WHEN v.source_reference ~ '^[0-9]+-[0-9]+$'
      AND split_part(v.source_reference,'-',1)::integer=v.source_page THEN v.source_reference ELSE v.source_page::text END,
    'source_locator',v.source_locator);
  after_values := _metadata || jsonb_build_object('calculator_policy',nullif(_metadata->>'calculator_policy',''),
    'source_locator',locator,'practice_skill_codes',to_jsonb(codes));
  SELECT array_agg(key ORDER BY key) INTO changed_fields FROM jsonb_each(after_values) e
    WHERE e.value IS DISTINCT FROM before_values->e.key;
  IF changed_fields IS NULL THEN RETURN v.id; END IF;
  old_evidence := v.import_evidence;
  IF (old_evidence ? 'metadata_edits' AND jsonb_typeof(old_evidence->'metadata_edits') <> 'array')
    OR (old_evidence ? 'review_gates' AND jsonb_typeof(old_evidence->'review_gates') <> 'object') THEN
    RAISE EXCEPTION 'Draft update rejected: existing review/audit evidence has an unexpected format.' USING ERRCODE = '23514';
  END IF;
  gates := coalesce(old_evidence->'review_gates','{}');
  IF changed_fields && ARRAY['primary_topic_code','practice_skill_codes','course_scope','representation_type','difficulty'] THEN
    gates := gates || '{"taxonomy_review_status":"pending"}'::jsonb;
  END IF;
  IF changed_fields && ARRAY['difficulty','calculator_policy','course_scope','representation_type'] THEN
    gates := gates || '{"math_review_status":"pending"}'::jsonb;
  END IF;
  IF changed_fields && ARRAY['source_page','source_locator'] THEN
    gates := gates || '{"source_rights_status":"pending","render_review_status":"pending"}'::jsonb;
  END IF;
  -- source_reference may contain unrelated provenance: retain it unless it was the old page-range encoding.
  next_reference := CASE WHEN page_end > page_start THEN page_text
    WHEN v.source_reference ~ '^[0-9]+-[0-9]+$' AND split_part(v.source_reference,'-',1)::integer=v.source_page THEN NULL
    ELSE v.source_reference END;
  audit := jsonb_build_object('actor_id',auth.uid(),'at',clock_timestamp(),'before',before_values,'after',after_values,
    'version_id',v.id,'human_review_status_before',old_evidence->'human_review_status','human_review_status_after','pending',
    'source_locator_verified_before',v.source_locator_verified,
    'source_locator_verified_after',CASE WHEN changed_fields && ARRAY['source_page','source_locator'] THEN false ELSE v.source_locator_verified END,
    'source_reference_before',v.source_reference,'source_reference_after',next_reference,
    'review_gates_before',old_evidence->'review_gates','review_gates_after',gates);
  UPDATE public.question_versions SET difficulty=(_metadata->>'difficulty')::public.question_difficulty,
    calculator_policy=nullif(_metadata->>'calculator_policy','')::public.question_calculator_policy,
    course_scope=(_metadata->>'course_scope')::public.question_course_scope,
    representation_type=(_metadata->>'representation_type')::public.question_representation_type,
    primary_topic_id=target_topic_id,source_page=page_start,source_reference=next_reference,source_locator=locator,
    source_locator_verified=CASE WHEN changed_fields && ARRAY['source_page','source_locator'] THEN false ELSE v.source_locator_verified END,
    import_evidence=old_evidence || jsonb_build_object(
      'original_import_evidence',coalesce(old_evidence->'original_import_evidence',old_evidence),
      'metadata_edits',coalesce(old_evidence->'metadata_edits','[]') || jsonb_build_array(audit),
      'human_review_status','pending','review_gates',gates)
    WHERE id=v.id;
  -- Preserve unchanged mappings (and their timestamps); only change the intended set.
  DELETE FROM public.question_practice_skills WHERE question_version_id=v.id AND NOT practice_skill_id=ANY(skill_ids);
  INSERT INTO public.question_practice_skills(question_version_id,practice_skill_id)
    SELECT v.id, id FROM unnest(skill_ids) id ON CONFLICT DO NOTHING;
  RETURN v.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.question_bank_content_issues(_question_id uuid,_version_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE v public.question_versions%ROWTYPE; issues jsonb:='[]'; n integer; correct integer;
BEGIN
  SELECT * INTO v FROM public.question_versions WHERE id=_version_id AND question_id=_question_id;
  IF NOT FOUND THEN RETURN jsonb_build_array(jsonb_build_object('code','QB_VERSION_MISMATCH','field','version_id','message','Select a version belonging to this question.')); END IF;
  IF v.question_type<>'mcq_single' OR btrim(v.stem)='' OR btrim(v.solution)='' THEN
    issues:=issues||jsonb_build_array(jsonb_build_object('code','QB_CONTENT_REQUIRED','field','stem','message','A single-answer MCQ needs a non-empty stem and solution.'));
  END IF;
  SELECT count(*),count(*) FILTER(WHERE is_correct) INTO n,correct FROM public.question_options WHERE question_version_id=v.id;
  IF n NOT BETWEEN 2 AND 6 THEN issues:=issues||jsonb_build_array(jsonb_build_object('code','QB_OPTION_COUNT','field','options','message','Provide 2–6 options.')); END IF;
  IF correct<>1 THEN issues:=issues||jsonb_build_array(jsonb_build_object('code','QB_CORRECT_COUNT','field','options','message','Exactly one option must be correct.')); END IF;
  IF NOT EXISTS(SELECT 1 FROM public.curriculum_topics WHERE id=v.primary_topic_id)
    OR EXISTS(SELECT 1 FROM public.question_topics WHERE question_version_id=v.id AND topic_id=v.primary_topic_id)
    OR NOT EXISTS(SELECT 1 FROM public.question_practice_skills WHERE question_version_id=v.id) THEN
    issues:=issues||jsonb_build_array(jsonb_build_object('code','QB_TAXONOMY','field','primary_topic_id','message','Provide a canonical primary Topic and at least one Practice Skill; primary and secondary Topics must differ.'));
  END IF;
  IF v.import_evidence ? 'legacy_arena' THEN
    IF NOT public.question_bank_legacy_arena_source(v.import_evidence,(SELECT external_id FROM public.questions WHERE id=_question_id))
      OR v.source_document<>'Legacy Arena bank' OR v.source_page IS NOT NULL
      OR v.source_question_number IS NOT NULL OR v.source_locator IS NOT NULL
      OR v.source_reference IS DISTINCT FROM 'arena:'||(v.import_evidence->'legacy_arena'->>'source_id') THEN
      issues:=issues||jsonb_build_array(jsonb_build_object('code','QB_LEGACY_SOURCE','field','source_document','message','The legacy Arena source changed or is incomplete.'));
    END IF;
  ELSE
  IF btrim(v.source_document)='' OR v.source_document !~* '\.pdf$' OR v.source_page<1 THEN
    issues:=issues||jsonb_build_array(jsonb_build_object('code','QB_SOURCE_REQUIRED','field','source_document','message','Provide the source PDF filename and a positive physical PDF page.'));
  END IF;
  IF v.source_locator IS NOT NULL AND (v.source_locator !~ '^p[0-9]{3,}-item[0-9]{2,}$'
    OR substring(v.source_locator FROM '^p([0-9]+)-')::numeric<>v.source_page) THEN
    issues:=issues||jsonb_build_array(jsonb_build_object('code','QB_LOCATOR_PAGE','field','source_locator','message','The locator must identify an item on the first physical PDF page.'));
  END IF;
  IF nullif(btrim(v.source_question_number),'') IS NULL AND nullif(btrim(v.source_locator),'') IS NULL THEN
    issues:=issues||jsonb_build_array(jsonb_build_object('code','QB_SOURCE_IDENTITY','field','source_locator','message','Provide a printed question number or source locator.'));
  END IF;
  END IF;
  IF v.requires_figure AND (v.image_url IS NULL OR v.image_url !~ '^https?://[^[:space:]]+$') THEN
    issues:=issues||jsonb_build_array(jsonb_build_object('code','QB_FIGURE_REQUIRED','field','image_url','message','Provide an authorized HTTP(S) figure URL.'));
  END IF;
  IF EXISTS(SELECT 1 FROM public.question_options o JOIN public.option_misconceptions m ON m.option_id=o.id WHERE o.question_version_id=v.id AND o.is_correct) THEN
    issues:=issues||jsonb_build_array(jsonb_build_object('code','QB_CORRECT_MISCONCEPTION','field','options','message','A correct option cannot carry a misconception mapping.'));
  END IF;
  RETURN issues;
END;
$$;
