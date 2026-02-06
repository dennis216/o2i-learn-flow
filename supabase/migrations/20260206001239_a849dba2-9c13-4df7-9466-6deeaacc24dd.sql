-- Make user_id nullable to allow zombie users without auth.users entries
ALTER TABLE public.profiles ALTER COLUMN user_id DROP NOT NULL;

-- Update the count_real_users function to handle null user_ids
CREATE OR REPLACE FUNCTION public.count_real_users()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT COUNT(*)::INTEGER FROM public.profiles WHERE is_zombie = FALSE AND user_id IS NOT NULL;
$$;