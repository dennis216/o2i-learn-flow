-- Run ONLY in the Dashboard SQL Editor for project lxoaeaewcrshjkigzyqe.
-- The comment is not a connection check. Confirm the Dashboard project first.
-- Return metadata only; no question, user, email, or token data.
BEGIN READ ONLY;
SELECT jsonb_build_object(
  'requested_project', 'lxoaeaewcrshjkigzyqe',
  'ledger', to_regclass('supabase_migrations.schema_migrations')::text,
  'columns', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'name', a.attname, 'type', format_type(a.atttypid, a.atttypmod),
      'not_null', a.attnotnull, 'identity', a.attidentity,
      'generated', a.attgenerated,
      'default', pg_get_expr(d.adbin, d.adrelid)
    ) ORDER BY a.attnum)
    FROM pg_attribute a
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE a.attrelid = to_regclass('supabase_migrations.schema_migrations')
      AND a.attnum > 0 AND NOT a.attisdropped
  ), '[]'::jsonb),
  'constraints', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('name', conname, 'definition', pg_get_constraintdef(oid)))
    FROM pg_constraint WHERE conrelid = to_regclass('supabase_migrations.schema_migrations')
  ), '[]'::jsonb),
  'user_triggers', COALESCE((
    SELECT jsonb_agg(tgname) FROM pg_trigger
    WHERE tgrelid = to_regclass('supabase_migrations.schema_migrations') AND NOT tgisinternal
  ), '[]'::jsonb),
  'rls_enabled', (SELECT relrowsecurity FROM pg_class
    WHERE oid = to_regclass('supabase_migrations.schema_migrations')),
  'executor_can_select', has_table_privilege(current_user,
    to_regclass('supabase_migrations.schema_migrations'), 'SELECT'),
  'executor_can_insert', has_table_privilege(current_user,
    to_regclass('supabase_migrations.schema_migrations'), 'INSERT')
) AS ledger_preflight;
COMMIT;
