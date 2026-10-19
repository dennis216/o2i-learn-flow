-- TARGET: lxoaeaewcrshjkigzyqe. Metadata ONLY; no RPC or question/user content reads.
-- After all three separate runs. This is not an administrator-session acceptance test.
BEGIN READ ONLY;
SET LOCAL search_path=public,extensions;
SELECT catalog_report AS task4_catalog FROM (WITH expected_functions(signature,body_hash,definer,return_type,argument_names,search_path) AS (VALUES ('public.has_role(uuid,public.app_role)','b6a4c82ad51a3997410a4bc37975e05f',true,'boolean',ARRAY['_user_id','_role']::text[],'public,extensions'),
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
  'note','Catalog checks do not replace administrator login/API/XLSX acceptance.') AS catalog_report FROM checks) final_catalog;
WITH expected(version,name,body_hash) AS (VALUES ('20260926000000','question_bank_foundation','d74284a7a6f56bb87a2d86fc5fab221b'),('20261004000000','question_bank_draft_import','ed97a5cdf46d446810ae336850d05874'),('20261018000000','question_bank_draft_management','0868c0f1ad21902ed372e05e0d62f58a'),('20261019000000','question_bank_unpublished_status','345be247bee1e33cf18b36c1707e7fd0'),('20261019010000','question_bank_publication','7fab57a8878606e00f2d71ae001d30cd')), checks AS (
  SELECT e.version,m.version IS NOT NULL AND m.name=e.name AND cardinality(m.statements)=1 AND md5(m.statements[1])=e.body_hash AS ok,
    cardinality(m.statements) AS statement_blocks,
    CASE WHEN e.version IN ('20261018000000','20261019000000','20261019010000') THEN m.created_by IS NULL AND m.idempotency_key IS NULL AND m.rollback IS NULL ELSE true END AS optional_audit_columns_untouched
  FROM expected e LEFT JOIN supabase_migrations.schema_migrations m ON m.version=e.version
)
SELECT jsonb_build_object('all_ledger_checks_pass',bool_and(coalesce(ok,false) AND coalesce(optional_audit_columns_untouched,false)),
  'migration_records',jsonb_agg(to_jsonb(c) ORDER BY version)) AS task4_ledger FROM checks c;
COMMIT;
