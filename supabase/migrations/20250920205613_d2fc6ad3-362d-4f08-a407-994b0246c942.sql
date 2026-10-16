-- Fix security vulnerability: Restrict profile access to protect email addresses
-- Drop the current overly permissive policy
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

-- Create a new policy that allows users to view their own profile completely
CREATE POLICY "Users can view their own profile" 
ON public.profiles 
FOR SELECT 
USING (auth.uid() = user_id);

-- Since we can't have column-level RLS in a single policy, we'll need to create a view
-- for public profile data that excludes sensitive information
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

-- Enable RLS on the view (even though it inherits from the table)
ALTER VIEW public.public_profiles SET (security_barrier = true);

-- Grant access to the public view
GRANT SELECT ON public.public_profiles TO authenticated, anon;
