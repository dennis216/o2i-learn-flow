-- Minimal stand-in for the production objects that 20261111000000_solution_request_threads.sql builds on:
-- Auth / Storage stubs, account roles, the module permission functions as deployed on 2026-11-03,
-- and solution_requests with the policies the old frontend relies on. Local disposable databases only.
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY, email text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
 $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
 $$ SELECT nullif(current_setting('request.jwt.claim.role', true), '') $$;

CREATE SCHEMA storage;
CREATE TABLE storage.buckets(id text PRIMARY KEY, name text, public boolean);
CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text REFERENCES storage.buckets(id),
 name text NOT NULL, owner uuid, owner_id text, metadata jsonb, UNIQUE(bucket_id, name));
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS
 $$ SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
INSERT INTO storage.buckets VALUES ('solution-images', 'solution-images', false);

GRANT USAGE ON SCHEMA public, auth, storage TO anon, authenticated, service_role;
GRANT ALL ON storage.objects TO anon, authenticated, service_role;
-- Mirror Supabase: new public tables and functions are granted to these roles.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

CREATE TYPE public.app_role AS ENUM ('admin', 'instructor', 'student', 'super_admin', 'course_admin', 'question_admin');
CREATE TYPE public.problem_type AS ENUM ('geometry', 'algebra', 'calculus', 'number_theory', 'combinatorics', 'pre_calculus', 'statistics', 'other');
CREATE TABLE public.profiles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid UNIQUE NOT NULL REFERENCES auth.users(id),
 full_name text, role text DEFAULT 'student');
CREATE TABLE public.user_roles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id),
 role public.app_role NOT NULL, UNIQUE(user_id, role));

CREATE FUNCTION public.has_role(_user_id uuid,_role public.app_role)
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
CREATE FUNCTION public.get_admin_access() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('courses',public.has_admin_module('courses'),'questions',public.has_admin_module('questions'),
 'playground',public.has_admin_module('playground'),'team',public.has_admin_module('team'),'users',public.has_admin_module('users'))
$$;
CREATE FUNCTION public.has_admin_storage_access(_bucket text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT CASE WHEN _bucket IN ('course-videos','course-images','course-games','roadmap-videos') THEN public.has_admin_module('courses')
 WHEN _bucket IN ('practice-images','question-images','solution-images') THEN public.has_admin_module('questions')
 WHEN _bucket='team-photos' THEN public.has_admin_module('team')
 ELSE public.has_role(auth.uid(),'admin') END
$$;

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TABLE public.solution_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  solution_text TEXT,
  solution_image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  problem_type public.problem_type DEFAULT 'other',
  is_public boolean DEFAULT false
);
ALTER TABLE public.solution_requests ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_solution_requests_updated_at BEFORE UPDATE ON public.solution_requests
 FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE POLICY "Users can create solution requests" ON public.solution_requests FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view public requests or their own" ON public.solution_requests FOR SELECT USING (is_public = true OR auth.uid() = user_id);
CREATE POLICY "Users can update their own requests" ON public.solution_requests FOR UPDATE USING (
  auth.uid() = user_id OR public.has_role(auth.uid(), 'instructor') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can upload solution images" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'solution-images' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can view own or public solution images" ON storage.objects FOR SELECT USING (
  bucket_id = 'solution-images' AND (auth.uid()::text = (storage.foldername(name))[1]
  OR EXISTS (SELECT 1 FROM public.solution_requests WHERE image_url LIKE '%' || storage.objects.name AND is_public = true)));
CREATE POLICY "Admins can view all solution images" ON storage.objects FOR SELECT USING (
  bucket_id = 'solution-images' AND public.has_admin_storage_access(bucket_id));
