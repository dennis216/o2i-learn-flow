-- Fix security vulnerability: Restrict profile access to protect email addresses
-- Drop the current overly permissive policy
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

-- Create a new policy that allows users to view their own profile completely
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;

CREATE POLICY "Users can view their own profile" 
ON public.profiles 
FOR SELECT 
USING (auth.uid() = user_id);

-- Create a view for public profile data that excludes sensitive information like email
CREATE OR REPLACE VIEW public.public_profiles AS
SELECT 
  id,
  user_id,
  full_name,
  avatar_url,
  role,
  created_at,
  updated_at
FROM public.profiles;

-- Grant access to the public view for authenticated users and anon users
GRANT SELECT ON public.public_profiles TO authenticated, anon;
