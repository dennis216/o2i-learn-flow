-- Reset all AP Calculus Practice Questions videos to strict Lesson 1-29 mapping

-- Unit 1: Limits & Continuity Practice (Lessons 1-10)
UPDATE course_videos SET title = 'Lesson 1: Intro to Limits & Motion', unit = 'Unit 1: Limits & Continuity Practice', order_index = 0 WHERE id = '7aed39d1-c404-4b4f-9371-e615d0958188';
UPDATE course_videos SET title = 'Lesson 2: Limit Properties & Existence', unit = 'Unit 1: Limits & Continuity Practice', order_index = 1 WHERE id = 'f328e7c2-1746-4f94-be43-e1e8c646f4d8';
UPDATE course_videos SET title = 'Lesson 3: Basic Calculations of Limits', unit = 'Unit 1: Limits & Continuity Practice', order_index = 2 WHERE id = '3f2458b9-f217-4e86-b7eb-6a2ea19f5ee4';
UPDATE course_videos SET title = 'Lesson 4: Graphical Understanding of Limits', unit = 'Unit 1: Limits & Continuity Practice', order_index = 3 WHERE id = 'b1db7271-99c1-47b0-857b-0024e19230e1';
UPDATE course_videos SET title = 'Lesson 5: Limits of Trigonometric Functions (sin x / x)', unit = 'Unit 1: Limits & Continuity Practice', order_index = 4 WHERE id = '50d1b8d7-0bed-42dd-a9b7-b3a03c946739';
UPDATE course_videos SET title = 'Lesson 6: Applying the Squeeze Theorem', unit = 'Unit 1: Limits & Continuity Practice', order_index = 5 WHERE id = '706bfd5d-c4e2-4c75-b03f-d610a530938d';
UPDATE course_videos SET title = 'Lesson 7: Determining Continuity & Differentiability', unit = 'Unit 1: Limits & Continuity Practice', order_index = 6 WHERE id = '3a169706-ce91-4e29-a0b1-c0cec3c3defe';
UPDATE course_videos SET title = 'Lesson 8: Types of Discontinuity (Holes & Asymptotes)', unit = 'Unit 1: Limits & Continuity Practice', order_index = 7 WHERE id = '0ae633d6-378f-4ae5-a3d8-ecfeb18a63b2';
UPDATE course_videos SET title = 'Lesson 9: Limit Analysis of Piecewise Functions', unit = 'Unit 1: Limits & Continuity Practice', order_index = 8 WHERE id = '5753e7b7-651c-4683-83a6-f57420480f40';
UPDATE course_videos SET title = 'Lesson 10: Intermediate Value Theorem (IVT)', unit = 'Unit 1: Limits & Continuity Practice', order_index = 9 WHERE id = 'b8927cd1-1f73-4171-aa0b-be1c1ba451b7';

-- Unit 2: Differentiation Foundations (Lessons 11-15)
UPDATE course_videos SET title = 'Lesson 11: Definition of Derivative: Limit Form (Part 1)', unit = 'Unit 2: Differentiation Foundations', order_index = 10 WHERE id = '75fef63a-e3df-44f0-a06f-58e498914db1';
UPDATE course_videos SET title = 'Lesson 12: Definition of Derivative: Limit Form (Part 2)', unit = 'Unit 2: Differentiation Foundations', order_index = 11 WHERE id = 'baed945c-f559-4193-a029-db02a4031bb6';
UPDATE course_videos SET title = 'Lesson 13: Definition of Derivative: Limit Form (Part 3)', unit = 'Unit 2: Differentiation Foundations', order_index = 12 WHERE id = '04ece927-7a0a-4810-8ab3-fec65fd3d7a7';
UPDATE course_videos SET title = 'Lesson 14: Basic Rules: Product & Quotient Rules', unit = 'Unit 2: Differentiation Foundations', order_index = 13 WHERE id = '2dc92d71-d0d3-4e8b-80c7-3dc479f9d5b4';
UPDATE course_videos SET title = 'Lesson 15: Mastery of the Chain Rule', unit = 'Unit 2: Differentiation Foundations', order_index = 14 WHERE id = '8f36a094-4a0e-4a93-b32c-421ca962db7f';

-- Unit 3: Advanced Derivatives & Implicit (Lessons 16-19)
UPDATE course_videos SET title = 'Lesson 16: Implicit Differentiation Techniques', unit = 'Unit 3: Advanced Derivatives & Implicit', order_index = 15 WHERE id = 'e024de93-6ca5-4931-80f6-4edc6f3836b8';
UPDATE course_videos SET title = 'Lesson 17: Higher-Order Derivatives (f''''(x))', unit = 'Unit 3: Advanced Derivatives & Implicit', order_index = 16 WHERE id = 'ce92436c-550d-4b74-b8f7-9f7d7893b1c9';
UPDATE course_videos SET title = 'Lesson 18: Practice - Chain & Product Rule', unit = 'Unit 3: Advanced Derivatives & Implicit', order_index = 17 WHERE id = 'cbfdfb07-e610-42f2-a560-2c3dd55c7a16';
UPDATE course_videos SET title = 'Lesson 19: Practice - Implicit & Inverse Trig (Arcsin)', unit = 'Unit 3: Advanced Derivatives & Implicit', order_index = 18 WHERE id = '3df0d6eb-2e4c-4668-a974-8d8f8d3a2d81';

-- Unit 4: Contextual Applications (Related Rates) (Lessons 20-21)
UPDATE course_videos SET title = 'Lesson 20: Practice - Related Rates: Cones & Spheres', unit = 'Unit 4: Contextual Applications (Related Rates)', order_index = 19 WHERE id = '7afc82e6-5847-460c-bb7a-cc007636fc34';
UPDATE course_videos SET title = 'Lesson 21: Practice - Analyzing Particle Motion Graphs', unit = 'Unit 4: Contextual Applications (Related Rates)', order_index = 20 WHERE id = '981141a8-03a1-48a6-bcec-fac61dcd15ee';

-- Unit 5: Analytical Applications (Lessons 22-23)
UPDATE course_videos SET title = 'Lesson 22: Practice - Extrema, Concavity & Linear Approx', unit = 'Unit 5: Analytical Applications', order_index = 21 WHERE id = '377b8cc6-43ba-4dfe-a381-f753fc91f9d0';
UPDATE course_videos SET title = 'Lesson 23: Core Derivative Rules & L''Hopital''s Rule', unit = 'Unit 5: Analytical Applications', order_index = 22 WHERE id = '92eb0684-31fd-4886-9382-f506cbb55336';

-- Unit 6: Inverse Functions & Special Derivatives (Lessons 24-29)
UPDATE course_videos SET title = 'Lesson 24: Derivatives of Inverse Trig Functions', unit = 'Unit 6: Inverse Functions & Special Derivatives', order_index = 23 WHERE id = '9996769e-45c0-4c10-8b97-b48d9ede2071';
UPDATE course_videos SET title = 'Lesson 25: General Inverse Function Derivative Formulas', unit = 'Unit 6: Inverse Functions & Special Derivatives', order_index = 24 WHERE id = 'db81927c-1f54-4f5b-b2a6-bb7be7aef316';
UPDATE course_videos SET title = 'Lesson 26: Numerical Examples of Inverse Derivatives', unit = 'Unit 6: Inverse Functions & Special Derivatives', order_index = 25 WHERE id = '3c4111a3-6e84-421b-9cea-ebe8cfd12125';
UPDATE course_videos SET title = 'Lesson 27: Geometric Meaning: Comparing Tangent Slopes', unit = 'Unit 6: Inverse Functions & Special Derivatives', order_index = 26 WHERE id = 'f1946ae3-22a4-4732-8e21-eafafe9eeaa4';
UPDATE course_videos SET title = 'Lesson 28: Analyzing Horizontal Tangents', unit = 'Unit 6: Inverse Functions & Special Derivatives', order_index = 27 WHERE id = '080845ab-36eb-47b2-9ac8-f809eb1f2a51';

-- Lesson 29 placeholder: insert new video record for Non-Differentiable Points Analysis
INSERT INTO course_videos (course_id, title, unit, video_url, order_index, description)
VALUES (
  'fccc7540-0c29-43be-8682-ae90ff2534cb',
  'Lesson 29: Non-Differentiable Points Analysis',
  'Unit 6: Inverse Functions & Special Derivatives',
  '',
  28,
  'Placeholder - video pending upload'
);