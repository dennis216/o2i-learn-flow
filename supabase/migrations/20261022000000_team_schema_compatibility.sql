-- Additive repair: supports legacy, dual-column and already migrated array schemas.
-- Existing scalar fields and all memberships are retained. RLS/grants are unchanged.
CREATE FUNCTION public.team_roles_from_legacy(value text) RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
  SELECT coalesce(array_agg(role ORDER BY position),'{}'::text[]) FROM (
    SELECT CASE btrim(token) WHEN 'Leader' THEN 'Team Leader' ELSE btrim(token) END AS role,min(position) AS position
    FROM regexp_split_to_table(coalesce(value,''),'\s*&\s*') WITH ORDINALITY AS parts(token,position)
    WHERE btrim(token)<>'' GROUP BY 1
  ) roles;
$$;
CREATE FUNCTION public.team_department_from_legacy(value text) RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
  SELECT CASE WHEN value IS NULL OR btrim(value)='' THEN '{}'::text[] ELSE ARRAY[
    CASE value WHEN 'Publicity' THEN 'Publicity & Marketing'
      WHEN 'Curriculum Content & Production' THEN 'Curriculum Content & Media Production' ELSE value END
  ] END;
$$;
DO $$
DECLARE had_role boolean; had_department boolean;
BEGIN
  LOCK TABLE public.team_members IN ACCESS EXCLUSIVE MODE;
  SELECT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.team_members'::regclass AND attname='role' AND NOT attisdropped),
    EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.team_members'::regclass AND attname='department' AND NOT attisdropped)
    INTO had_role,had_department;
  ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS role text,
    ADD COLUMN IF NOT EXISTS department text,
    ADD COLUMN IF NOT EXISTS roles text[], ADD COLUMN IF NOT EXISTS departments text[];
  -- Unknown and empty values are evidence, not a reason to reject or erase a member.
  ALTER TABLE public.team_members DROP CONSTRAINT IF EXISTS team_members_roles_controlled,
    DROP CONSTRAINT IF EXISTS team_members_roles_not_empty,
    DROP CONSTRAINT IF EXISTS team_members_departments_controlled,
    DROP CONSTRAINT IF EXISTS team_members_departments_not_empty;
  UPDATE public.team_members SET roles=coalesce(roles,public.team_roles_from_legacy(role)),
    departments=coalesce(departments,public.team_department_from_legacy(department));
  IF NOT had_role THEN UPDATE public.team_members SET role=array_to_string(roles,' & '); END IF;
  IF NOT had_department THEN UPDATE public.team_members SET department=array_to_string(departments,' | '); END IF;
  -- NULL defaults let the trigger distinguish omitted arrays from explicitly empty arrays.
  ALTER TABLE public.team_members ALTER COLUMN roles SET NOT NULL, ALTER COLUMN roles SET DEFAULT NULL,
    ALTER COLUMN departments SET NOT NULL, ALTER COLUMN departments SET DEFAULT NULL;
END;
$$;
CREATE FUNCTION public.sync_team_member_shapes() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.roles IS NULL THEN NEW.roles:=public.team_roles_from_legacy(NEW.role);
    ELSE NEW.role:=array_to_string(NEW.roles,' & '); END IF;
    IF NEW.departments IS NULL THEN NEW.departments:=public.team_department_from_legacy(NEW.department);
    ELSE NEW.department:=array_to_string(NEW.departments,' | '); END IF;
  ELSE
    IF NEW.roles IS DISTINCT FROM OLD.roles THEN
      NEW.roles:=coalesce(NEW.roles,public.team_roles_from_legacy(NEW.role));
      NEW.role:=array_to_string(NEW.roles,' & ');
    ELSIF NEW.role IS DISTINCT FROM OLD.role THEN NEW.roles:=public.team_roles_from_legacy(NEW.role); END IF;
    IF NEW.departments IS DISTINCT FROM OLD.departments THEN
      NEW.departments:=coalesce(NEW.departments,public.team_department_from_legacy(NEW.department));
      NEW.department:=array_to_string(NEW.departments,' | ');
    ELSIF NEW.department IS DISTINCT FROM OLD.department THEN NEW.departments:=public.team_department_from_legacy(NEW.department); END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER sync_team_member_shapes BEFORE INSERT OR UPDATE ON public.team_members
FOR EACH ROW EXECUTE FUNCTION public.sync_team_member_shapes();
REVOKE ALL ON FUNCTION public.team_roles_from_legacy(text),public.team_department_from_legacy(text),public.sync_team_member_shapes() FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
