-- Add category column to courses table for High School/Contest classification
ALTER TABLE public.courses
ADD COLUMN category text NOT NULL DEFAULT 'High School';

-- Add a check constraint for valid categories
ALTER TABLE public.courses
ADD CONSTRAINT courses_category_check CHECK (category IN ('High School', 'Contest'));

-- Update existing courses to have a default category based on subject if needed
-- AP courses go to High School, AMC/Contest courses go to Contest
UPDATE public.courses
SET category = CASE 
  WHEN subject ILIKE '%AMC%' OR subject ILIKE '%Euclid%' OR subject ILIKE '%Fermat%' 
       OR subject ILIKE '%Cayley%' OR subject ILIKE '%Pascal%' OR subject ILIKE '%Gauss%'
  THEN 'Contest'
  ELSE 'High School'
END;