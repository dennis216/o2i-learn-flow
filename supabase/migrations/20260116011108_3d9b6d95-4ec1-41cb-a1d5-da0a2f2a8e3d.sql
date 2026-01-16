-- Create a function to check if user is super_admin
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'super_admin'::app_role
  )
$$;

-- Assign super_admin role to ziquanwang52@gmail.com
DO $$
DECLARE
  target_user_id uuid;
BEGIN
  SELECT user_id INTO target_user_id 
  FROM public.profiles 
  WHERE email = 'ziquanwang52@gmail.com'
  LIMIT 1;
  
  IF target_user_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (target_user_id, 'super_admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
END $$;

-- RLS policy for user_roles - allow super_admins to view all roles
DROP POLICY IF EXISTS "Super admins can view all user roles" ON public.user_roles;
CREATE POLICY "Super admins can view all user roles" 
ON public.user_roles 
FOR SELECT 
USING (public.is_super_admin(auth.uid()));

-- RLS policy for user_roles - allow super_admins to manage user roles (INSERT/UPDATE/DELETE)
DROP POLICY IF EXISTS "Super admins can insert user roles" ON public.user_roles;
CREATE POLICY "Super admins can insert user roles" 
ON public.user_roles 
FOR INSERT 
WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Super admins can delete user roles" ON public.user_roles;
CREATE POLICY "Super admins can delete user roles" 
ON public.user_roles 
FOR DELETE 
USING (public.is_super_admin(auth.uid()));