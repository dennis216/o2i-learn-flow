-- Add exam_tips and notes_url columns to course_videos
ALTER TABLE public.course_videos 
ADD COLUMN IF NOT EXISTS exam_tips TEXT,
ADD COLUMN IF NOT EXISTS notes_url TEXT;