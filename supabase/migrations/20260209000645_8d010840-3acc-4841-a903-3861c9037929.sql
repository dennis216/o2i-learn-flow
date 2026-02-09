-- Add playground_url column to course_videos
ALTER TABLE public.course_videos ADD COLUMN IF NOT EXISTS playground_url text;

-- =============================================
-- PRE-CALCULUS 12 UPDATES (course_id: 440355c0-4e91-4089-bb35-ab19ae639196)
-- =============================================

-- Arithmetic Sequences videos - Link: https://www.geogebra.org/m/W9XN4bte
UPDATE public.course_videos SET playground_url = 'https://www.geogebra.org/m/W9XN4bte'
WHERE id IN (
  'cde9f459-a399-44a2-a831-b377b5f6953f', -- Basics & Formulas
  '14cf1723-bcf3-423e-a8c5-ab25866bc2a2', -- Finding 6th Term
  '7018fad6-d19a-488f-9640-6e989665dfd8', -- Solving for First Term
  'a34a788a-7c52-4409-8857-c3a77580437b', -- Word Problem
  '4b832b00-92e1-4a3e-bb97-9ed589efb713', -- Aircraft Part 1
  '8d0227f6-59f6-45f6-8f68-d589a7dd9543'  -- Aircraft Part 2
);

-- Arithmetic Series videos - Link: https://www.geogebra.org/m/jefvsc8m
UPDATE public.course_videos SET playground_url = 'https://www.geogebra.org/m/jefvsc8m'
WHERE id IN (
  '3b4ba698-6d9f-4ee7-bb9f-2da6cad9ccdb', -- Concepts
  'bc20b1e4-c836-44a1-8f53-a88c0341d04e', -- Sum Formula 1
  '38ac5b8e-56d6-4f7d-84c7-5ecc2d6d0090'  -- Sum Formula 2
);

-- Geometric Sequences video - Link: https://www.geogebra.org/m/v8reutun
UPDATE public.course_videos SET playground_url = 'https://www.geogebra.org/m/v8reutun'
WHERE id = '5355c5a6-e83b-4d23-9e14-eacbac466c8a';

-- Geometric Series video - Link: https://www.geogebra.org/m/vdrp8gth
UPDATE public.course_videos SET playground_url = 'https://www.geogebra.org/m/vdrp8gth'
WHERE id = '06625035-b44f-47ec-a3e1-dce2aab280e4';

-- Infinite Series videos - Link: https://www.geogebra.org/m/yvzkj9vj
UPDATE public.course_videos SET playground_url = 'https://www.geogebra.org/m/yvzkj9vj'
WHERE id IN (
  'ff82ae8b-30f4-4752-ba24-5dae9f9bd4c7', -- Convergence
  'ec2543db-f719-42ee-93c1-691adcd33388'  -- Formula
);

-- Notation videos - Link: https://www.geogebra.org/m/nrebeuaz
UPDATE public.course_videos SET playground_url = 'https://www.geogebra.org/m/nrebeuaz'
WHERE id IN (
  'c63ff5f0-f375-409d-814a-0fb80866fcde', -- Sigma
  '04ffe9de-7939-40a9-bbab-c0eff2b3013a'  -- Pi
);

-- =============================================
-- AP CALCULUS UPDATES (course_id: fccc7540-0c29-43be-8682-ae90ff2534cb)
-- =============================================

-- Unit 1: Limits & Continuity
-- Part 1: Limit Foundations (Lessons 1, 8)
UPDATE public.course_videos SET 
  unit = 'Unit 1: Limits & Continuity',
  subtitle = 'Part 1: Limit Foundations',
  playground_url = 'https://www.geogebra.org/m/m6396825'
WHERE id IN (
  '3f2458b9-f217-4e86-b7eb-6a2ea19f5ee4', -- Lesson 1
  '87a0e8c1-6979-4001-9e14-78424e64a54d'  -- Lesson 8
);

-- Part 2: Special Limits & Theorems (Lessons 2, 3)
UPDATE public.course_videos SET 
  unit = 'Unit 1: Limits & Continuity',
  subtitle = 'Part 2: Special Limits & Theorems',
  playground_url = 'https://www.geogebra.org/m/vdrp8gth'
WHERE id IN (
  '50d1b8d7-0bed-42dd-a9b7-b3a03c946739', -- Lesson 2
  '706bfd5d-c4e2-4c75-b03f-d610a530938d'  -- Lesson 3
);

-- Part 3: Continuity & IVT (Lessons 4, 5, 6, 7)
UPDATE public.course_videos SET 
  unit = 'Unit 1: Limits & Continuity',
  subtitle = 'Part 3: Continuity & IVT',
  playground_url = 'https://www.geogebra.org/m/XU6vS78p'
WHERE id IN (
  '3a169706-ce91-4e29-a0b1-c0cec3c3defe', -- Lesson 4
  '0ae633d6-378f-4ae5-a3d8-ecfeb18a63b2', -- Lesson 5
  '5753e7b7-651c-4683-83a6-f57420480f40', -- Lesson 6
  'b8927cd1-1f73-4171-aa0b-be1c1ba451b7'  -- Lesson 7
);

-- Unit 2: Differentiation Rules & Foundations
-- Part 1: The Limit Definition (Lessons 9, 10, 11)
UPDATE public.course_videos SET 
  unit = 'Unit 2: Differentiation Rules & Foundations',
  subtitle = 'Part 1: The Limit Definition',
  playground_url = 'https://www.geogebra.org/m/D6fP6TWh'
WHERE id IN (
  '05e5e343-ba7e-45ef-94e0-c52ab1de4d4e', -- Lesson 9
  '9feb4ad6-8e1b-4eb3-abbe-ef1d3c2cec4a', -- Lesson 10
  'd00f1b3e-36d6-4b1a-870b-5e00e76f0a79'  -- Lesson 11
);

-- Part 2: Basic Rules & Chain Rule (Lessons 12, 13)
UPDATE public.course_videos SET 
  unit = 'Unit 2: Differentiation Rules & Foundations',
  subtitle = 'Part 2: Basic Rules & Chain Rule',
  playground_url = 'https://www.geogebra.org/m/m6270631'
WHERE id IN (
  'c36c4fc7-0893-4f01-9f8b-db9a14e8f8a7', -- Lesson 12
  'bc95a3a8-1bf7-461b-b18c-31aee71b1ac7'  -- Lesson 13
);

-- Part 3: Implicit & Higher-Order (Lessons 14, 15)
UPDATE public.course_videos SET 
  unit = 'Unit 2: Differentiation Rules & Foundations',
  subtitle = 'Part 3: Implicit & Higher-Order',
  playground_url = 'https://www.geogebra.org/m/SyZ6zU9v'
WHERE id IN (
  '15ec3d91-cd74-4767-bb30-b945ab8bc3c7', -- Lesson 14
  '0e3a8b0d-69d7-483d-a6db-01b386ae4c03'  -- Lesson 15
);

-- Unit 3: Advanced Derivatives & Applications
-- Part 1: Inverse Functions (Lessons 16, 17, 18)
UPDATE public.course_videos SET 
  unit = 'Unit 3: Advanced Derivatives & Applications',
  subtitle = 'Part 1: Inverse Functions',
  playground_url = 'https://www.geogebra.org/m/vpt9z37k'
WHERE id IN (
  '2fcbdf0d-0add-44d2-a1e7-21a9f91a66e7', -- Lesson 16
  '4697ab2d-a56d-4b9a-9dcb-18afa93c8fa9', -- Lesson 17
  'e70fb0a1-35a0-4c38-a25f-c63110f8f9b9'  -- Lesson 18
);

-- Part 2: Graphical Analysis (Lessons 19, 20)
UPDATE public.course_videos SET 
  unit = 'Unit 3: Advanced Derivatives & Applications',
  subtitle = 'Part 2: Graphical Analysis',
  playground_url = 'https://www.geogebra.org/m/XU6vS78p'
WHERE id IN (
  '2eb2dd2d-5d78-4f82-a1dd-3bc5b2b8eb14', -- Lesson 19
  '0ffa2b75-c3b9-4fbb-8aa1-b04ed0ee6c41'  -- Lesson 20
);