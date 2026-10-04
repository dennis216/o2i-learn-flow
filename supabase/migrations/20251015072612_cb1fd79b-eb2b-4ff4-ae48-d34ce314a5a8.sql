-- Insert course videos for Counting and Probability course
INSERT INTO course_videos (course_id, title, description, video_url, order_index, subtitle)
SELECT
  courses.id,
  videos.title,
  videos.description,
  videos.video_url,
  videos.order_index,
  videos.subtitle
FROM public.courses
CROSS JOIN (
  VALUES
    ('Video 2', 'Description for video 2', 'Counting and Probability/RPReplay_Final1750567059 (1).mp4', 2, 'Add your subtitle here'),
    ('Video 3', 'Description for video 3', 'Counting and Probability/RPReplay_Final1750567285.mp4', 3, 'Add your subtitle here'),
    ('Video 4', 'Description for video 4', 'Counting and Probability/RPReplay_Final1750570581.mp4', 4, 'Add your subtitle here')
) AS videos(title, description, video_url, order_index, subtitle)
WHERE courses.id = '66b78483-36ac-4501-bcc7-7fecdca80421'::uuid;
