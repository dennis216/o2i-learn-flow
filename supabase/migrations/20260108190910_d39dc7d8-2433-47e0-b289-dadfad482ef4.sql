-- Add 4 more YouTube videos to AP Calculus course (Lessons 7-10)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.courses
    WHERE id = 'fccc7540-0c29-43be-8682-ae90ff2534cb'::uuid
  ) THEN
INSERT INTO course_videos (course_id, title, video_url, order_index) VALUES
('fccc7540-0c29-43be-8682-ae90ff2534cb', 'Lesson 7', 'https://youtu.be/4nVJ499q828', 7),
('fccc7540-0c29-43be-8682-ae90ff2534cb', 'Lesson 8', 'https://youtu.be/tqCv2EWp0VA', 8),
('fccc7540-0c29-43be-8682-ae90ff2534cb', 'Lesson 9', 'https://youtu.be/hL3x4458LsE', 9),
('fccc7540-0c29-43be-8682-ae90ff2534cb', 'Lesson 10', 'https://youtu.be/UHJ3GrTuaII', 10);
  END IF;
END;
$$;
