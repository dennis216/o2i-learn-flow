-- Fix Course Authors and Subject Names

-- 1. Update AP Precalc -> Pre-Calculus 12 in courses table
UPDATE public.courses 
SET subject = 'Pre-Calculus 12' 
WHERE subject = 'AP Precalc';

-- 2. Update course authors:
-- AP Calc: Victor Chen (c0a54985-dc0e-4e84-8e05-7d5a08e30c7a) - using Victor as "Charles" isn't in system
-- Geometry & Algebra: Dennis Wang (a074f47b-042c-4362-b8fc-b4ca6b8c1a29)
-- Counting & Probability: Florika (2b9ec0ae-8e08-4d05-af00-802e34dd3684) - already correct

-- Update AP Calculus to Victor Chen
UPDATE public.courses 
SET instructor_id = 'c0a54985-dc0e-4e84-8e05-7d5a08e30c7a'
WHERE title = 'AP Calculus';

-- Update Geometry to Dennis Wang
UPDATE public.courses 
SET instructor_id = 'a074f47b-042c-4362-b8fc-b4ca6b8c1a29'
WHERE title = 'Intro to Geometry';

-- Update Algebra to Dennis Wang
UPDATE public.courses 
SET instructor_id = 'a074f47b-042c-4362-b8fc-b4ca6b8c1a29'
WHERE title = 'Intro to Algebra';