-- Task 4B. Bounded, admin-only draft metadata editing and deletion.
-- No lifecycle/RLS relaxation; published history and original intake evidence survive.

CREATE FUNCTION public.question_bank_draft_fingerprint(_question_id uuid, _version_id uuid)
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT md5(jsonb_build_object(
    'question', to_jsonb(q), 'version', to_jsonb(v),
    'skills', (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.practice_skill_id), '[]')
      FROM public.question_practice_skills s WHERE s.question_version_id = v.id),
    'topics', (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.topic_id), '[]')
      FROM public.question_topics t WHERE t.question_version_id = v.id),
    'options', (SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY o.id), '[]')
      FROM public.question_options o WHERE o.question_version_id = v.id),
    'misconceptions', (SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.option_id, m.misconception_id), '[]')
      FROM public.option_misconceptions m JOIN public.question_options o ON o.id = m.option_id
      WHERE o.question_version_id = v.id),
    'videos', (SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.course_video_id), '[]')
      FROM public.question_course_videos c WHERE c.question_id = q.id)
  )::text) FROM public.questions q JOIN public.question_versions v ON v.question_id = q.id
  WHERE q.id = _question_id AND v.id = _version_id;
$$;

CREATE FUNCTION public.get_question_bank_draft(_question_id uuid, _version_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE q public.questions%ROWTYPE; v public.question_versions%ROWTYPE;
BEGIN
  PERFORM public.assert_question_bank_admin();
  -- Same parent -> version order as lifecycle RPCs. Child guards lock this version.
  -- SHARE locks make this read a coherent snapshot without writing any records.
  SELECT * INTO q FROM public.questions WHERE id = _question_id FOR SHARE;
  IF NOT FOUND OR q.status = 'retired' THEN
    RAISE EXCEPTION 'Draft unavailable: question is missing or retired.' USING ERRCODE = '55000';
  END IF;
  SELECT * INTO v FROM public.question_versions WHERE id = _version_id AND question_id = q.id FOR SHARE;
  IF NOT FOUND OR v.status NOT IN ('draft', 'review') THEN
    RAISE EXCEPTION 'Draft unavailable: refresh the list; this working version changed.' USING ERRCODE = '55000';
  END IF;
  RETURN jsonb_build_object('question', to_jsonb(q), 'version', to_jsonb(v),
    'topic_code', (SELECT topic_code FROM public.curriculum_topics WHERE id = v.primary_topic_id),
    'skill_codes', (SELECT coalesce(jsonb_agg(s.skill_code ORDER BY s.skill_code), '[]')
      FROM public.question_practice_skills m JOIN public.curriculum_practice_skills s ON s.id = m.practice_skill_id
      WHERE m.question_version_id = v.id),
    'options', (SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY o.order_index, o.id), '[]')
      FROM public.question_options o WHERE o.question_version_id = v.id),
    'fingerprint', public.question_bank_draft_fingerprint(q.id, v.id),
    'delete_scope', CASE WHEN q.status = 'draft' AND q.current_version_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.question_versions WHERE question_id = q.id AND id <> v.id)
      THEN 'question' ELSE 'revision' END);
END;
$$;

CREATE FUNCTION public.update_question_bank_draft_metadata(
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
    OR EXISTS (SELECT 1 FROM jsonb_each(_metadata) e WHERE e.key NOT IN ('calculator_policy','source_locator','practice_skill_codes')
      AND jsonb_typeof(e.value) <> 'string')
    OR jsonb_typeof(_metadata->'calculator_policy') NOT IN ('string','null')
    OR jsonb_typeof(_metadata->'source_locator') NOT IN ('string','null') THEN
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

CREATE FUNCTION public.delete_question_bank_draft(
  _question_id uuid, _version_id uuid, _expected_fingerprint text, _delete_question boolean
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE q public.questions%ROWTYPE; v public.question_versions%ROWTYPE; is_new boolean;
BEGIN
  PERFORM public.assert_question_bank_admin();
  SELECT * INTO q FROM public.questions WHERE id=_question_id FOR UPDATE;
  IF NOT FOUND OR q.status='retired' THEN
    RAISE EXCEPTION 'Draft deletion rejected: question is missing or retired.' USING ERRCODE='55000';
  END IF;
  SELECT * INTO v FROM public.question_versions WHERE id=_version_id AND question_id=q.id FOR UPDATE;
  IF NOT FOUND OR v.status<>'draft' OR q.current_version_id=v.id THEN
    RAISE EXCEPTION 'Draft deletion rejected: only an unpublished draft may be deleted; return review versions to draft first.' USING ERRCODE='55000';
  END IF;
  IF _expected_fingerprint IS DISTINCT FROM public.question_bank_draft_fingerprint(q.id,v.id) THEN
    RAISE EXCEPTION 'Draft changed since it was opened. Reload before deleting; nothing was deleted.' USING ERRCODE='40001';
  END IF;
  is_new := q.status='draft' AND q.current_version_id IS NULL AND NOT EXISTS (
    SELECT 1 FROM public.question_versions WHERE question_id=q.id AND id<>v.id);
  IF _delete_question IS DISTINCT FROM is_new THEN
    RAISE EXCEPTION 'Draft deletion rejected: deletion scope changed; reload and confirm the exact target.' USING ERRCODE='55000';
  END IF;
  IF is_new THEN DELETE FROM public.questions WHERE id=q.id;
  ELSE DELETE FROM public.question_versions WHERE id=v.id;
  END IF;
  RETURN jsonb_build_object('question_id',q.id,'version_id',v.id,'deleted_question',is_new);
END;
$$;

REVOKE ALL ON FUNCTION public.question_bank_draft_fingerprint(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.get_question_bank_draft(uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.update_question_bank_draft_metadata(uuid,uuid,text,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.delete_question_bank_draft(uuid,uuid,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_question_bank_draft(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_question_bank_draft_metadata(uuid,uuid,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_question_bank_draft(uuid,uuid,text,boolean) TO authenticated;
COMMENT ON FUNCTION public.get_question_bank_draft(uuid,uuid) IS 'Admin-only coherent read. Fingerprint includes version, skills and exclusive child evidence; opening an editor never writes data.';
COMMENT ON FUNCTION public.update_question_bank_draft_metadata(uuid,uuid,text,jsonb) IS 'Admin-only atomic whitelisted metadata+skill edit. Stale snapshots rejected; server-authored audit preserves intake evidence and invalidates affected reviews. Never publishes.';
COMMENT ON FUNCTION public.delete_question_bank_draft(uuid,uuid,text,boolean) IS 'Admin-only atomic confirmed draft deletion. Never deletes a published identity or historical version; stale snapshots rejected.';
