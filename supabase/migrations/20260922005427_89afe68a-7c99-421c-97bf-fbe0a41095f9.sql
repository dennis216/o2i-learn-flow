DELETE FROM public.course_videos WHERE course_id IN (SELECT id FROM public.courses WHERE subject NOT IN ('AP Calc','Pre-Calculus 12'));
DELETE FROM public.courses WHERE subject NOT IN ('AP Calc','Pre-Calculus 12');
DELETE FROM public.subjects WHERE name NOT IN ('AP Calc','Pre-Calculus 12');