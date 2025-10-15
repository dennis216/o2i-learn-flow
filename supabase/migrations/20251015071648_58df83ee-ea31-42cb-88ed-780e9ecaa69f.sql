-- Add subtitle field to course_videos table
ALTER TABLE course_videos 
ADD COLUMN IF NOT EXISTS subtitle text;