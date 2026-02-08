-- Add unit column to course_videos for hierarchical grouping
ALTER TABLE public.course_videos ADD COLUMN IF NOT EXISTS unit text;

-- Update the 6 Arithmetic Sequences videos with proper unit and part structure
-- Part 1: Introduction & Basics
UPDATE public.course_videos 
SET unit = 'Unit 1: Arithmetic Sequences', 
    subtitle = 'Part 1: Introduction & Basics',
    order_index = 1
WHERE course_id = '440355c0-4e91-4089-bb35-ab19ae639196' 
  AND title = 'Arithmetic Sequences - Basics & Formulas';

UPDATE public.course_videos 
SET unit = 'Unit 1: Arithmetic Sequences', 
    subtitle = 'Part 1: Introduction & Basics',
    order_index = 2
WHERE course_id = '440355c0-4e91-4089-bb35-ab19ae639196' 
  AND title = 'Solving for the First Term (Practice)';

-- Part 2: Calculations & Problem Solving
UPDATE public.course_videos 
SET unit = 'Unit 1: Arithmetic Sequences', 
    subtitle = 'Part 2: Calculations & Problem Solving',
    order_index = 3
WHERE course_id = '440355c0-4e91-4089-bb35-ab19ae639196' 
  AND title = 'Arithmetic Sequences - Finding the 6th Term';

UPDATE public.course_videos 
SET unit = 'Unit 1: Arithmetic Sequences', 
    subtitle = 'Part 2: Calculations & Problem Solving',
    order_index = 4
WHERE course_id = '440355c0-4e91-4089-bb35-ab19ae639196' 
  AND title = 'Arithmetic Sequences - Word Problem (Alfred & Bob)';

-- Part 3: Real-World Applications
UPDATE public.course_videos 
SET unit = 'Unit 1: Arithmetic Sequences', 
    subtitle = 'Part 3: Real-World Applications',
    order_index = 5
WHERE course_id = '440355c0-4e91-4089-bb35-ab19ae639196' 
  AND title = 'Aircraft Descent - Part 1';

UPDATE public.course_videos 
SET unit = 'Unit 1: Arithmetic Sequences', 
    subtitle = 'Part 3: Real-World Applications',
    order_index = 6
WHERE course_id = '440355c0-4e91-4089-bb35-ab19ae639196' 
  AND title = 'Aircraft Descent - Part 2 (New Rate)';

-- Update remaining videos to have their original subtitle as unit (for backwards compatibility)
UPDATE public.course_videos 
SET unit = subtitle
WHERE course_id = '440355c0-4e91-4089-bb35-ab19ae639196' 
  AND unit IS NULL;