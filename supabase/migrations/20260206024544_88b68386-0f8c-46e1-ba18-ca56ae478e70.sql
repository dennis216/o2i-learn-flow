-- CRITICAL SECURITY FIX: Remove email exposure to authenticated users
-- The current policy exposes ALL profile fields (including email) to any authenticated user
DROP POLICY IF EXISTS "Authenticated users can view public profile data for display" ON public.profiles;

-- No replacement policy needed. Remaining policies handle all legitimate cases:
-- 1. "Users can view their own profile" - users see their own complete profile
-- 2. "Super admins can view all profiles" - super admins have full access
-- 3. Public display uses public_profiles view (excludes email) for forum/community features