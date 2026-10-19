-- Confirm Dashboard project lxoaeaewcrshjkigzyqe before running. This label is not an identity check.
-- One metadata-only result; no question content, account records, credentials or writes.
WITH expected(stage,version,name,fingerprint) AS (VALUES
    ('simple_publication','20261020000000','question_bank_simple_publication','af640c18c5f8814caa56a5d8edcf47fc'),
    ('student_practice','20261021000000','question_bank_student_practice','bc92e36429c448b7d1523432f1250115'),
    ('random_selection','20261023000000','question_practice_random_selection','463ff7e63c60ebf1b79a3ca34a9ebdc1')
), stages AS (
  SELECT e.stage, CASE WHEN m.version IS NULL THEN 'absent'
    WHEN m.name=e.name AND cardinality(m.statements)=1 AND md5(m.statements[1])=e.fingerprint THEN 'matches'
    ELSE 'ledger_mismatch' END AS status
  FROM expected e LEFT JOIN supabase_migrations.schema_migrations m USING(version)
)
SELECT jsonb_build_object(
  'stages',(SELECT jsonb_object_agg(stage,status) FROM stages),
  'practice_tables',(SELECT jsonb_object_agg(name,to_regclass('public.'||name) IS NOT NULL)
    FROM (VALUES('question_practice_sessions'),('question_practice_items'),('question_practice_attempts')) t(name)),
  'start_rpc_exists',to_regprocedure('public.start_question_practice(uuid,uuid)') IS NOT NULL,
  'adaptive_present',EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261024000000')
    OR EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
      AND table_name='question_practice_sessions' AND column_name='selection_summary')
) AS release_preflight;
