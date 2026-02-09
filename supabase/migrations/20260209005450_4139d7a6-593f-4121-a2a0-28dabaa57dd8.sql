-- Update Lesson 18 for Unit 3 Part 1: Inverse Functions
UPDATE public.course_videos 
SET unit = 'Unit 3: Advanced Derivatives & Applications',
    subtitle = 'Part 1: Inverse Functions',
    playground_url = 'https://www.geogebra.org/m/hubgngby'
WHERE id = '3c4111a3-6e84-421b-9cea-ebe8cfd12125';

-- Update Lessons 19, 20 for Unit 3 Part 2: Graphical Analysis
UPDATE public.course_videos 
SET unit = 'Unit 3: Advanced Derivatives & Applications',
    subtitle = 'Part 2: Graphical Analysis',
    playground_url = 'https://www.geogebra.org/m/euzydj4a'
WHERE id IN ('f1946ae3-22a4-4732-8e21-eafafe9eeaa4', '080845ab-36eb-47b2-9ac8-f809eb1f2a51');