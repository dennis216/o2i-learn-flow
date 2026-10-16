DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = 'c0a54985-dc0e-4e84-8e05-7d5a08e30c7a'::uuid
  ) THEN
-- Insert AP Calculus AB course
INSERT INTO courses (title, description, level, subject, category, price, instructor_id)
VALUES (
  'AP Calculus AB',
  'Master the fundamentals of AP Calculus AB including limits, derivatives, integrals, and their applications.',
  'advanced',
  'AP Calc',
  'High School',
  0.00,
  'c0a54985-dc0e-4e84-8e05-7d5a08e30c7a'
);

-- Insert Lesson 1: Introduction to Limits
INSERT INTO course_videos (course_id, title, unit, video_url, order_index, description, exam_tips, transcript)
VALUES (
  (SELECT id FROM courses WHERE title = 'AP Calculus AB' LIMIT 1),
  'Introduction to Limits',
  'Unit 1: Limits and Continuity',
  'https://youtu.be/6OOvQQVCISY',
  0,
  'Foundations of calculus, free-fall motion formula $h(t) = \frac{1}{2}gt^2$, and the graphical definition of limits.',
  'Limit Existence Theorem: $\lim_{x \to c} f(x) = L$ iff $\lim_{x \to c^-} f(x) = \lim_{x \to c^+} f(x) = L$.',
  '[{"s": 0, "t": "Introduction to AP Calculus AB and instructor Brandon."}, {"s": 5, "t": "The foundation of Calculus starts with Limits."}, {"s": 10, "t": "Chapter 1: Introduction to Limits."}, {"s": 15, "t": "Physics context: Free-fall motion basics."}, {"s": 20, "t": "Objects falling under the influence of gravity alone."}, {"s": 25, "t": "The relationship between distance h and time t."}, {"s": 30, "t": "Formula: h(t) = 1/2 gt^2."}, {"s": 35, "t": "Defining g as the gravity constant."}, {"s": 40, "t": "Gravity value is approximately 9.81 m/s^2."}, {"s": 45, "t": "Example: A ball falling for 3 seconds."}, {"s": 50, "t": "Calculating height at t = 3 using the formula."}, {"s": 55, "t": "Average Velocity vs. Instantaneous Velocity intro."}, {"s": 60, "t": "Definition of displacement over time."}, {"s": 65, "t": "Displacement is the shortest path from A to B."}, {"s": 70, "t": "Comparison: Displacement is always ≤ Distance."}, {"s": 75, "t": "Instantaneous velocity as velocity at an exact moment."}, {"s": 80, "t": "Graphical analysis: Finding the slope of the curve."}, {"s": 85, "t": "Formula for slope using delta t approach."}, {"s": 90, "t": "The limit notation: x approaching a constant c."}, {"s": 95, "t": "Limit of f(x) as x approaches c equals L."}, {"s": 100, "t": "Dealing with non-permissible values (x - 2)."}, {"s": 105, "t": "How limits handle points where the function is undefined."}, {"s": 110, "t": "Properties of limits: Key rules to remember."}, {"s": 115, "t": "Importance of conditions for limit properties."}, {"s": 120, "t": "Introduction to One-sided Limits."}, {"s": 125, "t": "Right-hand limit (c+) vs Left-hand limit (c-)."}, {"s": 130, "t": "Theorem: Limit exists if LHL = RHL = L."}]'::jsonb
);

-- Insert Lesson 2: Limits DNE and Techniques
INSERT INTO course_videos (course_id, title, unit, video_url, order_index, description, exam_tips, transcript)
VALUES (
  (SELECT id FROM courses WHERE title = 'AP Calculus AB' LIMIT 1),
  'Limits DNE and Techniques',
  'Unit 1: Limits and Continuity',
  'https://youtu.be/LzCjz4w_k_c',
  1,
  'Analyzing why limits fail (DNE) and techniques like factoring, conjugate multiplication, and absolute value analysis.',
  'Use the Conjugate Method for limits like $\lim_{x \to 0} \frac{\sqrt{x+1}-1}{x}$.',
  '[{"s": 0, "t": "Cases where the limit does not exist (DNE)."}, {"s": 5, "t": "Case 1: Left-hand limit ≠ Right-hand limit."}, {"s": 10, "t": "Case 2: Unbounded behavior (increases/decreases without bound)."}, {"s": 15, "t": "Case 3: Oscillating behavior between values."}, {"s": 20, "t": "Example: Calculating limit using simple substitution."}, {"s": 25, "t": "Eliminating extraneous roots in limit functions."}, {"s": 30, "t": "Solving by factoring to cancel out common terms."}, {"s": 35, "t": "Concept of the Open Circle or open interval on a graph."}, {"s": 40, "t": "Technique: Multiplying by the conjugate for square roots."}, {"s": 45, "t": "Step-by-step rationalization of the denominator."}, {"s": 50, "t": "The absolute value limit |x|/x at zero."}, {"s": 55, "t": "Why |x|/x DNE at zero (jump discontinuity)."}, {"s": 60, "t": "Graphical discussion of limit existence."}, {"s": 65, "t": "Analyzing closed intervals vs. open intervals on plots."}, {"s": 70, "t": "Dealing with vertical asymptotes and infinity."}, {"s": 75, "t": "Summary of limit calculation methods: substitution and conjugation."}]'::jsonb
);

-- Insert Lesson 3: Related Rates and L'Hôpital's Rule
INSERT INTO course_videos (course_id, title, unit, video_url, order_index, description, exam_tips, transcript)
VALUES (
  (SELECT id FROM courses WHERE title = 'AP Calculus AB' LIMIT 1),
  'Related Rates and L''Hôpital''s Rule',
  'Unit 5: Analytical Applications of Differentiation',
  'https://youtu.be/h2R_VGk476A',
  2,
  'Real-world derivative applications including spherical balloons, conical tanks, and solving indeterminate forms using L''Hôpital.',
  'L''Hôpital''s Rule: If $\lim \frac{f(x)}{g(x)} = \frac{0}{0}$, then it equals $\lim \frac{f''(x)}{g''(x)}$.',
  '[{"s": 0, "t": "Chapter 6: Application of Derivatives."}, {"s": 5, "t": "Analyzing function behavior and real-world problems."}, {"s": 10, "t": "Defining Related Rates: Variables changing with respect to time."}, {"s": 15, "t": "Example: Pumping air into a spherical balloon."}, {"s": 20, "t": "Finding the rate of change of the radius (dr/dt)."}, {"s": 25, "t": "Differentiating the volume of a sphere formula."}, {"s": 30, "t": "Example 2: Conical tank filling problem."}, {"s": 35, "t": "Setting up the ratio between radius and height (r/h)."}, {"s": 40, "t": "Substituting variables to solve with one variable."}, {"s": 45, "t": "Final answer units: feet per minute."}, {"s": 50, "t": "Introduction to Mean Value Theorem (MVT)."}, {"s": 55, "t": "Conditions for MVT: Continuity and Differentiability."}, {"s": 60, "t": "Fun fact about L''Hôpital''s Rule history."}, {"s": 65, "t": "Applying L''Hôpital''s Rule to indeterminate forms (0/0)."}, {"s": 70, "t": "Example: Limit of sin(x)/x as x approaches 0."}, {"s": 75, "t": "Solving ln(x)/(x-1) using differentiation."}]'::jsonb
);

-- Insert Lesson 4: Extrema and Linearization
INSERT INTO course_videos (course_id, title, unit, video_url, order_index, description, exam_tips, transcript)
VALUES (
  (SELECT id FROM courses WHERE title = 'AP Calculus AB' LIMIT 1),
  'Extrema and Linearization',
  'Unit 5: Analytical Applications of Differentiation',
  'https://youtu.be/g9zBXMqGzSc',
  3,
  'Using first and second derivative tests to find extrema, concavity, and using tangent lines for linear approximation.',
  'Linearization $L(x) \approx f(a) + f''(a)(x-a)$ is only accurate near the point of tangency $x=a$.',
  '[{"s": 0, "t": "Section 6.4: Monotonicity, Concavity, and Extrema."}, {"s": 5, "t": "Determining increasing/decreasing intervals using f''(x)."}, {"s": 10, "t": "Critical points: Where f''(x) = 0 or is undefined."}, {"s": 15, "t": "Concavity: f''''(x) > 0 (Up) vs f''''(x) < 0 (Down)."}, {"s": 20, "t": "Inflection Points: Where the concavity changes sign."}, {"s": 25, "t": "First Derivative Test for local maximum and minimum."}, {"s": 30, "t": "Second Derivative Test for identifying extrema."}, {"s": 35, "t": "Example: Local max/min of f(x) = x - sin(x)."}, {"s": 40, "t": "Finding critical points within the interval [0, 2π]."}, {"s": 45, "t": "Linear Approximation: Approximating values using tangent lines."}, {"s": 50, "t": "Linearization formula: L(x) = f(a) + f''(a)(x - a)."}, {"s": 55, "t": "Example: Linear approximation of e^x at x = 0."}, {"s": 60, "t": "Final result: L(x) = 1 + x."}]'::jsonb
);
  END IF;
END;
$$;
