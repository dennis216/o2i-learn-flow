-- Task 4 step 1/3. TARGET: lxoaeaewcrshjkigzyqe (manual Dashboard confirmation required).
-- Execute this WHOLE file as a SEPARATE SQL Editor run. Do NOT concatenate the three files.
-- Only 20261018000000_question_bank_draft_management.sql is applied; no old migration is replayed.
-- Original migration SHA256 c383edcce2073ee8e0241419f9ee9cc9137f910d7d6e4972e5e630f4dd1a0a17
-- DEFAULT CLOSED. No complete backup exists; pre-commit rollback is NOT post-commit recovery.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SET LOCAL search_path=public,extensions;
DO $o2i_task4_release$
DECLARE
  -- Change only these three gates in the SQL Editor copy after reviewing preflight evidence.
  confirmed_dashboard_project text := '';
  accept_no_full_backup_risk boolean := false;
  preflight_evidence_confirmed boolean := false;
  actual_columns jsonb;
  report jsonb;
  migration_sql constant text := $o2i_task4_source$-- Task 4B. Bounded, admin-only draft metadata editing and deletion.
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
$o2i_task4_source$;
BEGIN
  IF confirmed_dashboard_project IS DISTINCT FROM 'lxoaeaewcrshjkigzyqe' OR preflight_evidence_confirmed IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'STOP: confirm Dashboard project and reviewed Task 4 preflight evidence.';
  END IF;
  IF accept_no_full_backup_risk IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'STOP: explicitly accept no-full-backup risk; committed earlier steps cannot be rolled back by a later step.';
  END IF;
  IF current_user<>'postgres' THEN RAISE EXCEPTION 'STOP: reviewed for SQL Editor postgres execution only.'; END IF;
  IF NOT pg_try_advisory_xact_lock(20260926,20261004) THEN RAISE EXCEPTION 'STOP: another question-bank release is running.'; END IF;
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

  IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version IN ('20261018000000','20261019000000','20261019010000')) THEN
    RAISE EXCEPTION 'STOP: this or a later Task 4 migration is already recorded. Readonly verify; never repeat blindly.';
  END IF;
  IF EXISTS(SELECT 1 FROM (VALUES ('20260926000000','question_bank_foundation','d74284a7a6f56bb87a2d86fc5fab221b'),('20261004000000','question_bank_draft_import','ed97a5cdf46d446810ae336850d05874')) e(version,name,body_hash)
    LEFT JOIN supabase_migrations.schema_migrations m ON m.version=e.version
    WHERE m.version IS NULL OR m.name IS DISTINCT FROM e.name OR cardinality(m.statements) IS DISTINCT FROM 1 OR md5(m.statements[1]) IS DISTINCT FROM e.body_hash) THEN
    RAISE EXCEPTION 'STOP: prerequisite migration ledger is missing or differs from repository SQL. Do not replay or repair it blindly.';
  END IF;
  IF to_regclass('public.question_version_reviews') IS NOT NULL OR to_regclass('public.question_publication_events') IS NOT NULL
    OR EXISTS(SELECT 1 FROM pg_attribute WHERE (attrelid=to_regclass('public.questions') AND attname='lifecycle_revision'
      OR attrelid=to_regclass('public.question_versions') AND attname='editorial_revision') AND attnum>0 AND NOT attisdropped)
    OR EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('question_bank_draft_fingerprint','get_question_bank_draft','update_question_bank_draft_metadata','delete_question_bank_draft','question_bank_error','question_bank_require_admin','advance_question_editorial_revision','track_question_version_identity','invalidate_returned_question_review','reject_question_child_reparent','track_question_child_change','question_bank_content_fingerprint','question_bank_publication_fingerprint','question_bank_source_flags','question_bank_content_issues','question_bank_review_issues','question_bank_publication_issues','precheck_question_publication','get_question_publication_state','record_question_version_review','save_question_bank_revision','publish_question_versions','publish_question_version','republish_question','unpublish_question','archive_question')) THEN
    RAISE EXCEPTION 'STOP: unrecorded or out-of-order Task 4 objects exist. Investigate partial deployment.';
  END IF;
  WITH expected_functions(signature,body_hash,definer,return_type,argument_names,search_path) AS (VALUES ('public.has_role(uuid,public.app_role)','b6a4c82ad51a3997410a4bc37975e05f',true,'boolean',ARRAY['_user_id','_role']::text[],'public,extensions'),
('public.is_super_admin(uuid)','debcc4a5a880088e40f8ad55ed073614',true,'boolean',ARRAY['_user_id']::text[],'public,extensions'),
('public.update_updated_at_column()','a3a8dcc15e232b73d3f5c4abfa43f3d8',false,'TRIGGER',ARRAY[]::text[],'public'),
('public.validate_question_version_approval(uuid,uuid)','45e5ed7585026f55e810f1acbff94555',true,'void',ARRAY['_question_id','_version_id']::text[],'public,extensions'),
('public.enforce_question_lifecycle()','e7f8d34ac2492a1fce7ead5f73f0880b',true,'trigger',ARRAY[]::text[],'public,extensions'),
('public.enforce_question_version_lifecycle()','a3f8b115a46fb425640cf19b711c2a6b',true,'trigger',ARRAY[]::text[],'public,extensions'),
('public.protect_non_draft_version_child()','8dfd627fabeea7d88246b510fc517281',true,'trigger',ARRAY[]::text[],'public,extensions'),
('public.reject_primary_topic_as_secondary()','053c04d309b2ab4aa4bcc7532a0db15d',true,'trigger',ARRAY[]::text[],'public,extensions'),
('public.reject_secondary_topic_as_primary()','9f4a112bf6c5eaaddce2b32204769e70',true,'trigger',ARRAY[]::text[],'public,extensions'),
('public.protect_non_draft_option_misconception()','450724421924aa5c21e59bb630e8c30d',true,'trigger',ARRAY[]::text[],'public,extensions'),
('public.reject_correct_option_misconception()','371661c1cadf945a79258e4ed6022cdb',true,'trigger',ARRAY[]::text[],'public,extensions'),
('public.reject_correct_option_with_misconception()','944bc1bcb25c7826990ff62301ac783a',true,'trigger',ARRAY[]::text[],'public,extensions'),
('public.prevent_approved_question_delete()','2a812c2c0af81b72a6be75a3fade01c0',true,'trigger',ARRAY[]::text[],'public,extensions'),
('public.assert_question_bank_admin()','db723134f0718668986d106b6689e375',true,'void',ARRAY[]::text[],'public,extensions'),
('public.create_question_revision(uuid)','acc2690cba4c5c3087b12297248631ec',true,'uuid',ARRAY['_question_id']::text[],'public,extensions'),
('public.submit_question_version_for_review(uuid,uuid)','1658956fe0598859003c1cd2a52c0206',true,'uuid',ARRAY['_question_id','_version_id']::text[],'public,extensions'),
('public.return_question_version_to_draft(uuid,uuid)','b09dac9c077364e28425ffaa395ca755',true,'uuid',ARRAY['_question_id','_version_id']::text[],'public,extensions'),
('public.approve_question_version(uuid,uuid)','030241308b6522d7a8cd77d3531f8a7a',true,'public.questions',ARRAY['_question_id','_version_id']::text[],'public,extensions'),
('public.retire_question(uuid)','f077f74c363cfdf03586961e1d143abb',true,'public.questions',ARRAY['_question_id']::text[],'public,extensions'),
('public.require_question_publication_metadata()','476ca3529520281ee087e914932c8d9d',true,'trigger',ARRAY[]::text[],'public,extensions'),
('public.save_question_bank_drafts(jsonb)','17ac2a83f0fd26e59a11e0c12c803390',true,'jsonb',ARRAY['_items']::text[],'public,extensions')),
function_checks AS (
  SELECT e.signature,p.oid IS NOT NULL AND p.prosecdef=e.definer AND p.prorettype=to_regtype(e.return_type)
    AND coalesce(p.proargnames,ARRAY[]::text[])=e.argument_names
    AND md5(regexp_replace(p.prosrc,'[[:space:]]','','g'))=e.body_hash
    AND EXISTS(SELECT 1 FROM unnest(p.proconfig) config WHERE replace(config,' ','')='search_path='||e.search_path) AS ok
  FROM expected_functions e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature)
), table_checks AS (
  SELECT e.name,c.relkind='r' AND c.relrowsecurity
    AND has_table_privilege('authenticated',c.oid,'SELECT')
    AND (SELECT count(*) FROM pg_policy p WHERE p.polrelid=c.oid)=e.policy_count AS ok
  FROM (VALUES ('questions',2),('question_versions',2),('question_options',2),('question_practice_skills',2),('question_topics',2),('misconceptions',2),('option_misconceptions',2),('question_course_videos',2)) e(name,policy_count)
  LEFT JOIN pg_class c ON c.oid=to_regclass('public.'||e.name)
), policy_checks AS (
  SELECT e.table_name,e.name,p.polcmd::text=e.command AND p.polpermissive
    AND p.polroles=ARRAY[(SELECT oid FROM pg_roles WHERE rolname='authenticated')]
    AND (e.name NOT LIKE 'Admins %' OR regexp_replace(pg_get_expr(p.polqual,p.polrelid),'[[:space:]]','','g')='has_role(auth.uid(),''admin''::app_role)')
    AND (e.command<>'*' OR regexp_replace(pg_get_expr(p.polwithcheck,p.polrelid),'[[:space:]]','','g')='has_role(auth.uid(),''admin''::app_role)') AS ok
  FROM (VALUES ('questions','Admins manage questions','*'),('questions','Authenticated users read approved questions','r'),('question_versions','Admins manage question versions','*'),('question_versions','Authenticated users read current approved versions','r'),('question_options','Admins manage question options','*'),('question_options','Authenticated users read approved question options','r'),('question_practice_skills','Admins manage question practice skills','*'),('question_practice_skills','Authenticated users read approved question practice skills','r'),('question_topics','Admins manage secondary question topics','*'),('question_topics','Authenticated users read approved secondary question topics','r'),('misconceptions','Admins manage misconceptions','*'),('misconceptions','Authenticated users read misconceptions for approved questions','r'),('option_misconceptions','Admins manage option misconceptions','*'),('option_misconceptions','Authenticated users read approved option misconceptions','r'),('question_course_videos','Admins manage question course videos','*'),('question_course_videos','Authenticated users read approved question course videos','r')) e(table_name,name,command)
  LEFT JOIN pg_policy p ON p.polrelid=to_regclass('public.'||e.table_name) AND p.polname=e.name
), trigger_checks AS (
  SELECT e.table_name,e.name,t.tgenabled='O' AND t.tgfoid=to_regprocedure(e.signature) AS ok
  FROM (VALUES ('questions','update_questions_updated_at','public.update_updated_at_column()'),('misconceptions','update_misconceptions_updated_at','public.update_updated_at_column()'),('questions','enforce_question_lifecycle_trigger','public.enforce_question_lifecycle()'),('question_versions','enforce_question_version_lifecycle_trigger','public.enforce_question_version_lifecycle()'),('question_options','protect_non_draft_question_options','public.protect_non_draft_version_child()'),('question_practice_skills','protect_non_draft_question_practice_skills','public.protect_non_draft_version_child()'),('question_topics','protect_non_draft_question_topics','public.protect_non_draft_version_child()'),('question_topics','reject_primary_topic_as_secondary_trigger','public.reject_primary_topic_as_secondary()'),('question_versions','reject_secondary_topic_as_primary_trigger','public.reject_secondary_topic_as_primary()'),('option_misconceptions','protect_non_draft_option_misconceptions','public.protect_non_draft_option_misconception()'),('option_misconceptions','reject_correct_option_misconception_trigger','public.reject_correct_option_misconception()'),('question_options','reject_correct_option_with_misconception_trigger','public.reject_correct_option_with_misconception()'),('questions','prevent_approved_question_delete_trigger','public.prevent_approved_question_delete()'),('question_versions','require_question_publication_metadata_trigger','public.require_question_publication_metadata()')) e(table_name,name,signature)
  LEFT JOIN pg_trigger t ON t.tgrelid=to_regclass('public.'||e.table_name) AND t.tgname=e.name
), column_checks AS (
  SELECT e.table_name,e.name,a.attnotnull=e.not_null AND format_type(a.atttypid,a.atttypmod)=e.type AS ok
  FROM (VALUES ('questions','status','question_status',true),('question_versions','status','question_version_status',true),('question_versions','source_page','integer',true),('question_versions','source_question_number','text',false),('question_versions','source_locator','text',false),('question_versions','source_locator_verified','boolean',true),('question_versions','calculator_policy','question_calculator_policy',false),('question_versions','source_type','question_source_type',false),('question_versions','import_evidence','jsonb',true),('question_options','import_evidence','jsonb',true)) e(table_name,name,type,not_null)
  LEFT JOIN pg_attribute a ON a.attrelid=to_regclass('public.'||e.table_name) AND a.attname=e.name AND a.attnum>0 AND NOT a.attisdropped
), index_checks AS (
  SELECT e.name,i.indisvalid AND i.indisready AND i.indisunique AND i.indpred IS NOT NULL AS ok
  FROM (VALUES ('question_options_one_correct_per_version'),('question_versions_one_working_revision'),('question_versions_one_approved_version')) e(name)
  LEFT JOIN pg_index i ON i.indexrelid=to_regclass('public.'||e.name)
), constraint_checks AS (
  SELECT e.table_name,e.name,c.convalidated AS ok,pg_get_constraintdef(c.oid) AS definition
  FROM (VALUES ('questions','questions_current_version_belongs_to_question'),('questions','questions_lifecycle_pointer_check'),
    ('question_versions','question_versions_question_version_unique'),('question_versions','question_versions_id_question_unique'),
    ('question_versions','question_versions_source_identity_check'),('question_versions','question_versions_approval_audit_check'),
    ('question_versions','question_versions_published_metadata_required')) e(table_name,name)
  LEFT JOIN pg_constraint c ON c.conrelid=to_regclass('public.'||e.table_name) AND c.conname=e.name
), checks AS (
  SELECT 'function:'||signature AS name,ok FROM function_checks
  UNION ALL SELECT 'table:'||name,ok FROM table_checks
  UNION ALL SELECT 'policy:'||table_name||'.'||name,ok FROM policy_checks
  UNION ALL SELECT 'trigger:'||table_name||'.'||name,ok FROM trigger_checks
  UNION ALL SELECT 'column:'||table_name||'.'||name,ok FROM column_checks
  UNION ALL SELECT 'index:'||name,ok FROM index_checks
  UNION ALL SELECT 'constraint:'||table_name||'.'||name,ok FROM constraint_checks
  UNION ALL SELECT 'enum:'||e.name,ARRAY(SELECT enumlabel::text FROM pg_enum WHERE enumtypid=to_regtype('public.'||e.name) ORDER BY enumsortorder)=e.expected_values
    FROM (VALUES ('question_status',ARRAY['draft','approved','retired']::text[]),('question_version_status',ARRAY['draft','review','approved','superseded']::text[]),('question_type',ARRAY['mcq_single']::text[]),('question_difficulty',ARRAY['easy','medium','hard']::text[]),('question_course_scope',ARRAY['AB','BC','BOTH']::text[]),('question_representation_type',ARRAY['analytical','graphical','numerical','verbal','mixed']::text[]),('question_calculator_policy',ARRAY['no_calculator','calculator_allowed','calculator_required']::text[]),('question_source_type',ARRAY['original','licensed','public_domain','permission_granted']::text[])) e(name,expected_values)
  UNION ALL SELECT 'lifecycle_constraint_matches_stage',position('unpublished' IN (SELECT definition FROM constraint_checks WHERE name='questions_lifecycle_pointer_check'))=0
  UNION ALL SELECT 'compound_current_version_fk',EXISTS(SELECT 1 FROM pg_constraint c WHERE c.conrelid=to_regclass('public.questions')
    AND c.conname='questions_current_version_belongs_to_question' AND c.contype='f' AND c.condeferrable AND c.confrelid=to_regclass('public.question_versions')
    AND ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(attnum,ord) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.attnum ORDER BY ord)=ARRAY['current_version_id','id']
    AND ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(attnum,ord) JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.attnum ORDER BY ord)=ARRAY['id','question_id'])
  UNION ALL SELECT 'rpc:'||signature,coalesce(has_function_privilege('authenticated',to_regprocedure(signature),'EXECUTE'),false)
    AND NOT coalesce(has_function_privilege('anon',to_regprocedure(signature),'EXECUTE'),true)
    FROM (VALUES ('public.save_question_bank_drafts(jsonb)')) e(signature)


)
SELECT jsonb_build_object('all_catalog_checks_pass',bool_and(coalesce(ok,false)),
  'checks',jsonb_agg(jsonb_build_object('name',name,'ok',coalesce(ok,false)) ORDER BY name),
  'note','Catalog checks do not replace administrator login/API/XLSX acceptance.') AS catalog_report FROM checks INTO report;
  IF NOT coalesce((report->>'all_catalog_checks_pass')::boolean,false) THEN
    RAISE EXCEPTION 'STOP: prerequisite catalog differs from the reviewed stage.' USING DETAIL=report::text;
  END IF;
  EXECUTE migration_sql;
  WITH expected_functions(signature,body_hash,definer,return_type,argument_names,search_path) AS (VALUES ('public.has_role(uuid,public.app_role)','b6a4c82ad51a3997410a4bc37975e05f',true,'boolean',ARRAY['_user_id','_role']::text[],'public,extensions'),
('public.is_super_admin(uuid)','debcc4a5a880088e40f8ad55ed073614',true,'boolean',ARRAY['_user_id']::text[],'public,extensions'),
('public.update_updated_at_column()','a3a8dcc15e232b73d3f5c4abfa43f3d8',false,'TRIGGER',ARRAY[]::text[],'public'),
('public.validate_question_version_approval(uuid,uuid)','45e5ed7585026f55e810f1acbff94555',true,'void',ARRAY['_question_id','_version_id']::text[],'public,extensions'),
('public.enforce_question_lifecycle()','e7f8d34ac2492a1fce7ead5f73f0880b',true,'trigger',ARRAY[]::text[],'public,extensions'),
('public.enforce_question_version_lifecycle()','a3f8b115a46fb425640cf19b711c2a6b',true,'trigger',ARRAY[]::text[],'public,extensions'),
('public.protect_non_draft_version_child()','8dfd627fabeea7d88246b510fc517281',true,'trigger',ARRAY[]::text[],'public,extensions'),
('public.reject_primary_topic_as_secondary()','053c04d309b2ab4aa4bcc7532a0db15d',true,'trigger',ARRAY[]::text[],'public,extensions'),
('public.reject_secondary_topic_as_primary()','9f4a112bf6c5eaaddce2b32204769e70',true,'trigger',ARRAY[]::text[],'public,extensions'),
('public.protect_non_draft_option_misconception()','450724421924aa5c21e59bb630e8c30d',true,'trigger',ARRAY[]::text[],'public,extensions'),
('public.reject_correct_option_misconception()','371661c1cadf945a79258e4ed6022cdb',true,'trigger',ARRAY[]::text[],'public,extensions'),
('public.reject_correct_option_with_misconception()','944bc1bcb25c7826990ff62301ac783a',true,'trigger',ARRAY[]::text[],'public,extensions'),
('public.prevent_approved_question_delete()','2a812c2c0af81b72a6be75a3fade01c0',true,'trigger',ARRAY[]::text[],'public,extensions'),
('public.assert_question_bank_admin()','db723134f0718668986d106b6689e375',true,'void',ARRAY[]::text[],'public,extensions'),
('public.create_question_revision(uuid)','acc2690cba4c5c3087b12297248631ec',true,'uuid',ARRAY['_question_id']::text[],'public,extensions'),
('public.submit_question_version_for_review(uuid,uuid)','1658956fe0598859003c1cd2a52c0206',true,'uuid',ARRAY['_question_id','_version_id']::text[],'public,extensions'),
('public.return_question_version_to_draft(uuid,uuid)','b09dac9c077364e28425ffaa395ca755',true,'uuid',ARRAY['_question_id','_version_id']::text[],'public,extensions'),
('public.approve_question_version(uuid,uuid)','030241308b6522d7a8cd77d3531f8a7a',true,'public.questions',ARRAY['_question_id','_version_id']::text[],'public,extensions'),
('public.retire_question(uuid)','f077f74c363cfdf03586961e1d143abb',true,'public.questions',ARRAY['_question_id']::text[],'public,extensions'),
('public.require_question_publication_metadata()','476ca3529520281ee087e914932c8d9d',true,'trigger',ARRAY[]::text[],'public,extensions'),
('public.save_question_bank_drafts(jsonb)','17ac2a83f0fd26e59a11e0c12c803390',true,'jsonb',ARRAY['_items']::text[],'public,extensions'),
('public.question_bank_draft_fingerprint(uuid,uuid)','b812c627441277154e1dcf9230154c61',true,'text',ARRAY['_question_id','_version_id']::text[],'public,extensions'),
('public.get_question_bank_draft(uuid,uuid)','28e6d42d05309d55a8828c9b856cc5f8',true,'jsonb',ARRAY['_question_id','_version_id']::text[],'public,extensions'),
('public.update_question_bank_draft_metadata(uuid,uuid,text,jsonb)','dcdb0d4fb8b8f3e0bf02fa690480d6ee',true,'uuid',ARRAY['_question_id','_version_id','_expected_fingerprint','_metadata']::text[],'public,extensions'),
('public.delete_question_bank_draft(uuid,uuid,text,boolean)','ee20ca534f158df89181499bab9ae5bf',true,'jsonb',ARRAY['_question_id','_version_id','_expected_fingerprint','_delete_question']::text[],'public,extensions')),
function_checks AS (
  SELECT e.signature,p.oid IS NOT NULL AND p.prosecdef=e.definer AND p.prorettype=to_regtype(e.return_type)
    AND coalesce(p.proargnames,ARRAY[]::text[])=e.argument_names
    AND md5(regexp_replace(p.prosrc,'[[:space:]]','','g'))=e.body_hash
    AND EXISTS(SELECT 1 FROM unnest(p.proconfig) config WHERE replace(config,' ','')='search_path='||e.search_path) AS ok
  FROM expected_functions e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature)
), table_checks AS (
  SELECT e.name,c.relkind='r' AND c.relrowsecurity
    AND has_table_privilege('authenticated',c.oid,'SELECT')
    AND (SELECT count(*) FROM pg_policy p WHERE p.polrelid=c.oid)=e.policy_count AS ok
  FROM (VALUES ('questions',2),('question_versions',2),('question_options',2),('question_practice_skills',2),('question_topics',2),('misconceptions',2),('option_misconceptions',2),('question_course_videos',2)) e(name,policy_count)
  LEFT JOIN pg_class c ON c.oid=to_regclass('public.'||e.name)
), policy_checks AS (
  SELECT e.table_name,e.name,p.polcmd::text=e.command AND p.polpermissive
    AND p.polroles=ARRAY[(SELECT oid FROM pg_roles WHERE rolname='authenticated')]
    AND (e.name NOT LIKE 'Admins %' OR regexp_replace(pg_get_expr(p.polqual,p.polrelid),'[[:space:]]','','g')='has_role(auth.uid(),''admin''::app_role)')
    AND (e.command<>'*' OR regexp_replace(pg_get_expr(p.polwithcheck,p.polrelid),'[[:space:]]','','g')='has_role(auth.uid(),''admin''::app_role)') AS ok
  FROM (VALUES ('questions','Admins manage questions','*'),('questions','Authenticated users read approved questions','r'),('question_versions','Admins manage question versions','*'),('question_versions','Authenticated users read current approved versions','r'),('question_options','Admins manage question options','*'),('question_options','Authenticated users read approved question options','r'),('question_practice_skills','Admins manage question practice skills','*'),('question_practice_skills','Authenticated users read approved question practice skills','r'),('question_topics','Admins manage secondary question topics','*'),('question_topics','Authenticated users read approved secondary question topics','r'),('misconceptions','Admins manage misconceptions','*'),('misconceptions','Authenticated users read misconceptions for approved questions','r'),('option_misconceptions','Admins manage option misconceptions','*'),('option_misconceptions','Authenticated users read approved option misconceptions','r'),('question_course_videos','Admins manage question course videos','*'),('question_course_videos','Authenticated users read approved question course videos','r')) e(table_name,name,command)
  LEFT JOIN pg_policy p ON p.polrelid=to_regclass('public.'||e.table_name) AND p.polname=e.name
), trigger_checks AS (
  SELECT e.table_name,e.name,t.tgenabled='O' AND t.tgfoid=to_regprocedure(e.signature) AS ok
  FROM (VALUES ('questions','update_questions_updated_at','public.update_updated_at_column()'),('misconceptions','update_misconceptions_updated_at','public.update_updated_at_column()'),('questions','enforce_question_lifecycle_trigger','public.enforce_question_lifecycle()'),('question_versions','enforce_question_version_lifecycle_trigger','public.enforce_question_version_lifecycle()'),('question_options','protect_non_draft_question_options','public.protect_non_draft_version_child()'),('question_practice_skills','protect_non_draft_question_practice_skills','public.protect_non_draft_version_child()'),('question_topics','protect_non_draft_question_topics','public.protect_non_draft_version_child()'),('question_topics','reject_primary_topic_as_secondary_trigger','public.reject_primary_topic_as_secondary()'),('question_versions','reject_secondary_topic_as_primary_trigger','public.reject_secondary_topic_as_primary()'),('option_misconceptions','protect_non_draft_option_misconceptions','public.protect_non_draft_option_misconception()'),('option_misconceptions','reject_correct_option_misconception_trigger','public.reject_correct_option_misconception()'),('question_options','reject_correct_option_with_misconception_trigger','public.reject_correct_option_with_misconception()'),('questions','prevent_approved_question_delete_trigger','public.prevent_approved_question_delete()'),('question_versions','require_question_publication_metadata_trigger','public.require_question_publication_metadata()')) e(table_name,name,signature)
  LEFT JOIN pg_trigger t ON t.tgrelid=to_regclass('public.'||e.table_name) AND t.tgname=e.name
), column_checks AS (
  SELECT e.table_name,e.name,a.attnotnull=e.not_null AND format_type(a.atttypid,a.atttypmod)=e.type AS ok
  FROM (VALUES ('questions','status','question_status',true),('question_versions','status','question_version_status',true),('question_versions','source_page','integer',true),('question_versions','source_question_number','text',false),('question_versions','source_locator','text',false),('question_versions','source_locator_verified','boolean',true),('question_versions','calculator_policy','question_calculator_policy',false),('question_versions','source_type','question_source_type',false),('question_versions','import_evidence','jsonb',true),('question_options','import_evidence','jsonb',true)) e(table_name,name,type,not_null)
  LEFT JOIN pg_attribute a ON a.attrelid=to_regclass('public.'||e.table_name) AND a.attname=e.name AND a.attnum>0 AND NOT a.attisdropped
), index_checks AS (
  SELECT e.name,i.indisvalid AND i.indisready AND i.indisunique AND i.indpred IS NOT NULL AS ok
  FROM (VALUES ('question_options_one_correct_per_version'),('question_versions_one_working_revision'),('question_versions_one_approved_version')) e(name)
  LEFT JOIN pg_index i ON i.indexrelid=to_regclass('public.'||e.name)
), constraint_checks AS (
  SELECT e.table_name,e.name,c.convalidated AS ok,pg_get_constraintdef(c.oid) AS definition
  FROM (VALUES ('questions','questions_current_version_belongs_to_question'),('questions','questions_lifecycle_pointer_check'),
    ('question_versions','question_versions_question_version_unique'),('question_versions','question_versions_id_question_unique'),
    ('question_versions','question_versions_source_identity_check'),('question_versions','question_versions_approval_audit_check'),
    ('question_versions','question_versions_published_metadata_required')) e(table_name,name)
  LEFT JOIN pg_constraint c ON c.conrelid=to_regclass('public.'||e.table_name) AND c.conname=e.name
), checks AS (
  SELECT 'function:'||signature AS name,ok FROM function_checks
  UNION ALL SELECT 'table:'||name,ok FROM table_checks
  UNION ALL SELECT 'policy:'||table_name||'.'||name,ok FROM policy_checks
  UNION ALL SELECT 'trigger:'||table_name||'.'||name,ok FROM trigger_checks
  UNION ALL SELECT 'column:'||table_name||'.'||name,ok FROM column_checks
  UNION ALL SELECT 'index:'||name,ok FROM index_checks
  UNION ALL SELECT 'constraint:'||table_name||'.'||name,ok FROM constraint_checks
  UNION ALL SELECT 'enum:'||e.name,ARRAY(SELECT enumlabel::text FROM pg_enum WHERE enumtypid=to_regtype('public.'||e.name) ORDER BY enumsortorder)=e.expected_values
    FROM (VALUES ('question_status',ARRAY['draft','approved','retired']::text[]),('question_version_status',ARRAY['draft','review','approved','superseded']::text[]),('question_type',ARRAY['mcq_single']::text[]),('question_difficulty',ARRAY['easy','medium','hard']::text[]),('question_course_scope',ARRAY['AB','BC','BOTH']::text[]),('question_representation_type',ARRAY['analytical','graphical','numerical','verbal','mixed']::text[]),('question_calculator_policy',ARRAY['no_calculator','calculator_allowed','calculator_required']::text[]),('question_source_type',ARRAY['original','licensed','public_domain','permission_granted']::text[])) e(name,expected_values)
  UNION ALL SELECT 'lifecycle_constraint_matches_stage',position('unpublished' IN (SELECT definition FROM constraint_checks WHERE name='questions_lifecycle_pointer_check'))=0
  UNION ALL SELECT 'compound_current_version_fk',EXISTS(SELECT 1 FROM pg_constraint c WHERE c.conrelid=to_regclass('public.questions')
    AND c.conname='questions_current_version_belongs_to_question' AND c.contype='f' AND c.condeferrable AND c.confrelid=to_regclass('public.question_versions')
    AND ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(attnum,ord) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.attnum ORDER BY ord)=ARRAY['current_version_id','id']
    AND ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(attnum,ord) JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.attnum ORDER BY ord)=ARRAY['id','question_id'])
  UNION ALL SELECT 'rpc:'||signature,coalesce(has_function_privilege('authenticated',to_regprocedure(signature),'EXECUTE'),false)
    AND NOT coalesce(has_function_privilege('anon',to_regprocedure(signature),'EXECUTE'),true)
    FROM (VALUES ('public.save_question_bank_drafts(jsonb)'),('public.get_question_bank_draft(uuid,uuid)'),('public.update_question_bank_draft_metadata(uuid,uuid,text,jsonb)'),('public.delete_question_bank_draft(uuid,uuid,text,boolean)')) e(signature)
UNION ALL SELECT 'private:'||signature,NOT has_function_privilege('authenticated',to_regprocedure(signature),'EXECUTE')
    AND NOT has_function_privilege('anon',to_regprocedure(signature),'EXECUTE') FROM (VALUES ('public.question_bank_draft_fingerprint(uuid,uuid)')) e(signature)

)
SELECT jsonb_build_object('all_catalog_checks_pass',bool_and(coalesce(ok,false)),
  'checks',jsonb_agg(jsonb_build_object('name',name,'ok',coalesce(ok,false)) ORDER BY name),
  'note','Catalog checks do not replace administrator login/API/XLSX acceptance.') AS catalog_report FROM checks INTO report;
  IF NOT coalesce((report->>'all_catalog_checks_pass')::boolean,false) THEN
    RAISE EXCEPTION 'STOP: post-migration catalog validation failed; this step and ledger roll back.' USING DETAIL=report::text;
  END IF;
  -- LEDGER: only after DDL/catalog success, in the same transaction.
  -- Optional created_by/idempotency_key/rollback remain NULL. No invented audit data.
  INSERT INTO supabase_migrations.schema_migrations(version,name,statements)
    VALUES('20261018000000','question_bank_draft_management',ARRAY[migration_sql]);
END;
$o2i_task4_release$;
COMMIT;
-- Stop on ANY error or uncertain outcome. Do not run the next file or repeat this file blindly.
