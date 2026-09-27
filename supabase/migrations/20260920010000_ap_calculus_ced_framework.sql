-- AP Calculus curriculum taxonomy based on the July 2026 College Board CED.
-- Canonical CED topics are shared by AB and BC; course mappings determine scope.

CREATE TABLE public.curriculum_frameworks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  title text NOT NULL,
  version text NOT NULL,
  source_title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.curriculum_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_id uuid NOT NULL REFERENCES public.curriculum_frameworks(id) ON DELETE CASCADE,
  unit_number smallint NOT NULL CHECK (unit_number BETWEEN 1 AND 99),
  title text NOT NULL,
  is_bc_only boolean NOT NULL DEFAULT false,
  ab_exam_weight_min smallint,
  ab_exam_weight_max smallint,
  bc_exam_weight_min smallint,
  bc_exam_weight_max smallint,
  ab_periods_min smallint,
  ab_periods_max smallint,
  bc_periods_min smallint,
  bc_periods_max smallint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (framework_id, unit_number)
);

CREATE TABLE public.curriculum_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES public.curriculum_units(id) ON DELETE CASCADE,
  topic_code text NOT NULL UNIQUE,
  title text NOT NULL,
  big_idea text NOT NULL CHECK (big_idea IN ('CHA', 'LIM', 'FUN')),
  is_bc_only boolean NOT NULL DEFAULT false,
  order_index smallint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (unit_id, order_index)
);

CREATE TABLE public.curriculum_learning_objectives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES public.curriculum_topics(id) ON DELETE CASCADE,
  objective_code text NOT NULL,
  statement text NOT NULL,
  order_index smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (topic_id, objective_code)
);

CREATE TABLE public.curriculum_practices (
  code smallint PRIMARY KEY CHECK (code BETWEEN 1 AND 4),
  name text NOT NULL,
  description text NOT NULL
);

CREATE TABLE public.curriculum_practice_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_code smallint NOT NULL REFERENCES public.curriculum_practices(code) ON DELETE CASCADE,
  skill_code text NOT NULL UNIQUE,
  description text NOT NULL,
  assessed boolean NOT NULL DEFAULT true
);

CREATE TABLE public.course_curriculum_units (
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.curriculum_units(id) ON DELETE CASCADE,
  order_index smallint NOT NULL,
  PRIMARY KEY (course_id, unit_id),
  UNIQUE (course_id, order_index)
);

ALTER TABLE public.course_videos
ADD COLUMN IF NOT EXISTS curriculum_topic_id uuid
REFERENCES public.curriculum_topics(id) ON DELETE SET NULL;

CREATE INDEX curriculum_topics_unit_order
ON public.curriculum_topics (unit_id, order_index);

CREATE INDEX course_curriculum_units_course_order
ON public.course_curriculum_units (course_id, order_index);

CREATE INDEX course_videos_curriculum_topic
ON public.course_videos (curriculum_topic_id);

ALTER TABLE public.curriculum_frameworks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curriculum_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curriculum_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curriculum_learning_objectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curriculum_practices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curriculum_practice_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_curriculum_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Curriculum frameworks are publicly readable"
ON public.curriculum_frameworks FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Curriculum units are publicly readable"
ON public.curriculum_units FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Curriculum topics are publicly readable"
ON public.curriculum_topics FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Curriculum objectives are publicly readable"
ON public.curriculum_learning_objectives FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Curriculum practices are publicly readable"
ON public.curriculum_practices FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Curriculum practice skills are publicly readable"
ON public.curriculum_practice_skills FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Course curriculum mappings are publicly readable"
ON public.course_curriculum_units FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Admins manage curriculum frameworks"
ON public.curriculum_frameworks FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins manage curriculum units"
ON public.curriculum_units FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins manage curriculum topics"
ON public.curriculum_topics FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins manage curriculum objectives"
ON public.curriculum_learning_objectives FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins manage curriculum practices"
ON public.curriculum_practices FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins manage curriculum practice skills"
ON public.curriculum_practice_skills FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins manage course curriculum mappings"
ON public.course_curriculum_units FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

INSERT INTO public.curriculum_frameworks (code, title, version, source_title)
VALUES (
  'AP-CALCULUS-2026',
  'AP Calculus AB and BC',
  'July 2026',
  'AP Calculus AB and BC Course and Exam Description'
)
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  version = EXCLUDED.version,
  source_title = EXCLUDED.source_title,
  updated_at = now();

WITH framework AS (
  SELECT id FROM public.curriculum_frameworks WHERE code = 'AP-CALCULUS-2026'
)
INSERT INTO public.curriculum_units (
  framework_id, unit_number, title, is_bc_only,
  ab_exam_weight_min, ab_exam_weight_max, bc_exam_weight_min, bc_exam_weight_max,
  ab_periods_min, ab_periods_max, bc_periods_min, bc_periods_max
)
SELECT framework.id, unit_number, title, is_bc_only,
       ab_weight_min, ab_weight_max, bc_weight_min, bc_weight_max,
       ab_period_min, ab_period_max, bc_period_min, bc_period_max
FROM framework
CROSS JOIN (VALUES
  (1, 'Limits and Continuity', false, 10, 15, 5, 10, 22, 23, 13, 14),
  (2, 'Differentiation: Definition and Fundamental Properties', false, 10, 15, 5, 10, 13, 14, 9, 10),
  (3, 'Differentiation: Composite, Implicit, and Inverse Functions', false, 5, 10, 5, 10, 10, 11, 8, 9),
  (4, 'Contextual Applications of Differentiation', false, 10, 15, 5, 10, 10, 11, 6, 7),
  (5, 'Analytical Applications of Differentiation', false, 15, 20, 10, 15, 15, 16, 10, 11),
  (6, 'Integration and Accumulation of Change', false, 15, 20, 15, 20, 18, 20, 15, 16),
  (7, 'Differential Equations', false, 5, 10, 5, 10, 8, 9, 9, 10),
  (8, 'Applications of Integration', false, 10, 15, 5, 10, 19, 20, 13, 14),
  (9, 'Parametric Equations, Polar Coordinates, and Vector-Valued Functions', true, NULL, NULL, 10, 15, NULL, NULL, 10, 11),
  (10, 'Infinite Sequences and Series', true, NULL, NULL, 15, 20, NULL, NULL, 17, 18)
) AS units(unit_number, title, is_bc_only, ab_weight_min, ab_weight_max, bc_weight_min, bc_weight_max, ab_period_min, ab_period_max, bc_period_min, bc_period_max)
ON CONFLICT (framework_id, unit_number) DO UPDATE SET
  title = EXCLUDED.title,
  is_bc_only = EXCLUDED.is_bc_only,
  ab_exam_weight_min = EXCLUDED.ab_exam_weight_min,
  ab_exam_weight_max = EXCLUDED.ab_exam_weight_max,
  bc_exam_weight_min = EXCLUDED.bc_exam_weight_min,
  bc_exam_weight_max = EXCLUDED.bc_exam_weight_max,
  ab_periods_min = EXCLUDED.ab_periods_min,
  ab_periods_max = EXCLUDED.ab_periods_max,
  bc_periods_min = EXCLUDED.bc_periods_min,
  bc_periods_max = EXCLUDED.bc_periods_max,
  updated_at = now();

WITH framework AS (
  SELECT id FROM public.curriculum_frameworks WHERE code = 'AP-CALCULUS-2026'
), topic_seed(unit_number, topic_code, title, big_idea, is_bc_only, order_index) AS (VALUES
  (1, '1.1', 'Introducing Calculus: Can Change Occur at an Instant?', 'CHA', false, 1),
  (1, '1.2', 'Defining Limits and Using Limit Notation', 'LIM', false, 2),
  (1, '1.3', 'Estimating Limit Values from Graphs', 'LIM', false, 3),
  (1, '1.4', 'Estimating Limit Values from Tables', 'LIM', false, 4),
  (1, '1.5', 'Determining Limits Using Algebraic Properties of Limits', 'LIM', false, 5),
  (1, '1.6', 'Determining Limits Using Algebraic Manipulation', 'LIM', false, 6),
  (1, '1.7', 'Selecting Procedures for Determining Limits', 'LIM', false, 7),
  (1, '1.8', 'Determining Limits Using the Squeeze Theorem', 'LIM', false, 8),
  (1, '1.9', 'Connecting Multiple Representations of Limits', 'LIM', false, 9),
  (1, '1.10', 'Exploring Types of Discontinuities', 'LIM', false, 10),
  (1, '1.11', 'Defining Continuity at a Point', 'LIM', false, 11),
  (1, '1.12', 'Confirming Continuity over an Interval', 'LIM', false, 12),
  (1, '1.13', 'Removing Discontinuities', 'LIM', false, 13),
  (1, '1.14', 'Connecting Infinite Limits and Vertical Asymptotes', 'LIM', false, 14),
  (1, '1.15', 'Connecting Limits at Infinity and Horizontal Asymptotes', 'LIM', false, 15),
  (1, '1.16', 'Working with the Intermediate Value Theorem (IVT)', 'FUN', false, 16),
  (2, '2.1', 'Defining Average and Instantaneous Rates of Change at a Point', 'CHA', false, 1),
  (2, '2.2', 'Defining the Derivative of a Function and Using Derivative Notation', 'CHA', false, 2),
  (2, '2.3', 'Estimating Derivatives of a Function at a Point', 'CHA', false, 3),
  (2, '2.4', 'Connecting Differentiability and Continuity: Determining When Derivatives Do and Do Not Exist', 'FUN', false, 4),
  (2, '2.5', 'Applying the Power Rule', 'FUN', false, 5),
  (2, '2.6', 'Derivative Rules: Constant, Sum, Difference, and Constant Multiple', 'FUN', false, 6),
  (2, '2.7', 'Derivatives of cos x, sin x, e^x, and ln x', 'FUN', false, 7),
  (2, '2.8', 'The Product Rule', 'FUN', false, 8),
  (2, '2.9', 'The Quotient Rule', 'FUN', false, 9),
  (2, '2.10', 'Finding the Derivatives of Tangent, Cotangent, Secant, and/or Cosecant Functions', 'FUN', false, 10),
  (3, '3.1', 'The Chain Rule', 'FUN', false, 1),
  (3, '3.2', 'Implicit Differentiation', 'FUN', false, 2),
  (3, '3.3', 'Differentiating Inverse Functions', 'FUN', false, 3),
  (3, '3.4', 'Differentiating Inverse Trigonometric Functions', 'FUN', false, 4),
  (3, '3.5', 'Selecting Procedures for Calculating Derivatives', 'FUN', false, 5),
  (3, '3.6', 'Calculating Higher-Order Derivatives', 'FUN', false, 6),
  (4, '4.1', 'Interpreting the Meaning of the Derivative in Context', 'CHA', false, 1),
  (4, '4.2', 'Straight-Line Motion: Connecting Position, Velocity, and Acceleration', 'CHA', false, 2),
  (4, '4.3', 'Rates of Change in Applied Contexts Other Than Motion', 'CHA', false, 3),
  (4, '4.4', 'Introduction to Related Rates', 'CHA', false, 4),
  (4, '4.5', 'Solving Related Rates Problems', 'CHA', false, 5),
  (4, '4.6', 'Approximating Values of a Function Using Local Linearity and Linearization', 'CHA', false, 6),
  (4, '4.7', 'Using L’Hospital’s Rule for Determining Limits of Indeterminate Forms', 'LIM', false, 7),
  (5, '5.1', 'Using the Mean Value Theorem', 'FUN', false, 1),
  (5, '5.2', 'Extreme Value Theorem, Global Versus Local Extrema, and Critical Points', 'FUN', false, 2),
  (5, '5.3', 'Determining Intervals on Which a Function Is Increasing or Decreasing', 'FUN', false, 3),
  (5, '5.4', 'Using the First Derivative Test to Determine Relative (Local) Extrema', 'FUN', false, 4),
  (5, '5.5', 'Using the Candidates Test to Determine Absolute (Global) Extrema', 'FUN', false, 5),
  (5, '5.6', 'Determining Concavity of Functions over Their Domains', 'FUN', false, 6),
  (5, '5.7', 'Using the Second Derivative Test to Determine Extrema', 'FUN', false, 7),
  (5, '5.8', 'Sketching Graphs of Functions and Their Derivatives', 'FUN', false, 8),
  (5, '5.9', 'Connecting a Function, Its First Derivative, and Its Second Derivative', 'FUN', false, 9),
  (5, '5.10', 'Introduction to Optimization Problems', 'FUN', false, 10),
  (5, '5.11', 'Solving Optimization Problems', 'FUN', false, 11),
  (5, '5.12', 'Exploring Behaviors of Implicit Relations', 'FUN', false, 12),
  (6, '6.1', 'Exploring Accumulations of Change', 'CHA', false, 1),
  (6, '6.2', 'Approximating Areas with Riemann Sums', 'LIM', false, 2),
  (6, '6.3', 'Riemann Sums, Summation Notation, and Definite Integral Notation', 'LIM', false, 3),
  (6, '6.4', 'The Fundamental Theorem of Calculus and Accumulation Functions', 'FUN', false, 4),
  (6, '6.5', 'Interpreting the Behavior of Accumulation Functions Involving Area', 'FUN', false, 5),
  (6, '6.6', 'Applying Properties of Definite Integrals', 'FUN', false, 6),
  (6, '6.7', 'The Fundamental Theorem of Calculus and Definite Integrals', 'FUN', false, 7),
  (6, '6.8', 'Finding Antiderivatives and Indefinite Integrals: Basic Rules and Notation', 'FUN', false, 8),
  (6, '6.9', 'Integrating Using Substitution', 'FUN', false, 9),
  (6, '6.10', 'Integrating Functions Using Long Division and Completing the Square', 'FUN', false, 10),
  (6, '6.11', 'Integrating Using Integration by Parts', 'FUN', true, 11),
  (6, '6.12', 'Using Linear Partial Fractions', 'FUN', true, 12),
  (6, '6.13', 'Evaluating Improper Integrals', 'LIM', true, 13),
  (6, '6.14', 'Selecting Techniques for Antidifferentiation', 'FUN', false, 14),
  (7, '7.1', 'Modeling Situations with Differential Equations', 'FUN', false, 1),
  (7, '7.2', 'Verifying Solutions for Differential Equations', 'FUN', false, 2),
  (7, '7.3', 'Sketching Slope Fields', 'FUN', false, 3),
  (7, '7.4', 'Reasoning Using Slope Fields', 'FUN', false, 4),
  (7, '7.5', 'Approximating Solutions Using Euler’s Method', 'FUN', true, 5),
  (7, '7.6', 'Finding General Solutions Using Separation of Variables', 'FUN', false, 6),
  (7, '7.7', 'Finding Particular Solutions Using Initial Conditions and Separation of Variables', 'FUN', false, 7),
  (7, '7.8', 'Exponential Models with Differential Equations', 'FUN', false, 8),
  (7, '7.9', 'Logistic Models with Differential Equations', 'FUN', true, 9),
  (8, '8.1', 'Finding the Average Value of a Function on an Interval', 'CHA', false, 1),
  (8, '8.2', 'Connecting Position, Velocity, and Acceleration of Functions Using Integrals', 'CHA', false, 2),
  (8, '8.3', 'Using Accumulation Functions and Definite Integrals in Applied Contexts', 'CHA', false, 3),
  (8, '8.4', 'Finding the Area Between Curves Expressed as Functions of x', 'CHA', false, 4),
  (8, '8.5', 'Finding the Area Between Curves Expressed as Functions of y', 'CHA', false, 5),
  (8, '8.6', 'Finding the Area Between Curves That Intersect at More Than Two Points', 'CHA', false, 6),
  (8, '8.7', 'Volumes with Cross Sections: Squares and Rectangles', 'CHA', false, 7),
  (8, '8.8', 'Volumes with Cross Sections: Triangles and Semicircles', 'CHA', false, 8),
  (8, '8.9', 'Volume with Disc Method: Revolving Around the x- or y-Axis', 'CHA', false, 9),
  (8, '8.10', 'Volume with Disc Method: Revolving Around Other Axes', 'CHA', false, 10),
  (8, '8.11', 'Volume with Washer Method: Revolving Around the x- or y-Axis', 'CHA', false, 11),
  (8, '8.12', 'Volume with Washer Method: Revolving Around Other Axes', 'CHA', false, 12),
  (8, '8.13', 'The Arc Length of a Smooth, Planar Curve and Distance Traveled', 'CHA', true, 13),
  (9, '9.1', 'Defining and Differentiating Parametric Equations', 'CHA', true, 1),
  (9, '9.2', 'Second Derivatives of Parametric Equations', 'CHA', true, 2),
  (9, '9.3', 'Finding Arc Lengths of Curves Given by Parametric Equations', 'CHA', true, 3),
  (9, '9.4', 'Defining and Differentiating Vector-Valued Functions', 'CHA', true, 4),
  (9, '9.5', 'Integrating Vector-Valued Functions', 'FUN', true, 5),
  (9, '9.6', 'Solving Motion Problems Using Parametric and Vector-Valued Functions', 'FUN', true, 6),
  (9, '9.7', 'Defining Polar Coordinates and Differentiating in Polar Form', 'FUN', true, 7),
  (9, '9.8', 'Find the Area of a Polar Region or the Area Bounded by a Single Polar Curve', 'CHA', true, 8),
  (9, '9.9', 'Finding the Area of the Region Bounded by Two Polar Curves', 'CHA', true, 9),
  (10, '10.1', 'Defining Convergent and Divergent Infinite Series', 'LIM', true, 1),
  (10, '10.2', 'Working with Geometric Series', 'LIM', true, 2),
  (10, '10.3', 'The nth Term Test for Divergence', 'LIM', true, 3),
  (10, '10.4', 'Integral Test for Convergence', 'LIM', true, 4),
  (10, '10.5', 'Harmonic Series and p-Series', 'LIM', true, 5),
  (10, '10.6', 'Comparison Tests for Convergence', 'LIM', true, 6),
  (10, '10.7', 'Alternating Series Test for Convergence', 'LIM', true, 7),
  (10, '10.8', 'Ratio Test for Convergence', 'LIM', true, 8),
  (10, '10.9', 'Determining Absolute or Conditional Convergence', 'LIM', true, 9),
  (10, '10.10', 'Alternating Series Error Bound', 'LIM', true, 10),
  (10, '10.11', 'Finding Taylor Polynomial Approximations of Functions', 'LIM', true, 11),
  (10, '10.12', 'Lagrange Error Bound', 'LIM', true, 12),
  (10, '10.13', 'Radius and Interval of Convergence of Power Series', 'LIM', true, 13),
  (10, '10.14', 'Finding Taylor or Maclaurin Series for a Function', 'LIM', true, 14),
  (10, '10.15', 'Representing Functions as Power Series', 'LIM', true, 15)
)
INSERT INTO public.curriculum_topics (unit_id, topic_code, title, big_idea, is_bc_only, order_index)
SELECT units.id, topic_seed.topic_code, topic_seed.title, topic_seed.big_idea, topic_seed.is_bc_only, topic_seed.order_index
FROM topic_seed
JOIN framework ON true
JOIN public.curriculum_units units
  ON units.framework_id = framework.id AND units.unit_number = topic_seed.unit_number
ON CONFLICT (topic_code) DO UPDATE SET
  title = EXCLUDED.title,
  big_idea = EXCLUDED.big_idea,
  is_bc_only = EXCLUDED.is_bc_only,
  order_index = EXCLUDED.order_index,
  updated_at = now();

INSERT INTO public.curriculum_practices (code, name, description) VALUES
  (1, 'Implementing Mathematical Processes', 'Determine expressions and values using mathematical procedures and rules.'),
  (2, 'Connecting Representations', 'Translate mathematical information from a single representation or across multiple representations.'),
  (3, 'Justification', 'Justify reasoning and solutions.'),
  (4, 'Communication and Notation', 'Use correct notation, language, and mathematical conventions to communicate results or solutions.')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

INSERT INTO public.curriculum_practice_skills (practice_code, skill_code, description, assessed) VALUES
  (1, '1.A', 'Identify the question to be answered or problem to be solved.', false),
  (1, '1.B', 'Identify key and relevant information to answer a question or solve a problem.', false),
  (1, '1.C', 'Identify an appropriate mathematical rule or procedure based on the classification of a given expression.', true),
  (1, '1.D', 'Identify an appropriate mathematical rule or procedure based on relationships between concepts or processes.', true),
  (1, '1.E', 'Apply appropriate mathematical rules or procedures, with and without technology.', true),
  (1, '1.F', 'Explain how an approximated value relates to the actual value.', true),
  (2, '2.A', 'Identify common underlying structures in problems involving different contextual situations.', true),
  (2, '2.B', 'Identify mathematical information from graphical, numerical, analytical, and/or verbal representations.', true),
  (2, '2.C', 'Identify a re-expression of mathematical information presented in a given representation.', true),
  (2, '2.D', 'Identify how mathematical characteristics or properties of functions are related in different representations.', true),
  (2, '2.E', 'Describe relationships among different representations of functions and their derivatives.', true),
  (3, '3.A', 'Apply technology to develop claims and conjectures.', false),
  (3, '3.B', 'Identify an appropriate mathematical definition, theorem, or test to apply.', true),
  (3, '3.C', 'Confirm whether hypotheses or conditions of a selected definition, theorem, or test have been satisfied.', true),
  (3, '3.D', 'Apply an appropriate mathematical definition, theorem, or test.', true),
  (3, '3.E', 'Provide reasons or rationales for solutions and conclusions.', true),
  (3, '3.F', 'Explain the meaning of mathematical solutions in context.', true),
  (3, '3.G', 'Confirm that solutions are accurate and appropriate.', true),
  (4, '4.A', 'Use precise mathematical language.', true),
  (4, '4.B', 'Use appropriate units of measure.', true),
  (4, '4.C', 'Use appropriate mathematical symbols and notation.', true),
  (4, '4.D', 'Use appropriate graphing techniques.', true),
  (4, '4.E', 'Apply appropriate rounding procedures.', true)
ON CONFLICT (skill_code) DO UPDATE SET
  practice_code = EXCLUDED.practice_code,
  description = EXCLUDED.description,
  assessed = EXCLUDED.assessed;

-- Reuse the two existing AP Calculus course records so existing links remain stable.
UPDATE public.courses SET
  title = 'AP Calculus AB',
  description = 'College Board CED-aligned AP Calculus AB course covering Units 1–8.',
  subject = 'AP Calc',
  category = 'High School',
  level = 'advanced',
  price = 0,
  updated_at = now()
WHERE id = '93124428-92f4-48d2-a6dc-e5f9e010248b';

UPDATE public.courses SET
  title = 'AP Calculus BC',
  description = 'College Board CED-aligned AP Calculus BC course covering Units 1–10, including BC-only topics.',
  subject = 'AP Calc',
  category = 'High School',
  level = 'advanced',
  price = 0,
  updated_at = now()
WHERE id = 'fccc7540-0c29-43be-8682-ae90ff2534cb';

DELETE FROM public.course_curriculum_units
WHERE course_id IN (
  '93124428-92f4-48d2-a6dc-e5f9e010248b',
  'fccc7540-0c29-43be-8682-ae90ff2534cb'
);

WITH framework AS (
  SELECT id FROM public.curriculum_frameworks WHERE code = 'AP-CALCULUS-2026'
)
INSERT INTO public.course_curriculum_units (course_id, unit_id, order_index)
SELECT '93124428-92f4-48d2-a6dc-e5f9e010248b'::uuid, units.id, units.unit_number
FROM public.curriculum_units units
JOIN framework ON framework.id = units.framework_id
WHERE units.unit_number BETWEEN 1 AND 8
UNION ALL
SELECT 'fccc7540-0c29-43be-8682-ae90ff2534cb'::uuid, units.id, units.unit_number
FROM public.curriculum_units units
JOIN framework ON framework.id = units.framework_id
WHERE units.unit_number BETWEEN 1 AND 10;

-- The user requested a clean lesson catalog. Storage objects are intentionally retained.
DELETE FROM public.course_videos;

COMMENT ON TABLE public.curriculum_topics IS
  'Canonical AP Calculus CED topics. Questions should reference topic IDs instead of free-text unit/topic tags.';
COMMENT ON TABLE public.curriculum_learning_objectives IS
  'CED learning objectives for fine-grained question alignment; populated in a separately reviewed content pass.';
COMMENT ON COLUMN public.course_videos.curriculum_topic_id IS
  'Optional canonical CED topic for the lesson video; replaces free-text-only unit assignment.';
