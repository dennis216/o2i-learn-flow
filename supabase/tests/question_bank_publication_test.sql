-- Latest-schema pgTAP suite. Uses only synthetic identities and rolls back.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(30);
INSERT INTO auth.users(id,email) VALUES
  ('94000000-0000-0000-0000-000000000001','publication-pgtap-admin@example.test'),
  ('94000000-0000-0000-0000-000000000002','publication-pgtap-student@example.test');
INSERT INTO public.user_roles(user_id,role) VALUES('94000000-0000-0000-0000-000000000001','admin');
CREATE TEMP TABLE publication_fixture(saved jsonb);
GRANT SELECT,INSERT ON publication_fixture TO authenticated;
SELECT set_config('request.jwt.claim.sub','94000000-0000-0000-0000-000000000001',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
INSERT INTO publication_fixture SELECT public.save_question_bank_drafts(jsonb_build_array(jsonb_build_object(
  'external_id','SYNTHETIC-PUBLICATION-PGTAP','correct_option_key','A','stem','Synthetic \(x^2\)','solution','Synthetic \[2x\]',
  'difficulty','easy','course_scope','AB','primary_topic_code',(SELECT topic_code FROM public.curriculum_topics ORDER BY topic_code LIMIT 1),
  'practice_skill_codes',jsonb_build_array((SELECT skill_code FROM public.curriculum_practice_skills ORDER BY skill_code LIMIT 1)),
  'representation_type','analytical','calculator_policy',NULL,'source_document','SYNTHETIC.pdf','source_page','12-13',
  'source_locator','p012-item01','requires_figure',false,'import_evidence','{"human_review_status":"pending","ai_flags":["ANSWER_AI_INFERRED"]}'::jsonb,
  'options','[{"option_key":"A","option_text":"Synthetic correct","is_correct":true,"import_evidence":{}},{"option_key":"B","option_text":"Synthetic wrong","is_correct":false,"import_evidence":{}}]'::jsonb
)))->0;
SELECT is((SELECT status::text FROM public.questions WHERE external_id='SYNTHETIC-PUBLICATION-PGTAP'),'draft','intake remains draft');
SELECT is((SELECT current_version_id FROM public.questions WHERE external_id='SYNTHETIC-PUBLICATION-PGTAP'),NULL::uuid,'intake has no publication pointer');
SELECT ok(EXISTS(SELECT 1 FROM publication_fixture f, jsonb_array_elements(public.precheck_question_publication((f.saved->>'question_id')::uuid,(f.saved->>'version_id')::uuid,'publish')->'issues') i
  WHERE i->>'code'='QB_REVIEW_REQUIRED'),'XLSX evidence cannot establish trusted review');
SELECT ok(NOT has_function_privilege('authenticated','public.approve_question_version(uuid,uuid)','EXECUTE'),'legacy approval is private');
SELECT ok(NOT has_function_privilege('authenticated','public.create_question_revision(uuid)','EXECUTE'),'legacy revision-only creation is private');
SELECT ok(NOT has_column_privilege('authenticated','public.questions','status','UPDATE'),'direct status writes are denied');
SELECT ok(NOT has_column_privilege('authenticated','public.question_versions','import_evidence','UPDATE'),'import evidence cannot be erased directly');
SELECT lives_ok($test$
  SELECT public.record_question_version_review((saved->>'question_id')::uuid,(saved->>'version_id')::uuid,
    public.precheck_question_publication((saved->>'question_id')::uuid,(saved->>'version_id')::uuid,'publish')->>'fingerprint',
    '{"confirmed":true}'::jsonb)
    FROM publication_fixture
$test$,'explicit manual review is recorded');
SELECT is((SELECT count(*)::int FROM public.question_version_reviews r JOIN publication_fixture f ON r.question_version_id=(f.saved->>'version_id')::uuid),1,'one trusted review exists');
SELECT is((SELECT reviewed_by FROM public.question_version_reviews r JOIN publication_fixture f ON r.question_version_id=(f.saved->>'version_id')::uuid),
  '94000000-0000-0000-0000-000000000001'::uuid,'review actor comes from authentication');
SELECT lives_ok($test$SELECT public.publish_question_version((saved->>'question_id')::uuid,(saved->>'version_id')::uuid,
  public.precheck_question_publication((saved->>'question_id')::uuid,(saved->>'version_id')::uuid,'publish')->>'fingerprint') FROM publication_fixture$test$,'first version publishes');
SELECT is((SELECT status::text FROM public.questions WHERE external_id='SYNTHETIC-PUBLICATION-PGTAP'),'approved','identity is published');
SELECT is((SELECT v.status::text FROM public.question_versions v JOIN publication_fixture f ON v.id=(f.saved->>'version_id')::uuid),'approved','current version is approved');
SELECT is((SELECT v.import_evidence->>'human_review_status' FROM public.question_versions v JOIN publication_fixture f ON v.id=(f.saved->>'version_id')::uuid),'pending','original pending evidence is preserved');
SELECT set_config('request.jwt.claim.sub','94000000-0000-0000-0000-000000000002',true);
SELECT is((SELECT count(*)::int FROM public.questions WHERE external_id='SYNTHETIC-PUBLICATION-PGTAP'),1,'student can see published identity');
SELECT is((SELECT count(*)::int FROM public.question_versions WHERE question_id=(SELECT id FROM public.questions WHERE external_id='SYNTHETIC-PUBLICATION-PGTAP')),0,'student cannot read raw solution records');
SELECT is((SELECT count(*)::int FROM public.question_options WHERE question_version_id=(SELECT current_version_id FROM public.questions WHERE external_id='SYNTHETIC-PUBLICATION-PGTAP')),0,'student cannot read correct-answer records');
SELECT throws_ok($test$SELECT public.precheck_question_publication((saved->>'question_id')::uuid,(saved->>'version_id')::uuid,'publish') FROM publication_fixture$test$,
  'P0001','QB_FORBIDDEN: Authenticated administrator access is required.','student cannot operate publication API');
SELECT set_config('request.jwt.claim.sub','94000000-0000-0000-0000-000000000001',true);
SELECT lives_ok($test$SELECT public.unpublish_question((saved->>'question_id')::uuid,(saved->>'version_id')::uuid,
  public.precheck_question_publication((saved->>'question_id')::uuid,(saved->>'version_id')::uuid,'publish')->>'fingerprint') FROM publication_fixture$test$,'withdrawal succeeds');
SELECT is((SELECT status::text FROM public.questions WHERE external_id='SYNTHETIC-PUBLICATION-PGTAP'),'unpublished','withdrawn identity is recoverable');
SELECT ok((SELECT current_version_id IS NOT NULL FROM public.questions WHERE external_id='SYNTHETIC-PUBLICATION-PGTAP'),'withdrawal retains approved pointer');
SELECT set_config('request.jwt.claim.sub','94000000-0000-0000-0000-000000000002',true);
SELECT is((SELECT count(*)::int FROM public.questions WHERE external_id='SYNTHETIC-PUBLICATION-PGTAP'),0,'withdrawal hides identity from students');
SELECT set_config('request.jwt.claim.sub','94000000-0000-0000-0000-000000000001',true);
SELECT lives_ok($test$SELECT public.republish_question((saved->>'question_id')::uuid,(saved->>'version_id')::uuid,
  public.precheck_question_publication((saved->>'question_id')::uuid,(saved->>'version_id')::uuid,'republish')->>'fingerprint') FROM publication_fixture$test$,'same approved version can be restored');
SELECT is((SELECT count(*)::int FROM public.question_versions WHERE question_id=(SELECT id FROM public.questions WHERE external_id='SYNTHETIC-PUBLICATION-PGTAP')),1,'restoration creates no duplicate version');
SELECT public.unpublish_question((saved->>'question_id')::uuid,(saved->>'version_id')::uuid,
  public.precheck_question_publication((saved->>'question_id')::uuid,(saved->>'version_id')::uuid,'publish')->>'fingerprint') FROM publication_fixture;
SELECT lives_ok($test$SELECT public.archive_question((saved->>'question_id')::uuid,(saved->>'version_id')::uuid,
  public.precheck_question_publication((saved->>'question_id')::uuid,(saved->>'version_id')::uuid,'republish')->>'fingerprint') FROM publication_fixture$test$,'withdrawn identity can be archived');
SELECT is((SELECT status::text FROM public.questions WHERE external_id='SYNTHETIC-PUBLICATION-PGTAP'),'retired','archive is not recoverable withdrawal');
SELECT is((SELECT v.status::text FROM public.question_versions v JOIN publication_fixture f ON v.id=(f.saved->>'version_id')::uuid),'superseded','archive retains immutable version history');
SELECT throws_ok($test$DELETE FROM public.questions WHERE external_id='SYNTHETIC-PUBLICATION-PGTAP'$test$,
  'P0001','QB_DELETE_HISTORY: Previously published questions cannot be permanently deleted. Withdraw and archive instead.','historical identity cannot be hard-deleted');
SELECT is((SELECT count(*)::int FROM public.question_publication_events WHERE question_id=(SELECT id FROM public.questions WHERE external_id='SYNTHETIC-PUBLICATION-PGTAP')),5,'publication/withdrawal/restoration/archive events are retained');
SELECT ok(NOT has_function_privilege('anon','public.publish_question_versions(jsonb)','EXECUTE'),'anonymous publication is denied');
SELECT * FROM finish();
ROLLBACK;
