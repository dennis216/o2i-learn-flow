-- Add foreign key constraint between course_videos and courses
ALTER TABLE public.course_videos
ADD CONSTRAINT course_videos_course_id_fkey 
FOREIGN KEY (course_id) 
REFERENCES public.courses(id) 
ON DELETE CASCADE;