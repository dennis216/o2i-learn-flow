-- CRITICAL SECURITY FIX: Remove public access to sensitive profile data
-- This prevents unauthorized access to user emails and personal information

-- Drop the dangerous public SELECT policy that exposes all user data
DROP POLICY IF EXISTS "Public can view basic profile info through view" ON public.profiles;

-- The remaining policies already properly restrict access:
-- - Users can only view their own profile data
-- - Users can only update their own profile data  
-- - Users can only insert their own profile data

-- Note: If public profile information is needed (like display names for forum posts),
-- use the existing public_profiles view which should only expose non-sensitive data