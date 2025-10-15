-- Create storage bucket for course videos
INSERT INTO storage.buckets (id, name, public)
VALUES ('course-videos', 'course-videos', true)
ON CONFLICT (id) DO NOTHING;

-- Create course_videos table to track video resources
CREATE TABLE IF NOT EXISTS public.course_videos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  video_url text NOT NULL,
  duration integer,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on course_videos table
ALTER TABLE public.course_videos ENABLE ROW LEVEL SECURITY;

-- Anyone can view course videos
CREATE POLICY "Anyone can view course videos"
ON public.course_videos
FOR SELECT
USING (true);

-- Instructors and admins can create course videos
CREATE POLICY "Instructors can create course videos"
ON public.course_videos
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'instructor'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

-- Instructors can update videos for their courses, admins can update all
CREATE POLICY "Instructors can update their course videos"
ON public.course_videos
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.courses 
    WHERE courses.id = course_videos.course_id 
    AND courses.instructor_id = auth.uid()
  ) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

-- Instructors can delete videos for their courses, admins can delete all
CREATE POLICY "Instructors can delete their course videos"
ON public.course_videos
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.courses 
    WHERE courses.id = course_videos.course_id 
    AND courses.instructor_id = auth.uid()
  ) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

-- Storage policies for course-videos bucket
-- Anyone can view course videos (public bucket)
CREATE POLICY "Anyone can view course videos"
ON storage.objects
FOR SELECT
USING (bucket_id = 'course-videos');

-- Instructors and admins can upload course videos
CREATE POLICY "Instructors can upload course videos"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'course-videos' AND
  (has_role(auth.uid(), 'instructor'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
);

-- Instructors and admins can update course videos
CREATE POLICY "Instructors can update course videos"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'course-videos' AND
  (has_role(auth.uid(), 'instructor'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
);

-- Instructors and admins can delete course videos
CREATE POLICY "Instructors can delete course videos"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'course-videos' AND
  (has_role(auth.uid(), 'instructor'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_course_videos_updated_at
BEFORE UPDATE ON public.course_videos
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();