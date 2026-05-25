
-- 1. Profiles: remove broad public read
DROP POLICY IF EXISTS "Enable read access for all users" ON public.profiles;

-- Recreate / refresh public_profiles view to include is_zombie (no emails)
DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles
WITH (security_invoker = true)
AS
SELECT id, user_id, full_name, avatar_url, role, is_zombie, created_at, updated_at
FROM public.profiles;

GRANT SELECT ON public.public_profiles TO anon, authenticated;

-- Add an RLS policy so the view (which runs as invoker) can read the underlying
-- non-sensitive columns for everyone. We still rely on the existing
-- "Users can view their own profile" + "Super admins can view all profiles"
-- policies for direct table access. To allow the view to function for everyone
-- without exposing email through direct table reads, we keep the view as a
-- security_definer-style by switching it back:
DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles AS
SELECT id, user_id, full_name, avatar_url, role, is_zombie, created_at, updated_at
FROM public.profiles;
GRANT SELECT ON public.public_profiles TO anon, authenticated;

-- 2. Solution images: drop the over-broad instructor access
DROP POLICY IF EXISTS "Admins and instructors can view all solution images" ON storage.objects;

CREATE POLICY "Admins can view all solution images"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'solution-images'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

-- 3. Avatars: add update / delete scoped to owner folder
CREATE POLICY "Users can update their own avatar"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'avatars'
  AND (auth.uid())::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'avatars'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own avatar"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'avatars'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

-- 4. Roadmap videos: replace profiles.role checks with has_role()
DROP POLICY IF EXISTS "Admins can upload roadmap videos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update roadmap videos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete roadmap videos" ON storage.objects;

CREATE POLICY "Admins can upload roadmap videos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'roadmap-videos'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Admins can update roadmap videos"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'roadmap-videos'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Admins can delete roadmap videos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'roadmap-videos'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);
