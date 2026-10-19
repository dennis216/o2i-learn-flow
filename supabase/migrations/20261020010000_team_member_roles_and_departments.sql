-- Support multiple controlled roles and department/group memberships per team member.
ALTER TABLE public.team_members
  ADD COLUMN roles text[],
  ADD COLUMN departments text[];

UPDATE public.team_members
SET roles = CASE role
  WHEN 'Founder' THEN ARRAY['Founder']
  WHEN 'Co-founder' THEN ARRAY['Co-founder']
  WHEN 'Team Leader' THEN ARRAY['Team Leader']
  WHEN 'Team Member' THEN ARRAY['Team Member']
  WHEN 'Website Developer' THEN ARRAY['Website Developer']
  WHEN 'Co-founder & Leader' THEN ARRAY['Co-founder', 'Team Leader']
  WHEN 'Co-founder & Team Leader' THEN ARRAY['Co-founder', 'Team Leader']
  WHEN 'Founder & Team Leader' THEN ARRAY['Founder', 'Team Leader']
  ELSE ARRAY[role]
END,
departments = ARRAY[
  CASE department
    WHEN 'Publicity' THEN 'Publicity & Marketing'
    WHEN 'Curriculum Content & Production' THEN 'Curriculum Content & Media Production'
    ELSE department
  END
];

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.team_members member,
      unnest(member.roles) value
    WHERE value <> ALL (ARRAY['Founder', 'Co-founder', 'Team Leader', 'Team Member', 'Website Developer'])
  ) THEN
    RAISE EXCEPTION 'Team migration blocked: review unsupported existing role values before converting to controlled roles.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.team_members member,
      unnest(member.departments) value
    WHERE value <> ALL (ARRAY[
      'Publicity & Marketing',
      'Web Development & Management',
      'Curriculum Content & Media Production',
      'Math Group',
      'Chemistry Group',
      'Physics Group',
      'Biology Group'
    ])
  ) THEN
    RAISE EXCEPTION 'Team migration blocked: review unsupported existing department values before converting to controlled memberships.';
  END IF;
END;
$$;

ALTER TABLE public.team_members
  ALTER COLUMN roles SET NOT NULL,
  ALTER COLUMN roles SET DEFAULT ARRAY['Team Member']::text[],
  ALTER COLUMN departments SET NOT NULL,
  ALTER COLUMN departments SET DEFAULT ARRAY['Publicity & Marketing']::text[],
  ADD CONSTRAINT team_members_roles_not_empty CHECK (cardinality(roles) > 0),
  ADD CONSTRAINT team_members_roles_controlled CHECK (
    roles <@ ARRAY['Founder', 'Co-founder', 'Team Leader', 'Team Member', 'Website Developer']::text[]
  ),
  ADD CONSTRAINT team_members_departments_not_empty CHECK (cardinality(departments) > 0),
  ADD CONSTRAINT team_members_departments_controlled CHECK (
    departments <@ ARRAY[
      'Publicity & Marketing',
      'Web Development & Management',
      'Curriculum Content & Media Production',
      'Math Group',
      'Chemistry Group',
      'Physics Group',
      'Biology Group'
    ]::text[]
  );

ALTER TABLE public.team_members
  DROP COLUMN role,
  DROP COLUMN department;
