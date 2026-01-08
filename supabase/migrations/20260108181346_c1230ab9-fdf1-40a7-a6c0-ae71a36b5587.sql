-- Rename Intro to Geometry videos (Lesson 2,3,4,5 → Lesson 1,2,3,4)
UPDATE course_videos SET title = 'Lesson 1' WHERE id = '91993075-b878-453a-9ada-d25abdc6778b';
UPDATE course_videos SET title = 'Lesson 2' WHERE id = 'b90268c6-8da5-48a8-afc8-0844ca18fa72';
UPDATE course_videos SET title = 'Lesson 3' WHERE id = '2c072029-6403-4bac-b2b7-6b805ead2fe7';
UPDATE course_videos SET title = 'Lesson 4' WHERE id = '725704a3-a488-43b1-89fc-5dae015eff61';

-- Rename Intro to Algebra videos (Lesson 6,7,8,9 → Lesson 1,2,3,4)
UPDATE course_videos SET title = 'Lesson 1' WHERE id = '6739a0a3-a6a6-44dd-a86a-baef46b1e485';
UPDATE course_videos SET title = 'Lesson 2' WHERE id = '2b92a141-bb93-40fb-abc8-f609ace1d9b7';
UPDATE course_videos SET title = 'Lesson 3' WHERE id = '1f6a7e43-83e1-4ceb-9e98-d4c6727d308f';
UPDATE course_videos SET title = 'Lesson 4' WHERE id = 'd2cee564-3273-4726-9e88-753b9e95d10f';