-- Fix video URLs by adding the course-videos prefix
UPDATE course_videos 
SET video_url = 'course-videos/' || video_url 
WHERE video_url NOT LIKE 'course-videos/%';