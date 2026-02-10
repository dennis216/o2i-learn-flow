
-- Fix AP Calculus Lesson 8: move it right after Lesson 1 (order_index 2), shift others down
-- Lesson 1 stays at order_index 1
-- Lesson 8 moves to order_index 2
-- Lessons 2-7 shift to 3-8
UPDATE course_videos SET order_index = 2 WHERE id = 'b1db7271-99c1-47b0-857b-0024e19230e1'; -- Lesson 8
UPDATE course_videos SET order_index = 3 WHERE id = '50d1b8d7-0bed-42dd-a9b7-b3a03c946739'; -- Lesson 2
UPDATE course_videos SET order_index = 4 WHERE id = '706bfd5d-c4e2-4c75-b03f-d610a530938d'; -- Lesson 3
UPDATE course_videos SET order_index = 5 WHERE id = '3a169706-ce91-4e29-a0b1-c0cec3c3defe'; -- Lesson 4
UPDATE course_videos SET order_index = 6 WHERE id = '0ae633d6-378f-4ae5-a3d8-ecfeb18a63b2'; -- Lesson 5
UPDATE course_videos SET order_index = 7 WHERE id = '5753e7b7-651c-4683-83a6-f57420480f40'; -- Lesson 6
UPDATE course_videos SET order_index = 8 WHERE id = 'b8927cd1-1f73-4171-aa0b-be1c1ba451b7'; -- Lesson 7
