-- Insert videos for Counting and Probability course
INSERT INTO course_videos (course_id, title, video_url, order_index)
SELECT courses.id, videos.title, videos.video_url, videos.order_index
FROM public.courses
CROSS JOIN (
  VALUES
    ('Lesson 1', 'https://youtu.be/044ODxcLMdk', 1),
    ('Lesson 2', 'https://youtu.be/rHDBedwo6m0', 2),
    ('Lesson 3', 'https://youtu.be/u6GcEA3D_Yw', 3),
    ('Lesson 4', 'https://youtu.be/u6GcEA3D_Yw', 4),
    ('Lesson 5', 'https://youtu.be/JCqxi7GmH8U', 5),
    ('Lesson 6', 'https://youtu.be/sXXjt_tENno', 6),
    ('Lesson 7', 'https://youtu.be/qR_IwwB2cKo', 7),
    ('Lesson 8', 'https://youtu.be/08Qw5f8crSU', 8),
    ('Lesson 9', 'https://youtu.be/u6GabeN8z-4', 9)
) AS videos(title, video_url, order_index)
WHERE courses.id = '66b78483-36ac-4501-bcc7-7fecdca80421'::uuid;
