
-- 1. Rename courses
UPDATE courses SET title = 'AP Calculus AB' WHERE id = '93124428-92f4-48d2-a6dc-e5f9e010248b';
UPDATE courses SET title = 'AP Calculus Practice Questions' WHERE id = 'fccc7540-0c29-43be-8682-ae90ff2534cb';

-- 2. Fix AP Calculus AB (theory) lessons: titles, units, order
UPDATE course_videos SET title = 'Lesson 1: Introduction to Limits', unit = 'Unit 1: Limits & Continuity', order_index = 0 WHERE id = 'db09f7b9-7e93-4024-8587-ad8f4d9d4532';
UPDATE course_videos SET title = 'Lesson 2: Limits DNE and Techniques', unit = 'Unit 1: Limits & Continuity', order_index = 1 WHERE id = '7931da10-529f-4065-92b0-6ef572763c5b';
UPDATE course_videos SET title = 'Lesson 3: Related Rates and L''Hôpital''s Rule', unit = 'Unit 2: Analytical Applications', order_index = 2 WHERE id = 'e1794612-595c-4933-8748-a88f882d2877';
UPDATE course_videos SET title = 'Lesson 4: Extrema and Linearization', unit = 'Unit 2: Analytical Applications', order_index = 3 WHERE id = 'd946b662-06b6-4c71-bf13-2320ab757250';

-- 3. Shift existing practice lessons: order_index +1, lesson number +5
UPDATE course_videos 
SET order_index = order_index + 1,
    title = 'Lesson ' || (CAST(SUBSTRING(title FROM 'Lesson (\d+)') AS INTEGER) + 5) || ': ' || SUBSTRING(title FROM 'Lesson \d+: (.+)')
WHERE course_id = 'fccc7540-0c29-43be-8682-ae90ff2534cb';

-- 4. Move 3 lessons back to practice course with correct numbering
UPDATE course_videos SET course_id = 'fccc7540-0c29-43be-8682-ae90ff2534cb', title = 'Lesson 5: Practice - Introduction to Limits & Motion', unit = 'Unit 3: Limits & Continuity Practice', order_index = 0 WHERE id = '7aed39d1-c404-4b4f-9371-e615d0958188';
UPDATE course_videos SET course_id = 'fccc7540-0c29-43be-8682-ae90ff2534cb', title = 'Lesson 6: Practice - Limit Properties & Existence', unit = 'Unit 3: Limits & Continuity Practice', order_index = 1 WHERE id = 'f328e7c2-1746-4f94-be43-e1e8c646f4d8';
UPDATE course_videos SET course_id = 'fccc7540-0c29-43be-8682-ae90ff2534cb', title = 'Lesson 7: Practice - Chain Rule & Product Rule', unit = 'Unit 4: Advanced Derivatives Practice', order_index = 2 WHERE id = 'cbfdfb07-e610-42f2-a560-2c3dd55c7a16';
