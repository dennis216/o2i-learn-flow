-- Add admin role for Dennis Wang
INSERT INTO public.user_roles (user_id, role)
VALUES ('a074f47b-042c-4362-b8fc-b4ca6b8c1a29', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;