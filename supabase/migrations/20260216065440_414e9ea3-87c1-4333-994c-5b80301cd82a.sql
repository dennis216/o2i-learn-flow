
-- Move 3 lessons from AP Calc BC to AP Calc AB
UPDATE course_videos SET course_id = '93124428-92f4-48d2-a6dc-e5f9e010248b', order_index = 4
WHERE id = '7aed39d1-c404-4b4f-9371-e615d0958188';

UPDATE course_videos SET course_id = '93124428-92f4-48d2-a6dc-e5f9e010248b', order_index = 5
WHERE id = 'f328e7c2-1746-4f94-be43-e1e8c646f4d8';

UPDATE course_videos SET course_id = '93124428-92f4-48d2-a6dc-e5f9e010248b', order_index = 6
WHERE id = 'cbfdfb07-e610-42f2-a560-2c3dd55c7a16';

-- Rename AP Calculus AB -> AP Calc Courses
UPDATE courses SET title = 'AP Calc Courses' WHERE id = '93124428-92f4-48d2-a6dc-e5f9e010248b';

-- Rename AP Calculus BC -> AP Practice Question Solution
UPDATE courses SET title = 'AP Practice Question Solution' WHERE id = 'fccc7540-0c29-43be-8682-ae90ff2534cb';
