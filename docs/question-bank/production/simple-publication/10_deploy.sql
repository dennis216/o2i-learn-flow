-- TARGET: lxoaeaewcrshjkigzyqe. Confirm this Dashboard project before running the WHOLE file.
-- Applies ONLY 20261020000000_question_bank_simple_publication.sql. Do not replay old migrations.
-- No full-backup/post-commit restoration claim. DDL and ledger roll back together on an error.
-- Migration SHA256: 2c2868a67a89b8e610b2e919690cb135ab808700a43029fa192fb587b5d0f415
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SET LOCAL search_path=public,extensions;
DO $o2i_simple_release$
DECLARE report jsonb;
  migration_sql constant text := $o2i_simple_source$-- Simplified version-bound publication confirmation. Requires the five existing question-bank migrations.
-- No content, imported evidence, historical reviews or publication history is rewritten.
ALTER TABLE public.question_versions DROP CONSTRAINT question_versions_published_metadata_required;
DROP TRIGGER require_question_publication_metadata_trigger ON public.question_versions;
DROP FUNCTION public.require_question_publication_metadata();

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
  IF v.requires_figure AND (v.image_url IS NULL OR v.image_url !~ '^https?://[^[:space:]]+$') THEN
    issues:=issues||jsonb_build_array(jsonb_build_object('code','QB_FIGURE_REQUIRED','field','image_url','message','Provide an authorized HTTP(S) figure URL.'));
  END IF;
  IF EXISTS(SELECT 1 FROM public.question_options o JOIN public.option_misconceptions m ON m.option_id=o.id WHERE o.question_version_id=v.id AND o.is_correct) THEN
    issues:=issues||jsonb_build_array(jsonb_build_object('code','QB_CORRECT_MISCONCEPTION','field','options','message','A correct option cannot carry a misconception mapping.'));
  END IF;
  RETURN issues;
END;
$$;

CREATE OR REPLACE FUNCTION public.question_bank_review_issues(_question_id uuid,_version_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE issues jsonb; r public.question_version_reviews%ROWTYPE;
BEGIN
  issues:=public.question_bank_content_issues(_question_id,_version_id);
  SELECT * INTO r FROM public.question_version_reviews WHERE question_version_id=_version_id ORDER BY reviewed_at DESC,id DESC LIMIT 1;
  IF NOT FOUND THEN
    issues:=issues||jsonb_build_array(jsonb_build_object('code','QB_REVIEW_REQUIRED','field','review','message','Confirm the selected content, answers, display and Topic/Skills before publication.'));
  ELSIF r.content_fingerprint IS DISTINCT FROM public.question_bank_content_fingerprint(_version_id) THEN
    issues:=issues||jsonb_build_array(jsonb_build_object('code','QB_REVIEW_STALE','field','review','message','Content or associations changed after confirmation; review this version again.'));
  END IF;
  -- Existing genuine reviews remain valid for their unchanged version/content.
  -- AI flags and imported assertions remain evidence, never trusted confirmation.
  RETURN issues;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_question_version_review(_question_id uuid,_version_id uuid,_expected_fingerprint text,_review jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE q public.questions%ROWTYPE; v public.question_versions%ROWTYPE; issues jsonb; review_id uuid;
BEGIN
  PERFORM public.question_bank_require_admin();
  SELECT * INTO q FROM public.questions WHERE id=_question_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM public.question_bank_error('QB_NOT_FOUND','Question not found.'); END IF;
  SELECT * INTO v FROM public.question_versions WHERE id=_version_id AND question_id=q.id FOR UPDATE;
  IF NOT FOUND OR q.status='retired' OR v.status='superseded'
    OR (v.status='approved' AND q.current_version_id IS DISTINCT FROM v.id) THEN
    PERFORM public.question_bank_error('QB_REVIEW_TARGET','Review the explicit working or current approved version of a non-archived question.');
  END IF;
  IF _expected_fingerprint IS DISTINCT FROM public.question_bank_publication_fingerprint(q.id,v.id) THEN
    PERFORM public.question_bank_error('QB_STALE','This question or review changed. Reload before confirming.');
  END IF;
  IF _review IS NULL OR jsonb_typeof(_review)<>'object' THEN PERFORM public.question_bank_error('QB_INVALID_REVIEW','Provide explicit review confirmations.'); END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(_review))<>1 OR NOT _review ? 'confirmed' THEN
    PERFORM public.question_bank_error('QB_INVALID_REVIEW','Accept only the explicit confirmed field; identity and timestamps are server-controlled.');
  END IF;
  IF (_review->'confirmed') IS DISTINCT FROM 'true'::jsonb THEN
    PERFORM public.question_bank_error('QB_CONFIRMATION_REQUIRED','Confirm the selected content, answers, display and Topic/Skills.');
  END IF;
  issues:=public.question_bank_content_issues(q.id,v.id);
  IF jsonb_array_length(issues)>0 THEN
    PERFORM public.question_bank_error(issues->0->>'code',issues->0->>'message',jsonb_build_object('issues',issues));
  END IF;
  INSERT INTO public.question_version_reviews(question_version_id,content_fingerprint,review_data,reviewed_by)
    VALUES(v.id,public.question_bank_content_fingerprint(v.id),_review,auth.uid()) RETURNING id INTO review_id;
  RETURN jsonb_build_object('review_id',review_id,'precheck',public.precheck_question_publication(q.id,v.id,
    CASE WHEN v.status='approved' AND q.status='unpublished' THEN 'republish' ELSE 'publish' END));
END;
$$;

-- CREATE OR REPLACE preserves the existing SECURITY DEFINER signatures and grants.
COMMENT ON FUNCTION public.record_question_version_review(uuid,uuid,text,jsonb) IS
  'Explicit content/answer/display/Topic-Skills confirmation for one exact version/content fingerprint. Server identity/time; no inferred facts or evidence updates. Legacy genuine review rows are retained.';
$o2i_simple_source$;
BEGIN
  IF current_user<>'postgres' THEN RAISE EXCEPTION 'STOP: run only as the SQL Editor postgres role.'; END IF;
  IF NOT pg_try_advisory_xact_lock(20260926,20261004) THEN RAISE EXCEPTION 'STOP: another question-bank release is running.'; END IF;
  LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
  IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261020000000') THEN
    RAISE EXCEPTION 'STOP: new migration already recorded; use readonly verification instead of rerunning.';
  END IF;
  IF EXISTS(SELECT 1 FROM (VALUES ('20260926000000','question_bank_foundation','d74284a7a6f56bb87a2d86fc5fab221b'),('20261004000000','question_bank_draft_import','ed97a5cdf46d446810ae336850d05874'),('20261018000000','question_bank_draft_management','0868c0f1ad21902ed372e05e0d62f58a'),('20261019000000','question_bank_unpublished_status','345be247bee1e33cf18b36c1707e7fd0'),('20261019010000','question_bank_publication','7fab57a8878606e00f2d71ae001d30cd')) e(version,name,body_hash)
    LEFT JOIN supabase_migrations.schema_migrations m ON m.version=e.version
    WHERE m.version IS NULL OR m.name IS DISTINCT FROM e.name OR cardinality(m.statements) IS DISTINCT FROM 1 OR md5(m.statements[1]) IS DISTINCT FROM e.body_hash) THEN
    RAISE EXCEPTION 'STOP: prerequisite ledger does not match the five deployed migrations. Do not replay or repair them blindly.';
  END IF;
  IF EXISTS(SELECT 1 FROM (VALUES ('public.question_bank_content_issues(uuid,uuid)','36597e9f2bdccb6b7712cbadb57f995c'),
('public.question_bank_review_issues(uuid,uuid)','2baddf9fdceeeaf1af645d01a14529d5'),
('public.record_question_version_review(uuid,uuid,text,jsonb)','d815d915411f9aeaeaeb2d49515477f0')) e(signature,body_hash)
    LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature)
    WHERE p.oid IS NULL OR md5(regexp_replace(p.prosrc,'[[:space:]]','','g')) IS DISTINCT FROM e.body_hash) THEN
    RAISE EXCEPTION 'STOP: prerequisite publication functions differ from the reviewed version.';
  END IF;
  EXECUTE migration_sql;
  WITH expected_functions(signature,body_hash) AS (VALUES ('public.question_bank_content_issues(uuid,uuid)','2f999de9aa3bb710177353e8a9616fc6'),
('public.question_bank_review_issues(uuid,uuid)','d6c7a51fa23a5b652dd26ad55952d316'),
('public.record_question_version_review(uuid,uuid,text,jsonb)','942350b362404da65535fee5ade5b256')), checks AS (
  SELECT e.signature AS name,coalesce(md5(regexp_replace(p.prosrc,'[[:space:]]','','g'))=e.body_hash
    AND p.prosecdef AND p.prorettype='jsonb'::regtype
    AND 'search_path=public, extensions'=ANY(p.proconfig),false) AS ok
  FROM expected_functions e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature)
  UNION ALL SELECT 'optional_metadata_constraint_removed',NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.question_versions'::regclass AND conname='question_versions_published_metadata_required')
  UNION ALL SELECT 'optional_metadata_trigger_removed',NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.question_versions'::regclass AND tgname='require_question_publication_metadata_trigger')
  UNION ALL SELECT 'optional_metadata_function_removed',to_regprocedure('public.require_question_publication_metadata()') IS NULL
  UNION ALL SELECT 'source_identity_constraint_retained',EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.question_versions'::regclass AND conname='question_versions_source_identity_check' AND convalidated)
  UNION ALL SELECT 'nullable_optional_metadata',count(*)=2 AND bool_and(NOT attnotnull) FROM pg_attribute WHERE attrelid='public.question_versions'::regclass AND attname IN ('calculator_policy','source_type') AND NOT attisdropped
  UNION ALL SELECT 'reviews_admin_rls',relrowsecurity FROM pg_class WHERE oid='public.question_version_reviews'::regclass
  UNION ALL SELECT 'reviews_append_only',NOT has_table_privilege('authenticated','public.question_version_reviews','INSERT,UPDATE,DELETE')
  UNION ALL SELECT 'review_rpc_authenticated',has_function_privilege('authenticated','public.record_question_version_review(uuid,uuid,text,jsonb)','EXECUTE')
  UNION ALL SELECT 'review_rpc_not_anon',NOT has_function_privilege('anon','public.record_question_version_review(uuid,uuid,text,jsonb)','EXECUTE')
  UNION ALL SELECT 'content_checks_private',NOT has_function_privilege('authenticated','public.question_bank_content_issues(uuid,uuid)','EXECUTE')
  UNION ALL SELECT 'review_checks_private',NOT has_function_privilege('authenticated','public.question_bank_review_issues(uuid,uuid)','EXECUTE')
  UNION ALL SELECT 'raw_solutions_admin_rls',relrowsecurity AND NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.question_versions'::regclass AND polname='Authenticated users read current approved versions') FROM pg_class WHERE oid='public.question_versions'::regclass
  UNION ALL SELECT 'raw_answers_admin_rls',relrowsecurity AND NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.question_options'::regclass AND polname='Authenticated users read approved question options') FROM pg_class WHERE oid='public.question_options'::regclass
  UNION ALL SELECT 'version_evidence_protected',NOT has_column_privilege('authenticated','public.question_versions','import_evidence','UPDATE')
  UNION ALL SELECT 'version_status_protected',NOT has_column_privilege('authenticated','public.question_versions','status','UPDATE')
  UNION ALL SELECT 'legacy_approval_private',NOT has_function_privilege('authenticated','public.approve_question_version(uuid,uuid)','EXECUTE')
)
SELECT jsonb_build_object('all_catalog_checks_pass',bool_and(coalesce(ok,false)),'checks',jsonb_agg(jsonb_build_object('name',name,'ok',coalesce(ok,false)) ORDER BY name)) FROM checks INTO report;
  IF NOT coalesce((report->>'all_catalog_checks_pass')::boolean,false) THEN
    RAISE EXCEPTION 'STOP: post-migration checks failed; transaction rolled back.' USING DETAIL=report::text;
  END IF;
  INSERT INTO supabase_migrations.schema_migrations(version,name,statements)
    VALUES('20261020000000','question_bank_simple_publication',ARRAY[migration_sql]);
END;
$o2i_simple_release$;
COMMIT;
-- If any statement fails, stop; inspect before retrying. Run 20_verify_readonly.sql after success.
