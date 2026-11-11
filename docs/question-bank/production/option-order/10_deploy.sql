-- Execute once after a fresh preflight and explicit authorization. No seeds, question changes or historical replay.
BEGIN;
DO $deploy$
DECLARE migration_sql text:=$option_order$-- Practice shows each issued question's options in a random order frozen when the question is issued,
-- relabelled A-F by display position. Grading uses option IDs, so it is unchanged. Items issued before
-- this migration keep option_order NULL and render in stored order, so earlier history is unchanged.
-- Arena items take the order Arena already froze, so Review shows what the student saw in Arena.
ALTER TABLE public.question_practice_items ADD COLUMN option_order uuid[];
COMMENT ON COLUMN public.question_practice_items.option_order IS 'Option IDs in display order, frozen at issuance. NULL for items issued before 2026-11-11 (stored order).';

CREATE FUNCTION public.question_practice_items_shuffle_options() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,extensions AS $$
BEGIN
  IF NEW.option_order IS NULL THEN
    SELECT array_agg(o.id ORDER BY random()) INTO NEW.option_order FROM public.question_options o WHERE o.question_version_id=NEW.version_id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER question_practice_items_shuffle_options BEFORE INSERT ON public.question_practice_items
  FOR EACH ROW EXECUTE FUNCTION public.question_practice_items_shuffle_options();

CREATE FUNCTION public.question_practice_items_arena_order() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,extensions AS $$
BEGIN
  UPDATE public.question_practice_items SET option_order=NEW.option_order
    WHERE session_id=NEW.session_id AND question_id=NEW.question_id AND version_id=NEW.version_id;
  RETURN NULL;
END;
$$;
CREATE TRIGGER question_practice_items_arena_order AFTER INSERT ON public.arena_practice_issues
  FOR EACH ROW EXECUTE FUNCTION public.question_practice_items_arena_order();
REVOKE ALL ON FUNCTION public.question_practice_items_shuffle_options(),public.question_practice_items_arena_order() FROM PUBLIC,anon,authenticated;

-- Same as 20261026 question_practice_snapshot (renamed in 20261028) except the options subquery.
CREATE OR REPLACE FUNCTION public.question_practice_snapshot_questions(_session_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE s public.question_practice_sessions%ROWTYPE;
BEGIN
  SELECT * INTO s FROM public.question_practice_sessions WHERE id=_session_id AND user_id=public.question_practice_require_user();
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Practice session is not available to your account.'; END IF;
  RETURN jsonb_build_object('id',s.id,'topic_id',s.topic_id,'created_at',s.created_at,'selection_summary',CASE WHEN s.selection_summary->>'rule_version'='practice-adaptation-v2' THEN NULL ELSE s.selection_summary END,
    'adaptation_summary',CASE WHEN s.selection_summary->>'rule_version'='practice-adaptation-v2' THEN s.selection_summary ELSE NULL END,'questions',coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'question_id',i.question_id,'version_id',i.version_id,'position',i.position,
      'stem',v.stem,'image_url',v.image_url,'requires_figure',v.requires_figure,
      'difficulty',v.difficulty,'calculator_policy',v.calculator_policy,'course_scope',v.course_scope,
      'topic',jsonb_build_object('id',t.id,'code',t.topic_code,'title',t.title),
      'representation_type',v.representation_type,'skill_descriptions',coalesce((SELECT jsonb_agg(p.description ORDER BY p.skill_code) FROM public.question_practice_skills ps JOIN public.curriculum_practice_skills p ON p.id=ps.practice_skill_id WHERE ps.question_version_id=v.id),'[]'::jsonb),
      'skills',coalesce((SELECT jsonb_agg(p.skill_code ORDER BY p.skill_code) FROM public.question_practice_skills ps JOIN public.curriculum_practice_skills p ON p.id=ps.practice_skill_id WHERE ps.question_version_id=v.id),'[]'::jsonb),
      'options',(SELECT jsonb_agg(jsonb_build_object('id',x.id,'key',CASE WHEN i.option_order IS NULL THEN x.option_key ELSE chr(64+x.rank::integer) END,'text',x.option_text) ORDER BY x.rank)
        FROM (SELECT o.id,o.option_key,o.option_text,row_number() OVER(ORDER BY array_position(i.option_order,o.id) NULLS LAST,o.order_index,o.id) AS rank
          FROM public.question_options o WHERE o.question_version_id=v.id) x),
      'attempt',CASE WHEN a.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id',a.id,'selected_option_id',a.selected_option_id,'is_correct',a.is_correct,
        'submitted_at',a.submitted_at,'elapsed_seconds',a.elapsed_seconds,
        'selection_trajectory',a.selection_trajectory,'timing_complete',a.timing_complete,
        'correct_option_id',(SELECT o.id FROM public.question_options o WHERE o.question_version_id=i.version_id AND o.is_correct),
        'solution',v.solution) END
    ) ORDER BY i.position)
    FROM public.question_practice_items i JOIN public.question_versions v ON v.id=i.version_id
    JOIN public.curriculum_topics t ON t.id=v.primary_topic_id
    LEFT JOIN public.question_practice_attempts a ON a.session_id=i.session_id AND a.question_id=i.question_id AND a.user_id=s.user_id
    WHERE i.session_id=s.id),'[]'::jsonb));
END;
$$;
$option_order$;
BEGIN
 LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
 IF NOT (NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261111000000') AND NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='question_practice_items' AND column_name='option_order') AND to_regprocedure('public.question_practice_items_shuffle_options()') IS NULL AND to_regprocedure('public.question_practice_items_arena_order()') IS NULL) THEN RAISE EXCEPTION 'Option order already recorded or partially present; stop without replay.'; END IF;
 IF NOT (EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261026000000' AND name='question_practice_adaptation_v2' AND cardinality(statements)=1 AND md5(statements[1])='354934137b8be264f4b1b2cf58d36b2e') AND EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261028000000' AND name='course_topic_practice' AND cardinality(statements)=1 AND md5(statements[1])='f8d0fd626747b1dd42fd6f03cf285591') AND EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261105000000' AND name='arena_practice_integration' AND cardinality(statements)=1 AND md5(statements[1])='436e441fb7a6b67212e0ae29144a8fd3')) OR NOT coalesce((SELECT md5(prosrc)='1162f028c31bdeab0a9fdd0e77b48089' FROM pg_proc WHERE oid=to_regprocedure('public.question_practice_snapshot_questions(uuid)')),false) THEN RAISE EXCEPTION 'Practice prerequisite mismatch; stop without replaying migrations.'; END IF;
 EXECUTE migration_sql;
 INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261111000000','question_practice_option_order',ARRAY[migration_sql]);
END;
$deploy$;
COMMIT;
