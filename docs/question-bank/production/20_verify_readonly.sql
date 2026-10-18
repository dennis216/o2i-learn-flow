-- Readonly acceptance for project lxoaeaewcrshjkigzyqe; verify Dashboard target manually.
-- No RPC execution, content reads, auth sessions, cache refresh, or test fixtures.
-- Run after a successful deployment. Ledger columns must first match file 00.
BEGIN READ ONLY;
SET LOCAL search_path = public, extensions;
WITH expected_tables(name) AS (VALUES
  ('questions'),
  ('question_versions'),
  ('question_options'),
  ('question_practice_skills'),
  ('question_topics'),
  ('misconceptions'),
  ('option_misconceptions'),
  ('question_course_videos')
), expected_functions(signature, body_hash, definer, return_type, argument_names) AS (VALUES
  ('public.validate_question_version_approval(uuid, uuid)', '45e5ed7585026f55e810f1acbff94555', true, 'void', ARRAY['_question_id','_version_id']::text[]),
  ('public.enforce_question_lifecycle()', 'e7f8d34ac2492a1fce7ead5f73f0880b', true, 'trigger', ARRAY[]::text[]),
  ('public.enforce_question_version_lifecycle()', 'a3f8b115a46fb425640cf19b711c2a6b', true, 'trigger', ARRAY[]::text[]),
  ('public.protect_non_draft_version_child()', '8dfd627fabeea7d88246b510fc517281', true, 'trigger', ARRAY[]::text[]),
  ('public.reject_primary_topic_as_secondary()', '053c04d309b2ab4aa4bcc7532a0db15d', true, 'trigger', ARRAY[]::text[]),
  ('public.reject_secondary_topic_as_primary()', '9f4a112bf6c5eaaddce2b32204769e70', true, 'trigger', ARRAY[]::text[]),
  ('public.protect_non_draft_option_misconception()', '450724421924aa5c21e59bb630e8c30d', true, 'trigger', ARRAY[]::text[]),
  ('public.reject_correct_option_misconception()', '371661c1cadf945a79258e4ed6022cdb', true, 'trigger', ARRAY[]::text[]),
  ('public.reject_correct_option_with_misconception()', '944bc1bcb25c7826990ff62301ac783a', true, 'trigger', ARRAY[]::text[]),
  ('public.prevent_approved_question_delete()', '2a812c2c0af81b72a6be75a3fade01c0', true, 'trigger', ARRAY[]::text[]),
  ('public.assert_question_bank_admin()', 'db723134f0718668986d106b6689e375', true, 'void', ARRAY[]::text[]),
  ('public.create_question_revision(uuid)', 'acc2690cba4c5c3087b12297248631ec', true, 'uuid', ARRAY['_question_id']::text[]),
  ('public.submit_question_version_for_review(uuid, uuid)', '1658956fe0598859003c1cd2a52c0206', true, 'uuid', ARRAY['_question_id','_version_id']::text[]),
  ('public.return_question_version_to_draft(uuid, uuid)', 'b09dac9c077364e28425ffaa395ca755', true, 'uuid', ARRAY['_question_id','_version_id']::text[]),
  ('public.approve_question_version(uuid, uuid)', '030241308b6522d7a8cd77d3531f8a7a', true, 'public.questions', ARRAY['_question_id','_version_id']::text[]),
  ('public.retire_question(uuid)', 'f077f74c363cfdf03586961e1d143abb', true, 'public.questions', ARRAY['_question_id']::text[]),
  ('public.require_question_publication_metadata()', '476ca3529520281ee087e914932c8d9d', true, 'trigger', ARRAY[]::text[]),
  ('public.save_question_bank_drafts(jsonb)', '17ac2a83f0fd26e59a11e0c12c803390', true, 'jsonb', ARRAY['_items']::text[])
), expected_policies(table_name, name, command) AS (VALUES
  ('questions', 'Admins manage questions', '*'),
  ('questions', 'Authenticated users read approved questions', 'r'),
  ('question_versions', 'Admins manage question versions', '*'),
  ('question_versions', 'Authenticated users read current approved versions', 'r'),
  ('question_options', 'Admins manage question options', '*'),
  ('question_options', 'Authenticated users read approved question options', 'r'),
  ('question_practice_skills', 'Admins manage question practice skills', '*'),
  ('question_practice_skills', 'Authenticated users read approved question practice skills', 'r'),
  ('question_topics', 'Admins manage secondary question topics', '*'),
  ('question_topics', 'Authenticated users read approved secondary question topics', 'r'),
  ('misconceptions', 'Admins manage misconceptions', '*'),
  ('misconceptions', 'Authenticated users read misconceptions for approved questions', 'r'),
  ('option_misconceptions', 'Admins manage option misconceptions', '*'),
  ('option_misconceptions', 'Authenticated users read approved option misconceptions', 'r'),
  ('question_course_videos', 'Admins manage question course videos', '*'),
  ('question_course_videos', 'Authenticated users read approved question course videos', 'r')
), expected_triggers(table_name, name, signature) AS (VALUES
  ('questions', 'update_questions_updated_at', 'public.update_updated_at_column()'),
  ('misconceptions', 'update_misconceptions_updated_at', 'public.update_updated_at_column()'),
  ('questions', 'enforce_question_lifecycle_trigger', 'public.enforce_question_lifecycle()'),
  ('question_versions', 'enforce_question_version_lifecycle_trigger', 'public.enforce_question_version_lifecycle()'),
  ('question_options', 'protect_non_draft_question_options', 'public.protect_non_draft_version_child()'),
  ('question_practice_skills', 'protect_non_draft_question_practice_skills', 'public.protect_non_draft_version_child()'),
  ('question_topics', 'protect_non_draft_question_topics', 'public.protect_non_draft_version_child()'),
  ('question_topics', 'reject_primary_topic_as_secondary_trigger', 'public.reject_primary_topic_as_secondary()'),
  ('question_versions', 'reject_secondary_topic_as_primary_trigger', 'public.reject_secondary_topic_as_primary()'),
  ('option_misconceptions', 'protect_non_draft_option_misconceptions', 'public.protect_non_draft_option_misconception()'),
  ('option_misconceptions', 'reject_correct_option_misconception_trigger', 'public.reject_correct_option_misconception()'),
  ('question_options', 'reject_correct_option_with_misconception_trigger', 'public.reject_correct_option_with_misconception()'),
  ('questions', 'prevent_approved_question_delete_trigger', 'public.prevent_approved_question_delete()'),
  ('question_versions', 'require_question_publication_metadata_trigger', 'public.require_question_publication_metadata()')
), table_checks AS (
  SELECT e.name, c.oid, c.relrowsecurity,
    c.relkind = 'r' AND c.relrowsecurity
      AND has_schema_privilege('authenticated', 'public', 'USAGE')
      AND (SELECT bool_and(has_table_privilege('authenticated', c.oid, privilege))
        FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) privilege)
      AND (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) = 2
      AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid
        AND p.polroles <> ARRAY[(SELECT oid FROM pg_roles WHERE rolname = 'authenticated')])
      AS ok
  FROM expected_tables e LEFT JOIN pg_class c ON c.oid = to_regclass('public.' || e.name)
), function_checks AS (
  SELECT e.signature, p.oid IS NOT NULL AS exists,
    p.prosecdef = e.definer AND p.prorettype = to_regtype(e.return_type)
      AND COALESCE(p.proargnames, ARRAY[]::text[]) = e.argument_names
      AND md5(regexp_replace(p.prosrc, '[[:space:]]', '', 'g')) = e.body_hash
      AND 'search_path=public, extensions' = ANY(p.proconfig) AS ok,
    has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute
  FROM expected_functions e LEFT JOIN pg_proc p ON p.oid = to_regprocedure(e.signature)
), policy_checks AS (
  SELECT e.table_name, e.name,
    p.polcmd::text = e.command AND p.polpermissive
      AND p.polroles = ARRAY[(SELECT oid FROM pg_roles WHERE rolname = 'authenticated')] AS ok,
    pg_get_expr(p.polqual, p.polrelid) AS using_expression,
    pg_get_expr(p.polwithcheck, p.polrelid) AS check_expression
  FROM expected_policies e LEFT JOIN pg_policy p
    ON p.polrelid = to_regclass('public.' || e.table_name) AND p.polname = e.name
), trigger_checks AS (
  SELECT e.table_name, e.name,
    t.tgfoid = to_regprocedure(e.signature) AND t.tgenabled = 'O' AS ok
  FROM expected_triggers e LEFT JOIN pg_trigger t
    ON t.tgrelid = to_regclass('public.' || e.table_name) AND t.tgname = e.name
), key_constraints(name, table_name, kind, keys) AS (VALUES
  ('questions_current_version_belongs_to_question', 'questions', 'f', ARRAY['current_version_id','id']),
  ('question_versions_question_version_unique', 'question_versions', 'u', ARRAY['question_id','version_number']),
  ('question_versions_id_question_unique', 'question_versions', 'u', ARRAY['id','question_id']),
  ('question_versions_source_identity_check', 'question_versions', 'c', NULL),
  ('question_versions_approval_audit_check', 'question_versions', 'c', NULL),
  ('question_versions_published_metadata_required', 'question_versions', 'c', NULL),
  ('questions_lifecycle_pointer_check', 'questions', 'c', NULL)
), constraint_checks AS (
  SELECT e.name, c.contype::text = e.kind AND c.convalidated
    AND (e.keys IS NULL OR e.keys = ARRAY(SELECT a.attname::text
      FROM unnest(c.conkey) WITH ORDINALITY k(attnum, ord)
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum ORDER BY k.ord))
    AND (e.kind <> 'f' OR (c.confrelid = to_regclass('public.question_versions')
      AND c.condeferrable AND ARRAY['id','question_id'] = ARRAY(SELECT a.attname::text
        FROM unnest(c.confkey) WITH ORDINALITY k(attnum, ord)
        JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.attnum ORDER BY k.ord))) AS ok
  FROM key_constraints e LEFT JOIN pg_constraint c
    ON c.conrelid = to_regclass('public.' || e.table_name) AND c.conname = e.name
), index_checks AS (
  SELECT n.name, i.indisunique AND i.indisvalid AND i.indpred IS NOT NULL AS ok,
    pg_get_indexdef(i.indexrelid) AS definition
  FROM (VALUES ('question_options_one_correct_per_version'),
    ('question_versions_one_working_revision'), ('question_versions_one_approved_version')) n(name)
  LEFT JOIN pg_index i ON i.indexrelid = to_regclass('public.' || n.name)
), column_checks AS (
  SELECT e.table_name, e.name,
    a.attnotnull = e.not_null AND format_type(a.atttypid, a.atttypmod) = e.type AS ok,
    pg_get_expr(d.adbin, d.adrelid) AS default_expression
  FROM (VALUES
    ('question_versions','calculator_policy','question_calculator_policy',false),
    ('question_versions','source_type','question_source_type',false),
    ('question_versions','import_evidence','jsonb',true),
    ('question_options','import_evidence','jsonb',true),
    ('question_versions','source_page','integer',true),
    ('question_versions','source_question_number','text',false),
    ('question_versions','source_locator','text',false),
    ('questions','status','question_status',true),
    ('question_versions','status','question_version_status',true)
  ) e(table_name,name,type,not_null)
  LEFT JOIN pg_attribute a ON a.attrelid = to_regclass('public.' || e.table_name)
    AND a.attname = e.name AND a.attnum > 0 AND NOT a.attisdropped
  LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
), rpc_checks AS (
  SELECT bool_and(COALESCE(has_function_privilege('authenticated', to_regprocedure(signature), 'EXECUTE'), false)) AS authenticated_execute,
    NOT COALESCE(has_function_privilege('anon', to_regprocedure('public.save_question_bank_drafts(jsonb)'), 'EXECUTE'), true) AS anon_save_denied
  FROM (VALUES ('public.save_question_bank_drafts(jsonb)'), ('public.create_question_revision(uuid)'),
    ('public.submit_question_version_for_review(uuid, uuid)'), ('public.return_question_version_to_draft(uuid, uuid)'),
    ('public.approve_question_version(uuid, uuid)'), ('public.retire_question(uuid)')) r(signature)
)
SELECT jsonb_build_object(
  'all_catalog_checks_pass',
    (SELECT bool_and(COALESCE(ok,false)) FROM table_checks)
    AND (SELECT bool_and(COALESCE(ok,false)) FROM function_checks)
    AND (SELECT bool_and(COALESCE(ok,false)) FROM policy_checks)
    AND (SELECT bool_and(COALESCE(ok,false)) FROM trigger_checks)
    AND (SELECT bool_and(COALESCE(ok,false)) FROM constraint_checks)
    AND (SELECT bool_and(COALESCE(ok,false)) FROM index_checks)
    AND (SELECT bool_and(COALESCE(ok,false)) FROM column_checks)
    AND (SELECT authenticated_execute AND anon_save_denied FROM rpc_checks),
  'tables', (SELECT jsonb_agg(to_jsonb(t) - 'oid') FROM table_checks t),
  'functions', (SELECT jsonb_agg(to_jsonb(f)) FROM function_checks f),
  'policies', (SELECT jsonb_agg(to_jsonb(p)) FROM policy_checks p),
  'triggers', (SELECT jsonb_agg(to_jsonb(t)) FROM trigger_checks t),
  'key_constraints', (SELECT jsonb_agg(to_jsonb(c)) FROM constraint_checks c),
  'partial_indexes', (SELECT jsonb_agg(to_jsonb(i)) FROM index_checks i),
  'draft_columns', (SELECT jsonb_agg(to_jsonb(c)) FROM column_checks c),
  'rpc_grants', (SELECT to_jsonb(r) FROM rpc_checks r),
  'all_constraints', (SELECT jsonb_agg(jsonb_build_object('table', e.name,
    'name', c.conname, 'definition', pg_get_constraintdef(c.oid)))
    FROM expected_tables e JOIN pg_constraint c ON c.conrelid = to_regclass('public.' || e.name)),
  'warning', 'Catalog checks are NOT an administrator session, REST cache, or real XLSX acceptance test.'
) AS question_bank_catalog_report;
SELECT version, name, cardinality(statements) AS statement_blocks,
  CASE version
    WHEN '20260926000000' THEN name = 'question_bank_foundation' AND cardinality(statements) = 1 AND md5(statements[1]) = 'd74284a7a6f56bb87a2d86fc5fab221b'
    WHEN '20261004000000' THEN name = 'question_bank_draft_import' AND cardinality(statements) = 1 AND md5(statements[1]) = 'ed97a5cdf46d446810ae336850d05874'
    ELSE false END AS matches_packaged_migration
FROM supabase_migrations.schema_migrations
WHERE version IN ('20260926000000','20261004000000') ORDER BY version;
COMMIT;
