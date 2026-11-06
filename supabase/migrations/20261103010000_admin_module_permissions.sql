-- Forward-only module authorization. Existing admin means Full Admin.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid,_role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.role()='authenticated' AND _role::text <> 'instructor' AND EXISTS(
 SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND
 (role=_role OR (_role='admin' AND role='super_admin')))
$$;

CREATE FUNCTION public.has_admin_module(_module text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.role()='authenticated' AND _module IN ('courses','questions','playground','team','users')
 AND EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND
 (role='super_admin' OR (role='admin' AND _module<>'users')
 OR (role='course_admin' AND _module IN ('courses','playground'))
 OR (role='question_admin' AND _module IN ('questions','playground'))))
$$;
REVOKE ALL ON FUNCTION public.has_admin_module(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_admin_module(text) TO anon,authenticated,service_role;

CREATE FUNCTION public.get_admin_access() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('courses',public.has_admin_module('courses'),'questions',public.has_admin_module('questions'),
 'playground',public.has_admin_module('playground'),'team',public.has_admin_module('team'),'users',public.has_admin_module('users'))
$$;
REVOKE ALL ON FUNCTION public.get_admin_access() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_access() TO authenticated;

-- Never revive an Instructor permission, including old owner-based policies.
INSERT INTO public.user_roles(user_id,role)
 SELECT DISTINCT r.user_id,'student'::public.app_role FROM public.user_roles r
 WHERE r.role='instructor' AND NOT EXISTS(SELECT 1 FROM public.user_roles x WHERE x.user_id=r.user_id AND x.role<>'instructor')
 ON CONFLICT(user_id,role) DO NOTHING;
DELETE FROM public.user_roles WHERE role='instructor';
UPDATE public.profiles SET role='student' WHERE role='instructor';
CREATE FUNCTION public.reject_retired_account_role() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.role='instructor' THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Instructor accounts are retired.'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER reject_retired_account_role BEFORE INSERT OR UPDATE ON public.user_roles
 FOR EACH ROW EXECUTE FUNCTION public.reject_retired_account_role();

-- Only this RPC may change managed roles; replace atomically, serialized on the account.
CREATE FUNCTION public.set_account_role(_user_id uuid,_role public.app_role) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.has_admin_module('users') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Super Admin access is required.'; END IF;
 IF _role IS NULL OR _role NOT IN ('student','admin','course_admin','question_admin') THEN RAISE EXCEPTION 'Unsupported account type.'; END IF;
 PERFORM 1 FROM auth.users WHERE id=_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Account not found.'; END IF;
 IF _user_id=auth.uid() OR public.is_super_admin(_user_id) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Super Admin accounts are protected.'; END IF;
 DELETE FROM public.user_roles WHERE user_id=_user_id;
 INSERT INTO public.user_roles(user_id,role) VALUES(_user_id,_role);
END $$;
REVOKE ALL ON FUNCTION public.set_account_role(uuid,public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_account_role(uuid,public.app_role) TO authenticated;
DROP POLICY IF EXISTS "Super admins can grant content admin" ON public.user_roles;
DROP POLICY IF EXISTS "Super admins can revoke content admin" ON public.user_roles;

-- Rewrite only known module tables. Preserve existing visibility and content validation.
DO $module_policies$
DECLARE t record; p record; expression text; check_expression text; command text;
BEGIN
 FOR t IN SELECT * FROM (VALUES
('courses','courses'),
('course_videos','courses'),
('subjects','courses'),
('chapters','courses'),
('sub_chapters','courses'),
('video_lessons','courses'),
('ai_summaries','courses'),
('roadmaps','courses'),
('course_topic_content','courses'),
('course_topic_videos','courses'),
('course_lessons','courses'),
('course_lesson_videos','courses'),
('course_lesson_courses','courses'),
('course_outline_entries','courses'),
('course_outline_topics','courses'),
('course_outline_revisions','courses'),
('course_curriculum_units','courses'),
('curriculum_frameworks','courses'),
('curriculum_units','courses'),
('curriculum_topics','courses'),
('curriculum_practices','courses'),
('curriculum_practice_skills','courses'),
('questions','questions'),
('question_versions','questions'),
('question_options','questions'),
('question_topics','questions'),
('question_course_videos','questions'),
('question_practice_skills','questions'),
('option_misconceptions','questions'),
('misconceptions','questions'),
('question_version_reviews','questions'),
('question_publication_events','questions'),
('practice_problems','questions'),
('playground_links','playground'),
('team_members','team')
 ) AS modules(table_name,module_name) LOOP
  IF to_regclass('public.'||t.table_name) IS NULL THEN CONTINUE; END IF;
  FOR p IN SELECT * FROM pg_policies WHERE schemaname='public' AND tablename=t.table_name LOOP
   expression:=regexp_replace(p.qual,'(public\.)?has_role\((auth\.)?uid\(\), ''admin''::(public\.)?app_role\)',format('public.has_admin_module(%L)',t.module_name),'g');
   check_expression:=regexp_replace(p.with_check,'(public\.)?has_role\((auth\.)?uid\(\), ''admin''::(public\.)?app_role\)',format('public.has_admin_module(%L)',t.module_name),'g');
   IF expression IS DISTINCT FROM p.qual OR check_expression IS DISTINCT FROM p.with_check THEN
    EXECUTE format('ALTER POLICY %I ON public.%I %s %s',p.policyname,t.table_name,
      CASE WHEN expression IS NULL THEN '' ELSE 'USING ('||expression||')' END,
      CASE WHEN check_expression IS NULL THEN '' ELSE 'WITH CHECK ('||check_expression||')' END);
   END IF;
  END LOOP;
  -- Restrictive policies close legacy owner/public write paths as well as admin paths.
  FOREACH command IN ARRAY ARRAY['INSERT','UPDATE','DELETE'] LOOP
   EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR %s TO authenticated %s %s',
    'module_guard_'||lower(command),t.table_name,command,
    CASE WHEN command='INSERT' THEN '' ELSE format('USING (public.has_admin_module(%L))',t.module_name) END,
    CASE WHEN command='DELETE' THEN '' ELSE format('WITH CHECK (public.has_admin_module(%L))',t.module_name) END);
  END LOOP;
 END LOOP;
END $module_policies$;

-- Patch the installed function bodies, not historical source snapshots. No business logic changes.
DO $module_functions$
DECLARE f record; definition text;
BEGIN
 FOR f IN SELECT p.oid,m.module_name FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 JOIN (VALUES
('get_course_outline','courses'),
('get_course_topic','courses'),
('get_course_topic_before_outline','courses'),
('save_course_lesson_before_outline','courses'),
('save_course_topic','courses'),
('course_lesson_visible','courses'),
('list_saved_course_lessons','courses'),
('save_course_lesson','courses'),
('share_course_lesson','courses'),
('restore_course_lesson','courses'),
('initialize_course_outline','courses'),
('get_course_outline_v2','courses'),
('get_course_outline_entry','courses'),
('save_course_outline_content','courses'),
('resolve_course_entry','courses'),
('edit_course_outline','courses'),
('link_course_outline_content','courses'),
('list_course_outline_archive','courses'),
('create_managed_course','courses'),
('list_course_video_library','courses'),
('save_course_video_metadata','courses'),
('assert_question_bank_admin','questions'),
('question_bank_require_admin','questions'),
('get_question_practice_admin_statistics','questions')
 ) m(function_name,module_name) ON m.function_name=p.proname
 WHERE n.nspname='public' LOOP
  definition:=pg_get_functiondef(f.oid);
  definition:=regexp_replace(definition,'public\.has_role\((auth.uid\(\)|uid),\s*''admin''(::public.app_role)?\)',format('public.has_admin_module(%L)',f.module_name),'g');
  EXECUTE definition;
 END LOOP;
END $module_functions$;

CREATE FUNCTION public.has_admin_storage_access(_bucket text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT CASE WHEN _bucket IN ('course-videos','course-images','course-games','roadmap-videos') THEN public.has_admin_module('courses')
 WHEN _bucket IN ('practice-images','question-images','solution-images') THEN public.has_admin_module('questions')
 WHEN _bucket='team-photos' THEN public.has_admin_module('team')
 ELSE public.has_role(auth.uid(),'admin') END
$$;
REVOKE ALL ON FUNCTION public.has_admin_storage_access(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_admin_storage_access(text) TO anon,authenticated,service_role;
DO $storage_policies$
DECLARE p record; expression text; check_expression text; command text;
BEGIN
 FOR p IN SELECT * FROM pg_policies WHERE schemaname='storage' AND tablename='objects' LOOP
  expression:=regexp_replace(p.qual,'(public\.)?has_role\((auth\.)?uid\(\), ''admin''::(public\.)?app_role\)','public.has_admin_storage_access(bucket_id)','g');
  check_expression:=regexp_replace(p.with_check,'(public\.)?has_role\((auth\.)?uid\(\), ''admin''::(public\.)?app_role\)','public.has_admin_storage_access(bucket_id)','g');
  IF expression IS DISTINCT FROM p.qual OR check_expression IS DISTINCT FROM p.with_check THEN
   EXECUTE format('ALTER POLICY %I ON storage.objects %s %s',p.policyname,
    CASE WHEN expression IS NULL THEN '' ELSE 'USING ('||expression||')' END,
    CASE WHEN check_expression IS NULL THEN '' ELSE 'WITH CHECK ('||check_expression||')' END);
  END IF;
 END LOOP;
 FOREACH command IN ARRAY ARRAY['INSERT','UPDATE','DELETE'] LOOP
  expression:='bucket_id NOT IN (''course-videos'',''course-images'',''course-games'',''roadmap-videos'',''practice-images'',''question-images'',''team-photos'') OR public.has_admin_storage_access(bucket_id)';
  EXECUTE format('CREATE POLICY %I ON storage.objects AS RESTRICTIVE FOR %s TO authenticated %s %s',
   'admin_module_'||lower(command),command,
   CASE WHEN command='INSERT' THEN '' ELSE 'USING ('||expression||')' END,
   CASE WHEN command='DELETE' THEN '' ELSE 'WITH CHECK ('||expression||')' END);
 END LOOP;
END $storage_policies$;
-- Existing image-owner policies need a positive grant for all content managers.
CREATE POLICY module_course_image_insert ON storage.objects FOR INSERT TO authenticated
 WITH CHECK(bucket_id='course-images' AND public.has_admin_module('courses'));
CREATE POLICY module_course_image_update ON storage.objects FOR UPDATE TO authenticated
 USING(bucket_id='course-images' AND public.has_admin_module('courses')) WITH CHECK(bucket_id='course-images' AND public.has_admin_module('courses'));
CREATE POLICY module_course_image_delete ON storage.objects FOR DELETE TO authenticated
 USING(bucket_id='course-images' AND public.has_admin_module('courses'));

-- Retired Instructor ownership must not expose draft courses.
DROP POLICY IF EXISTS "Published courses are publicly readable" ON public.courses;
DROP POLICY IF EXISTS "Anyone can view published courses" ON public.courses;
DROP POLICY IF EXISTS "Anyone can view courses" ON public.courses;
DROP POLICY IF EXISTS "Published courses or course managers can view courses" ON public.courses;
CREATE POLICY "Published courses or course managers can view courses" ON public.courses FOR SELECT TO anon,authenticated
 USING(is_published OR public.has_admin_module('courses'));
COMMENT ON TABLE public.user_roles IS 'Account permissions: admin=Full Admin; course_admin; question_admin; student. Instructor retired. Super Admin protected.';

CREATE POLICY module_course_read_guard ON public.courses AS RESTRICTIVE FOR SELECT TO anon,authenticated
 USING(is_published OR public.has_admin_module('courses'));

-- Playground's legacy policies queried user_roles directly instead of has_role.
DROP POLICY "Admins can insert playground links" ON public.playground_links;
DROP POLICY "Admins can update playground links" ON public.playground_links;
DROP POLICY "Admins can delete playground links" ON public.playground_links;
CREATE POLICY playground_admin_insert ON public.playground_links FOR INSERT TO authenticated WITH CHECK(public.has_admin_module('playground'));
CREATE POLICY playground_admin_update ON public.playground_links FOR UPDATE TO authenticated USING(public.has_admin_module('playground')) WITH CHECK(public.has_admin_module('playground'));
CREATE POLICY playground_admin_delete ON public.playground_links FOR DELETE TO authenticated USING(public.has_admin_module('playground'));
NOTIFY pgrst,'reload schema';
