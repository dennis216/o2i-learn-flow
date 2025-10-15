-- Insert Counting and Probability course with actual user
INSERT INTO public.courses (title, description, subject, level, instructor_id, price) 
VALUES 
  ('Counting and Probability', 'Master the fundamentals of counting principles and probability theory. Learn combinations, permutations, and probability distributions.', 'Mathematics', 'intermediate', 'b05d95ec-cf04-46cd-9ed3-79c7da7f1af6', 0)
ON CONFLICT DO NOTHING;

-- Insert the video for this course
INSERT INTO public.course_videos (course_id, title, description, video_url, order_index)
SELECT 
  id,
  'Introduction to Counting and Probability',
  'Learn the basics of counting principles and probability',
  'course-videos/Counting-and-Probability',
  1
FROM public.courses 
WHERE title = 'Counting and Probability'
ON CONFLICT DO NOTHING;