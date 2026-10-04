-- Insert the course only when its production instructor profile exists. Keep
-- the returned ID so the video cannot attach to an unrelated same-title course.
WITH inserted_course AS (
INSERT INTO public.courses (title, description, subject, level, instructor_id, price)
SELECT
  'Counting and Probability',
  'Master the fundamentals of counting principles and probability theory. Learn combinations, permutations, and probability distributions.',
  'Mathematics',
  'intermediate',
  user_id,
  0
FROM public.profiles
WHERE user_id = 'b05d95ec-cf04-46cd-9ed3-79c7da7f1af6'::uuid
ON CONFLICT DO NOTHING
RETURNING id
)

-- Insert the video for this course
INSERT INTO public.course_videos (course_id, title, description, video_url, order_index)
SELECT 
  id,
  'Introduction to Counting and Probability',
  'Learn the basics of counting principles and probability',
  'course-videos/Counting-and-Probability',
  1
FROM inserted_course
ON CONFLICT DO NOTHING;
