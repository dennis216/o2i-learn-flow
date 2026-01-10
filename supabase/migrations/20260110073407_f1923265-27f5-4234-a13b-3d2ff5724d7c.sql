-- Add transcript field to course_videos table
ALTER TABLE public.course_videos 
ADD COLUMN transcript jsonb DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.course_videos.transcript IS 'Video transcript in format: [{"s": seconds, "t": "text content"}]';