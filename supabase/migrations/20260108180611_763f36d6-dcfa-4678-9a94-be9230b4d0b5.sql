-- Insert three new math courses for florika
INSERT INTO courses (title, description, level, subject, price, instructor_id)
SELECT
  courses.title,
  courses.description,
  courses.level,
  courses.subject,
  courses.price,
  profiles.user_id
FROM public.profiles
CROSS JOIN (
  VALUES
    ('Intro to Geometry', 'Learn fundamental geometry concepts and problem-solving techniques', 'beginner', 'mathematics', 0.00),
    ('Intro to Algebra', 'Master algebraic expressions, equations, and foundational concepts', 'beginner', 'mathematics', 0.00),
    ('AP Calculus', 'Comprehensive AP Calculus preparation covering limits, derivatives, and integrals', 'advanced', 'mathematics', 0.00)
) AS courses(title, description, level, subject, price)
WHERE profiles.user_id = '2b9ec0ae-8e08-4d05-af00-802e34dd3684'::uuid;
