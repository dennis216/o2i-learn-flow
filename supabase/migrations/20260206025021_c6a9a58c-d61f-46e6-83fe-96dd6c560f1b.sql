-- Create admin_emails table for dynamic admin assignment (replacing hard-coded emails)
CREATE TABLE IF NOT EXISTS public.admin_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  role app_role NOT NULL DEFAULT 'admin',
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.admin_emails ENABLE ROW LEVEL SECURITY;

-- Only super_admin can manage this table
CREATE POLICY "Super admins can view admin emails"
ON public.admin_emails FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can insert admin emails"
ON public.admin_emails FOR INSERT
TO authenticated
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can delete admin emails"
ON public.admin_emails FOR DELETE
TO authenticated
USING (public.is_super_admin(auth.uid()));

-- Seed the existing admin email into the table (migrate from hard-coded value)
INSERT INTO public.admin_emails (email, role) 
VALUES ('jessiejin26@gmail.com', 'admin')
ON CONFLICT (email) DO NOTHING;

-- Update the auto_assign_admin_role function to use the table instead of hard-coded email
CREATE OR REPLACE FUNCTION public.auto_assign_admin_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  admin_record RECORD;
BEGIN
  -- Check if the new user's email exists in the admin_emails table
  SELECT role INTO admin_record
  FROM public.admin_emails
  WHERE email = NEW.email;
  
  IF FOUND THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, admin_record.role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$function$;