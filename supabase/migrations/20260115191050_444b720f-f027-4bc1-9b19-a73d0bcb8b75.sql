-- Remap existing courses to the correct subject values matching the new filter system

-- Intro to Geometry -> Geo 1 (Intro)
UPDATE public.courses 
SET subject = 'Geo 1 (Intro)', category = 'High School'
WHERE title ILIKE '%Intro to Geometry%' OR title ILIKE '%Introduction to Geometry%';

-- Intro to Algebra -> Alg 1 (Intro)
UPDATE public.courses 
SET subject = 'Alg 1 (Intro)', category = 'High School'
WHERE title ILIKE '%Intro to Algebra%' OR title ILIKE '%Introduction to Algebra%';

-- AP Calculus -> AP Calc
UPDATE public.courses 
SET subject = 'AP Calc', category = 'High School'
WHERE title ILIKE '%Calculus%' OR title ILIKE '%AP Calc%';

-- Counting and Probability -> Counting & Prob 1
UPDATE public.courses 
SET subject = 'Counting & Prob 1', category = 'High School'
WHERE title ILIKE '%Counting%' AND title ILIKE '%Probability%';

-- AMC related -> AMC 10 or AMC 12
UPDATE public.courses 
SET subject = 'AMC 10', category = 'Contest'
WHERE title ILIKE '%AMC 10%';

UPDATE public.courses 
SET subject = 'AMC 12', category = 'Contest'
WHERE title ILIKE '%AMC 12%';

-- Euclid -> Euclid
UPDATE public.courses 
SET subject = 'Euclid', category = 'Contest'
WHERE title ILIKE '%Euclid%';