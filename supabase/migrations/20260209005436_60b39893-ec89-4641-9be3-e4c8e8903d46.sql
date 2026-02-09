-- Update Unit 1: Limits & Continuity videos with proper structure and playground URLs

-- Part 1: Limit Foundations (Lessons 1, 8)
UPDATE public.course_videos 
SET unit = 'Unit 1: Limits & Continuity',
    subtitle = 'Part 1: Limit Foundations',
    playground_url = 'https://www.geogebra.org/m/vtrufde8'
WHERE id IN ('3f2458b9-f217-4e86-b7eb-6a2ea19f5ee4', 'b1db7271-99c1-47b0-857b-0024e19230e1');

-- Part 2: Special Limits & Squeeze Theorem (Lessons 2, 3)
UPDATE public.course_videos 
SET unit = 'Unit 1: Limits & Continuity',
    subtitle = 'Part 2: Special Limits & Squeeze Theorem',
    playground_url = 'https://www.geogebra.org/m/Dvvc59J5'
WHERE id IN ('50d1b8d7-0bed-42dd-a9b7-b3a03c946739', '706bfd5d-c4e2-4c75-b03f-d610a530938d');

-- Part 3: Continuity & IVT (Lessons 4, 5, 6, 7)
UPDATE public.course_videos 
SET unit = 'Unit 1: Limits & Continuity',
    subtitle = 'Part 3: Continuity & IVT',
    playground_url = 'https://www.geogebra.org/m/kmYwYaNy'
WHERE id IN ('3a169706-ce91-4e29-a0b1-c0cec3c3defe', '0ae633d6-378f-4ae5-a3d8-ecfeb18a63b2', '5753e7b7-651c-4683-83a6-f57420480f40', 'b8927cd1-1f73-4171-aa0b-be1c1ba451b7');

-- Update Unit 2: Differentiation Rules & Foundations videos

-- Part 1: The Limit Definition (Lessons 9, 10, 11)
UPDATE public.course_videos 
SET unit = 'Unit 2: Differentiation Rules & Foundations',
    subtitle = 'Part 1: The Limit Definition',
    playground_url = 'https://www.geogebra.org/m/BtAwrBd5'
WHERE id IN ('75fef63a-e3df-44f0-a06f-58e498914db1', 'baed945c-f559-4193-a029-db02a4031bb6', '04ece927-7a0a-4810-8ab3-fec65fd3d7a7');

-- Part 2: Basic Rules & Chain Rule (Lessons 12, 13)
UPDATE public.course_videos 
SET unit = 'Unit 2: Differentiation Rules & Foundations',
    subtitle = 'Part 2: Basic Rules & Chain Rule',
    playground_url = 'https://www.geogebra.org/m/kGcJ3CDZ'
WHERE id IN ('2dc92d71-d0d3-4e8b-80c7-3dc479f9d5b4', '8f36a094-4a0e-4a93-b32c-421ca962db7f');

-- Part 3: Implicit & Higher-Order (Lessons 14, 15)
UPDATE public.course_videos 
SET unit = 'Unit 2: Differentiation Rules & Foundations',
    subtitle = 'Part 3: Implicit & Higher-Order',
    playground_url = 'https://www.geogebra.org/m/ct6ybnsv'
WHERE id IN ('e024de93-6ca5-4931-80f6-4edc6f3836b8', 'ce92436c-550d-4b74-b8f7-9f7d7893b1c9');

-- Update Unit 3: Advanced Derivatives & Applications videos

-- Part 1: Inverse Functions (Lessons 16, 17, 18)
UPDATE public.course_videos 
SET unit = 'Unit 3: Advanced Derivatives & Applications',
    subtitle = 'Part 1: Inverse Functions',
    playground_url = 'https://www.geogebra.org/m/hubgngby'
WHERE id IN ('9996769e-45c0-4c10-8b97-b48d9ede2071', 'db81927c-1f54-4f5b-b2a6-bb7be7aef316', '93bb48f4-3b2e-4d58-96e2-83f88b31e2a1');

-- Part 2: Graphical Analysis (Lessons 19, 20)
UPDATE public.course_videos 
SET unit = 'Unit 3: Advanced Derivatives & Applications',
    subtitle = 'Part 2: Graphical Analysis',
    playground_url = 'https://www.geogebra.org/m/euzydj4a'
WHERE id IN ('7c41f6e0-b8e9-4d9b-8d60-f37d6e7b5a23', 'a2d9e5c1-7f3a-4b8c-9e1d-5a6b7c8d9e0f');