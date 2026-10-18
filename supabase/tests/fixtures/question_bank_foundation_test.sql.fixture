BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(99);

-- Fixed, local-only identities make failures reproducible. The surrounding
-- transaction is rolled back by this test file.
INSERT INTO auth.users (
  id,
  email,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) VALUES
  (
    '10000000-0000-0000-0000-000000000001',
    'question-bank-admin@test.invalid',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Question Bank Admin"}'::jsonb,
    now(),
    now()
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    'question-bank-student@test.invalid',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Question Bank Student"}'::jsonb,
    now(),
    now()
  );

INSERT INTO public.user_roles (user_id, role)
VALUES (
  '10000000-0000-0000-0000-000000000001',
  'admin'::public.app_role
);

SELECT set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

INSERT INTO public.questions (id, external_id)
VALUES (
  '20000000-0000-0000-0000-000000000001',
  'DB-TEST-MCQ-001'
);

INSERT INTO public.question_versions (
  id,
  question_id,
  version_number,
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
  source_question_number
)
SELECT
  '30000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  1,
  'If $f(x)=x^2$, what is $f''(2)$?',
  'Differentiate to obtain $f''(x)=2x$, then evaluate at $x=2$.',
  'easy'::public.question_difficulty,
  'BOTH'::public.question_course_scope,
  topic.id,
  'analytical'::public.question_representation_type,
  'no_calculator'::public.question_calculator_policy,
  'public_domain'::public.question_source_type,
  'question-bank-test-source.pdf',
  12,
  '7'
FROM public.curriculum_topics AS topic
ORDER BY topic.topic_code
LIMIT 1;

INSERT INTO public.question_options (
  id,
  question_version_id,
  option_key,
  option_text,
  order_index,
  is_correct
) VALUES
  (
    '40000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    'A',
    '$2$',
    1,
    false
  ),
  (
    '40000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000001',
    'B',
    '$4$',
    2,
    true
  );

INSERT INTO public.question_practice_skills (
  question_version_id,
  practice_skill_id
)
SELECT
  '30000000-0000-0000-0000-000000000001',
  id
FROM public.curriculum_practice_skills
ORDER BY skill_code
LIMIT 1;

INSERT INTO public.question_topics (question_version_id, topic_id)
SELECT
  '30000000-0000-0000-0000-000000000001',
  id
FROM public.curriculum_topics
WHERE id <> (
  SELECT primary_topic_id
  FROM public.question_versions
  WHERE id = '30000000-0000-0000-0000-000000000001'
)
ORDER BY topic_code
LIMIT 1;

INSERT INTO public.misconceptions (
  id,
  code,
  name,
  description,
  framework_id
)
SELECT
  '50000000-0000-0000-0000-000000000001',
  'DB-TEST-MISCONCEPTION',
  'Test misconception',
  'Local integration-test fixture only.',
  id
FROM public.curriculum_frameworks
ORDER BY code
LIMIT 1;

INSERT INTO public.option_misconceptions (option_id, misconception_id)
VALUES (
  '40000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001'
);

SELECT is(
  (SELECT status::text FROM public.questions WHERE id = '20000000-0000-0000-0000-000000000001'),
  'draft',
  'new question starts as draft'
);
SELECT is(
  (SELECT current_version_id FROM public.questions WHERE id = '20000000-0000-0000-0000-000000000001'),
  NULL::uuid,
  'new question has no published version'
);
SELECT is(
  (SELECT status::text FROM public.question_versions WHERE id = '30000000-0000-0000-0000-000000000001'),
  'draft',
  'first version starts as draft'
);
SELECT lives_ok(
  $$SELECT public.submit_question_version_for_review(
    '20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001'
  )$$,
  'admin can submit first version for review'
);
SELECT is(
  (SELECT status::text FROM public.question_versions WHERE id = '30000000-0000-0000-0000-000000000001'),
  'review',
  'first version enters review'
);
SELECT lives_ok(
  $$SELECT public.approve_question_version(
    '20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001'
  )$$,
  'admin can approve a valid first version'
);
SELECT is(
  (SELECT status::text FROM public.questions WHERE id = '20000000-0000-0000-0000-000000000001'),
  'approved',
  'first approval publishes the question'
);
SELECT is(
  (SELECT current_version_id FROM public.questions WHERE id = '20000000-0000-0000-0000-000000000001'),
  '30000000-0000-0000-0000-000000000001'::uuid,
  'first approval sets the publication pointer'
);
SELECT is(
  (SELECT status::text FROM public.question_versions WHERE id = '30000000-0000-0000-0000-000000000001'),
  'approved',
  'first version becomes approved'
);
SELECT is(
  (SELECT reviewed_by FROM public.question_versions WHERE id = '30000000-0000-0000-0000-000000000001'),
  '10000000-0000-0000-0000-000000000001'::uuid,
  'approved version records the reviewer'
);
SELECT ok(
  (SELECT approved_at IS NOT NULL FROM public.question_versions WHERE id = '30000000-0000-0000-0000-000000000001'),
  'approved version records approval time'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000002',
  true
);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*) FROM public.questions WHERE id = '20000000-0000-0000-0000-000000000001'),
  1::bigint,
  'student can read an approved question'
);
SELECT is(
  (SELECT count(*) FROM public.question_versions WHERE question_id = '20000000-0000-0000-0000-000000000001'),
  1::bigint,
  'student can read only the current approved version'
);
SELECT is(
  (SELECT count(*) FROM public.question_options WHERE question_version_id = '30000000-0000-0000-0000-000000000001'),
  2::bigint,
  'student can read current approved options'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000000',
  true
);
SELECT set_config('request.jwt.claim.role', 'anon', true);
SET LOCAL ROLE anon;

SELECT is(
  (SELECT count(*) FROM public.questions WHERE id = '20000000-0000-0000-0000-000000000001'),
  0::bigint,
  'anonymous users cannot read questions'
);
SELECT is(
  (SELECT count(*) FROM public.question_versions WHERE question_id = '20000000-0000-0000-0000-000000000001'),
  0::bigint,
  'anonymous users cannot read versions'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$SELECT public.create_question_revision('20000000-0000-0000-0000-000000000001')$$,
  'admin can create a revision from the published version'
);
SELECT is(
  (SELECT version_number FROM public.question_versions WHERE question_id = '20000000-0000-0000-0000-000000000001' AND status = 'draft'),
  2,
  'revision receives the next version number'
);
SELECT is(
  (SELECT status::text FROM public.question_versions WHERE question_id = '20000000-0000-0000-0000-000000000001' AND version_number = 2),
  'draft',
  'revision is editable draft content'
);
SELECT is(
  (SELECT current_version_id FROM public.questions WHERE id = '20000000-0000-0000-0000-000000000001'),
  '30000000-0000-0000-0000-000000000001'::uuid,
  'creating a revision does not move publication'
);
SELECT is(
  (SELECT count(*) FROM public.question_options WHERE question_version_id = (SELECT id FROM public.question_versions WHERE question_id = '20000000-0000-0000-0000-000000000001' AND version_number = 2)),
  2::bigint,
  'revision clones options'
);
SELECT is(
  (SELECT count(*) FROM public.question_practice_skills WHERE question_version_id = (SELECT id FROM public.question_versions WHERE question_id = '20000000-0000-0000-0000-000000000001' AND version_number = 2)),
  1::bigint,
  'revision clones practice skills'
);
SELECT is(
  (SELECT count(*) FROM public.question_topics WHERE question_version_id = (SELECT id FROM public.question_versions WHERE question_id = '20000000-0000-0000-0000-000000000001' AND version_number = 2)),
  1::bigint,
  'revision clones secondary topics'
);
SELECT is(
  (SELECT count(*) FROM public.option_misconceptions AS om JOIN public.question_options AS qo ON qo.id = om.option_id WHERE qo.question_version_id = (SELECT id FROM public.question_versions WHERE question_id = '20000000-0000-0000-0000-000000000001' AND version_number = 2)),
  1::bigint,
  'revision clones option misconception mappings'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000002',
  true
);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT array_agg(version_number ORDER BY version_number) FROM public.question_versions WHERE question_id = '20000000-0000-0000-0000-000000000001'),
  ARRAY[1],
  'student continues to see v1 while v2 is draft'
);
SELECT is(
  (SELECT count(*) FROM public.question_options WHERE question_version_id = (SELECT id FROM public.question_versions WHERE question_id = '20000000-0000-0000-0000-000000000001' AND version_number = 2)),
  0::bigint,
  'student cannot read draft revision options'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$SELECT public.submit_question_version_for_review(
    '20000000-0000-0000-0000-000000000001',
    (SELECT id FROM public.question_versions WHERE question_id = '20000000-0000-0000-0000-000000000001' AND version_number = 2)
  )$$,
  'admin can submit v2 for review'
);
SELECT is(
  (SELECT status::text FROM public.question_versions WHERE question_id = '20000000-0000-0000-0000-000000000001' AND version_number = 2),
  'review',
  'v2 enters review'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000002',
  true
);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT array_agg(version_number ORDER BY version_number) FROM public.question_versions WHERE question_id = '20000000-0000-0000-0000-000000000001'),
  ARRAY[1],
  'student continues to see v1 while v2 is in review'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$UPDATE public.question_options
    SET option_text = 'review edit must fail'
    WHERE question_version_id = (
      SELECT id FROM public.question_versions
      WHERE question_id = '20000000-0000-0000-0000-000000000001'
        AND version_number = 2
    ) AND option_key = 'A'$$,
  '55000',
  'Only draft question-version content may be edited.',
  'review option content is immutable'
);
SELECT lives_ok(
  $$SELECT public.return_question_version_to_draft(
    '20000000-0000-0000-0000-000000000001',
    (SELECT id FROM public.question_versions WHERE question_id = '20000000-0000-0000-0000-000000000001' AND version_number = 2)
  )$$,
  'admin can explicitly return review content to draft'
);
SELECT is(
  (SELECT status::text FROM public.question_versions WHERE question_id = '20000000-0000-0000-0000-000000000001' AND version_number = 2),
  'draft',
  'returned revision is draft'
);
SELECT lives_ok(
  $$UPDATE public.question_versions
    SET stem = 'Revised: if $f(x)=x^2$, what is $f''(2)$?',
        source_question_number = NULL,
        source_locator = 'p012-item03',
        source_locator_verified = false
    WHERE question_id = '20000000-0000-0000-0000-000000000001'
      AND version_number = 2$$,
  'admin can edit draft content and provenance'
);
SELECT lives_ok(
  $$SELECT public.submit_question_version_for_review(
    '20000000-0000-0000-0000-000000000001',
    (SELECT id FROM public.question_versions WHERE question_id = '20000000-0000-0000-0000-000000000001' AND version_number = 2)
  )$$,
  'edited v2 can return to review'
);
SELECT throws_ok(
  $$SELECT public.approve_question_version(
    '20000000-0000-0000-0000-000000000001',
    (SELECT id FROM public.question_versions WHERE question_id = '20000000-0000-0000-0000-000000000001' AND version_number = 2)
  )$$,
  '23514',
  'Question approval rejected: provide a printed source_question_number or a verified source_locator.',
  'unverified generated locator blocks approval'
);
SELECT is(
  (SELECT current_version_id FROM public.questions WHERE id = '20000000-0000-0000-0000-000000000001'),
  '30000000-0000-0000-0000-000000000001'::uuid,
  'failed provenance validation leaves publication on v1'
);
SELECT lives_ok(
  $$SELECT public.return_question_version_to_draft(
    '20000000-0000-0000-0000-000000000001',
    (SELECT id FROM public.question_versions WHERE question_id = '20000000-0000-0000-0000-000000000001' AND version_number = 2)
  )$$,
  'invalid review version can return to draft for correction'
);
SELECT throws_ok(
  $$INSERT INTO public.option_misconceptions (option_id, misconception_id)
    SELECT qo.id, '50000000-0000-0000-0000-000000000001'
    FROM public.question_options AS qo
    JOIN public.question_versions AS qv ON qv.id = qo.question_version_id
    WHERE qv.question_id = '20000000-0000-0000-0000-000000000001'
      AND qv.version_number = 2
      AND qo.is_correct$$,
  '23514',
  'Correct options cannot have misconception mappings.',
  'correct options reject misconception mappings'
);
SELECT lives_ok(
  $$UPDATE public.question_versions
    SET source_locator_verified = true,
        requires_figure = true,
        image_url = NULL
    WHERE question_id = '20000000-0000-0000-0000-000000000001'
      AND version_number = 2$$,
  'draft can record a figure requirement'
);
SELECT lives_ok(
  $$SELECT public.submit_question_version_for_review(
    '20000000-0000-0000-0000-000000000001',
    (SELECT id FROM public.question_versions WHERE question_id = '20000000-0000-0000-0000-000000000001' AND version_number = 2)
  )$$,
  'figure-dependent revision can enter review'
);
SELECT throws_ok(
  $$SELECT public.approve_question_version(
    '20000000-0000-0000-0000-000000000001',
    (SELECT id FROM public.question_versions WHERE question_id = '20000000-0000-0000-0000-000000000001' AND version_number = 2)
  )$$,
  '23514',
  'Question approval rejected: image_url is required when requires_figure is true.',
  'missing required figure blocks approval'
);
SELECT is(
  (SELECT current_version_id FROM public.questions WHERE id = '20000000-0000-0000-0000-000000000001'),
  '30000000-0000-0000-0000-000000000001'::uuid,
  'failed figure validation leaves publication on v1'
);
SELECT lives_ok(
  $$SELECT public.return_question_version_to_draft(
    '20000000-0000-0000-0000-000000000001',
    (SELECT id FROM public.question_versions WHERE question_id = '20000000-0000-0000-0000-000000000001' AND version_number = 2)
  )$$,
  'figure-dependent review can return to draft'
);
SELECT lives_ok(
  $$UPDATE public.question_versions
    SET image_url = 'https://example.invalid/question-bank-test-figure.png'
    WHERE question_id = '20000000-0000-0000-0000-000000000001'
      AND version_number = 2$$,
  'admin can add the missing figure URL in draft'
);
SELECT throws_ok(
  $$DO $test$
    BEGIN
      DELETE FROM public.option_misconceptions
      WHERE option_id = (
        SELECT qo.id
        FROM public.question_options AS qo
        JOIN public.question_versions AS qv
          ON qv.id = qo.question_version_id
        WHERE qv.question_id = '20000000-0000-0000-0000-000000000001'
          AND qv.version_number = 2
          AND qo.option_key = 'A'
      );

      UPDATE public.question_options
      SET is_correct = true
      WHERE question_version_id = (
        SELECT id FROM public.question_versions
        WHERE question_id = '20000000-0000-0000-0000-000000000001'
          AND version_number = 2
      ) AND option_key = 'A';
    END;
    $test$;$$,
  '23505',
  'duplicate key value violates unique constraint "question_options_one_correct_per_version"',
  'database prevents multiple correct options'
);
SELECT lives_ok(
  $$DELETE FROM public.question_options
    WHERE question_version_id = (
      SELECT id FROM public.question_versions
      WHERE question_id = '20000000-0000-0000-0000-000000000001'
        AND version_number = 2
    ) AND option_key = 'A'$$,
  'test fixture can reduce v2 to one option while it is draft'
);
SELECT lives_ok(
  $$SELECT public.submit_question_version_for_review(
    '20000000-0000-0000-0000-000000000001',
    (SELECT id FROM public.question_versions WHERE question_id = '20000000-0000-0000-0000-000000000001' AND version_number = 2)
  )$$,
  'one-option v2 can enter review for approval validation'
);
SELECT throws_ok(
  $$SELECT public.approve_question_version(
    '20000000-0000-0000-0000-000000000001',
    (SELECT id FROM public.question_versions WHERE question_id = '20000000-0000-0000-0000-000000000001' AND version_number = 2)
  )$$,
  '23514',
  'Question approval rejected: mcq_single requires 2-6 options; found 1.',
  'approval rejects fewer than two options'
);
SELECT is(
  (SELECT current_version_id FROM public.questions WHERE id = '20000000-0000-0000-0000-000000000001'),
  '30000000-0000-0000-0000-000000000001'::uuid,
  'failed one-option approval leaves publication on v1'
);
SELECT lives_ok(
  $$SELECT public.return_question_version_to_draft(
    '20000000-0000-0000-0000-000000000001',
    (SELECT id FROM public.question_versions WHERE question_id = '20000000-0000-0000-0000-000000000001' AND version_number = 2)
  )$$,
  'one-option review can return to draft'
);
SELECT lives_ok(
  $$DO $test$
    DECLARE
      draft_version_id uuid;
    BEGIN
      SELECT id INTO draft_version_id
      FROM public.question_versions
      WHERE question_id = '20000000-0000-0000-0000-000000000001'
        AND version_number = 2;

      INSERT INTO public.question_options (
        id,
        question_version_id,
        option_key,
        option_text,
        order_index,
        is_correct
      ) VALUES (
        '40000000-0000-0000-0000-000000000101',
        draft_version_id,
        'A',
        '$2$',
        1,
        false
      );

      INSERT INTO public.option_misconceptions (option_id, misconception_id)
      VALUES (
        '40000000-0000-0000-0000-000000000101',
        '50000000-0000-0000-0000-000000000001'
      );
    END;
    $test$;$$,
  'test fixture restores the second option and its misconception mapping'
);
SELECT lives_ok(
  $$INSERT INTO public.question_options (
      id,
      question_version_id,
      option_key,
      option_text,
      order_index,
      is_correct
    )
    SELECT
      option_id,
      qv.id,
      option_key,
      option_text,
      order_index,
      false
    FROM public.question_versions AS qv
    CROSS JOIN (
      VALUES
        ('40000000-0000-0000-0000-000000000102'::uuid, 'C', 'Extra C', 3),
        ('40000000-0000-0000-0000-000000000103'::uuid, 'D', 'Extra D', 4),
        ('40000000-0000-0000-0000-000000000104'::uuid, 'E', 'Extra E', 5),
        ('40000000-0000-0000-0000-000000000105'::uuid, 'F', 'Extra F', 6),
        ('40000000-0000-0000-0000-000000000106'::uuid, 'G', 'Extra G', 7)
    ) AS extras(option_id, option_key, option_text, order_index)
    WHERE qv.question_id = '20000000-0000-0000-0000-000000000001'
      AND qv.version_number = 2$$,
  'test fixture can expand v2 to seven options while it is draft'
);
SELECT lives_ok(
  $$SELECT public.submit_question_version_for_review(
    '20000000-0000-0000-0000-000000000001',
    (SELECT id FROM public.question_versions WHERE question_id = '20000000-0000-0000-0000-000000000001' AND version_number = 2)
  )$$,
  'seven-option v2 can enter review for approval validation'
);
SELECT throws_ok(
  $$SELECT public.approve_question_version(
    '20000000-0000-0000-0000-000000000001',
    (SELECT id FROM public.question_versions WHERE question_id = '20000000-0000-0000-0000-000000000001' AND version_number = 2)
  )$$,
  '23514',
  'Question approval rejected: mcq_single requires 2-6 options; found 7.',
  'approval rejects more than six options'
);
SELECT is(
  (SELECT current_version_id FROM public.questions WHERE id = '20000000-0000-0000-0000-000000000001'),
  '30000000-0000-0000-0000-000000000001'::uuid,
  'failed seven-option approval leaves publication on v1'
);
SELECT lives_ok(
  $$SELECT public.return_question_version_to_draft(
    '20000000-0000-0000-0000-000000000001',
    (SELECT id FROM public.question_versions WHERE question_id = '20000000-0000-0000-0000-000000000001' AND version_number = 2)
  )$$,
  'seven-option review can return to draft'
);
SELECT lives_ok(
  $$DELETE FROM public.question_options
    WHERE id IN (
      '40000000-0000-0000-0000-000000000102',
      '40000000-0000-0000-0000-000000000103',
      '40000000-0000-0000-0000-000000000104',
      '40000000-0000-0000-0000-000000000105',
      '40000000-0000-0000-0000-000000000106'
    )$$,
  'test fixture removes the five extra options'
);
SELECT lives_ok(
  $$UPDATE public.question_options
    SET is_correct = false
    WHERE question_version_id = (
      SELECT id FROM public.question_versions
      WHERE question_id = '20000000-0000-0000-0000-000000000001'
        AND version_number = 2
    ) AND option_key = 'B'$$,
  'test fixture can remove the only correct answer while v2 is draft'
);
SELECT lives_ok(
  $$SELECT public.submit_question_version_for_review(
    '20000000-0000-0000-0000-000000000001',
    (SELECT id FROM public.question_versions WHERE question_id = '20000000-0000-0000-0000-000000000001' AND version_number = 2)
  )$$,
  'zero-correct-option v2 can enter review for approval validation'
);
SELECT throws_ok(
  $$SELECT public.approve_question_version(
    '20000000-0000-0000-0000-000000000001',
    (SELECT id FROM public.question_versions WHERE question_id = '20000000-0000-0000-0000-000000000001' AND version_number = 2)
  )$$,
  '23514',
  'Question approval rejected: mcq_single requires exactly one correct option; found 0.',
  'approval rejects a version with no correct option'
);
SELECT is(
  (SELECT current_version_id FROM public.questions WHERE id = '20000000-0000-0000-0000-000000000001'),
  '30000000-0000-0000-0000-000000000001'::uuid,
  'failed zero-correct approval leaves publication on v1'
);
SELECT lives_ok(
  $$SELECT public.return_question_version_to_draft(
    '20000000-0000-0000-0000-000000000001',
    (SELECT id FROM public.question_versions WHERE question_id = '20000000-0000-0000-0000-000000000001' AND version_number = 2)
  )$$,
  'zero-correct review can return to draft'
);
SELECT lives_ok(
  $$UPDATE public.question_options
    SET is_correct = true
    WHERE question_version_id = (
      SELECT id FROM public.question_versions
      WHERE question_id = '20000000-0000-0000-0000-000000000001'
        AND version_number = 2
    ) AND option_key = 'B'$$,
  'test fixture restores exactly one correct option'
);
SELECT throws_ok(
  $$UPDATE public.question_versions
    SET source_document = NULL
    WHERE question_id = '20000000-0000-0000-0000-000000000001'
      AND version_number = 2$$,
  '23502',
  'null value in column "source_document" of relation "question_versions" violates not-null constraint',
  'table constraint rejects a missing source document before approval'
);
SELECT is(
  (SELECT current_version_id FROM public.questions WHERE id = '20000000-0000-0000-0000-000000000001'),
  '30000000-0000-0000-0000-000000000001'::uuid,
  'missing source document failure leaves publication on v1'
);
SELECT throws_ok(
  $$UPDATE public.question_versions
    SET source_page = 0
    WHERE question_id = '20000000-0000-0000-0000-000000000001'
      AND version_number = 2$$,
  '23514',
  'new row for relation "question_versions" violates check constraint "question_versions_source_page_check"',
  'table constraint rejects a non-positive physical source page before approval'
);
SELECT is(
  (SELECT current_version_id FROM public.questions WHERE id = '20000000-0000-0000-0000-000000000001'),
  '30000000-0000-0000-0000-000000000001'::uuid,
  'invalid physical source page failure leaves publication on v1'
);
SELECT throws_ok(
  $$UPDATE public.question_versions
    SET primary_topic_id = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
    WHERE question_id = '20000000-0000-0000-0000-000000000001'
      AND version_number = 2$$,
  '23503',
  'insert or update on table "question_versions" violates foreign key constraint "question_versions_primary_topic_id_fkey"',
  'foreign key rejects a missing primary Topic before approval'
);
SELECT is(
  (SELECT current_version_id FROM public.questions WHERE id = '20000000-0000-0000-0000-000000000001'),
  '30000000-0000-0000-0000-000000000001'::uuid,
  'invalid primary Topic failure leaves publication on v1'
);
SELECT lives_ok(
  $$SELECT public.submit_question_version_for_review(
    '20000000-0000-0000-0000-000000000001',
    (SELECT id FROM public.question_versions WHERE question_id = '20000000-0000-0000-0000-000000000001' AND version_number = 2)
  )$$,
  'corrected v2 can enter review'
);
SELECT lives_ok(
  $$SELECT public.approve_question_version(
    '20000000-0000-0000-0000-000000000001',
    (SELECT id FROM public.question_versions WHERE question_id = '20000000-0000-0000-0000-000000000001' AND version_number = 2)
  )$$,
  'valid v2 approval atomically switches publication'
);
SELECT is(
  (SELECT status::text FROM public.question_versions WHERE id = '30000000-0000-0000-0000-000000000001'),
  'superseded',
  'v1 becomes superseded history'
);
SELECT is(
  (SELECT status::text FROM public.question_versions WHERE question_id = '20000000-0000-0000-0000-000000000001' AND version_number = 2),
  'approved',
  'v2 becomes approved'
);
SELECT is(
  (SELECT current_version_id FROM public.questions WHERE id = '20000000-0000-0000-0000-000000000001'),
  (SELECT id FROM public.question_versions WHERE question_id = '20000000-0000-0000-0000-000000000001' AND version_number = 2),
  'publication pointer atomically switches to v2'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000002',
  true
);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT array_agg(version_number ORDER BY version_number) FROM public.question_versions WHERE question_id = '20000000-0000-0000-0000-000000000001'),
  ARRAY[2],
  'student sees only v2 after publication switches'
);
SELECT is(
  (SELECT count(*) FROM public.question_options WHERE question_version_id = '30000000-0000-0000-0000-000000000001'),
  0::bigint,
  'student cannot read superseded v1 options'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$UPDATE public.question_versions
    SET stem = 'forbidden historical edit'
    WHERE id = '30000000-0000-0000-0000-000000000001'$$,
  '55000',
  'Superseded versions are immutable historical records.',
  'superseded version rows are immutable'
);
SELECT throws_ok(
  $$UPDATE public.question_options
    SET option_text = 'forbidden published edit'
    WHERE question_version_id = (
      SELECT id FROM public.question_versions
      WHERE question_id = '20000000-0000-0000-0000-000000000001'
        AND version_number = 2
    ) AND option_key = 'A'$$,
  '55000',
  'Only draft question-version content may be edited.',
  'approved version children are immutable'
);
SELECT throws_ok(
  $$DELETE FROM public.question_versions
    WHERE id = '30000000-0000-0000-0000-000000000001'$$,
  '55000',
  'Only draft versions may be deleted.',
  'superseded versions cannot be deleted'
);
SELECT throws_ok(
  $$UPDATE public.questions
    SET status = 'retired'::public.question_status,
        current_version_id = NULL
    WHERE id = '20000000-0000-0000-0000-000000000001'$$,
  '42501',
  'Question publication state can only change through a controlled lifecycle function.',
  'direct publication-state changes are rejected'
);
SELECT lives_ok(
  $$SELECT public.create_question_revision('20000000-0000-0000-0000-000000000001')$$,
  'admin can create one new working revision'
);
SELECT throws_ok(
  $$SELECT public.create_question_revision('20000000-0000-0000-0000-000000000001')$$,
  '23505',
  'Question revision rejected: this question already has a draft or review version.',
  'second simultaneous working revision is rejected'
);
SELECT is(
  (SELECT count(*) FROM public.question_versions WHERE question_id = '20000000-0000-0000-0000-000000000001' AND status IN ('draft', 'review')),
  1::bigint,
  'only one working revision exists'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000002',
  true
);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$SELECT public.create_question_revision('20000000-0000-0000-0000-000000000001')$$,
  '42501',
  'Only an authenticated admin or super-admin may manage question revisions.',
  'student cannot create revisions'
);
SELECT throws_ok(
  $$SELECT public.submit_question_version_for_review(
    '20000000-0000-0000-0000-000000000001',
    (SELECT id FROM public.question_versions WHERE question_id = '20000000-0000-0000-0000-000000000001' AND version_number = 3)
  )$$,
  '42501',
  'Only an authenticated admin or super-admin may manage question revisions.',
  'student cannot submit revisions'
);
SELECT throws_ok(
  $$SELECT public.return_question_version_to_draft(
    '20000000-0000-0000-0000-000000000001',
    (SELECT id FROM public.question_versions WHERE question_id = '20000000-0000-0000-0000-000000000001' AND version_number = 3)
  )$$,
  '42501',
  'Only an authenticated admin or super-admin may manage question revisions.',
  'student cannot return revisions to draft'
);
SELECT throws_ok(
  $$SELECT public.approve_question_version(
    '20000000-0000-0000-0000-000000000001',
    (SELECT id FROM public.question_versions WHERE question_id = '20000000-0000-0000-0000-000000000001' AND version_number = 3)
  )$$,
  '42501',
  'Only an authenticated admin or super-admin may manage question revisions.',
  'student cannot approve revisions'
);
SELECT throws_ok(
  $$SELECT public.retire_question('20000000-0000-0000-0000-000000000001')$$,
  '42501',
  'Only an authenticated admin or super-admin may manage question revisions.',
  'student cannot retire questions'
);
SELECT is_empty(
  $$UPDATE public.questions
    SET status = 'retired'::public.question_status,
        current_version_id = NULL
    WHERE id = '20000000-0000-0000-0000-000000000001'
    RETURNING 1$$,
  'student direct update is filtered by RLS'
);
SELECT is(
  (SELECT current_version_id FROM public.questions WHERE id = '20000000-0000-0000-0000-000000000001'),
  (SELECT id FROM public.question_versions WHERE question_id = '20000000-0000-0000-0000-000000000001' AND version_number = 2),
  'unauthorized operations leave publication unchanged'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$DELETE FROM public.question_versions
    WHERE question_id = '20000000-0000-0000-0000-000000000001'
      AND version_number = 3$$,
  'admin can remove the unresolved draft before retirement'
);
SELECT lives_ok(
  $$SELECT public.retire_question('20000000-0000-0000-0000-000000000001')$$,
  'admin can retire a published question without a working revision'
);
SELECT is(
  (SELECT status::text FROM public.questions WHERE id = '20000000-0000-0000-0000-000000000001'),
  'retired',
  'retirement changes the question lifecycle status'
);
SELECT is(
  (SELECT current_version_id FROM public.questions WHERE id = '20000000-0000-0000-0000-000000000001'),
  NULL::uuid,
  'retirement clears the publication pointer'
);
SELECT is(
  (SELECT status::text FROM public.question_versions WHERE question_id = '20000000-0000-0000-0000-000000000001' AND version_number = 2),
  'superseded',
  'retirement preserves current content as superseded history'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000002',
  true
);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*) FROM public.questions WHERE id = '20000000-0000-0000-0000-000000000001'),
  0::bigint,
  'student cannot read a retired question'
);
SELECT is(
  (SELECT count(*) FROM public.question_versions WHERE question_id = '20000000-0000-0000-0000-000000000001'),
  0::bigint,
  'student cannot read retired question history'
);
SELECT is(
  (SELECT count(*) FROM public.question_options WHERE question_version_id IN (
    SELECT id FROM public.question_versions WHERE question_id = '20000000-0000-0000-0000-000000000001'
  )),
  0::bigint,
  'student cannot read retired question options'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*) FROM public.question_versions WHERE question_id = '20000000-0000-0000-0000-000000000001'),
  2::bigint,
  'admin retains access to both historical versions after retirement'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
