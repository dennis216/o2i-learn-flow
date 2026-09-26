-- Content administration is role-based. No email address is trusted in source code.
-- A super_admin can manage content and grant/revoke the admin role.
-- An admin can manage content, but cannot change roles or database structure.

DROP TRIGGER IF EXISTS on_auth_user_created_assign_role ON auth.users;
DROP FUNCTION IF EXISTS public.auto_assign_admin_role();

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF auth.role() != 'authenticated' THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND (
        role = _role
        OR (_role = 'admin'::public.app_role AND role = 'super_admin'::public.app_role)
      )
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
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'super_admin'::public.app_role
  );
END;
$$;

-- Remove legacy policies that allowed ordinary admins to edit account roles.
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
DROP POLICY IF EXISTS "Super admins can view all user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Super admins can insert user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Super admins can delete user roles" ON public.user_roles;

CREATE POLICY "Super admins can view all user roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can grant content admin"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_super_admin(auth.uid())
  AND role = 'admin'::public.app_role
);

CREATE POLICY "Super admins can revoke content admin"
ON public.user_roles
FOR DELETE
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  AND role = 'admin'::public.app_role
  AND user_id <> auth.uid()
);

COMMENT ON TABLE public.user_roles IS
  'Role assignments. super_admin is bootstrapped outside the browser; admins manage content only.';

-- The product has exactly one owner account.
CREATE UNIQUE INDEX IF NOT EXISTS user_roles_single_super_admin
ON public.user_roles (role)
WHERE role = 'super_admin'::public.app_role;

CREATE TABLE IF NOT EXISTS public.user_login_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  signed_in_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_login_events_user_time
ON public.user_login_events (user_id, signed_in_at DESC);

ALTER TABLE public.user_login_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can record their own sign in"
ON public.user_login_events
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Super admins can view login activity"
ON public.user_login_events
FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));

COMMENT ON TABLE public.user_login_events IS
  'Minimal account activity log used by the owner dashboard. No IP address or browser fingerprint is stored.';
