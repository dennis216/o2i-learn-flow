-- Create app_role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'instructor', 'student');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
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
      AND role = _role
  )
$$;

-- User_roles policies - users can view their own roles, admins can view all
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
ON public.user_roles
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert roles"
ON public.user_roles
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update roles"
ON public.user_roles
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete roles"
ON public.user_roles
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

-- Update ai_summaries policies
DROP POLICY IF EXISTS "Admins can create ai_summaries" ON public.ai_summaries;
DROP POLICY IF EXISTS "Admins can delete ai_summaries" ON public.ai_summaries;
DROP POLICY IF EXISTS "Admins can update ai_summaries" ON public.ai_summaries;

CREATE POLICY "Admins can create ai_summaries"
ON public.ai_summaries
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete ai_summaries"
ON public.ai_summaries
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update ai_summaries"
ON public.ai_summaries
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

-- Update chapters policies
DROP POLICY IF EXISTS "Admins can create chapters" ON public.chapters;
DROP POLICY IF EXISTS "Admins can delete chapters" ON public.chapters;
DROP POLICY IF EXISTS "Admins can update chapters" ON public.chapters;

CREATE POLICY "Admins can create chapters"
ON public.chapters
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete chapters"
ON public.chapters
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update chapters"
ON public.chapters
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

-- Update courses policies
DROP POLICY IF EXISTS "Instructors can create courses" ON public.courses;
DROP POLICY IF EXISTS "Instructors can update their own courses" ON public.courses;

CREATE POLICY "Instructors can create courses"
ON public.courses
FOR INSERT
WITH CHECK (
  public.has_role(auth.uid(), 'instructor') OR 
  public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Instructors can update their own courses"
ON public.courses
FOR UPDATE
USING (
  instructor_id = auth.uid() OR 
  public.has_role(auth.uid(), 'admin')
);

-- Update practice_problems policies
DROP POLICY IF EXISTS "Admins can create practice_problems" ON public.practice_problems;
DROP POLICY IF EXISTS "Admins can delete practice_problems" ON public.practice_problems;
DROP POLICY IF EXISTS "Admins can update practice_problems" ON public.practice_problems;

CREATE POLICY "Admins can create practice_problems"
ON public.practice_problems
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete practice_problems"
ON public.practice_problems
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update practice_problems"
ON public.practice_problems
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

-- Update roadmaps policies
DROP POLICY IF EXISTS "Admins can create roadmaps" ON public.roadmaps;
DROP POLICY IF EXISTS "Admins can delete roadmaps" ON public.roadmaps;
DROP POLICY IF EXISTS "Admins can update roadmaps" ON public.roadmaps;

CREATE POLICY "Admins can create roadmaps"
ON public.roadmaps
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete roadmaps"
ON public.roadmaps
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update roadmaps"
ON public.roadmaps
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

-- Update solution_requests policies
DROP POLICY IF EXISTS "Users can update their own requests" ON public.solution_requests;

CREATE POLICY "Users can update their own requests"
ON public.solution_requests
FOR UPDATE
USING (
  auth.uid() = user_id OR 
  public.has_role(auth.uid(), 'instructor') OR 
  public.has_role(auth.uid(), 'admin')
);

-- Update sub_chapters policies
DROP POLICY IF EXISTS "Admins can create sub_chapters" ON public.sub_chapters;
DROP POLICY IF EXISTS "Admins can delete sub_chapters" ON public.sub_chapters;
DROP POLICY IF EXISTS "Admins can update sub_chapters" ON public.sub_chapters;

CREATE POLICY "Admins can create sub_chapters"
ON public.sub_chapters
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete sub_chapters"
ON public.sub_chapters
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update sub_chapters"
ON public.sub_chapters
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

-- Update video_lessons policies
DROP POLICY IF EXISTS "Admins can create video_lessons" ON public.video_lessons;
DROP POLICY IF EXISTS "Admins can delete video_lessons" ON public.video_lessons;
DROP POLICY IF EXISTS "Admins can update video_lessons" ON public.video_lessons;

CREATE POLICY "Admins can create video_lessons"
ON public.video_lessons
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete video_lessons"
ON public.video_lessons
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update video_lessons"
ON public.video_lessons
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));