-- Metadata only, one result object. Does not read questions, answers or users and never invokes a mutation RPC.
BEGIN READ ONLY;
SET LOCAL search_path=public,extensions;
WITH catalog AS (
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
SELECT jsonb_build_object('all_catalog_checks_pass',bool_and(coalesce(ok,false)),'checks',jsonb_agg(jsonb_build_object('name',name,'ok',coalesce(ok,false)) ORDER BY name)) FROM checks
), ledger AS (
  SELECT coalesce(bool_and(name='question_bank_simple_publication' AND cardinality(statements)=1 AND md5(statements[1])='af640c18c5f8814caa56a5d8edcf47fc'),false) AND count(*)=1 AS ok
  FROM supabase_migrations.schema_migrations WHERE version='20261020000000'
)
SELECT (SELECT * FROM catalog) || jsonb_build_object('all_ledger_checks_pass',(SELECT ok FROM ledger)) AS simple_publication_verification;
COMMIT;
