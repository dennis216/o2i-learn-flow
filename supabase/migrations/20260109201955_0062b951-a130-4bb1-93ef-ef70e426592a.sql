-- Clear existing AP Calculus videos and re-insert with proper unit/lesson structure
DELETE FROM course_videos WHERE course_id = 'fccc7540-0c29-43be-8682-ae90ff2534cb';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.courses
    WHERE id = 'fccc7540-0c29-43be-8682-ae90ff2534cb'::uuid
  ) THEN
INSERT INTO course_videos (course_id, title, subtitle, video_url, order_index) VALUES
-- Unit 1: Limits & Continuity
('fccc7540-0c29-43be-8682-ae90ff2534cb', 'Lesson 1: Basic Calculations of Limits', 'Unit 1: Limits & Continuity', 'https://youtu.be/B-LfTZgaGnM', 1),
('fccc7540-0c29-43be-8682-ae90ff2534cb', 'Lesson 2: Limits of Trigonometric Functions (sin x / x)', 'Unit 1: Limits & Continuity', 'https://youtu.be/FLlA0VzZsLY', 2),
('fccc7540-0c29-43be-8682-ae90ff2534cb', 'Lesson 3: Applying the Squeeze Theorem', 'Unit 1: Limits & Continuity', 'https://youtu.be/LZzD5hkCXnM', 3),
('fccc7540-0c29-43be-8682-ae90ff2534cb', 'Lesson 4: Determining Continuity and Differentiability', 'Unit 1: Limits & Continuity', 'https://youtu.be/tqCv2EWp0VA', 4),
('fccc7540-0c29-43be-8682-ae90ff2534cb', 'Lesson 5: Types of Discontinuity: Removable Discontinuity (Holes)', 'Unit 1: Limits & Continuity', 'https://youtu.be/40DGcQ46MYE', 5),
('fccc7540-0c29-43be-8682-ae90ff2534cb', 'Lesson 6: Limit Analysis of Piecewise Functions', 'Unit 1: Limits & Continuity', 'https://youtu.be/9lZrqEVaSbA', 6),
('fccc7540-0c29-43be-8682-ae90ff2534cb', 'Lesson 7: Understanding the Intermediate Value Theorem (IVT)', 'Unit 1: Limits & Continuity', 'https://youtu.be/HAeLcXq_41g', 7),
('fccc7540-0c29-43be-8682-ae90ff2534cb', 'Lesson 8: Graphical Understanding of Limits', 'Unit 1: Limits & Continuity', 'https://youtu.be/sMuju8LLguM', 8),

-- Unit 2: Differentiation Rules & Foundations
('fccc7540-0c29-43be-8682-ae90ff2534cb', 'Lesson 9: Definition of Derivative: Limit Form (Part 1)', 'Unit 2: Differentiation Rules & Foundations', 'https://youtu.be/hL3x4458LsE', 9),
('fccc7540-0c29-43be-8682-ae90ff2534cb', 'Lesson 10: Definition of Derivative: Limit Form (Part 2)', 'Unit 2: Differentiation Rules & Foundations', 'https://youtu.be/0LfmOhKlB-k', 10),
('fccc7540-0c29-43be-8682-ae90ff2534cb', 'Lesson 11: Definition of Derivative: Limit Form (Part 3)', 'Unit 2: Differentiation Rules & Foundations', 'https://youtu.be/rb_eOOl5NHY', 11),
('fccc7540-0c29-43be-8682-ae90ff2534cb', 'Lesson 12: Basic Differentiation: Product and Quotient Rules', 'Unit 2: Differentiation Rules & Foundations', 'https://youtu.be/4nVJ499q828', 12),
('fccc7540-0c29-43be-8682-ae90ff2534cb', 'Lesson 13: Mastery of the Chain Rule', 'Unit 2: Differentiation Rules & Foundations', 'https://youtu.be/YXq93S1ynIU', 13),
('fccc7540-0c29-43be-8682-ae90ff2534cb', 'Lesson 14: Implicit Differentiation Techniques', 'Unit 2: Differentiation Rules & Foundations', 'https://youtu.be/TFaHAQmTtao', 14),
('fccc7540-0c29-43be-8682-ae90ff2534cb', 'Lesson 15: Higher-Order Derivatives: Calculating the Second Derivative', 'Unit 2: Differentiation Rules & Foundations', 'https://youtu.be/64_PkpXvW9o', 15),

-- Unit 3: Advanced Derivatives & Applications
('fccc7540-0c29-43be-8682-ae90ff2534cb', 'Lesson 16: Derivatives of Inverse Trigonometric Functions', 'Unit 3: Advanced Derivatives & Applications', 'https://youtu.be/CpRE8PusBVU', 16),
('fccc7540-0c29-43be-8682-ae90ff2534cb', 'Lesson 17: Derivative Formulas for General Inverse Functions', 'Unit 3: Advanced Derivatives & Applications', 'https://youtu.be/mxDDwsPQan8', 17),
('fccc7540-0c29-43be-8682-ae90ff2534cb', 'Lesson 18: Numerical Examples of Inverse Function Derivatives', 'Unit 3: Advanced Derivatives & Applications', 'https://youtu.be/RrADtVHziT8', 18),
('fccc7540-0c29-43be-8682-ae90ff2534cb', 'Lesson 19: Geometric Meaning: Comparing Slopes of Tangent Lines', 'Unit 3: Advanced Derivatives & Applications', 'https://youtu.be/UHJ3GrTuaII', 19),
('fccc7540-0c29-43be-8682-ae90ff2534cb', 'Lesson 20: Analyzing Graphs: Horizontal Tangents and Non-Differentiable Points', 'Unit 3: Advanced Derivatives & Applications', 'https://youtu.be/3u7xNpvwbFE', 20);
  END IF;
END;
$$;
