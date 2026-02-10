
-- Fix Pre-Calculus 12 curriculum: merge all into single Unit 1 with proper Parts

-- Part 1: Arithmetic Sequences
UPDATE course_videos SET unit = 'Unit 1: Sequences & Series', subtitle = 'Part 1: Arithmetic Sequences'
WHERE id IN ('cde9f459-a399-44a2-a831-b377b5f6953f', '7018fad6-d19a-488f-9640-6e989665dfd8', '14cf1723-bcf3-423e-a8c5-ab25866bc2a2', 'a34a788a-7c52-4409-8857-c3a77580437b');

-- Part 1 continued: Aircraft Descent (real-world applications of arithmetic sequences)
UPDATE course_videos SET unit = 'Unit 1: Sequences & Series', subtitle = 'Part 1: Arithmetic Sequences'
WHERE id IN ('4b832b00-92e1-4a3e-bb97-9ed589efb713', '8d0227f6-59f6-45f6-8f68-d589a7dd9543');

-- Part 2: Geometric Sequences
UPDATE course_videos SET unit = 'Unit 1: Sequences & Series', subtitle = 'Part 2: Geometric Sequences'
WHERE id = '5355c5a6-e83b-4d23-9e14-eacbac466c8a';

-- Part 3: Arithmetic Series
UPDATE course_videos SET unit = 'Unit 1: Sequences & Series', subtitle = 'Part 3: Arithmetic Series'
WHERE id IN ('3b4ba698-6d9f-4ee7-bb9f-2da6cad9ccdb', 'bc20b1e4-c836-44a1-8f53-a88c0341d04e', '38ac5b8e-56d6-4f7d-84c7-5ecc2d6d0090');

-- Part 4: Geometric Series
UPDATE course_videos SET unit = 'Unit 1: Sequences & Series', subtitle = 'Part 4: Geometric Series'
WHERE id = '06625035-b44f-47ec-a3e1-dce2aab280e4';

-- Part 5: Infinite Series
UPDATE course_videos SET unit = 'Unit 1: Sequences & Series', subtitle = 'Part 5: Infinite Series'
WHERE id IN ('ff82ae8b-30f4-4752-ba24-5dae9f9bd4c7', 'ec2543db-f719-42ee-93c1-691adcd33388');

-- Part 6: Mathematical Notation
UPDATE course_videos SET unit = 'Unit 1: Sequences & Series', subtitle = 'Part 6: Mathematical Notation'
WHERE id IN ('c63ff5f0-f375-409d-814a-0fb80866fcde', '04ffe9de-7939-40a9-bbab-c0eff2b3013a');

-- Fix order_index to be sequential
UPDATE course_videos SET order_index = 1 WHERE id = 'cde9f459-a399-44a2-a831-b377b5f6953f';
UPDATE course_videos SET order_index = 2 WHERE id = '7018fad6-d19a-488f-9640-6e989665dfd8';
UPDATE course_videos SET order_index = 3 WHERE id = '14cf1723-bcf3-423e-a8c5-ab25866bc2a2';
UPDATE course_videos SET order_index = 4 WHERE id = 'a34a788a-7c52-4409-8857-c3a77580437b';
UPDATE course_videos SET order_index = 5 WHERE id = '4b832b00-92e1-4a3e-bb97-9ed589efb713';
UPDATE course_videos SET order_index = 6 WHERE id = '8d0227f6-59f6-45f6-8f68-d589a7dd9543';
UPDATE course_videos SET order_index = 7 WHERE id = '5355c5a6-e83b-4d23-9e14-eacbac466c8a';
UPDATE course_videos SET order_index = 8 WHERE id = '3b4ba698-6d9f-4ee7-bb9f-2da6cad9ccdb';
UPDATE course_videos SET order_index = 9 WHERE id = 'bc20b1e4-c836-44a1-8f53-a88c0341d04e';
UPDATE course_videos SET order_index = 10 WHERE id = '38ac5b8e-56d6-4f7d-84c7-5ecc2d6d0090';
UPDATE course_videos SET order_index = 11 WHERE id = '06625035-b44f-47ec-a3e1-dce2aab280e4';
UPDATE course_videos SET order_index = 12 WHERE id = 'ff82ae8b-30f4-4752-ba24-5dae9f9bd4c7';
UPDATE course_videos SET order_index = 13 WHERE id = 'ec2543db-f719-42ee-93c1-691adcd33388';
UPDATE course_videos SET order_index = 14 WHERE id = 'c63ff5f0-f375-409d-814a-0fb80866fcde';
UPDATE course_videos SET order_index = 15 WHERE id = '04ffe9de-7939-40a9-bbab-c0eff2b3013a';
