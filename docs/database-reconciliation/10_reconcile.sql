-- Generated. Existing Arena objects must match; its source is recorded but NEVER executed.
BEGIN;
SET LOCAL search_path=public,pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $repair$
DECLARE
 course_sql text := $course_source$-- Forward-only: published Units 1-3 remain public; later units require a session.
-- Shared assets remain public when any published Unit 1-3 uses them.
CREATE OR REPLACE FUNCTION public.course_topic_visible(_course_id uuid,_topic_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
 SELECT EXISTS(SELECT 1 FROM public.course_outline_entries e JOIN public.course_outline_topics m ON m.entry_id=e.id
 JOIN public.course_lessons l ON l.id=e.content_id JOIN public.courses c ON c.id=e.course_id JOIN public.curriculum_units u ON u.id=e.unit_id
 WHERE e.course_id=_course_id AND m.topic_id=_topic_id AND (auth.uid() IS NOT NULL OR u.unit_number <= 3) AND NOT e.archived AND c.is_published AND l.is_published AND public.course_topic_in_scope(c.id,m.topic_id));
$$;
CREATE OR REPLACE FUNCTION public.course_lesson_visible(_lesson_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
 SELECT EXISTS(SELECT 1 FROM public.course_outline_entries e JOIN public.courses c ON c.id=e.course_id JOIN public.curriculum_units u ON u.id=e.unit_id JOIN public.course_lessons l ON l.id=e.content_id WHERE e.content_id=_lesson_id AND (auth.uid() IS NOT NULL OR u.unit_number <= 3) AND NOT e.archived AND c.is_published AND l.is_published);
$$;

CREATE OR REPLACE FUNCTION public.get_course_outline_entry(_course_id uuid,_entry_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE e public.course_outline_entries%ROWTYPE; l public.course_lessons%ROWTYPE; result jsonb; anchor uuid;
BEGIN
 SELECT * INTO e FROM public.course_outline_entries WHERE course_id=_course_id AND id=_entry_id AND NOT archived;
 IF NOT FOUND THEN RAISE EXCEPTION 'Course lesson is not available.'; END IF;
 IF auth.uid() IS NULL AND NOT EXISTS(SELECT 1 FROM public.curriculum_units WHERE id=e.unit_id AND unit_number <= 3) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Log in to access more'; END IF;
 SELECT * INTO l FROM public.course_lessons WHERE id=e.content_id;
 IF NOT public.has_admin_module('courses') AND NOT(coalesce(l.is_published,false) AND EXISTS(SELECT 1 FROM public.courses WHERE id=_course_id AND is_published)) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Lesson content is not available.'; END IF;
 SELECT topic_id INTO anchor FROM public.course_outline_topics WHERE entry_id=e.id ORDER BY topic_id LIMIT 1;
 result:=jsonb_build_object('course_id',_course_id,'entry_id',e.id,'topic_id',coalesce(l.topic_id,anchor),'is_published',coalesce(l.is_published,false),'game_path',l.game_path,'videos',coalesce((SELECT jsonb_agg(jsonb_build_object('id',v.id,'course_id',_course_id,'title',v.title,'description',v.description,'video_url',v.video_url,'duration',v.duration,'transcript',v.transcript,'order_index',m.order_index) ORDER BY m.order_index) FROM public.course_lesson_videos m JOIN public.course_videos v ON v.id=m.video_id WHERE m.lesson_id=l.id),'[]'::jsonb));
 IF public.has_admin_module('courses') THEN
 result:=result||jsonb_build_object('lesson_id',l.id,'revision',coalesce(l.revision,0),'owner_course_id',coalesce(l.owner_course_id,_course_id),'linked_courses',coalesce((SELECT jsonb_agg(jsonb_build_object('id',x.id,'title',x.title)) FROM public.courses x WHERE EXISTS(SELECT 1 FROM public.course_outline_entries b WHERE b.content_id=l.id AND NOT b.archived AND b.course_id=x.id)),'[]'::jsonb),'shared_video_topics',coalesce((SELECT jsonb_agg(DISTINCT jsonb_build_object('video_id',v.video_id,'topic_code',t.topic_code)) FROM public.course_lesson_videos own JOIN public.course_lesson_videos v ON v.video_id=own.video_id AND v.lesson_id<>own.lesson_id JOIN public.course_outline_entries other_e ON other_e.content_id=v.lesson_id AND NOT other_e.archived JOIN public.course_outline_topics mt ON mt.entry_id=other_e.id JOIN public.curriculum_topics t ON t.id=mt.topic_id WHERE own.lesson_id=l.id),'[]'::jsonb));
 END IF;
 RETURN result;
END;
$$;
$course_source$;
 arena_sql text := $arena_source$-- Limit Arena: the question bank stays on the server.
-- Clients never read these tables. They get one question at a time, without
-- its answer, and only see the answer and explanation after submitting.
-- Question rows are imported separately and must never be added to this repo.

CREATE TABLE public.arena_questions (
  id text PRIMARY KEY,
  unit smallint NOT NULL CHECK (unit BETWEEN 1 AND 10),
  tier smallint NOT NULL CHECK (tier BETWEEN 1 AND 3),
  topic text NOT NULL,
  stem text NOT NULL,
  -- options->0 is the correct answer; arena_next_question shuffles before sending.
  options jsonb NOT NULL CHECK (jsonb_typeof(options) = 'array' AND jsonb_array_length(options) = 4),
  explanation text NOT NULL,
  graph jsonb,
  table_html text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.arena_question_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  run_id uuid NOT NULL,
  question_id text NOT NULL REFERENCES public.arena_questions(id) ON DELETE CASCADE,
  -- option_order[n + 1] is the stored option shown at display position n.
  option_order smallint[] NOT NULL CHECK (cardinality(option_order) = 4),
  issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  selected_index smallint CHECK (selected_index BETWEEN 0 AND 3),
  is_correct boolean,
  answered_at timestamptz
);

CREATE INDEX arena_questions_unit_tier_idx ON public.arena_questions(unit, tier) WHERE active;
CREATE INDEX arena_question_issues_user_time_idx ON public.arena_question_issues(user_id, issued_at DESC);
CREATE INDEX arena_question_issues_user_question_idx ON public.arena_question_issues(user_id, question_id, issued_at DESC);

-- RLS with no policies, plus revoked grants: direct table access is refused for
-- anon and authenticated. Supabase grants new public tables to both by default.
ALTER TABLE public.arena_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arena_question_issues ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.arena_questions, public.arena_question_issues FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.arena_questions TO service_role;

CREATE FUNCTION public.arena_catalog() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sign in to play.'; END IF;
  RETURN jsonb_build_object('counts', coalesce((
    SELECT jsonb_object_agg(c.unit, c.total)
    FROM (SELECT unit, count(*) AS total FROM public.arena_questions WHERE active GROUP BY unit) c
  ), '{}'::jsonb));
END;
$$;

CREATE FUNCTION public.arena_next_question(
  _run_id uuid,
  _units integer[],
  _current_unit integer,
  _tier integer,
  _prefer_current boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  per_minute constant integer := 30;
  per_day constant integer := 300;
  last_minute integer;
  last_day integer;
  chosen public.arena_questions%ROWTYPE;
  shuffled smallint[];
  new_issue uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sign in to play.'; END IF;
  IF _run_id IS NULL OR _units IS NULL OR cardinality(_units) NOT BETWEEN 1 AND 10
     OR EXISTS (SELECT 1 FROM unnest(_units) u WHERE u IS NULL OR u NOT BETWEEN 1 AND 10)
     OR _tier IS NULL OR _tier NOT BETWEEN 1 AND 3 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid question request.';
  END IF;

  -- Serialize one account so concurrent requests cannot slip past the limits.
  PERFORM pg_advisory_xact_lock(hashtextextended('arena:' || uid::text, 0));
  SELECT count(*) FILTER (WHERE issued_at > clock_timestamp() - interval '1 minute'), count(*)
    INTO last_minute, last_day
    FROM public.arena_question_issues
    WHERE user_id = uid AND issued_at > clock_timestamp() - interval '1 day';
  IF last_minute >= per_minute OR last_day >= per_day THEN
    RETURN jsonb_build_object('status', 'rate_limited');
  END IF;

  -- Not yet seen this run, then the requested tier, then the current unit,
  -- then whatever this account has gone longest without seeing.
  SELECT q.* INTO chosen
  FROM public.arena_questions q
  LEFT JOIN LATERAL (
    SELECT max(i.issued_at) AS last_issued, bool_or(i.run_id = _run_id) AS in_run
    FROM public.arena_question_issues i
    WHERE i.user_id = uid AND i.question_id = q.id
  ) seen ON true
  WHERE q.active AND q.unit = ANY(_units)
  ORDER BY coalesce(seen.in_run, false),
    q.tier <> _tier,
    (coalesce(_prefer_current, false) AND q.unit IS DISTINCT FROM _current_unit),
    seen.last_issued ASC NULLS FIRST,
    random()
  LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'empty'); END IF;

  SELECT array_agg(n::smallint ORDER BY random()) INTO shuffled FROM generate_series(0, 3) n;
  INSERT INTO public.arena_question_issues(user_id, run_id, question_id, option_order)
    VALUES (uid, _run_id, chosen.id, shuffled)
    RETURNING id INTO new_issue;

  RETURN jsonb_build_object(
    'status', 'ok',
    'issue_id', new_issue,
    'unit', chosen.unit,
    'tier', chosen.tier,
    'topic', chosen.topic,
    'stem', chosen.stem,
    'opts', (SELECT jsonb_agg(chosen.options -> o.stored::integer ORDER BY o.position)
             FROM unnest(shuffled) WITH ORDINALITY o(stored, position)),
    'graph', chosen.graph,
    'table', chosen.table_html
  );
END;
$$;

CREATE FUNCTION public.arena_submit_answer(_issue_id uuid, _selected integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  issue public.arena_question_issues%ROWTYPE;
  solution text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sign in to play.'; END IF;
  IF _selected IS NULL OR _selected NOT BETWEEN 0 AND 3 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Choose one of the four options.';
  END IF;

  SELECT * INTO issue FROM public.arena_question_issues
    WHERE id = _issue_id AND user_id = uid FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not_found'); END IF;

  -- The first answer is final: retries return it, so options cannot be probed.
  IF issue.answered_at IS NULL THEN
    UPDATE public.arena_question_issues
      SET selected_index = _selected,
          is_correct = option_order[_selected + 1] = 0,
          answered_at = clock_timestamp()
      WHERE id = issue.id
      RETURNING * INTO issue;
  END IF;

  SELECT explanation INTO solution FROM public.arena_questions WHERE id = issue.question_id;
  RETURN jsonb_build_object(
    'status', 'ok',
    'correct', issue.is_correct,
    'correct_index', array_position(issue.option_order, 0::smallint) - 1,
    'explanation', solution
  );
END;
$$;

REVOKE ALL ON FUNCTION public.arena_catalog() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.arena_next_question(uuid, integer[], integer, integer, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.arena_submit_answer(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.arena_catalog() TO authenticated;
GRANT EXECUTE ON FUNCTION public.arena_next_question(uuid, integer[], integer, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.arena_submit_answer(uuid, integer) TO authenticated;
$arena_source$;
 before_counts bigint[];
BEGIN
 LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
 IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='supabase_migrations.schema_migrations'::regclass AND NOT tgisinternal) THEN RAISE EXCEPTION 'Unexpected ledger trigger; stop.'; END IF;
 IF NOT (EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261103020000' AND name='admin_user_deletion' AND cardinality(statements)=1 AND md5(statements[1])='d11ccb83ad64a84db35645599c39f9eb')) OR NOT (NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version IN ('20261104000100','20261105010000') OR name IN ('arena_game','course_login_access'))) THEN RAISE EXCEPTION 'History mismatch or repair already recorded; stop without replay.'; END IF;
 LOCK TABLE public.arena_questions,public.arena_question_issues IN SHARE MODE;
 IF NOT coalesce(((-- Only system catalogs; never reads questions, answers or account rows.
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
) AS arena_catalog) = '{"tables":[{"acl":[["postgres","DELETE",false],["postgres","INSERT",false],["postgres","MAINTAIN",false],["postgres","REFERENCES",false],["postgres","SELECT",false],["postgres","TRIGGER",false],["postgres","TRUNCATE",false],["postgres","UPDATE",false],["service_role","DELETE",false],["service_role","INSERT",false],["service_role","MAINTAIN",false],["service_role","REFERENCES",false],["service_role","SELECT",false],["service_role","TRIGGER",false],["service_role","TRUNCATE",false],["service_role","UPDATE",false]],"rls":true,"kind":"r","name":"arena_question_issues","owner":"postgres","columns":[{"acl":null,"name":"id","type":"uuid","default":"gen_random_uuid()","identity":"","not_null":true,"generated":""},{"acl":null,"name":"user_id","type":"uuid","default":null,"identity":"","not_null":true,"generated":""},{"acl":null,"name":"run_id","type":"uuid","default":null,"identity":"","not_null":true,"generated":""},{"acl":null,"name":"question_id","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"acl":null,"name":"option_order","type":"smallint[]","default":null,"identity":"","not_null":true,"generated":""},{"acl":null,"name":"issued_at","type":"timestamp with time zone","default":"clock_timestamp()","identity":"","not_null":true,"generated":""},{"acl":null,"name":"selected_index","type":"smallint","default":null,"identity":"","not_null":false,"generated":""},{"acl":null,"name":"is_correct","type":"boolean","default":null,"identity":"","not_null":false,"generated":""},{"acl":null,"name":"answered_at","type":"timestamp with time zone","default":null,"identity":"","not_null":false,"generated":""}],"indexes":[["CREATE INDEX arena_question_issues_user_question_idx ON public.arena_question_issues USING btree (user_id, question_id, issued_at DESC)",true,true],["CREATE INDEX arena_question_issues_user_time_idx ON public.arena_question_issues USING btree (user_id, issued_at DESC)",true,true],["CREATE UNIQUE INDEX arena_question_issues_pkey ON public.arena_question_issues USING btree (id)",true,true]],"policies":null,"triggers":null,"force_rls":false,"constraints":[["arena_question_issues_option_order_check","CHECK ((cardinality(option_order) = 4))",true,false,false],["arena_question_issues_pkey","PRIMARY KEY (id)",true,false,false],["arena_question_issues_question_id_fkey","FOREIGN KEY (question_id) REFERENCES arena_questions(id) ON DELETE CASCADE",true,false,false],["arena_question_issues_selected_index_check","CHECK (((selected_index >= 0) AND (selected_index <= 3)))",true,false,false],["arena_question_issues_user_id_fkey","FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE",true,false,false]],"persistence":"p"},{"acl":[["postgres","DELETE",false],["postgres","INSERT",false],["postgres","MAINTAIN",false],["postgres","REFERENCES",false],["postgres","SELECT",false],["postgres","TRIGGER",false],["postgres","TRUNCATE",false],["postgres","UPDATE",false],["service_role","DELETE",false],["service_role","INSERT",false],["service_role","MAINTAIN",false],["service_role","REFERENCES",false],["service_role","SELECT",false],["service_role","TRIGGER",false],["service_role","TRUNCATE",false],["service_role","UPDATE",false]],"rls":true,"kind":"r","name":"arena_questions","owner":"postgres","columns":[{"acl":null,"name":"id","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"acl":null,"name":"unit","type":"smallint","default":null,"identity":"","not_null":true,"generated":""},{"acl":null,"name":"tier","type":"smallint","default":null,"identity":"","not_null":true,"generated":""},{"acl":null,"name":"topic","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"acl":null,"name":"stem","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"acl":null,"name":"options","type":"jsonb","default":null,"identity":"","not_null":true,"generated":""},{"acl":null,"name":"explanation","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"acl":null,"name":"graph","type":"jsonb","default":null,"identity":"","not_null":false,"generated":""},{"acl":null,"name":"table_html","type":"text","default":null,"identity":"","not_null":false,"generated":""},{"acl":null,"name":"active","type":"boolean","default":"true","identity":"","not_null":true,"generated":""},{"acl":null,"name":"created_at","type":"timestamp with time zone","default":"now()","identity":"","not_null":true,"generated":""}],"indexes":[["CREATE INDEX arena_questions_unit_tier_idx ON public.arena_questions USING btree (unit, tier) WHERE active",true,true],["CREATE UNIQUE INDEX arena_questions_pkey ON public.arena_questions USING btree (id)",true,true]],"policies":null,"triggers":null,"force_rls":false,"constraints":[["arena_questions_options_check","CHECK (((jsonb_typeof(options) = ''array''::text) AND (jsonb_array_length(options) = 4)))",true,false,false],["arena_questions_pkey","PRIMARY KEY (id)",true,false,false],["arena_questions_tier_check","CHECK (((tier >= 1) AND (tier <= 3)))",true,false,false],["arena_questions_unit_check","CHECK (((unit >= 1) AND (unit <= 10)))",true,false,false]],"persistence":"p"}],"functions":[{"acl":[["authenticated","EXECUTE",false],["postgres","EXECUTE",false],["service_role","EXECUTE",false]],"owner":"postgres","signature":"arena_catalog()","anon_execute":false,"definition_md5":"4096bf02378fbd9b48c95646e2330a90","authenticated_execute":true},{"acl":[["authenticated","EXECUTE",false],["postgres","EXECUTE",false],["service_role","EXECUTE",false]],"owner":"postgres","signature":"arena_next_question(uuid,integer[],integer,integer,boolean)","anon_execute":false,"definition_md5":"6a498e67a01b861596d8e75960797a47","authenticated_execute":true},{"acl":[["authenticated","EXECUTE",false],["postgres","EXECUTE",false],["service_role","EXECUTE",false]],"owner":"postgres","signature":"arena_submit_answer(uuid,integer)","anon_execute":false,"definition_md5":"5fa73f7129d129b26925bcdd4aa58088","authenticated_execute":true}],"client_table_access":[["arena_question_issues","anon",false,false],["arena_question_issues","authenticated",false,false],["arena_questions","anon",false,false],["arena_questions","authenticated",false,false]]}'::jsonb),false) THEN RAISE EXCEPTION 'Arena catalog differs; no DDL or ledger adoption is allowed.'; END IF;
 IF NOT coalesce((EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.course_topic_visible(uuid,uuid)') AND md5(regexp_replace(replace(prosrc,E'\r',''),E'[ \t]+\n',E'\n','g'))='a133a50145830b4d062f11d37d7ceece' AND prosecdef AND provolatile='s' AND proconfig=ARRAY['search_path=public, extensions'] AND pg_get_userbyid(proowner)='postgres') AND EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.course_lesson_visible(uuid)') AND md5(regexp_replace(replace(prosrc,E'\r',''),E'[ \t]+\n',E'\n','g'))='2b8ca927c9e43b1027173be1b16f2216' AND prosecdef AND provolatile='s' AND proconfig=ARRAY['search_path=public, extensions'] AND pg_get_userbyid(proowner)='postgres') AND EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.get_course_outline_entry(uuid,uuid)') AND md5(regexp_replace(replace(prosrc,E'\r',''),E'[ \t]+\n',E'\n','g'))='b858aaacd671d232ae9adea4195b02a2' AND prosecdef AND provolatile='s' AND proconfig=ARRAY['search_path=public, extensions'] AND pg_get_userbyid(proowner)='postgres')),false) OR NOT coalesce((EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='course_lesson_courses' AND policyname='lesson_binding_read' AND cmd='SELECT' AND permissive='PERMISSIVE' AND roles=ARRAY['public']::name[] AND qual='(has_admin_module(''courses''::text) OR course_topic_visible(course_id, topic_id))' AND with_check IS NULL) AND EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('public.course_lesson_courses') AND relrowsecurity) AND EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='course_lesson_videos' AND policyname='lesson_video_read' AND cmd='SELECT' AND permissive='PERMISSIVE' AND roles=ARRAY['public']::name[] AND qual='(has_admin_module(''courses''::text) OR course_lesson_visible(lesson_id))' AND with_check IS NULL) AND EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('public.course_lesson_videos') AND relrowsecurity) AND EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='course_lessons' AND policyname='lesson_read' AND cmd='SELECT' AND permissive='PERMISSIVE' AND roles=ARRAY['public']::name[] AND qual='(has_admin_module(''courses''::text) OR course_lesson_visible(id))' AND with_check IS NULL) AND EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('public.course_lessons') AND relrowsecurity) AND EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='course_videos' AND policyname='course_published_video_read' AND cmd='SELECT' AND permissive='PERMISSIVE' AND roles=ARRAY['public']::name[] AND qual='(has_admin_module(''courses''::text) OR (EXISTS ( SELECT 1
   FROM course_lesson_videos v
  WHERE ((v.video_id = course_videos.id) AND course_lesson_visible(v.lesson_id)))))' AND with_check IS NULL) AND EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('public.course_videos') AND relrowsecurity) AND EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='course_game_read' AND cmd='SELECT' AND permissive='PERMISSIVE' AND roles=ARRAY['public']::name[] AND qual='((bucket_id = ''course-games''::text) AND (has_admin_storage_access(bucket_id) OR (EXISTS ( SELECT 1
   FROM course_lessons l
  WHERE ((l.game_path = objects.name) AND course_lesson_visible(l.id))))))' AND with_check IS NULL) AND EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('storage.objects') AND relrowsecurity) AND coalesce(has_function_privilege('anon',to_regprocedure('public.course_topic_visible(uuid,uuid)'),'EXECUTE'),false) AND coalesce(has_function_privilege('authenticated',to_regprocedure('public.course_topic_visible(uuid,uuid)'),'EXECUTE'),false) AND coalesce(has_function_privilege('anon',to_regprocedure('public.course_lesson_visible(uuid)'),'EXECUTE'),false) AND coalesce(has_function_privilege('authenticated',to_regprocedure('public.course_lesson_visible(uuid)'),'EXECUTE'),false) AND coalesce(has_function_privilege('anon',to_regprocedure('public.get_course_outline_entry(uuid,uuid)'),'EXECUTE'),false) AND coalesce(has_function_privilege('authenticated',to_regprocedure('public.get_course_outline_entry(uuid,uuid)'),'EXECUTE'),false)),false) THEN RAISE EXCEPTION 'Course baseline differs; stop before replacing functions.'; END IF;
 before_counts:=ARRAY[(SELECT count(*) FROM public.arena_questions),(SELECT count(*) FROM public.arena_question_issues)];
 EXECUTE course_sql;
 IF NOT coalesce((EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.course_topic_visible(uuid,uuid)') AND md5(regexp_replace(replace(prosrc,E'\r',''),E'[ \t]+\n',E'\n','g'))='8b88df94abb2b1f5120bae7860235bb9' AND prosecdef AND provolatile='s' AND proconfig=ARRAY['search_path=public, extensions'] AND pg_get_userbyid(proowner)='postgres') AND EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.course_lesson_visible(uuid)') AND md5(regexp_replace(replace(prosrc,E'\r',''),E'[ \t]+\n',E'\n','g'))='680d5328bb2afc88d46eca84d8d9927f' AND prosecdef AND provolatile='s' AND proconfig=ARRAY['search_path=public, extensions'] AND pg_get_userbyid(proowner)='postgres') AND EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.get_course_outline_entry(uuid,uuid)') AND md5(regexp_replace(replace(prosrc,E'\r',''),E'[ \t]+\n',E'\n','g'))='3f66e61bbb3f30df1b06d4cbc791b0b7' AND prosecdef AND provolatile='s' AND proconfig=ARRAY['search_path=public, extensions'] AND pg_get_userbyid(proowner)='postgres')),false) OR NOT coalesce((EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='course_lesson_courses' AND policyname='lesson_binding_read' AND cmd='SELECT' AND permissive='PERMISSIVE' AND roles=ARRAY['public']::name[] AND qual='(has_admin_module(''courses''::text) OR course_topic_visible(course_id, topic_id))' AND with_check IS NULL) AND EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('public.course_lesson_courses') AND relrowsecurity) AND EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='course_lesson_videos' AND policyname='lesson_video_read' AND cmd='SELECT' AND permissive='PERMISSIVE' AND roles=ARRAY['public']::name[] AND qual='(has_admin_module(''courses''::text) OR course_lesson_visible(lesson_id))' AND with_check IS NULL) AND EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('public.course_lesson_videos') AND relrowsecurity) AND EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='course_lessons' AND policyname='lesson_read' AND cmd='SELECT' AND permissive='PERMISSIVE' AND roles=ARRAY['public']::name[] AND qual='(has_admin_module(''courses''::text) OR course_lesson_visible(id))' AND with_check IS NULL) AND EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('public.course_lessons') AND relrowsecurity) AND EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='course_videos' AND policyname='course_published_video_read' AND cmd='SELECT' AND permissive='PERMISSIVE' AND roles=ARRAY['public']::name[] AND qual='(has_admin_module(''courses''::text) OR (EXISTS ( SELECT 1
   FROM course_lesson_videos v
  WHERE ((v.video_id = course_videos.id) AND course_lesson_visible(v.lesson_id)))))' AND with_check IS NULL) AND EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('public.course_videos') AND relrowsecurity) AND EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='course_game_read' AND cmd='SELECT' AND permissive='PERMISSIVE' AND roles=ARRAY['public']::name[] AND qual='((bucket_id = ''course-games''::text) AND (has_admin_storage_access(bucket_id) OR (EXISTS ( SELECT 1
   FROM course_lessons l
  WHERE ((l.game_path = objects.name) AND course_lesson_visible(l.id))))))' AND with_check IS NULL) AND EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('storage.objects') AND relrowsecurity) AND coalesce(has_function_privilege('anon',to_regprocedure('public.course_topic_visible(uuid,uuid)'),'EXECUTE'),false) AND coalesce(has_function_privilege('authenticated',to_regprocedure('public.course_topic_visible(uuid,uuid)'),'EXECUTE'),false) AND coalesce(has_function_privilege('anon',to_regprocedure('public.course_lesson_visible(uuid)'),'EXECUTE'),false) AND coalesce(has_function_privilege('authenticated',to_regprocedure('public.course_lesson_visible(uuid)'),'EXECUTE'),false) AND coalesce(has_function_privilege('anon',to_regprocedure('public.get_course_outline_entry(uuid,uuid)'),'EXECUTE'),false) AND coalesce(has_function_privilege('authenticated',to_regprocedure('public.get_course_outline_entry(uuid,uuid)'),'EXECUTE'),false)),false) OR NOT coalesce(((-- Only system catalogs; never reads questions, answers or account rows.
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
) AS arena_catalog) = '{"tables":[{"acl":[["postgres","DELETE",false],["postgres","INSERT",false],["postgres","MAINTAIN",false],["postgres","REFERENCES",false],["postgres","SELECT",false],["postgres","TRIGGER",false],["postgres","TRUNCATE",false],["postgres","UPDATE",false],["service_role","DELETE",false],["service_role","INSERT",false],["service_role","MAINTAIN",false],["service_role","REFERENCES",false],["service_role","SELECT",false],["service_role","TRIGGER",false],["service_role","TRUNCATE",false],["service_role","UPDATE",false]],"rls":true,"kind":"r","name":"arena_question_issues","owner":"postgres","columns":[{"acl":null,"name":"id","type":"uuid","default":"gen_random_uuid()","identity":"","not_null":true,"generated":""},{"acl":null,"name":"user_id","type":"uuid","default":null,"identity":"","not_null":true,"generated":""},{"acl":null,"name":"run_id","type":"uuid","default":null,"identity":"","not_null":true,"generated":""},{"acl":null,"name":"question_id","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"acl":null,"name":"option_order","type":"smallint[]","default":null,"identity":"","not_null":true,"generated":""},{"acl":null,"name":"issued_at","type":"timestamp with time zone","default":"clock_timestamp()","identity":"","not_null":true,"generated":""},{"acl":null,"name":"selected_index","type":"smallint","default":null,"identity":"","not_null":false,"generated":""},{"acl":null,"name":"is_correct","type":"boolean","default":null,"identity":"","not_null":false,"generated":""},{"acl":null,"name":"answered_at","type":"timestamp with time zone","default":null,"identity":"","not_null":false,"generated":""}],"indexes":[["CREATE INDEX arena_question_issues_user_question_idx ON public.arena_question_issues USING btree (user_id, question_id, issued_at DESC)",true,true],["CREATE INDEX arena_question_issues_user_time_idx ON public.arena_question_issues USING btree (user_id, issued_at DESC)",true,true],["CREATE UNIQUE INDEX arena_question_issues_pkey ON public.arena_question_issues USING btree (id)",true,true]],"policies":null,"triggers":null,"force_rls":false,"constraints":[["arena_question_issues_option_order_check","CHECK ((cardinality(option_order) = 4))",true,false,false],["arena_question_issues_pkey","PRIMARY KEY (id)",true,false,false],["arena_question_issues_question_id_fkey","FOREIGN KEY (question_id) REFERENCES arena_questions(id) ON DELETE CASCADE",true,false,false],["arena_question_issues_selected_index_check","CHECK (((selected_index >= 0) AND (selected_index <= 3)))",true,false,false],["arena_question_issues_user_id_fkey","FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE",true,false,false]],"persistence":"p"},{"acl":[["postgres","DELETE",false],["postgres","INSERT",false],["postgres","MAINTAIN",false],["postgres","REFERENCES",false],["postgres","SELECT",false],["postgres","TRIGGER",false],["postgres","TRUNCATE",false],["postgres","UPDATE",false],["service_role","DELETE",false],["service_role","INSERT",false],["service_role","MAINTAIN",false],["service_role","REFERENCES",false],["service_role","SELECT",false],["service_role","TRIGGER",false],["service_role","TRUNCATE",false],["service_role","UPDATE",false]],"rls":true,"kind":"r","name":"arena_questions","owner":"postgres","columns":[{"acl":null,"name":"id","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"acl":null,"name":"unit","type":"smallint","default":null,"identity":"","not_null":true,"generated":""},{"acl":null,"name":"tier","type":"smallint","default":null,"identity":"","not_null":true,"generated":""},{"acl":null,"name":"topic","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"acl":null,"name":"stem","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"acl":null,"name":"options","type":"jsonb","default":null,"identity":"","not_null":true,"generated":""},{"acl":null,"name":"explanation","type":"text","default":null,"identity":"","not_null":true,"generated":""},{"acl":null,"name":"graph","type":"jsonb","default":null,"identity":"","not_null":false,"generated":""},{"acl":null,"name":"table_html","type":"text","default":null,"identity":"","not_null":false,"generated":""},{"acl":null,"name":"active","type":"boolean","default":"true","identity":"","not_null":true,"generated":""},{"acl":null,"name":"created_at","type":"timestamp with time zone","default":"now()","identity":"","not_null":true,"generated":""}],"indexes":[["CREATE INDEX arena_questions_unit_tier_idx ON public.arena_questions USING btree (unit, tier) WHERE active",true,true],["CREATE UNIQUE INDEX arena_questions_pkey ON public.arena_questions USING btree (id)",true,true]],"policies":null,"triggers":null,"force_rls":false,"constraints":[["arena_questions_options_check","CHECK (((jsonb_typeof(options) = ''array''::text) AND (jsonb_array_length(options) = 4)))",true,false,false],["arena_questions_pkey","PRIMARY KEY (id)",true,false,false],["arena_questions_tier_check","CHECK (((tier >= 1) AND (tier <= 3)))",true,false,false],["arena_questions_unit_check","CHECK (((unit >= 1) AND (unit <= 10)))",true,false,false]],"persistence":"p"}],"functions":[{"acl":[["authenticated","EXECUTE",false],["postgres","EXECUTE",false],["service_role","EXECUTE",false]],"owner":"postgres","signature":"arena_catalog()","anon_execute":false,"definition_md5":"4096bf02378fbd9b48c95646e2330a90","authenticated_execute":true},{"acl":[["authenticated","EXECUTE",false],["postgres","EXECUTE",false],["service_role","EXECUTE",false]],"owner":"postgres","signature":"arena_next_question(uuid,integer[],integer,integer,boolean)","anon_execute":false,"definition_md5":"6a498e67a01b861596d8e75960797a47","authenticated_execute":true},{"acl":[["authenticated","EXECUTE",false],["postgres","EXECUTE",false],["service_role","EXECUTE",false]],"owner":"postgres","signature":"arena_submit_answer(uuid,integer)","anon_execute":false,"definition_md5":"5fa73f7129d129b26925bcdd4aa58088","authenticated_execute":true}],"client_table_access":[["arena_question_issues","anon",false,false],["arena_question_issues","authenticated",false,false],["arena_questions","anon",false,false],["arena_questions","authenticated",false,false]]}'::jsonb),false) OR NOT (EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261103020000' AND name='admin_user_deletion' AND cardinality(statements)=1 AND md5(statements[1])='d11ccb83ad64a84db35645599c39f9eb')) THEN RAISE EXCEPTION 'Post-install verification failed; entire repair rolls back.'; END IF;
 IF before_counts<>ARRAY[(SELECT count(*) FROM public.arena_questions),(SELECT count(*) FROM public.arena_question_issues)] THEN RAISE EXCEPTION 'Arena row count changed; entire repair rolls back.'; END IF;
 INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES
 ('20261104000100','arena_game',ARRAY[arena_sql]),
 ('20261105010000','course_login_access',ARRAY[course_sql]);
END;
$repair$;
COMMIT;
