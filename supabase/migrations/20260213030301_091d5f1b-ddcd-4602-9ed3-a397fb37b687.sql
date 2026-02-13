
-- Step 1: Move 3 AP Calc videos to Practice Questions course
UPDATE course_videos SET course_id = 'fccc7540-0c29-43be-8682-ae90ff2534cb' WHERE id IN ('7aed39d1-c404-4b4f-9371-e615d0958188', 'f328e7c2-1746-4f94-be43-e1e8c646f4d8', '92eb0684-31fd-4886-9382-f506cbb55336');

-- Step 2: Update ALL videos with correct unit, title, subtitle=NULL, and continuous order_index

-- ======= Unit 1: Limits & Continuity Practice (Lessons 1-10) =======
UPDATE course_videos SET unit = 'Unit 1: Limits & Continuity Practice', subtitle = NULL, title = 'Lesson 1: Introduction to Limits & Motion', order_index = 0 WHERE id = '7aed39d1-c404-4b4f-9371-e615d0958188';
UPDATE course_videos SET unit = 'Unit 1: Limits & Continuity Practice', subtitle = NULL, title = 'Lesson 2: Limit Properties & Existence', order_index = 1 WHERE id = 'f328e7c2-1746-4f94-be43-e1e8c646f4d8';
UPDATE course_videos SET unit = 'Unit 1: Limits & Continuity Practice', subtitle = NULL, title = 'Lesson 3: Basic Calculations of Limits', order_index = 2 WHERE id = '3f2458b9-f217-4e86-b7eb-6a2ea19f5ee4';
UPDATE course_videos SET unit = 'Unit 1: Limits & Continuity Practice', subtitle = NULL, title = 'Lesson 4: Graphical Understanding of Limits', order_index = 3 WHERE id = 'b1db7271-99c1-47b0-857b-0024e19230e1';
UPDATE course_videos SET unit = 'Unit 1: Limits & Continuity Practice', subtitle = NULL, title = 'Lesson 5: Limits of Trigonometric Functions (sin x / x)', order_index = 4 WHERE id = '50d1b8d7-0bed-42dd-a9b7-b3a03c946739';
UPDATE course_videos SET unit = 'Unit 1: Limits & Continuity Practice', subtitle = NULL, title = 'Lesson 6: Applying the Squeeze Theorem', order_index = 5 WHERE id = '706bfd5d-c4e2-4c75-b03f-d610a530938d';
UPDATE course_videos SET unit = 'Unit 1: Limits & Continuity Practice', subtitle = NULL, title = 'Lesson 7: Determining Continuity and Differentiability', order_index = 6 WHERE id = '3a169706-ce91-4e29-a0b1-c0cec3c3defe';
UPDATE course_videos SET unit = 'Unit 1: Limits & Continuity Practice', subtitle = NULL, title = 'Lesson 8: Types of Discontinuity: Removable Discontinuity (Holes)', order_index = 7 WHERE id = '0ae633d6-378f-4ae5-a3d8-ecfeb18a63b2';
UPDATE course_videos SET unit = 'Unit 1: Limits & Continuity Practice', subtitle = NULL, title = 'Lesson 9: Limit Analysis of Piecewise Functions', order_index = 8 WHERE id = '5753e7b7-651c-4683-83a6-f57420480f40';
UPDATE course_videos SET unit = 'Unit 1: Limits & Continuity Practice', subtitle = NULL, title = 'Lesson 10: Understanding the Intermediate Value Theorem (IVT)', order_index = 9 WHERE id = 'b8927cd1-1f73-4171-aa0b-be1c1ba451b7';

-- ======= Unit 2: Differentiation Foundations Practice (Lessons 11-15) =======
UPDATE course_videos SET unit = 'Unit 2: Differentiation Foundations Practice', subtitle = NULL, title = 'Lesson 11: Definition of Derivative: Limit Form (Part 1)', order_index = 10 WHERE id = '75fef63a-e3df-44f0-a06f-58e498914db1';
UPDATE course_videos SET unit = 'Unit 2: Differentiation Foundations Practice', subtitle = NULL, title = 'Lesson 12: Definition of Derivative: Limit Form (Part 2)', order_index = 11 WHERE id = 'baed945c-f559-4193-a029-db02a4031bb6';
UPDATE course_videos SET unit = 'Unit 2: Differentiation Foundations Practice', subtitle = NULL, title = 'Lesson 13: Definition of Derivative: Limit Form (Part 3)', order_index = 12 WHERE id = '04ece927-7a0a-4810-8ab3-fec65fd3d7a7';
UPDATE course_videos SET unit = 'Unit 2: Differentiation Foundations Practice', subtitle = NULL, title = 'Lesson 14: Basic Differentiation: Product and Quotient Rules', order_index = 13 WHERE id = '2dc92d71-d0d3-4e8b-80c7-3dc479f9d5b4';
UPDATE course_videos SET unit = 'Unit 2: Differentiation Foundations Practice', subtitle = NULL, title = 'Lesson 15: Mastery of the Chain Rule', order_index = 14 WHERE id = '8f36a094-4a0e-4a93-b32c-421ca962db7f';

-- ======= Unit 3: Advanced Derivatives Practice (Lessons 16-19) =======
UPDATE course_videos SET unit = 'Unit 3: Advanced Derivatives Practice', subtitle = NULL, title = 'Lesson 16: Implicit Differentiation Techniques', order_index = 15 WHERE id = 'e024de93-6ca5-4931-80f6-4edc6f3836b8';
UPDATE course_videos SET unit = 'Unit 3: Advanced Derivatives Practice', subtitle = NULL, title = 'Lesson 17: Higher-Order Derivatives: Calculating the Second Derivative', order_index = 16 WHERE id = 'ce92436c-550d-4b74-b8f7-9f7d7893b1c9';
UPDATE course_videos SET unit = 'Unit 3: Advanced Derivatives Practice', subtitle = NULL, title = 'Lesson 18: Practice - Chain Rule & Product Rule', order_index = 17 WHERE id = 'cbfdfb07-e610-42f2-a560-2c3dd55c7a16';
UPDATE course_videos SET unit = 'Unit 3: Advanced Derivatives Practice', subtitle = NULL, title = 'Lesson 19: Practice - Implicit Differentiation & Arcsin', order_index = 18 WHERE id = '3df0d6eb-2e4c-4668-a974-8d8f8d3a2d81';

-- ======= Unit 4: Contextual Applications Practice (Lessons 20-21) =======
UPDATE course_videos SET unit = 'Unit 4: Contextual Applications Practice', subtitle = NULL, title = 'Lesson 20: Practice - Related Rates: Cones & Spheres', order_index = 19 WHERE id = '7afc82e6-5847-460c-bb7a-cc007636fc34';
UPDATE course_videos SET unit = 'Unit 4: Contextual Applications Practice', subtitle = NULL, title = 'Lesson 21: Practice - Analyzing Particle Motion Graphs', order_index = 20 WHERE id = '981141a8-03a1-48a6-bcec-fac61dcd15ee';

-- ======= Unit 5: Analytical Applications Practice (Lessons 22-23) =======
UPDATE course_videos SET unit = 'Unit 5: Analytical Applications Practice', subtitle = NULL, title = 'Lesson 22: Practice - Extrema, Concavity & Linear Approx', order_index = 21 WHERE id = '377b8cc6-43ba-4dfe-a381-f753fc91f9d0';
UPDATE course_videos SET unit = 'Unit 5: Analytical Applications Practice', subtitle = NULL, title = 'Lesson 23: Core Derivative Rules & L''Hopital''s Rule', order_index = 22 WHERE id = '92eb0684-31fd-4886-9382-f506cbb55336';

-- ======= Unit 6: Unit 9 & 10 Interactive Labs (Lessons 24-28) =======
UPDATE course_videos SET unit = 'Unit 6: Unit 9 & 10 Interactive Labs', subtitle = NULL, title = 'Lesson 24: Derivatives of Inverse Trigonometric Functions', order_index = 23 WHERE id = '9996769e-45c0-4c10-8b97-b48d9ede2071';
UPDATE course_videos SET unit = 'Unit 6: Unit 9 & 10 Interactive Labs', subtitle = NULL, title = 'Lesson 25: Derivative Formulas for General Inverse Functions', order_index = 24 WHERE id = 'db81927c-1f54-4f5b-b2a6-bb7be7aef316';
UPDATE course_videos SET unit = 'Unit 6: Unit 9 & 10 Interactive Labs', subtitle = NULL, title = 'Lesson 26: Numerical Examples of Inverse Function Derivatives', order_index = 25 WHERE id = '3c4111a3-6e84-421b-9cea-ebe8cfd12125';
UPDATE course_videos SET unit = 'Unit 6: Unit 9 & 10 Interactive Labs', subtitle = NULL, title = 'Lesson 27: Geometric Meaning: Comparing Slopes of Tangent Lines', order_index = 26 WHERE id = 'f1946ae3-22a4-4732-8e21-eafafe9eeaa4';
UPDATE course_videos SET unit = 'Unit 6: Unit 9 & 10 Interactive Labs', subtitle = NULL, title = 'Lesson 28: Analyzing Graphs: Horizontal Tangents and Non-Differentiable Points', order_index = 27 WHERE id = '080845ab-36eb-47b2-9ac8-f809eb1f2a51';
