-- Commit enum additions before the permission migration uses them.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'course_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'question_admin';
