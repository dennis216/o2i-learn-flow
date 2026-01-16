-- Migration 1: Add columns and enum value
-- Add unit_number and lesson_number to practice_problems table
ALTER TABLE public.practice_problems 
ADD COLUMN IF NOT EXISTS unit_number integer DEFAULT NULL,
ADD COLUMN IF NOT EXISTS lesson_number text DEFAULT NULL;

-- Add index for filtering by unit
CREATE INDEX IF NOT EXISTS idx_practice_problems_unit ON public.practice_problems(unit_number);