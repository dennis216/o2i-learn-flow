-- Add is_zombie column to profiles table to distinguish real users from generated ones
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_zombie BOOLEAN DEFAULT FALSE;

-- Set all existing profiles as real users (not zombies)
UPDATE public.profiles SET is_zombie = FALSE WHERE is_zombie IS NULL;

-- Add NOT NULL constraint after setting defaults
ALTER TABLE public.profiles 
ALTER COLUMN is_zombie SET NOT NULL;

-- Create an index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_profiles_is_zombie ON public.profiles(is_zombie);

-- Create a function to count real (non-zombie) users
CREATE OR REPLACE FUNCTION public.count_real_users()
RETURNS INTEGER
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER FROM public.profiles WHERE is_zombie = FALSE;
$$;