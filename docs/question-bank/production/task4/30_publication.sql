-- Task 4 step 3/3. TARGET: lxoaeaewcrshjkigzyqe (manual Dashboard confirmation required).
-- Execute this WHOLE file as a SEPARATE SQL Editor run. Do NOT concatenate the three files.
-- Only 20261019010000_question_bank_publication.sql is applied; no old migration is replayed.
-- Original migration SHA256 1cbd0632946fed7df90eeb758d1029deca0135fbe09304fb645abbc1fb1a1f50
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
  migration_sql constant text := $o2i_task4_source$-- Task 4C. Requires the preceding enum migration to have committed.
-- New trusted review records are NOT the imported XLSX review assertions.

ALTER TABLE public.questions DROP CONSTRAINT questions_lifecycle_pointer_check;
ALTER TABLE public.questions ADD CONSTRAINT questions_lifecycle_pointer_check CHECK (
  (status IN ('draft','retired') AND current_version_id IS NULL)
  OR (status IN ('approved','unpublished') AND current_version_id IS NOT NULL)
);
ALTER TABLE public.questions ADD COLUMN lifecycle_revision bigint NOT NULL DEFAULT 0 CHECK (lifecycle_revision >= 0);
ALTER TABLE public.question_versions ADD COLUMN editorial_revision bigint NOT NULL DEFAULT 0 CHECK (editorial_revision >= 0);

CREATE TABLE public.question_version_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_version_id uuid NOT NULL REFERENCES public.question_versions(id) ON DELETE CASCADE,
  content_fingerprint text NOT NULL,
  review_data jsonb NOT NULL CHECK (jsonb_typeof(review_data)='object'),
  reviewed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  reviewed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX question_version_reviews_version_idx ON public.question_version_reviews(question_version_id,reviewed_at DESC,id DESC);
CREATE TABLE public.question_publication_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  version_id uuid NOT NULL REFERENCES public.question_versions(id) ON DELETE RESTRICT,
  previous_version_id uuid REFERENCES public.question_versions(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('publish','unpublish','republish','archive')),
  request_fingerprint text NOT NULL,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX question_publication_events_question_idx ON public.question_publication_events(question_id,occurred_at DESC,id DESC);
ALTER TABLE public.question_version_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_publication_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read trusted question reviews" ON public.question_version_reviews FOR SELECT TO authenticated
  USING(public.has_role(auth.uid(),'admin'::public.app_role));
CREATE POLICY "Admins read question publication history" ON public.question_publication_events FOR SELECT TO authenticated
  USING(public.has_role(auth.uid(),'admin'::public.app_role));
REVOKE ALL ON public.question_version_reviews,public.question_publication_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.question_version_reviews,public.question_publication_events TO authenticated;

-- Do not expose solution/is_correct through raw-table queries. Safe student
-- delivery/grading is a future API, not an anonymous or answer-bearing view.
DROP POLICY "Authenticated users read current approved versions" ON public.question_versions;
DROP POLICY "Authenticated users read approved question options" ON public.question_options;
DROP POLICY "Authenticated users read misconceptions for approved questions" ON public.misconceptions;
DROP POLICY "Authenticated users read approved option misconceptions" ON public.option_misconceptions;

-- A caller can set arbitrary custom GUCs: lifecycle guards alone are NOT an
-- authorization boundary. Revoke table UPDATE, then grant only draft content
-- columns. Owned SECURITY DEFINER RPCs alone can set status/audit/evidence.
REVOKE INSERT,UPDATE ON public.questions,public.question_versions FROM PUBLIC,anon,authenticated;
GRANT UPDATE(external_id) ON public.questions TO authenticated;
GRANT UPDATE(stem,solution,difficulty,course_scope,primary_topic_id,representation_type,
  calculator_policy,source_type,source_document,source_page,source_question_number,
  source_locator,source_reference,requires_figure,image_url) ON public.question_versions TO authenticated;

CREATE FUNCTION public.question_bank_error(_code text,_message text,_details jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql SET search_path=public,extensions AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE=_code||': '||_message,
    DETAIL=(jsonb_build_object('code',_code)||coalesce(_details,'{}'))::text;
END;
$$;
CREATE FUNCTION public.question_bank_require_admin()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN
    PERFORM public.question_bank_error('QB_FORBIDDEN','Authenticated administrator access is required.');
  END IF;
END;
$$;

CREATE FUNCTION public.advance_question_editorial_revision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.editorial_revision<>0 THEN
      PERFORM public.question_bank_error('QB_INVALID_REVISION','New versions must start at editorial revision zero.');
    END IF;
  ELSE
    IF NEW.source_page IS DISTINCT FROM OLD.source_page OR NEW.source_locator IS DISTINCT FROM OLD.source_locator THEN
      NEW.source_locator_verified:=false;
    END IF;
    IF (to_jsonb(NEW)-ARRAY['status','reviewed_by','approved_at','editorial_revision'])
      IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','reviewed_by','approved_at','editorial_revision']) THEN
      NEW.editorial_revision:=OLD.editorial_revision+1;
    ELSIF NEW.editorial_revision IS DISTINCT FROM OLD.editorial_revision AND NEW.editorial_revision<>OLD.editorial_revision+1 THEN
      PERFORM public.question_bank_error('QB_INVALID_REVISION','The editorial revision may only advance, never reset.');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER a_advance_question_editorial_revision BEFORE INSERT OR UPDATE ON public.question_versions
  FOR EACH ROW EXECUTE FUNCTION public.advance_question_editorial_revision();

CREATE FUNCTION public.track_question_version_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
BEGIN
  -- A deleted working revision must not revive an old create/save token (ABA).
  UPDATE public.questions SET lifecycle_revision=lifecycle_revision+1
    WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.question_id ELSE NEW.question_id END;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER track_question_version_identity AFTER INSERT OR DELETE ON public.question_versions
  FOR EACH ROW EXECUTE FUNCTION public.track_question_version_identity();

CREATE FUNCTION public.invalidate_returned_question_review()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
BEGIN
  UPDATE public.question_versions SET editorial_revision=editorial_revision+1 WHERE id=NEW.id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER invalidate_returned_question_review AFTER UPDATE OF status ON public.question_versions
  FOR EACH ROW WHEN (OLD.status='review' AND NEW.status='draft')
  EXECUTE FUNCTION public.invalidate_returned_question_review();

CREATE FUNCTION public.reject_question_child_reparent()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
BEGIN
  IF TG_TABLE_NAME='option_misconceptions' THEN
    IF NEW.option_id IS DISTINCT FROM OLD.option_id THEN
      PERFORM public.question_bank_error('QB_CHILD_REPARENT','An option mapping cannot be moved to another option.');
    END IF;
  ELSIF NEW.question_version_id IS DISTINCT FROM OLD.question_version_id THEN
    PERFORM public.question_bank_error('QB_CHILD_REPARENT','A version child cannot be moved to another version.');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER a_reject_option_reparent BEFORE UPDATE ON public.question_options FOR EACH ROW EXECUTE FUNCTION public.reject_question_child_reparent();
CREATE TRIGGER a_reject_skill_reparent BEFORE UPDATE ON public.question_practice_skills FOR EACH ROW EXECUTE FUNCTION public.reject_question_child_reparent();
CREATE TRIGGER a_reject_topic_reparent BEFORE UPDATE ON public.question_topics FOR EACH ROW EXECUTE FUNCTION public.reject_question_child_reparent();
CREATE TRIGGER a_reject_misconception_reparent BEFORE UPDATE ON public.option_misconceptions FOR EACH ROW EXECUTE FUNCTION public.reject_question_child_reparent();

CREATE FUNCTION public.track_question_child_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE version_id uuid;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF to_jsonb(NEW)=to_jsonb(OLD) THEN RETURN NEW; END IF;
  END IF;
  IF TG_TABLE_NAME='option_misconceptions' THEN
    SELECT question_version_id INTO version_id FROM public.question_options
      WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.option_id ELSE NEW.option_id END;
  ELSE
    version_id:=CASE WHEN TG_OP='DELETE' THEN OLD.question_version_id ELSE NEW.question_version_id END;
  END IF;
  -- Existing guards have already serialized the child write with the draft
  -- parent. During cascade deletion the parent can be absent; do not recreate it.
  UPDATE public.question_versions SET editorial_revision=editorial_revision+1 WHERE id=version_id AND status='draft';
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER track_question_options_change AFTER INSERT OR UPDATE OR DELETE ON public.question_options
  FOR EACH ROW EXECUTE FUNCTION public.track_question_child_change();
CREATE TRIGGER track_question_skills_change AFTER INSERT OR UPDATE OR DELETE ON public.question_practice_skills
  FOR EACH ROW EXECUTE FUNCTION public.track_question_child_change();
CREATE TRIGGER track_question_topics_change AFTER INSERT OR UPDATE OR DELETE ON public.question_topics
  FOR EACH ROW EXECUTE FUNCTION public.track_question_child_change();
CREATE TRIGGER track_option_misconceptions_change AFTER INSERT OR UPDATE OR DELETE ON public.option_misconceptions
  FOR EACH ROW EXECUTE FUNCTION public.track_question_child_change();

CREATE FUNCTION public.question_bank_content_fingerprint(_version_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
  SELECT md5(jsonb_build_object('version',to_jsonb(v)-ARRAY['status','reviewed_by','approved_at'],
    'options',(SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY o.id),'[]') FROM public.question_options o WHERE o.question_version_id=v.id),
    'skills',(SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.practice_skill_id),'[]') FROM public.question_practice_skills s WHERE s.question_version_id=v.id),
    'topics',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.topic_id),'[]') FROM public.question_topics t WHERE t.question_version_id=v.id),
    'misconceptions',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.option_id,m.misconception_id),'[]')
      FROM public.option_misconceptions m JOIN public.question_options o ON o.id=m.option_id WHERE o.question_version_id=v.id)
  )::text) FROM public.question_versions v WHERE v.id=_version_id;
$$;
CREATE FUNCTION public.question_bank_publication_fingerprint(_question_id uuid,_version_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
  SELECT md5(jsonb_build_object('snapshot',public.question_bank_draft_fingerprint(_question_id,_version_id),
    'review',(SELECT to_jsonb(r) FROM public.question_version_reviews r WHERE r.question_version_id=_version_id ORDER BY r.reviewed_at DESC,r.id DESC LIMIT 1),
    'versions',(SELECT jsonb_agg(jsonb_build_array(v.id,v.version_number,v.status) ORDER BY v.version_number)
      FROM public.question_versions v WHERE v.question_id=_question_id))::text);
$$;

CREATE FUNCTION public.question_bank_source_flags(_version_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE evidence jsonb; flags jsonb; original_flags jsonb;
BEGIN
  SELECT import_evidence INTO evidence FROM public.question_versions WHERE id=_version_id;
  flags:=coalesce(evidence->'ai_flags','[]');
  original_flags:=coalesce(evidence->'original_import_evidence'->'ai_flags','[]');
  IF jsonb_typeof(flags)<>'array' OR jsonb_typeof(original_flags)<>'array' THEN RETURN NULL; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(flags||original_flags) f WHERE jsonb_typeof(f)<>'string' OR btrim(f#>>'{}')='') THEN RETURN NULL; END IF;
  RETURN (SELECT coalesce(jsonb_agg(code ORDER BY code),'[]') FROM (SELECT DISTINCT value AS code FROM jsonb_array_elements_text(flags||original_flags)) f);
END;
$$;

CREATE FUNCTION public.question_bank_content_issues(_question_id uuid,_version_id uuid)
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
  IF v.source_question_number IS NULL AND (v.source_locator IS NULL OR NOT v.source_locator_verified) THEN
    issues:=issues||jsonb_build_array(jsonb_build_object('code','QB_LOCATOR_UNVERIFIED','field','source_locator','message','An unnumbered source requires a human-verified unique locator.'));
  END IF;
  IF v.requires_figure AND (v.image_url IS NULL OR v.image_url !~ '^https?://[^[:space:]]+$') THEN
    issues:=issues||jsonb_build_array(jsonb_build_object('code','QB_FIGURE_REQUIRED','field','image_url','message','Provide an authorized HTTP(S) figure URL and complete rendering review.'));
  END IF;
  IF v.calculator_policy IS NULL THEN issues:=issues||jsonb_build_array(jsonb_build_object('code','QB_CALCULATOR_REQUIRED','field','calculator_policy','message','Establish the calculator policy before publication.')); END IF;
  IF v.source_type IS NULL THEN issues:=issues||jsonb_build_array(jsonb_build_object('code','QB_SOURCE_TYPE_REQUIRED','field','source_type','message','Establish the source-use category and rights basis before publication.')); END IF;
  IF EXISTS(SELECT 1 FROM public.question_options o JOIN public.option_misconceptions m ON m.option_id=o.id WHERE o.question_version_id=v.id AND o.is_correct) THEN
    issues:=issues||jsonb_build_array(jsonb_build_object('code','QB_CORRECT_MISCONCEPTION','field','options','message','A correct option cannot carry a misconception mapping.'));
  END IF;
  RETURN issues;
END;
$$;

CREATE FUNCTION public.question_bank_review_issues(_question_id uuid,_version_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE issues jsonb; r public.question_version_reviews%ROWTYPE; flags jsonb; flag text;
BEGIN
  issues:=public.question_bank_content_issues(_question_id,_version_id);
  SELECT * INTO r FROM public.question_version_reviews WHERE question_version_id=_version_id ORDER BY reviewed_at DESC,id DESC LIMIT 1;
  IF NOT FOUND THEN
    issues:=issues||jsonb_build_array(jsonb_build_object('code','QB_REVIEW_REQUIRED','field','review','message','Submit explicit server-recorded math, taxonomy, source-use and rendering confirmations.'));
  ELSIF r.content_fingerprint IS DISTINCT FROM public.question_bank_content_fingerprint(_version_id) THEN
    issues:=issues||jsonb_build_array(jsonb_build_object('code','QB_REVIEW_STALE','field','review','message','Content or associations changed after confirmation; review this version again.'));
  END IF;
  flags:=public.question_bank_source_flags(_version_id);
  IF flags IS NULL THEN
    issues:=issues||jsonb_build_array(jsonb_build_object('code','QB_FLAG_EVIDENCE_INVALID','field','ai_flags','message','Original AI flag evidence has an unsupported format; do not erase it.'));
  ELSE
    FOR flag IN SELECT value FROM jsonb_array_elements_text(flags) LOOP
      IF nullif(btrim(r.review_data->'flag_resolutions'->>flag),'') IS NULL THEN
        issues:=issues||jsonb_build_array(jsonb_build_object('code','QB_FLAG_UNRESOLVED','field','ai_flags','flag',flag,'message','Record how this original flag was resolved: '||flag));
      END IF;
    END LOOP;
  END IF;
  RETURN issues;
END;
$$;

CREATE FUNCTION public.question_bank_publication_issues(_question_id uuid,_version_id uuid,_action text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE q public.questions%ROWTYPE; v public.question_versions%ROWTYPE; issues jsonb;
BEGIN
  SELECT * INTO q FROM public.questions WHERE id=_question_id;
  IF NOT FOUND THEN RETURN jsonb_build_array(jsonb_build_object('code','QB_NOT_FOUND','field','question_id','message','Question not found.')); END IF;
  issues:=public.question_bank_review_issues(_question_id,_version_id);
  SELECT * INTO v FROM public.question_versions WHERE id=_version_id AND question_id=q.id;
  IF NOT FOUND THEN RETURN issues; END IF;
  IF q.status='retired' THEN
    issues:=issues||jsonb_build_array(jsonb_build_object('code','QB_RETIRED','field','status','message','Archived questions cannot be republished in place.'));
  ELSIF _action='publish' THEN
    IF v.status NOT IN ('draft','review') THEN
      issues:=issues||jsonb_build_array(jsonb_build_object('code','QB_VERSION_NOT_WORKING','field','version_id','message','Select the explicit draft/review version; use Republish for a withdrawn current version.'));
    END IF;
  ELSIF _action='republish' THEN
    IF q.status<>'unpublished' OR q.current_version_id IS DISTINCT FROM v.id OR v.status<>'approved' THEN
      issues:=issues||jsonb_build_array(jsonb_build_object('code','QB_NOT_UNPUBLISHED','field','version_id','message','Republish requires the explicit current approved version of a withdrawn question.'));
    END IF;
  ELSE
    issues:=issues||jsonb_build_array(jsonb_build_object('code','QB_INVALID_ACTION','field','action','message','Choose publish or republish explicitly.'));
  END IF;
  IF q.current_version_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.question_versions WHERE id=q.current_version_id AND question_id=q.id AND status='approved') THEN
    issues:=issues||jsonb_build_array(jsonb_build_object('code','QB_CURRENT_VERSION_INVALID','field','current_version_id','message','The current version is not this question''s approved version.'));
  END IF;
  RETURN issues;
END;
$$;

CREATE FUNCTION public.precheck_question_publication(_question_id uuid,_version_id uuid,_action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE q public.questions%ROWTYPE; v public.question_versions%ROWTYPE; issues jsonb;
BEGIN
  PERFORM public.question_bank_require_admin();
  SELECT * INTO q FROM public.questions WHERE id=_question_id FOR SHARE;
  SELECT * INTO v FROM public.question_versions WHERE id=_version_id AND question_id=_question_id FOR SHARE;
  issues:=public.question_bank_publication_issues(_question_id,_version_id,_action);
  RETURN jsonb_build_object('question_id',_question_id,'version_id',_version_id,'action',_action,
    'question_status',q.status,'version_status',v.status,'current_version_id',q.current_version_id,
    'working_version_id',(SELECT id FROM public.question_versions WHERE question_id=q.id AND status IN ('draft','review')),
    'fingerprint',CASE WHEN v.id IS NOT NULL THEN public.question_bank_publication_fingerprint(q.id,v.id) END,
    'eligible',jsonb_array_length(issues)=0,'issues',issues,
    'review',(SELECT jsonb_build_object('id',id,'reviewed_by',reviewed_by,'reviewed_at',reviewed_at,
      'current',content_fingerprint=public.question_bank_content_fingerprint(v.id)) FROM public.question_version_reviews
      WHERE question_version_id=v.id ORDER BY reviewed_at DESC,id DESC LIMIT 1));
END;
$$;

CREATE FUNCTION public.get_question_publication_state(_question_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE q public.questions%ROWTYPE;
BEGIN
  PERFORM public.question_bank_require_admin();
  SELECT * INTO q FROM public.questions WHERE id=_question_id FOR SHARE;
  IF NOT FOUND THEN PERFORM public.question_bank_error('QB_NOT_FOUND','Question not found.'); END IF;
  PERFORM 1 FROM public.question_versions WHERE question_id=q.id ORDER BY id FOR SHARE;
  RETURN jsonb_build_object('question_id',q.id,'external_id',q.external_id,'status',q.status,'current_version_id',q.current_version_id,
    'versions',(SELECT coalesce(jsonb_agg(jsonb_build_object('version_id',v.id,'version_number',v.version_number,'status',v.status,
      'fingerprint',public.question_bank_publication_fingerprint(q.id,v.id)) ORDER BY v.version_number),'[]') FROM public.question_versions v WHERE v.question_id=q.id),
    'events',(SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.occurred_at,e.id),'[]') FROM public.question_publication_events e WHERE e.question_id=q.id));
END;
$$;

CREATE FUNCTION public.record_question_version_review(_question_id uuid,_version_id uuid,_expected_fingerprint text,_review jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE q public.questions%ROWTYPE; v public.question_versions%ROWTYPE; section text; flags jsonb; flag text;
  policy public.question_calculator_policy; provenance public.question_source_type; verified boolean; issues jsonb; review_id uuid;
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
  IF (SELECT count(*) FROM jsonb_object_keys(_review))<>6 OR NOT _review ?& ARRAY['math','taxonomy','source','render','calculator_policy','flag_resolutions'] THEN
    PERFORM public.question_bank_error('QB_INVALID_REVIEW','Only the documented review fields are accepted; identity and timestamps are server-controlled.');
  END IF;
  FOREACH section IN ARRAY ARRAY['math','taxonomy','source','render'] LOOP
    IF jsonb_typeof(_review->section) IS DISTINCT FROM 'object' OR (_review->section->'confirmed') IS DISTINCT FROM 'true'::jsonb
      OR jsonb_typeof(_review->section->'notes') IS DISTINCT FROM 'string' OR nullif(btrim(_review->section->>'notes'),'') IS NULL THEN
      PERFORM public.question_bank_error('QB_CONFIRMATION_REQUIRED','Explicit confirmation and meaningful notes are required for '||section||'.',jsonb_build_object('field',section));
    END IF;
    IF section<>'source' AND ((SELECT count(*) FROM jsonb_object_keys(_review->section))<>2) THEN
      PERFORM public.question_bank_error('QB_INVALID_REVIEW','Unexpected review section fields.',jsonb_build_object('field',section));
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM jsonb_object_keys(_review->'source'))<>5 OR NOT (_review->'source') ?& ARRAY['confirmed','notes','source_type','locator_verified','printed_number_verified']
    OR jsonb_typeof(_review->'source'->'locator_verified') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(_review->'source'->'printed_number_verified') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(_review->'calculator_policy') IS DISTINCT FROM 'string'
    OR jsonb_typeof(_review->'source'->'source_type') IS DISTINCT FROM 'string' THEN
    PERFORM public.question_bank_error('QB_INVALID_REVIEW','Provide source-use category, calculator policy and explicit provenance verification.');
  END IF;
  BEGIN
    policy:=(_review->>'calculator_policy')::public.question_calculator_policy;
    provenance:=(_review->'source'->>'source_type')::public.question_source_type;
  EXCEPTION WHEN invalid_text_representation THEN
    PERFORM public.question_bank_error('QB_INVALID_REVIEW','Calculator policy or source-use category is not a controlled value.');
  END;
  verified:=(_review->'source'->>'locator_verified')::boolean;
  IF verified AND v.source_locator IS NULL THEN
    PERFORM public.question_bank_error('QB_LOCATOR_UNVERIFIED','An absent locator cannot be marked verified.');
  END IF;
  IF v.source_question_number IS NULL AND NOT verified THEN
    PERFORM public.question_bank_error('QB_LOCATOR_UNVERIFIED','Verify that the generated locator uniquely identifies this unnumbered source question.');
  ELSIF v.source_question_number IS NOT NULL AND (_review->'source'->'printed_number_verified')<>'true'::jsonb THEN
    PERFORM public.question_bank_error('QB_PRINTED_NUMBER_UNVERIFIED','Verify that the recorded question number is actually printed in the source.');
  END IF;
  flags:=public.question_bank_source_flags(v.id);
  IF flags IS NULL THEN PERFORM public.question_bank_error('QB_FLAG_EVIDENCE_INVALID','Original flag evidence is not an array of non-empty strings.'); END IF;
  IF jsonb_typeof(_review->'flag_resolutions') IS DISTINCT FROM 'object' THEN PERFORM public.question_bank_error('QB_FLAG_UNRESOLVED','Provide a resolution record for every original flag.'); END IF;
  FOR flag IN SELECT value FROM jsonb_array_elements_text(flags) LOOP
    IF jsonb_typeof(_review->'flag_resolutions'->flag) IS DISTINCT FROM 'string' OR nullif(btrim(_review->'flag_resolutions'->>flag),'') IS NULL THEN
      PERFORM public.question_bank_error('QB_FLAG_UNRESOLVED','Explain how the original flag was resolved.',jsonb_build_object('flag',flag));
    END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(_review->'flag_resolutions') f WHERE NOT flags ? f) THEN
    PERFORM public.question_bank_error('QB_UNKNOWN_FLAG','Resolve only flags actually present in the original evidence.');
  END IF;
  IF v.status='draft' THEN
    UPDATE public.question_versions SET calculator_policy=policy,source_type=provenance,source_locator_verified=verified WHERE id=v.id;
  ELSIF v.calculator_policy IS DISTINCT FROM policy OR v.source_type IS DISTINCT FROM provenance OR v.source_locator_verified IS DISTINCT FROM verified THEN
    PERFORM public.question_bank_error('QB_READ_ONLY','Review/published content is immutable: return to draft or save a working revision before changing publication facts.');
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

CREATE OR REPLACE FUNCTION public.validate_question_version_approval(_question_id uuid,_version_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE issues jsonb;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.question_versions WHERE id=_version_id AND question_id=_question_id AND status='review') THEN
    PERFORM public.question_bank_error('QB_VERSION_NOT_REVIEW','Approval requires this question''s explicit review version.');
  END IF;
  issues:=public.question_bank_publication_issues(_question_id,_version_id,'publish');
  IF jsonb_array_length(issues)>0 THEN PERFORM public.question_bank_error(issues->0->>'code',issues->0->>'message',jsonb_build_object('issues',issues)); END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_question_lifecycle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE context text:=current_setting('o2i.question_lifecycle',true); issues jsonb;
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'draft' OR NEW.current_version_id IS NOT NULL OR NEW.lifecycle_revision<>0 THEN
      PERFORM public.question_bank_error('QB_CONTROLLED_LIFECYCLE','New questions must start as unpublished drafts.');
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.status=OLD.status AND NEW.current_version_id IS NOT DISTINCT FROM OLD.current_version_id THEN
    IF NEW.lifecycle_revision IS DISTINCT FROM OLD.lifecycle_revision AND NEW.lifecycle_revision<>OLD.lifecycle_revision+1 THEN
      PERFORM public.question_bank_error('QB_INVALID_REVISION','The lifecycle revision may only advance, never reset.');
    END IF;
    RETURN NEW;
  END IF;
  NEW.lifecycle_revision:=OLD.lifecycle_revision+1;
  IF OLD.status='retired' THEN PERFORM public.question_bank_error('QB_RETIRED','Archived questions cannot be restored in place.'); END IF;
  IF context='approve_version' THEN
    IF NEW.status<>'approved' OR NEW.current_version_id IS NULL THEN PERFORM public.question_bank_error('QB_CONTROLLED_LIFECYCLE','Publication must select an approved current version.'); END IF;
  ELSIF context='unpublish_question' THEN
    IF OLD.status<>'approved' OR NEW.status<>'unpublished' OR NEW.current_version_id IS DISTINCT FROM OLD.current_version_id THEN
      PERFORM public.question_bank_error('QB_CONTROLLED_LIFECYCLE','Unpublish must retain the current approved version.');
    END IF;
  ELSIF context='republish_question' THEN
    IF OLD.status<>'unpublished' OR NEW.status<>'approved' OR NEW.current_version_id IS DISTINCT FROM OLD.current_version_id THEN
      PERFORM public.question_bank_error('QB_CONTROLLED_LIFECYCLE','Republish must explicitly restore the current approved version.');
    END IF;
  ELSIF context='retire_question' THEN
    IF OLD.status<>'unpublished' OR NEW.status<>'retired' OR NEW.current_version_id IS NOT NULL THEN
      PERFORM public.question_bank_error('QB_CONTROLLED_LIFECYCLE','Archive requires a withdrawn question and preserves its versions.');
    END IF;
  ELSE PERFORM public.question_bank_error('QB_CONTROLLED_LIFECYCLE','Use a controlled publication RPC.');
  END IF;
  IF NEW.status IN ('approved','unpublished') AND NOT EXISTS(SELECT 1 FROM public.question_versions WHERE id=NEW.current_version_id AND question_id=NEW.id AND status='approved') THEN
    PERFORM public.question_bank_error('QB_CURRENT_VERSION_INVALID','The current version must belong to this question and remain approved.');
  END IF;
  IF NEW.status='approved' THEN
    issues:=public.question_bank_review_issues(NEW.id,NEW.current_version_id);
    IF jsonb_array_length(issues)>0 THEN PERFORM public.question_bank_error(issues->0->>'code',issues->0->>'message',jsonb_build_object('issues',issues)); END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_approved_question_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
BEGIN
  IF OLD.status<>'draft' OR EXISTS(SELECT 1 FROM public.question_versions WHERE question_id=OLD.id AND status IN ('approved','superseded')) THEN
    PERFORM public.question_bank_error('QB_DELETE_HISTORY','Previously published questions cannot be permanently deleted. Withdraw and archive instead.');
  END IF;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_question_revision(_question_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE q public.questions%ROWTYPE; v public.question_versions%ROWTYPE; new_id uuid; next_number integer;
  previous_context text:=current_setting('o2i.question_version_transition',true);
BEGIN
  PERFORM public.question_bank_require_admin();
  SELECT * INTO q FROM public.questions WHERE id=_question_id FOR UPDATE;
  IF NOT FOUND OR q.status NOT IN ('approved','unpublished') OR q.current_version_id IS NULL THEN
    PERFORM public.question_bank_error('QB_REVISION_SOURCE','A published or withdrawn question with a current approved version is required.');
  END IF;
  SELECT * INTO v FROM public.question_versions WHERE id=q.current_version_id AND question_id=q.id AND status='approved' FOR UPDATE;
  IF NOT FOUND THEN PERFORM public.question_bank_error('QB_CURRENT_VERSION_INVALID','The current approved source version is invalid.'); END IF;
  IF EXISTS(SELECT 1 FROM public.question_versions WHERE question_id=q.id AND status IN ('draft','review')) THEN
    PERFORM public.question_bank_error('QB_WORKING_REVISION_EXISTS','Select the existing working version explicitly; do not create another.');
  END IF;
  SELECT coalesce(max(version_number),0)+1 INTO next_number FROM public.question_versions WHERE question_id=q.id;
  PERFORM set_config('o2i.question_version_transition','create_revision',true);
  INSERT INTO public.question_versions(question_id,version_number,status,question_type,stem,solution,difficulty,course_scope,
    primary_topic_id,representation_type,calculator_policy,source_type,source_document,source_page,source_question_number,
    source_locator,source_locator_verified,source_reference,requires_figure,image_url,import_evidence,created_by)
  VALUES(q.id,next_number,'draft',v.question_type,v.stem,v.solution,v.difficulty,v.course_scope,v.primary_topic_id,v.representation_type,
    v.calculator_policy,v.source_type,v.source_document,v.source_page,v.source_question_number,v.source_locator,v.source_locator_verified,
    v.source_reference,v.requires_figure,v.image_url,v.import_evidence,auth.uid()) RETURNING id INTO new_id;
  INSERT INTO public.question_options(question_version_id,option_key,option_text,order_index,is_correct,import_evidence)
    SELECT new_id,option_key,option_text,order_index,is_correct,import_evidence FROM public.question_options WHERE question_version_id=v.id;
  INSERT INTO public.question_practice_skills(question_version_id,practice_skill_id)
    SELECT new_id,practice_skill_id FROM public.question_practice_skills WHERE question_version_id=v.id;
  INSERT INTO public.question_topics(question_version_id,topic_id)
    SELECT new_id,topic_id FROM public.question_topics WHERE question_version_id=v.id;
  INSERT INTO public.option_misconceptions(option_id,misconception_id)
    SELECT new_option.id,m.misconception_id FROM public.option_misconceptions m
      JOIN public.question_options old_option ON old_option.id=m.option_id
      JOIN public.question_options new_option ON new_option.question_version_id=new_id AND new_option.option_key=old_option.option_key
      WHERE old_option.question_version_id=v.id;
  -- Trusted reviews are version-bound and deliberately NOT copied.
  PERFORM set_config('o2i.question_version_transition',coalesce(previous_context,''),true);
  RETURN new_id;
END;
$$;

-- Preserve the old signature as a private core, but bind reviewed_by to the
-- trusted reviewer. Publication events separately record the approving actor.
CREATE OR REPLACE FUNCTION public.approve_question_version(_question_id uuid,_version_id uuid)
RETURNS public.questions LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE q public.questions%ROWTYPE; v public.question_versions%ROWTYPE; reviewer uuid;
  old_context text:=current_setting('o2i.question_lifecycle',true);
  old_version_context text:=current_setting('o2i.question_version_transition',true);
BEGIN
  PERFORM public.question_bank_require_admin();
  SELECT * INTO q FROM public.questions WHERE id=_question_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM public.question_bank_error('QB_NOT_FOUND','Question not found.'); END IF;
  SELECT * INTO v FROM public.question_versions WHERE id=_version_id AND question_id=q.id FOR UPDATE;
  IF NOT FOUND THEN PERFORM public.question_bank_error('QB_VERSION_MISMATCH','Version does not belong to this question.'); END IF;
  IF q.current_version_id IS NOT NULL THEN
    PERFORM 1 FROM public.question_versions WHERE id=q.current_version_id AND question_id=q.id AND status='approved' FOR UPDATE;
    IF NOT FOUND THEN PERFORM public.question_bank_error('QB_CURRENT_VERSION_INVALID','Current approved version is invalid.'); END IF;
  END IF;
  PERFORM public.validate_question_version_approval(q.id,v.id);
  SELECT reviewed_by INTO reviewer FROM public.question_version_reviews WHERE question_version_id=v.id ORDER BY reviewed_at DESC,id DESC LIMIT 1;
  PERFORM set_config('o2i.question_lifecycle','approve_version',true);
  PERFORM set_config('o2i.question_version_transition','approve_version',true);
  IF q.current_version_id IS NOT NULL THEN UPDATE public.question_versions SET status='superseded' WHERE id=q.current_version_id; END IF;
  UPDATE public.question_versions SET status='approved',reviewed_by=reviewer,approved_at=clock_timestamp() WHERE id=v.id;
  UPDATE public.questions SET status='approved',current_version_id=v.id WHERE id=q.id RETURNING * INTO q;
  PERFORM set_config('o2i.question_lifecycle',coalesce(old_context,''),true);
  PERFORM set_config('o2i.question_version_transition',coalesce(old_version_context,''),true);
  RETURN q;
END;
$$;

CREATE FUNCTION public.save_question_bank_revision(_question_id uuid,_source_version_id uuid,_expected_fingerprint text,_metadata jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE q public.questions%ROWTYPE; new_id uuid;
BEGIN
  PERFORM public.question_bank_require_admin();
  SELECT * INTO q FROM public.questions WHERE id=_question_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM public.question_bank_error('QB_NOT_FOUND','Question not found.'); END IF;
  PERFORM 1 FROM public.question_versions WHERE id=_source_version_id AND question_id=q.id FOR UPDATE;
  IF NOT FOUND OR q.current_version_id IS DISTINCT FROM _source_version_id OR q.status NOT IN ('approved','unpublished') THEN
    PERFORM public.question_bank_error('QB_REVISION_SOURCE','Select the explicit current approved version of a published or withdrawn question.');
  END IF;
  IF _expected_fingerprint IS DISTINCT FROM public.question_bank_publication_fingerprint(q.id,_source_version_id) THEN
    PERFORM public.question_bank_error('QB_STALE','Publication or a working revision changed. Reload before saving.');
  END IF;
  new_id:=public.create_question_revision(q.id);
  BEGIN
    PERFORM public.update_question_bank_draft_metadata(q.id,new_id,public.question_bank_draft_fingerprint(q.id,new_id),_metadata);
  EXCEPTION WHEN check_violation OR invalid_text_representation OR invalid_parameter_value OR numeric_value_out_of_range OR foreign_key_violation THEN
    PERFORM public.question_bank_error('QB_METADATA_INVALID',SQLERRM);
  END;
  RETURN jsonb_build_object('question_id',q.id,'version_id',new_id,'status','draft',
    'draft',public.get_question_bank_draft(q.id,new_id),'state',public.get_question_publication_state(q.id));
END;
$$;

CREATE FUNCTION public.publish_question_versions(_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE item jsonb; issues jsonb; saved jsonb:='[]'; qid uuid; vid uuid; previous_id uuid; event_id uuid;
  old_context text:=current_setting('o2i.question_lifecycle',true);
BEGIN
  PERFORM public.question_bank_require_admin();
  IF _items IS NULL OR jsonb_typeof(_items)<>'array' THEN PERFORM public.question_bank_error('QB_INVALID_BATCH','Provide an explicit array of publication targets.'); END IF;
  IF jsonb_array_length(_items) NOT BETWEEN 1 AND 20 THEN PERFORM public.question_bank_error('QB_BATCH_LIMIT','Publish 1–20 explicit question/version targets per transaction.'); END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(_items) LOOP
    IF jsonb_typeof(item)<>'object' THEN PERFORM public.question_bank_error('QB_INVALID_BATCH','Each target must be an object.'); END IF;
    IF (SELECT count(*) FROM jsonb_object_keys(item))<>4 OR NOT item ?& ARRAY['question_id','version_id','expected_fingerprint','action']
      OR EXISTS(SELECT 1 FROM jsonb_each(item) e WHERE jsonb_typeof(e.value)<>'string')
      OR nullif(item->>'expected_fingerprint','') IS NULL OR item->>'action' NOT IN ('publish','republish') THEN
      PERFORM public.question_bank_error('QB_INVALID_BATCH','Each target needs only question_id, version_id, expected_fingerprint and explicit action.');
    END IF;
    BEGIN qid:=(item->>'question_id')::uuid; vid:=(item->>'version_id')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN PERFORM public.question_bank_error('QB_INVALID_BATCH','Question and version IDs must be UUIDs.'); END;
  END LOOP;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(_items) x GROUP BY (x->>'question_id')::uuid HAVING count(*)>1)
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(_items) x GROUP BY (x->>'version_id')::uuid HAVING count(*)>1) THEN
    PERFORM public.question_bank_error('QB_DUPLICATE_TARGET','A batch cannot repeat a question or version ID.');
  END IF;
  -- Globally ordered parent locks, then version locks. No target is mutated
  -- until every expected snapshot and server review/content check passes.
  PERFORM 1 FROM public.questions q WHERE q.id IN (SELECT (x->>'question_id')::uuid FROM jsonb_array_elements(_items) x) ORDER BY q.id FOR UPDATE;
  PERFORM 1 FROM public.question_versions v JOIN public.questions q ON q.id=v.question_id
    WHERE q.id IN (SELECT (x->>'question_id')::uuid FROM jsonb_array_elements(_items) x)
      AND (v.id=q.current_version_id OR v.id IN (SELECT (x->>'version_id')::uuid FROM jsonb_array_elements(_items) x))
    ORDER BY v.question_id,v.id FOR UPDATE OF v;
  FOR item IN SELECT value FROM jsonb_array_elements(_items) ORDER BY (value->>'question_id')::uuid LOOP
    qid:=(item->>'question_id')::uuid; vid:=(item->>'version_id')::uuid;
    IF NOT EXISTS(SELECT 1 FROM public.questions WHERE id=qid) THEN PERFORM public.question_bank_error('QB_NOT_FOUND','Question not found.',jsonb_build_object('question_id',qid)); END IF;
    IF NOT EXISTS(SELECT 1 FROM public.question_versions WHERE id=vid AND question_id=qid) THEN PERFORM public.question_bank_error('QB_VERSION_MISMATCH','Version does not belong to the requested question.',jsonb_build_object('question_id',qid,'version_id',vid)); END IF;
    IF item->>'expected_fingerprint' IS DISTINCT FROM public.question_bank_publication_fingerprint(qid,vid) THEN
      PERFORM public.question_bank_error('QB_STALE','Publication target changed. Reload the plan; nothing in this batch was published.',jsonb_build_object('question_id',qid,'version_id',vid));
    END IF;
    issues:=public.question_bank_publication_issues(qid,vid,item->>'action');
    IF jsonb_array_length(issues)>0 THEN PERFORM public.question_bank_error(issues->0->>'code',issues->0->>'message',jsonb_build_object('question_id',qid,'version_id',vid,'issues',issues)); END IF;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(_items) ORDER BY (value->>'question_id')::uuid LOOP
    qid:=(item->>'question_id')::uuid; vid:=(item->>'version_id')::uuid;
    SELECT current_version_id INTO previous_id FROM public.questions WHERE id=qid;
    IF item->>'action'='publish' THEN
      IF EXISTS(SELECT 1 FROM public.question_versions WHERE id=vid AND status='draft') THEN
        PERFORM public.submit_question_version_for_review(qid,vid);
      END IF;
      PERFORM public.approve_question_version(qid,vid);
    ELSE
      PERFORM set_config('o2i.question_lifecycle','republish_question',true);
      UPDATE public.questions SET status='approved' WHERE id=qid;
      PERFORM set_config('o2i.question_lifecycle',coalesce(old_context,''),true);
    END IF;
    INSERT INTO public.question_publication_events(question_id,version_id,previous_version_id,action,request_fingerprint,actor_id)
      VALUES(qid,vid,previous_id,item->>'action',item->>'expected_fingerprint',auth.uid()) RETURNING id INTO event_id;
    saved:=saved||jsonb_build_array(jsonb_build_object('question_id',qid,'version_id',vid,'action',item->>'action',
      'status','approved','current_version_id',vid,'event_id',event_id,'fingerprint',public.question_bank_publication_fingerprint(qid,vid)));
  END LOOP;
  RETURN saved;
END;
$$;

CREATE FUNCTION public.publish_question_version(_question_id uuid,_version_id uuid,_expected_fingerprint text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
BEGIN
  RETURN public.publish_question_versions(jsonb_build_array(jsonb_build_object('question_id',_question_id,'version_id',_version_id,
    'expected_fingerprint',_expected_fingerprint,'action','publish')))->0;
END;
$$;
CREATE FUNCTION public.republish_question(_question_id uuid,_version_id uuid,_expected_fingerprint text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
BEGIN
  RETURN public.publish_question_versions(jsonb_build_array(jsonb_build_object('question_id',_question_id,'version_id',_version_id,
    'expected_fingerprint',_expected_fingerprint,'action','republish')))->0;
END;
$$;

CREATE FUNCTION public.unpublish_question(_question_id uuid,_version_id uuid,_expected_fingerprint text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE q public.questions%ROWTYPE; old_context text:=current_setting('o2i.question_lifecycle',true); event_id uuid;
BEGIN
  PERFORM public.question_bank_require_admin();
  SELECT * INTO q FROM public.questions WHERE id=_question_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM public.question_bank_error('QB_NOT_FOUND','Question not found.'); END IF;
  PERFORM 1 FROM public.question_versions WHERE id=_version_id AND question_id=q.id FOR UPDATE;
  IF q.status<>'approved' OR q.current_version_id IS DISTINCT FROM _version_id THEN PERFORM public.question_bank_error('QB_NOT_PUBLISHED','Select the explicit current published version to withdraw.'); END IF;
  IF _expected_fingerprint IS DISTINCT FROM public.question_bank_publication_fingerprint(q.id,_version_id) THEN PERFORM public.question_bank_error('QB_STALE','The published question changed. Reload before withdrawing.'); END IF;
  PERFORM set_config('o2i.question_lifecycle','unpublish_question',true);
  UPDATE public.questions SET status='unpublished' WHERE id=q.id;
  PERFORM set_config('o2i.question_lifecycle',coalesce(old_context,''),true);
  INSERT INTO public.question_publication_events(question_id,version_id,previous_version_id,action,request_fingerprint,actor_id)
    VALUES(q.id,_version_id,_version_id,'unpublish',_expected_fingerprint,auth.uid()) RETURNING id INTO event_id;
  RETURN jsonb_build_object('question_id',q.id,'version_id',_version_id,'status','unpublished','current_version_id',_version_id,
    'event_id',event_id,'fingerprint',public.question_bank_publication_fingerprint(q.id,_version_id));
END;
$$;

CREATE FUNCTION public.archive_question(_question_id uuid,_version_id uuid,_expected_fingerprint text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE q public.questions%ROWTYPE; event_id uuid; old_context text:=current_setting('o2i.question_lifecycle',true);
  old_version_context text:=current_setting('o2i.question_version_transition',true);
BEGIN
  PERFORM public.question_bank_require_admin();
  SELECT * INTO q FROM public.questions WHERE id=_question_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM public.question_bank_error('QB_NOT_FOUND','Question not found.'); END IF;
  PERFORM 1 FROM public.question_versions WHERE id=_version_id AND question_id=q.id FOR UPDATE;
  IF q.status<>'unpublished' OR q.current_version_id IS DISTINCT FROM _version_id THEN PERFORM public.question_bank_error('QB_NOT_UNPUBLISHED','Withdraw the explicit current version before archiving.'); END IF;
  IF _expected_fingerprint IS DISTINCT FROM public.question_bank_publication_fingerprint(q.id,_version_id) THEN PERFORM public.question_bank_error('QB_STALE','Question changed. Reload before archiving.'); END IF;
  IF EXISTS(SELECT 1 FROM public.question_versions WHERE question_id=q.id AND status IN ('draft','review')) THEN
    PERFORM public.question_bank_error('QB_WORKING_REVISION_EXISTS','Resolve or delete the working revision first; archive never removes it silently.');
  END IF;
  PERFORM set_config('o2i.question_lifecycle','retire_question',true);
  PERFORM set_config('o2i.question_version_transition','retire_question',true);
  UPDATE public.question_versions SET status='superseded' WHERE id=_version_id;
  UPDATE public.questions SET status='retired',current_version_id=NULL WHERE id=q.id;
  PERFORM set_config('o2i.question_lifecycle',coalesce(old_context,''),true);
  PERFORM set_config('o2i.question_version_transition',coalesce(old_version_context,''),true);
  INSERT INTO public.question_publication_events(question_id,version_id,previous_version_id,action,request_fingerprint,actor_id)
    VALUES(q.id,_version_id,_version_id,'archive',_expected_fingerprint,auth.uid()) RETURNING id INTO event_id;
  RETURN jsonb_build_object('question_id',q.id,'version_id',_version_id,'status','retired','current_version_id',NULL,'event_id',event_id);
END;
$$;

-- Legacy entry points become private cores; clients must use snapshot-aware operations.
REVOKE ALL ON FUNCTION public.approve_question_version(uuid,uuid),public.create_question_revision(uuid),public.retire_question(uuid)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.validate_question_version_approval(uuid,uuid),public.assert_question_bank_admin(),
  public.enforce_question_lifecycle(),public.enforce_question_version_lifecycle(),public.prevent_approved_question_delete()
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.question_bank_error(text,text,jsonb),public.question_bank_require_admin(),
  public.advance_question_editorial_revision(),public.track_question_version_identity(),public.invalidate_returned_question_review(),public.reject_question_child_reparent(),public.track_question_child_change(),
  public.question_bank_content_fingerprint(uuid),public.question_bank_publication_fingerprint(uuid,uuid),
  public.question_bank_source_flags(uuid),public.question_bank_content_issues(uuid,uuid),public.question_bank_review_issues(uuid,uuid),
  public.question_bank_publication_issues(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.precheck_question_publication(uuid,uuid,text),public.get_question_publication_state(uuid),
  public.record_question_version_review(uuid,uuid,text,jsonb),public.save_question_bank_revision(uuid,uuid,text,jsonb),
  public.publish_question_versions(jsonb),public.publish_question_version(uuid,uuid,text),
  public.unpublish_question(uuid,uuid,text),public.republish_question(uuid,uuid,text),public.archive_question(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.precheck_question_publication(uuid,uuid,text),public.get_question_publication_state(uuid),
  public.record_question_version_review(uuid,uuid,text,jsonb),public.save_question_bank_revision(uuid,uuid,text,jsonb),
  public.publish_question_versions(jsonb),public.publish_question_version(uuid,uuid,text),
  public.unpublish_question(uuid,uuid,text),public.republish_question(uuid,uuid,text),public.archive_question(uuid,uuid,text) TO authenticated;

COMMENT ON TABLE public.question_version_reviews IS 'Append-only admin confirmations tied to exact version content/editorial revision. Imported review assertions never substitute for these records.';
COMMENT ON TABLE public.question_publication_events IS 'Append-only server-authored publication/withdrawal/restoration/archive history. Unknown outcomes can be verified with get_question_publication_state.';
COMMENT ON COLUMN public.questions.current_version_id IS 'Current approved content retained for approved/unpublished identities; only approved identities are student-visible. NULL for draft/retired.';
COMMENT ON COLUMN public.question_versions.editorial_revision IS 'Monotonic content/child change counter. Old confirmations remain stale even if values are changed back.';
COMMENT ON COLUMN public.questions.lifecycle_revision IS 'Monotonic publication/version-set change counter. Deleting a working revision never revives an old save/publication token.';
COMMENT ON FUNCTION public.save_question_bank_revision(uuid,uuid,text,jsonb) IS 'Explicit Save only: clone current published/withdrawn version and apply Task 4B metadata atomically. Reads never create a revision.';
COMMENT ON FUNCTION public.publish_question_versions(jsonb) IS 'Admin-only 1-20 explicit snapshot-checked targets, ordered parent/version locks and all-or-nothing publication. Imported approvals are not trusted.';
COMMENT ON FUNCTION public.precheck_question_publication(uuid,uuid,text) IS 'Read-only advisory checks and stable QB_* issues. Publication repeats checks under exclusive locks; never trust this result alone.';
COMMENT ON FUNCTION public.get_question_publication_state(uuid) IS 'Admin-only readback for exact current/working/history identities and publication audit; safe recovery for unknown request outcomes.';
COMMENT ON FUNCTION public.record_question_version_review(uuid,uuid,text,jsonb) IS 'Explicit version-bound human confirmations and original-flag resolutions. Server identity/time; preserves intake evidence and never publishes.';
COMMENT ON FUNCTION public.publish_question_version(uuid,uuid,text) IS 'Single-item wrapper over the same atomic publication batch core; requires exact version and fresh snapshot.';
COMMENT ON FUNCTION public.unpublish_question(uuid,uuid,text) IS 'Reversible withdrawal retaining current approved content and all history. Does not erase a working revision.';
COMMENT ON FUNCTION public.republish_question(uuid,uuid,text) IS 'Explicit restoration of the selected withdrawn current approved version; rechecks trusted review/content and creates no version.';
COMMENT ON FUNCTION public.archive_question(uuid,uuid,text) IS 'Irreversible archive of a withdrawn question with no working revision; retains all published history and records server actor/time.';
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

  IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version IN ('20261019010000')) THEN
    RAISE EXCEPTION 'STOP: this or a later Task 4 migration is already recorded. Readonly verify; never repeat blindly.';
  END IF;
  IF EXISTS(SELECT 1 FROM (VALUES ('20260926000000','question_bank_foundation','d74284a7a6f56bb87a2d86fc5fab221b'),('20261004000000','question_bank_draft_import','ed97a5cdf46d446810ae336850d05874'),('20261018000000','question_bank_draft_management','0868c0f1ad21902ed372e05e0d62f58a'),('20261019000000','question_bank_unpublished_status','345be247bee1e33cf18b36c1707e7fd0')) e(version,name,body_hash)
    LEFT JOIN supabase_migrations.schema_migrations m ON m.version=e.version
    WHERE m.version IS NULL OR m.name IS DISTINCT FROM e.name OR cardinality(m.statements) IS DISTINCT FROM 1 OR md5(m.statements[1]) IS DISTINCT FROM e.body_hash) THEN
    RAISE EXCEPTION 'STOP: prerequisite migration ledger is missing or differs from repository SQL. Do not replay or repair it blindly.';
  END IF;
  IF to_regclass('public.question_version_reviews') IS NOT NULL OR to_regclass('public.question_publication_events') IS NOT NULL
    OR EXISTS(SELECT 1 FROM pg_attribute WHERE (attrelid=to_regclass('public.questions') AND attname='lifecycle_revision'
      OR attrelid=to_regclass('public.question_versions') AND attname='editorial_revision') AND attnum>0 AND NOT attisdropped)
    OR EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('question_bank_error','question_bank_require_admin','advance_question_editorial_revision','track_question_version_identity','invalidate_returned_question_review','reject_question_child_reparent','track_question_child_change','question_bank_content_fingerprint','question_bank_publication_fingerprint','question_bank_source_flags','question_bank_content_issues','question_bank_review_issues','question_bank_publication_issues','precheck_question_publication','get_question_publication_state','record_question_version_review','save_question_bank_revision','publish_question_versions','publish_question_version','republish_question','unpublish_question','archive_question')) THEN
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
    FROM (VALUES ('question_status',ARRAY['draft','approved','retired','unpublished']::text[]),('question_version_status',ARRAY['draft','review','approved','superseded']::text[]),('question_type',ARRAY['mcq_single']::text[]),('question_difficulty',ARRAY['easy','medium','hard']::text[]),('question_course_scope',ARRAY['AB','BC','BOTH']::text[]),('question_representation_type',ARRAY['analytical','graphical','numerical','verbal','mixed']::text[]),('question_calculator_policy',ARRAY['no_calculator','calculator_allowed','calculator_required']::text[]),('question_source_type',ARRAY['original','licensed','public_domain','permission_granted']::text[])) e(name,expected_values)
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
    RAISE EXCEPTION 'STOP: prerequisite catalog differs from the reviewed stage.' USING DETAIL=report::text;
  END IF;
  EXECUTE migration_sql;
  WITH expected_functions(signature,body_hash,definer,return_type,argument_names,search_path) AS (VALUES ('public.has_role(uuid,public.app_role)','b6a4c82ad51a3997410a4bc37975e05f',true,'boolean',ARRAY['_user_id','_role']::text[],'public,extensions'),
('public.is_super_admin(uuid)','debcc4a5a880088e40f8ad55ed073614',true,'boolean',ARRAY['_user_id']::text[],'public,extensions'),
('public.update_updated_at_column()','a3a8dcc15e232b73d3f5c4abfa43f3d8',false,'TRIGGER',ARRAY[]::text[],'public'),
('public.validate_question_version_approval(uuid,uuid)','e0c39ea89217a0bd395891789ed41aa7',true,'void',ARRAY['_question_id','_version_id']::text[],'public,extensions'),
('public.enforce_question_lifecycle()','b2128ce0e672a8c73f3a450147aa0013',true,'trigger',ARRAY[]::text[],'public,extensions'),
('public.enforce_question_version_lifecycle()','a3f8b115a46fb425640cf19b711c2a6b',true,'trigger',ARRAY[]::text[],'public,extensions'),
('public.protect_non_draft_version_child()','8dfd627fabeea7d88246b510fc517281',true,'trigger',ARRAY[]::text[],'public,extensions'),
('public.reject_primary_topic_as_secondary()','053c04d309b2ab4aa4bcc7532a0db15d',true,'trigger',ARRAY[]::text[],'public,extensions'),
('public.reject_secondary_topic_as_primary()','9f4a112bf6c5eaaddce2b32204769e70',true,'trigger',ARRAY[]::text[],'public,extensions'),
('public.protect_non_draft_option_misconception()','450724421924aa5c21e59bb630e8c30d',true,'trigger',ARRAY[]::text[],'public,extensions'),
('public.reject_correct_option_misconception()','371661c1cadf945a79258e4ed6022cdb',true,'trigger',ARRAY[]::text[],'public,extensions'),
('public.reject_correct_option_with_misconception()','944bc1bcb25c7826990ff62301ac783a',true,'trigger',ARRAY[]::text[],'public,extensions'),
('public.prevent_approved_question_delete()','2e12549b043dadabf9d7a9869fe81f75',true,'trigger',ARRAY[]::text[],'public,extensions'),
('public.assert_question_bank_admin()','db723134f0718668986d106b6689e375',true,'void',ARRAY[]::text[],'public,extensions'),
('public.create_question_revision(uuid)','7d3052c024c10cf44e0a1ec10e7c56cb',true,'uuid',ARRAY['_question_id']::text[],'public,extensions'),
('public.submit_question_version_for_review(uuid,uuid)','1658956fe0598859003c1cd2a52c0206',true,'uuid',ARRAY['_question_id','_version_id']::text[],'public,extensions'),
('public.return_question_version_to_draft(uuid,uuid)','b09dac9c077364e28425ffaa395ca755',true,'uuid',ARRAY['_question_id','_version_id']::text[],'public,extensions'),
('public.approve_question_version(uuid,uuid)','855be8e2cbbaeaab309a61e65c9a5cde',true,'public.questions',ARRAY['_question_id','_version_id']::text[],'public,extensions'),
('public.retire_question(uuid)','f077f74c363cfdf03586961e1d143abb',true,'public.questions',ARRAY['_question_id']::text[],'public,extensions'),
('public.require_question_publication_metadata()','476ca3529520281ee087e914932c8d9d',true,'trigger',ARRAY[]::text[],'public,extensions'),
('public.save_question_bank_drafts(jsonb)','17ac2a83f0fd26e59a11e0c12c803390',true,'jsonb',ARRAY['_items']::text[],'public,extensions'),
('public.question_bank_draft_fingerprint(uuid,uuid)','b812c627441277154e1dcf9230154c61',true,'text',ARRAY['_question_id','_version_id']::text[],'public,extensions'),
('public.get_question_bank_draft(uuid,uuid)','28e6d42d05309d55a8828c9b856cc5f8',true,'jsonb',ARRAY['_question_id','_version_id']::text[],'public,extensions'),
('public.update_question_bank_draft_metadata(uuid,uuid,text,jsonb)','dcdb0d4fb8b8f3e0bf02fa690480d6ee',true,'uuid',ARRAY['_question_id','_version_id','_expected_fingerprint','_metadata']::text[],'public,extensions'),
('public.delete_question_bank_draft(uuid,uuid,text,boolean)','ee20ca534f158df89181499bab9ae5bf',true,'jsonb',ARRAY['_question_id','_version_id','_expected_fingerprint','_delete_question']::text[],'public,extensions'),
('public.question_bank_error(text,text,jsonb)','fd9ca1ef6ff6015941e2bde30ca2b41e',false,'void',ARRAY['_code','_message','_details']::text[],'public,extensions'),
('public.question_bank_require_admin()','9b1cb807faa0ea3d245a5206411d92a3',true,'void',ARRAY[]::text[],'public,extensions'),
('public.advance_question_editorial_revision()','561075734b85dea3f60313fd067305ad',true,'trigger',ARRAY[]::text[],'public,extensions'),
('public.track_question_version_identity()','f6d8a3e38a580b2225811ecee2d28056',true,'trigger',ARRAY[]::text[],'public,extensions'),
('public.invalidate_returned_question_review()','8b97084e7363e7f47025f58c29dc3b37',true,'trigger',ARRAY[]::text[],'public,extensions'),
('public.reject_question_child_reparent()','cf9cd7bb6e56c2898a539d86e3a5ab30',true,'trigger',ARRAY[]::text[],'public,extensions'),
('public.track_question_child_change()','57717632643c17d0e7d9aa603ec2f107',true,'trigger',ARRAY[]::text[],'public,extensions'),
('public.question_bank_content_fingerprint(uuid)','8ef4516f97625b71c8f9563612140ecf',true,'text',ARRAY['_version_id']::text[],'public,extensions'),
('public.question_bank_publication_fingerprint(uuid,uuid)','cea5e96d48c908262cb58a74db3afeb5',true,'text',ARRAY['_question_id','_version_id']::text[],'public,extensions'),
('public.question_bank_source_flags(uuid)','f5c9b20f8bb0ee9c7695f2c6a1f70177',true,'jsonb',ARRAY['_version_id']::text[],'public,extensions'),
('public.question_bank_content_issues(uuid,uuid)','36597e9f2bdccb6b7712cbadb57f995c',true,'jsonb',ARRAY['_question_id','_version_id']::text[],'public,extensions'),
('public.question_bank_review_issues(uuid,uuid)','2baddf9fdceeeaf1af645d01a14529d5',true,'jsonb',ARRAY['_question_id','_version_id']::text[],'public,extensions'),
('public.question_bank_publication_issues(uuid,uuid,text)','4ff048f87eaf241296ea72e27dd84473',true,'jsonb',ARRAY['_question_id','_version_id','_action']::text[],'public,extensions'),
('public.precheck_question_publication(uuid,uuid,text)','560d5c85f3e18df2442ec9264b69ba6a',true,'jsonb',ARRAY['_question_id','_version_id','_action']::text[],'public,extensions'),
('public.get_question_publication_state(uuid)','0719f9dfc1ae178875f318971b133ca0',true,'jsonb',ARRAY['_question_id']::text[],'public,extensions'),
('public.record_question_version_review(uuid,uuid,text,jsonb)','d815d915411f9aeaeaeb2d49515477f0',true,'jsonb',ARRAY['_question_id','_version_id','_expected_fingerprint','_review']::text[],'public,extensions'),
('public.save_question_bank_revision(uuid,uuid,text,jsonb)','e980820f7bc6a4126444b7cfd9fb377c',true,'jsonb',ARRAY['_question_id','_source_version_id','_expected_fingerprint','_metadata']::text[],'public,extensions'),
('public.publish_question_versions(jsonb)','7fdbd8644782d612ebf116a5fed6b635',true,'jsonb',ARRAY['_items']::text[],'public,extensions'),
('public.publish_question_version(uuid,uuid,text)','7221776f4e220e22567d45cebdd77008',true,'jsonb',ARRAY['_question_id','_version_id','_expected_fingerprint']::text[],'public,extensions'),
('public.republish_question(uuid,uuid,text)','8e1aad857f13add71482386ae4e9fbd2',true,'jsonb',ARRAY['_question_id','_version_id','_expected_fingerprint']::text[],'public,extensions'),
('public.unpublish_question(uuid,uuid,text)','734a6a8b8e3e717391897b37b6790fcb',true,'jsonb',ARRAY['_question_id','_version_id','_expected_fingerprint']::text[],'public,extensions'),
('public.archive_question(uuid,uuid,text)','e0124ff1ba8e894b0aa3f27b50705e2e',true,'jsonb',ARRAY['_question_id','_version_id','_expected_fingerprint']::text[],'public,extensions')),
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
  FROM (VALUES ('questions',2),('question_versions',1),('question_options',1),('question_practice_skills',2),('question_topics',2),('misconceptions',1),('option_misconceptions',1),('question_course_videos',2),('question_version_reviews',1),('question_publication_events',1)) e(name,policy_count)
  LEFT JOIN pg_class c ON c.oid=to_regclass('public.'||e.name)
), policy_checks AS (
  SELECT e.table_name,e.name,p.polcmd::text=e.command AND p.polpermissive
    AND p.polroles=ARRAY[(SELECT oid FROM pg_roles WHERE rolname='authenticated')]
    AND (e.name NOT LIKE 'Admins %' OR regexp_replace(pg_get_expr(p.polqual,p.polrelid),'[[:space:]]','','g')='has_role(auth.uid(),''admin''::app_role)')
    AND (e.command<>'*' OR regexp_replace(pg_get_expr(p.polwithcheck,p.polrelid),'[[:space:]]','','g')='has_role(auth.uid(),''admin''::app_role)') AS ok
  FROM (VALUES ('questions','Admins manage questions','*'),('questions','Authenticated users read approved questions','r'),('question_versions','Admins manage question versions','*'),('question_options','Admins manage question options','*'),('question_practice_skills','Admins manage question practice skills','*'),('question_practice_skills','Authenticated users read approved question practice skills','r'),('question_topics','Admins manage secondary question topics','*'),('question_topics','Authenticated users read approved secondary question topics','r'),('misconceptions','Admins manage misconceptions','*'),('option_misconceptions','Admins manage option misconceptions','*'),('question_course_videos','Admins manage question course videos','*'),('question_course_videos','Authenticated users read approved question course videos','r'),('question_version_reviews','Admins read trusted question reviews','r'),('question_publication_events','Admins read question publication history','r')) e(table_name,name,command)
  LEFT JOIN pg_policy p ON p.polrelid=to_regclass('public.'||e.table_name) AND p.polname=e.name
), trigger_checks AS (
  SELECT e.table_name,e.name,t.tgenabled='O' AND t.tgfoid=to_regprocedure(e.signature) AS ok
  FROM (VALUES ('questions','update_questions_updated_at','public.update_updated_at_column()'),('misconceptions','update_misconceptions_updated_at','public.update_updated_at_column()'),('questions','enforce_question_lifecycle_trigger','public.enforce_question_lifecycle()'),('question_versions','enforce_question_version_lifecycle_trigger','public.enforce_question_version_lifecycle()'),('question_options','protect_non_draft_question_options','public.protect_non_draft_version_child()'),('question_practice_skills','protect_non_draft_question_practice_skills','public.protect_non_draft_version_child()'),('question_topics','protect_non_draft_question_topics','public.protect_non_draft_version_child()'),('question_topics','reject_primary_topic_as_secondary_trigger','public.reject_primary_topic_as_secondary()'),('question_versions','reject_secondary_topic_as_primary_trigger','public.reject_secondary_topic_as_primary()'),('option_misconceptions','protect_non_draft_option_misconceptions','public.protect_non_draft_option_misconception()'),('option_misconceptions','reject_correct_option_misconception_trigger','public.reject_correct_option_misconception()'),('question_options','reject_correct_option_with_misconception_trigger','public.reject_correct_option_with_misconception()'),('questions','prevent_approved_question_delete_trigger','public.prevent_approved_question_delete()'),('question_versions','require_question_publication_metadata_trigger','public.require_question_publication_metadata()'),('question_versions','a_advance_question_editorial_revision','public.advance_question_editorial_revision()'),('question_versions','track_question_version_identity','public.track_question_version_identity()'),('question_versions','invalidate_returned_question_review','public.invalidate_returned_question_review()'),('question_options','a_reject_option_reparent','public.reject_question_child_reparent()'),('question_practice_skills','a_reject_skill_reparent','public.reject_question_child_reparent()'),('question_topics','a_reject_topic_reparent','public.reject_question_child_reparent()'),('option_misconceptions','a_reject_misconception_reparent','public.reject_question_child_reparent()'),('question_options','track_question_options_change','public.track_question_child_change()'),('question_practice_skills','track_question_skills_change','public.track_question_child_change()'),('question_topics','track_question_topics_change','public.track_question_child_change()'),('option_misconceptions','track_option_misconceptions_change','public.track_question_child_change()')) e(table_name,name,signature)
  LEFT JOIN pg_trigger t ON t.tgrelid=to_regclass('public.'||e.table_name) AND t.tgname=e.name
), column_checks AS (
  SELECT e.table_name,e.name,a.attnotnull=e.not_null AND format_type(a.atttypid,a.atttypmod)=e.type AS ok
  FROM (VALUES ('questions','status','question_status',true),('question_versions','status','question_version_status',true),('question_versions','source_page','integer',true),('question_versions','source_question_number','text',false),('question_versions','source_locator','text',false),('question_versions','source_locator_verified','boolean',true),('question_versions','calculator_policy','question_calculator_policy',false),('question_versions','source_type','question_source_type',false),('question_versions','import_evidence','jsonb',true),('question_options','import_evidence','jsonb',true),('questions','lifecycle_revision','bigint',true),('question_versions','editorial_revision','bigint',true),('question_version_reviews','review_data','jsonb',true),('question_version_reviews','reviewed_by','uuid',true),('question_publication_events','actor_id','uuid',true),('question_publication_events','request_fingerprint','text',true)) e(table_name,name,type,not_null)
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
    FROM (VALUES ('question_status',ARRAY['draft','approved','retired','unpublished']::text[]),('question_version_status',ARRAY['draft','review','approved','superseded']::text[]),('question_type',ARRAY['mcq_single']::text[]),('question_difficulty',ARRAY['easy','medium','hard']::text[]),('question_course_scope',ARRAY['AB','BC','BOTH']::text[]),('question_representation_type',ARRAY['analytical','graphical','numerical','verbal','mixed']::text[]),('question_calculator_policy',ARRAY['no_calculator','calculator_allowed','calculator_required']::text[]),('question_source_type',ARRAY['original','licensed','public_domain','permission_granted']::text[])) e(name,expected_values)
  UNION ALL SELECT 'lifecycle_constraint_matches_stage',position('unpublished' IN (SELECT definition FROM constraint_checks WHERE name='questions_lifecycle_pointer_check'))>0
  UNION ALL SELECT 'compound_current_version_fk',EXISTS(SELECT 1 FROM pg_constraint c WHERE c.conrelid=to_regclass('public.questions')
    AND c.conname='questions_current_version_belongs_to_question' AND c.contype='f' AND c.condeferrable AND c.confrelid=to_regclass('public.question_versions')
    AND ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(attnum,ord) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.attnum ORDER BY ord)=ARRAY['current_version_id','id']
    AND ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(attnum,ord) JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.attnum ORDER BY ord)=ARRAY['id','question_id'])
  UNION ALL SELECT 'rpc:'||signature,coalesce(has_function_privilege('authenticated',to_regprocedure(signature),'EXECUTE'),false)
    AND NOT coalesce(has_function_privilege('anon',to_regprocedure(signature),'EXECUTE'),true)
    FROM (VALUES ('public.save_question_bank_drafts(jsonb)'),('public.get_question_bank_draft(uuid,uuid)'),('public.update_question_bank_draft_metadata(uuid,uuid,text,jsonb)'),('public.delete_question_bank_draft(uuid,uuid,text,boolean)'),('public.precheck_question_publication(uuid,uuid,text)'),('public.get_question_publication_state(uuid)'),('public.record_question_version_review(uuid,uuid,text,jsonb)'),('public.save_question_bank_revision(uuid,uuid,text,jsonb)'),('public.publish_question_versions(jsonb)'),('public.publish_question_version(uuid,uuid,text)'),('public.unpublish_question(uuid,uuid,text)'),('public.republish_question(uuid,uuid,text)'),('public.archive_question(uuid,uuid,text)')) e(signature)
UNION ALL SELECT 'private:'||signature,NOT has_function_privilege('authenticated',to_regprocedure(signature),'EXECUTE')
    AND NOT has_function_privilege('anon',to_regprocedure(signature),'EXECUTE') FROM (VALUES ('public.validate_question_version_approval(uuid,uuid)'),('public.assert_question_bank_admin()'),('public.create_question_revision(uuid)'),('public.approve_question_version(uuid,uuid)'),('public.retire_question(uuid)'),('public.question_bank_draft_fingerprint(uuid,uuid)'),('public.question_bank_error(text,text,jsonb)'),('public.question_bank_require_admin()'),('public.question_bank_content_fingerprint(uuid)'),('public.question_bank_publication_fingerprint(uuid,uuid)'),('public.question_bank_source_flags(uuid)'),('public.question_bank_content_issues(uuid,uuid)'),('public.question_bank_review_issues(uuid,uuid)'),('public.question_bank_publication_issues(uuid,uuid,text)')) e(signature)
UNION ALL SELECT 'protected:'||table_name||'.'||column_name,NOT has_column_privilege('authenticated','public.'||table_name,column_name,'UPDATE')
    FROM (VALUES ('questions','status'),('questions','current_version_id'),('questions','lifecycle_revision'),('question_versions','status'),
      ('question_versions','import_evidence'),('question_versions','source_locator_verified'),('question_versions','editorial_revision')) e(table_name,column_name)
    UNION ALL SELECT 'no_direct_identity_insert',NOT has_table_privilege('authenticated','public.questions','INSERT')
    UNION ALL SELECT 'no_direct_version_insert',NOT has_table_privilege('authenticated','public.question_versions','INSERT')
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
    VALUES('20261019010000','question_bank_publication',ARRAY[migration_sql]);
END;
$o2i_task4_release$;
COMMIT;
-- Stop on ANY error or uncertain outcome. Do not run the next file or repeat this file blindly.
