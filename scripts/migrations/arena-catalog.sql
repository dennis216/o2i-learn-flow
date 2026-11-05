-- Only system catalogs; never reads questions, answers or account rows.
-- Ignore CRLF and trailing horizontal whitespace only, not SQL tokens or comments.
SELECT jsonb_build_object(
 'tables',coalesce((SELECT jsonb_agg(jsonb_build_object(
  'name',c.relname,'kind',c.relkind,'persistence',c.relpersistence,'owner',pg_get_userbyid(c.relowner),
  'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
  'acl',(SELECT jsonb_agg(jsonb_build_array(CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,x.privilege_type,x.is_grantable) ORDER BY x.grantee::regrole::text,x.privilege_type) FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) x),
  'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated,'acl',a.attacl::text) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
  'constraints',(SELECT jsonb_agg(jsonb_build_array(k.conname,pg_get_constraintdef(k.oid),k.convalidated,k.condeferrable,k.condeferred) ORDER BY k.conname) FROM pg_constraint k WHERE k.conrelid=c.oid),
  'indexes',(SELECT jsonb_agg(jsonb_build_array(pg_get_indexdef(i.indexrelid),i.indisvalid,i.indisready) ORDER BY pg_get_indexdef(i.indexrelid)) FROM pg_index i WHERE i.indrelid=c.oid),
  'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.policyname) FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=c.relname),
  'triggers',(SELECT jsonb_agg(jsonb_build_array(pg_get_triggerdef(t.oid),t.tgenabled) ORDER BY t.tgname) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal)
 ) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('arena_questions','arena_question_issues')),'[]'::jsonb),
 'functions',coalesce((SELECT jsonb_agg(jsonb_build_object(
  'signature',p.oid::regprocedure::text,'owner',pg_get_userbyid(p.proowner),
  'definition_md5',md5(regexp_replace(replace(pg_get_functiondef(p.oid),E'\r',''),E'[ \t]+\n',E'\n','g')),
  'acl',(SELECT jsonb_agg(jsonb_build_array(CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,x.privilege_type,x.is_grantable) ORDER BY x.grantee::regrole::text,x.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x),
  'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE')
 ) ORDER BY p.oid::regprocedure::text) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('arena_catalog','arena_next_question','arena_submit_answer')),'[]'::jsonb),
 'client_table_access',coalesce((SELECT jsonb_agg(jsonb_build_array(c.relname,r.name,has_table_privilege(r.name,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),has_any_column_privilege(r.name,c.oid,'SELECT,INSERT,UPDATE,REFERENCES')) ORDER BY c.relname,r.name) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN (VALUES('anon'),('authenticated')) r(name) WHERE n.nspname='public' AND c.relname IN ('arena_questions','arena_question_issues')),'[]'::jsonb)
) AS arena_catalog;
