
-- Add department column to team_members
ALTER TABLE public.team_members ADD COLUMN department text NOT NULL DEFAULT 'Publicity';

-- Clear existing team members (fresh start with correct data)
DELETE FROM public.team_members;

-- Insert all team members with departments
INSERT INTO public.team_members (name, role, bio, department, order_index) VALUES
  ('Victor Chen', 'Co-founder & Leader', NULL, 'Publicity', 1),
  ('Fiona Wang', 'Team Member', NULL, 'Publicity', 2),
  ('Dereck', 'Team Member', NULL, 'Publicity', 3),
  ('Dennis Wang', 'Co-founder & Leader', NULL, 'Web Development & Management', 4),
  ('Jessin Jin', 'Team Member', NULL, 'Web Development & Management', 5),
  ('Aadyabir Singh', 'Co-founder & Leader', NULL, 'Curriculum Content & Production', 6),
  ('Charles Wang', 'Team Member', NULL, 'Curriculum Content & Production', 7),
  ('Peter Zhang', 'Team Member', NULL, 'Curriculum Content & Production', 8),
  ('Ivan Hou', 'Team Member', NULL, 'Curriculum Content & Production', 9),
  ('Brandon Chen', 'Team Member', NULL, 'Curriculum Content & Production', 10);
