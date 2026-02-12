
-- === STEP 1: Move "Unit 5 & Ch 6" back to AP Calc from Practice ===
UPDATE course_videos SET course_id = 'a1594f02-e453-4a4d-9129-2ba075474769'
WHERE id = '92eb0684-31fd-4886-9382-f506cbb55336';

-- === STEP 2: Move Unit 3 Parts 1,2,3 from AP Calc to Practice ===
UPDATE course_videos SET course_id = 'fccc7540-0c29-43be-8682-ae90ff2534cb'
WHERE id IN ('2990869a-d83b-4300-9826-c1a5ed7558c4','cbfdfb07-e610-42f2-a560-2c3dd55c7a16','3df0d6eb-2e4c-4668-a974-8d8f8d3a2d81');

-- === STEP 3: Bump existing Practice lessons so they don't collide (add 100) ===
UPDATE course_videos SET order_index = order_index + 100
WHERE course_id = 'fccc7540-0c29-43be-8682-ae90ff2534cb'
  AND id NOT IN ('2990869a-d83b-4300-9826-c1a5ed7558c4','cbfdfb07-e610-42f2-a560-2c3dd55c7a16','3df0d6eb-2e4c-4668-a974-8d8f8d3a2d81',
                 '7afc82e6-5847-460c-bb7a-cc007636fc34','981141a8-03a1-48a6-bcec-fac61dcd15ee','377b8cc6-43ba-4dfe-a381-f753fc91f9d0');

-- === STEP 4: Set order_index 0-8, rename titles, update units ===

-- Lesson 1 (AP Calc)
UPDATE course_videos SET order_index = 0,
  title = 'Lesson 1: Ch 1 p1: Introduction to Limits & Motion',
  unit = 'Limits & Foundations'
WHERE id = '7aed39d1-c404-4b4f-9371-e615d0958188';

-- Lesson 2 (AP Calc)
UPDATE course_videos SET order_index = 1,
  title = 'Lesson 2: Ch 1 p2: Limit Properties & Existence',
  unit = 'Limits & Foundations'
WHERE id = 'f328e7c2-1746-4f94-be43-e1e8c646f4d8';

-- Lesson 3 (AP Calc) - moved back from Practice
UPDATE course_videos SET order_index = 2,
  title = 'Lesson 3: Unit 5 & Ch 6: Core Derivative Rules & L''Hopital''s Rule',
  unit = 'Differentiation Rules'
WHERE id = '92eb0684-31fd-4886-9382-f506cbb55336';

-- Lesson 4 (Practice)
UPDATE course_videos SET order_index = 3,
  title = 'Lesson 4: Practice - Derivative of Inverse Functions',
  unit = 'Practice Sessions'
WHERE id = '2990869a-d83b-4300-9826-c1a5ed7558c4';

-- Lesson 5 (Practice)
UPDATE course_videos SET order_index = 4,
  title = 'Lesson 5: Practice - Chain Rule & Product Rule',
  unit = 'Practice Sessions'
WHERE id = 'cbfdfb07-e610-42f2-a560-2c3dd55c7a16';

-- Lesson 6 (Practice)
UPDATE course_videos SET order_index = 5,
  title = 'Lesson 6: Practice - Implicit Differentiation & Arcsin',
  unit = 'Practice Sessions'
WHERE id = '3df0d6eb-2e4c-4668-a974-8d8f8d3a2d81';

-- Lesson 7 (Practice)
UPDATE course_videos SET order_index = 6,
  title = 'Lesson 7: Practice - Related Rates: Cones & Spheres',
  unit = 'Applications Practice'
WHERE id = '7afc82e6-5847-460c-bb7a-cc007636fc34';

-- Lesson 8 (Practice)
UPDATE course_videos SET order_index = 7,
  title = 'Lesson 8: Practice - Analyzing Particle Motion Graphs',
  unit = 'Applications Practice'
WHERE id = '981141a8-03a1-48a6-bcec-fac61dcd15ee';

-- Lesson 9 (Practice)
UPDATE course_videos SET order_index = 8,
  title = 'Lesson 9: Practice - Extrema, Concavity & Linear Approx',
  unit = 'Applications Practice'
WHERE id = '377b8cc6-43ba-4dfe-a381-f753fc91f9d0';

-- "Be happy" stays in AP Calc at the end
UPDATE course_videos SET order_index = 99
WHERE id = 'a560603b-d7b4-471c-91d7-97690f69a7ac';
