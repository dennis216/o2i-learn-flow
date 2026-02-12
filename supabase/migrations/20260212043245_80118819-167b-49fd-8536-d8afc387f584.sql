
-- Move 4 videos from AP Calc to AP Calculus Practice Questions
UPDATE course_videos SET course_id = 'fccc7540-0c29-43be-8682-ae90ff2534cb', order_index = 21
WHERE id = '7afc82e6-5847-460c-bb7a-cc007636fc34'; -- Unit 4 Part 1: Related Rates

UPDATE course_videos SET course_id = 'fccc7540-0c29-43be-8682-ae90ff2534cb', order_index = 22
WHERE id = '981141a8-03a1-48a6-bcec-fac61dcd15ee'; -- Unit 4 Part 2: Particle Motion

UPDATE course_videos SET course_id = 'fccc7540-0c29-43be-8682-ae90ff2534cb', order_index = 23
WHERE id = '92eb0684-31fd-4886-9382-f506cbb55336'; -- Unit 5: Derivative Rules & L'Hopital's

UPDATE course_videos SET course_id = 'fccc7540-0c29-43be-8682-ae90ff2534cb', order_index = 24
WHERE id = '377b8cc6-43ba-4dfe-a381-f753fc91f9d0'; -- Ch 6 p2: Extrema, Concavity

-- Reorder remaining AP Calc videos cleanly (0-4)
UPDATE course_videos SET order_index = 0 WHERE id = '7aed39d1-c404-4b4f-9371-e615d0958188'; -- Ch 1 p1
UPDATE course_videos SET order_index = 1 WHERE id = 'f328e7c2-1746-4f94-be43-e1e8c646f4d8'; -- Ch 1 p2
UPDATE course_videos SET order_index = 2 WHERE id = '2990869a-d83b-4300-9826-c1a5ed7558c4'; -- Unit 3 Part 1
UPDATE course_videos SET order_index = 3 WHERE id = 'cbfdfb07-e610-42f2-a560-2c3dd55c7a16'; -- Unit 3 Part 2
UPDATE course_videos SET order_index = 4 WHERE id = '3df0d6eb-2e4c-4668-a974-8d8f8d3a2d81'; -- Unit 3 Part 3&5
UPDATE course_videos SET order_index = 5 WHERE id = 'a560603b-d7b4-471c-91d7-97690f69a7ac'; -- Be happy
