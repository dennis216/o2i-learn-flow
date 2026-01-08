-- Move Lesson 2, 3, 4, 5 to Intro to Geometry
UPDATE course_videos SET course_id = 'dbbf1ea2-0041-4f89-80b7-129899558670' 
WHERE id IN ('91993075-b878-453a-9ada-d25abdc6778b', 'b90268c6-8da5-48a8-afc8-0844ca18fa72', '2c072029-6403-4bac-b2b7-6b805ead2fe7', '725704a3-a488-43b1-89fc-5dae015eff61');

-- Move Lesson 6, 7, 8, 9 to Intro to Algebra
UPDATE course_videos SET course_id = 'ca026ae2-06f8-48c8-966b-ef6a3033a21f' 
WHERE id IN ('6739a0a3-a6a6-44dd-a86a-baef46b1e485', '2b92a141-bb93-40fb-abc8-f609ace1d9b7', '1f6a7e43-83e1-4ceb-9e98-d4c6727d308f', 'd2cee564-3273-4726-9e88-753b9e95d10f');