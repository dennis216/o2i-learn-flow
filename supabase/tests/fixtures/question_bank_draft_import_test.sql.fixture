BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(29);

INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('81000000-0000-0000-0000-000000000001', 'draft-import-admin@test.invalid',
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('81000000-0000-0000-0000-000000000002', 'draft-import-student@test.invalid',
   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());
INSERT INTO public.user_roles (user_id, role)
VALUES ('81000000-0000-0000-0000-000000000001', 'admin'::public.app_role);

CREATE TEMP TABLE draft_import_fixture (name text PRIMARY KEY, payload jsonb NOT NULL);
INSERT INTO draft_import_fixture (name, payload)
SELECT 'valid', jsonb_build_array(jsonb_build_object(
  'external_id', 'DB-DRAFT-IMPORT-001',
  'correct_option_key', 'A',
  'stem', 'Synthetic stem \\(x^2\\)',
  'solution', 'Synthetic solution \\[2x\\]',
  'difficulty', 'easy', 'course_scope', 'AB',
  'primary_topic_code', (SELECT topic_code FROM public.curriculum_topics ORDER BY topic_code LIMIT 1),
  'practice_skill_codes', jsonb_build_array((SELECT skill_code FROM public.curriculum_practice_skills ORDER BY skill_code LIMIT 1)),
  'representation_type', 'analytical', 'calculator_policy', NULL,
  'source_document', 'SYNTHETIC_SOURCE.pdf', 'source_page', '12-13',
  'source_question_number', '1', 'source_locator', NULL,
  'requires_figure', false, 'image_url', NULL,
  'import_evidence', '{"original_source_page":"12-13","source_transcription_notes":"合成抄录备注","ai_flags":["ANSWER_AI_INFERRED"],"human_review_status":"pending","human_review_notes":"合成审核备注","manual_edits":[{"row":2,"field":"difficulty","before":"medium","after":"easy"}]}'::jsonb,
  'options', '[{"option_key":"A","option_text":"\\(2x\\)","is_correct":true,"import_evidence":{"option_explanation":"合成解析 A"}},{"option_key":"B","option_text":"\\(x\\)","is_correct":false,"import_evidence":{"option_explanation":"合成解析 B"}}]'::jsonb
));
GRANT SELECT ON draft_import_fixture TO authenticated;

SELECT set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000002', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  format('SELECT public.save_question_bank_drafts(%L::jsonb)', (SELECT payload::text FROM draft_import_fixture WHERE name = 'valid')),
  '42501', NULL, 'non-admin cannot call draft save RPC'
);
SELECT is((SELECT count(*)::integer FROM public.questions WHERE external_id = 'DB-DRAFT-IMPORT-001'), 0,
  'unauthorized RPC creates no question');

SELECT set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000001', true);
SELECT lives_ok(
  format('SELECT public.save_question_bank_drafts(%L::jsonb)', (SELECT payload::text FROM draft_import_fixture WHERE name = 'valid')),
  'admin can atomically save a pending XLSX row as a draft'
);
SELECT is((SELECT status::text FROM public.questions WHERE external_id = 'DB-DRAFT-IMPORT-001'), 'draft',
  'question is unpublished draft');
SELECT is((SELECT current_version_id FROM public.questions WHERE external_id = 'DB-DRAFT-IMPORT-001'), NULL::uuid,
  'draft has no published pointer');
SELECT is((SELECT v.status::text FROM public.question_versions v JOIN public.questions q ON q.id = v.question_id
  WHERE q.external_id = 'DB-DRAFT-IMPORT-001'), 'draft', 'first version is draft');
SELECT is((SELECT source_type FROM public.question_versions v JOIN public.questions q ON q.id = v.question_id
  WHERE q.external_id = 'DB-DRAFT-IMPORT-001'), NULL::public.question_source_type,
  'unknown rights source_type stays NULL');
SELECT is((SELECT calculator_policy FROM public.question_versions v JOIN public.questions q ON q.id = v.question_id
  WHERE q.external_id = 'DB-DRAFT-IMPORT-001'), NULL::public.question_calculator_policy,
  'unknown calculator_policy stays NULL');
SELECT is((SELECT source_reference FROM public.question_versions v JOIN public.questions q ON q.id = v.question_id
  WHERE q.external_id = 'DB-DRAFT-IMPORT-001'), '12-13', 'physical PDF page range is retained');
SELECT is((SELECT v.import_evidence->>'human_review_notes' FROM public.question_versions v
  JOIN public.questions q ON q.id = v.question_id WHERE q.external_id = 'DB-DRAFT-IMPORT-001'),
  '合成审核备注', 'human review notes are preserved');
SELECT is((SELECT v.import_evidence->'ai_flags'->>0 FROM public.question_versions v
  JOIN public.questions q ON q.id = v.question_id WHERE q.external_id = 'DB-DRAFT-IMPORT-001'),
  'ANSWER_AI_INFERRED', 'AI uncertainty flag is preserved');
SELECT is((SELECT v.import_evidence->'manual_edits'->0->>'before' FROM public.question_versions v
  JOIN public.questions q ON q.id = v.question_id WHERE q.external_id = 'DB-DRAFT-IMPORT-001'),
  'medium', 'manual before/after edit evidence is retained');
SELECT is((SELECT count(*)::integer FROM public.question_options o JOIN public.question_versions v
  ON v.id = o.question_version_id JOIN public.questions q ON q.id = v.question_id
  WHERE q.external_id = 'DB-DRAFT-IMPORT-001'), 2, 'both options are saved');
SELECT is((SELECT o.import_evidence->>'option_explanation' FROM public.question_options o
  JOIN public.question_versions v ON v.id = o.question_version_id
  JOIN public.questions q ON q.id = v.question_id
  WHERE q.external_id = 'DB-DRAFT-IMPORT-001' AND o.option_key = 'A'),
  '合成解析 A', 'option explanation is preserved');
SELECT is((SELECT count(*)::integer FROM public.question_practice_skills ps
  JOIN public.question_versions v ON v.id = ps.question_version_id
  JOIN public.questions q ON q.id = v.question_id
  WHERE q.external_id = 'DB-DRAFT-IMPORT-001'), 1, 'canonical skill mapping is saved');

SELECT lives_ok(
  format('SELECT public.save_question_bank_drafts(%L::jsonb)', (
    SELECT jsonb_build_array(jsonb_set(
      jsonb_set(payload->0, '{external_id}', '"DB-DRAFT-IMPORT-APPROVED-CELL"'::jsonb),
      '{import_evidence,human_review_status}', '"approved"'::jsonb
    ))::text FROM draft_import_fixture WHERE name = 'valid'
  )),
  'XLSX approved cell can only enter the unpublished draft intake'
);
SELECT is((SELECT q.status::text FROM public.questions q
  WHERE q.external_id = 'DB-DRAFT-IMPORT-APPROVED-CELL'), 'draft',
  'approved XLSX cell does not approve the question');
SELECT is((SELECT v.status::text FROM public.question_versions v
  JOIN public.questions q ON q.id = v.question_id
  WHERE q.external_id = 'DB-DRAFT-IMPORT-APPROVED-CELL'), 'draft',
  'approved XLSX cell does not approve the version');

SELECT throws_ok(
  format('SELECT public.save_question_bank_drafts(%L::jsonb)', (SELECT payload::text FROM draft_import_fixture WHERE name = 'valid')),
  '23505', NULL, 'repeat confirmation cannot duplicate an external_id'
);

SELECT throws_ok(
  format('SELECT public.save_question_bank_drafts(%L::jsonb)', (
    SELECT jsonb_build_array(
      jsonb_set(payload->0, '{external_id}', '"DB-DRAFT-ROLLBACK-001"'::jsonb),
      jsonb_set(payload->0, '{external_id}', '"DB-DRAFT-IMPORT-001"'::jsonb)
    )::text FROM draft_import_fixture WHERE name = 'valid'
  )),
  '23505', NULL, 'second invalid item rejects the whole batch'
);
SELECT is((SELECT count(*)::integer FROM public.questions WHERE external_id = 'DB-DRAFT-ROLLBACK-001'), 0,
  'first item of failed batch is rolled back');

SELECT lives_ok(
  $$SELECT public.submit_question_version_for_review(q.id, v.id)
    FROM public.questions q JOIN public.question_versions v ON v.question_id = q.id
    WHERE q.external_id = 'DB-DRAFT-IMPORT-001'$$,
  'draft may be submitted to review without publishing'
);
SELECT throws_ok(
  $$SELECT public.approve_question_version(q.id, v.id)
    FROM public.questions q JOIN public.question_versions v ON v.question_id = q.id
    WHERE q.external_id = 'DB-DRAFT-IMPORT-001'$$,
  '23514', NULL, 'approval rejects unknown source_type and calculator_policy'
);
SELECT is((SELECT current_version_id FROM public.questions WHERE external_id = 'DB-DRAFT-IMPORT-001'), NULL::uuid,
  'failed approval leaves publication pointer empty');

SELECT set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000002', true);
SELECT is((SELECT count(*)::integer FROM public.questions WHERE external_id = 'DB-DRAFT-IMPORT-001'), 0,
  'ordinary user cannot read pending question');
SELECT is((SELECT count(*)::integer FROM public.question_versions v JOIN public.questions q ON q.id = v.question_id
  WHERE q.external_id = 'DB-DRAFT-IMPORT-001'), 0,
  'ordinary user cannot read pending version');

SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', 'anon', true);
SET LOCAL ROLE anon;
SELECT ok(NOT has_function_privilege('anon', 'public.save_question_bank_drafts(jsonb)', 'EXECUTE'),
  'anonymous visitor cannot execute the draft save RPC');
SELECT is((SELECT count(*)::integer FROM public.questions WHERE external_id = 'DB-DRAFT-IMPORT-001'), 0,
  'anonymous visitor cannot read pending question');
SELECT is((SELECT count(*)::integer FROM public.question_options o JOIN public.question_versions v
  ON v.id = o.question_version_id JOIN public.questions q ON q.id = v.question_id
  WHERE q.external_id = 'DB-DRAFT-IMPORT-001'), 0,
  'anonymous visitor cannot read pending options');

SELECT * FROM finish();
ROLLBACK;
