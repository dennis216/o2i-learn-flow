-- 1. Storage RLS hardening for course-images
DROP POLICY IF EXISTS "Course image owners can update course images" ON storage.objects;
DROP POLICY IF EXISTS "Course image owners can delete course images" ON storage.objects;
DROP POLICY IF EXISTS "Public can list course images" ON storage.objects;

CREATE POLICY "Course image owners can update course images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'course-images'
  AND (
    auth.uid()::text = owner
    OR auth.uid()::text = metadata->>'user_id'
    OR auth.uid()::text = metadata->>'creator'
  )
)
WITH CHECK (
  bucket_id = 'course-images'
  AND (
    auth.uid()::text = owner
    OR auth.uid()::text = metadata->>'user_id'
    OR auth.uid()::text = metadata->>'creator'
  )
);

CREATE POLICY "Course image owners can delete course images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'course-images'
  AND (
    auth.uid()::text = owner
    OR auth.uid()::text = metadata->>'user_id'
    OR auth.uid()::text = metadata->>'creator'
  )
);

CREATE POLICY "Public can view course images"
ON storage.objects FOR SELECT
USING (bucket_id = 'course-images');

CREATE POLICY "Public cannot list course images"
ON storage.objects FOR LIST
USING (false);

-- 2. Extension isolation
CREATE SCHEMA IF NOT EXISTS extensions;

ALTER EXTENSION IF EXISTS "uuid-ossp" SET SCHEMA extensions;
ALTER EXTENSION IF EXISTS "pgcrypto" SET SCHEMA extensions;

ALTER DATABASE CURRENT SET search_path = public, extensions;

-- 3. SECURITY DEFINER hardening
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF auth.role() != 'authenticated' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF auth.role() != 'authenticated' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'super_admin'::app_role
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_assign_admin_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF auth.role() != 'authenticated' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NEW.email = 'jessiejin26@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', 'Anonymous User'),
    NEW.email
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.count_real_users()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  SELECT COUNT(*)::INTEGER
  FROM public.profiles
  WHERE is_zombie = FALSE
    AND user_id IS NOT NULL;
$$;
