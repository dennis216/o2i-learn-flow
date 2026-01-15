-- Update transcripts for all 20 AP Calculus lessons
UPDATE course_videos SET transcript = '[{"s": 4, "t": "Substitute x=2 into the equation to find the limit directly."}, {"s": 42, "t": "When x approaches infinity, compare the degrees."}, {"s": 112, "t": "For 0/0 forms, factor the polynomial."}]'::jsonb WHERE video_url LIKE '%B-LfTZgaGnM%';

UPDATE course_videos SET transcript = '[{"s": 0, "t": "Review sin(x)/x as x approaches 0 equals 1."}, {"s": 18, "t": "Adjust denominator to match 5x."}, {"s": 105, "t": "Final result is 2/3."}]'::jsonb WHERE video_url LIKE '%FLlA0VzZsLY%';

UPDATE course_videos SET transcript = '[{"s": 22, "t": "Squeeze Theorem: bound function between -x and x."}, {"s": 89, "t": "As x goes to 0, middle function is squeezed to 0."}]'::jsonb WHERE video_url LIKE '%LZzD5hkCXnM%';

UPDATE course_videos SET transcript = '[{"s": 12, "t": "Differentiability requires continuity and matching slopes."}, {"s": 68, "t": "Set pieces equal for continuity; set derivatives equal for slopes."}]'::jsonb WHERE video_url LIKE '%tqCv2EWp0VA%';

UPDATE course_videos SET transcript = '[{"s": 15, "t": "Removable discontinuity (hole) vs jump discontinuity."}]'::jsonb WHERE video_url LIKE '%40DGcQ46MYE%';

UPDATE course_videos SET transcript = '[{"s": 15, "t": "Check left/right limits for piecewise functions."}]'::jsonb WHERE video_url LIKE '%9lZrqEVaSbA%';

UPDATE course_videos SET transcript = '[{"s": 20, "t": "IVT: continuous function hits every value between f(a) and f(b)."}]'::jsonb WHERE video_url LIKE '%HAeLcXq_41g%';

UPDATE course_videos SET transcript = '[{"s": 18, "t": "Limit existence vs function value continuity."}]'::jsonb WHERE video_url LIKE '%sMuju8LLguM%';

UPDATE course_videos SET transcript = '[{"s": 2, "t": "Limit definition of derivative: f(x+h)-f(x) over h."}, {"s": 104, "t": "Derivative of sin is cos, eval at pi/3 is 1/2."}]'::jsonb WHERE video_url LIKE '%hL3x4458LsE%';

UPDATE course_videos SET transcript = '[{"s": 1, "t": "Power rule for x^(1/3) at x=8."}, {"s": 132, "t": "Result is 1/12."}]'::jsonb WHERE video_url LIKE '%0LfmOhKlB-k%';

UPDATE course_videos SET transcript = '[{"s": 22, "t": "Recognize derivative of x^6 at x=1."}, {"s": 79, "t": "Result is 6."}]'::jsonb WHERE video_url LIKE '%rb_eOOl5NHY%';

UPDATE course_videos SET transcript = '[{"s": 1, "t": "Product and Quotient rules application."}, {"s": 138, "t": "Apply low d-high minus high d-low."}]'::jsonb WHERE video_url LIKE '%4nVJ499q828%';

UPDATE course_videos SET transcript = '[{"s": 12, "t": "Chain rule: derivative of outside times derivative of inside."}]'::jsonb WHERE video_url LIKE '%YXq93S1ynIU%';

UPDATE course_videos SET transcript = '[{"s": 15, "t": "Implicit differentiation: dy/dx for y terms."}]'::jsonb WHERE video_url LIKE '%TFaHAQmTtao%';

UPDATE course_videos SET transcript = '[{"s": 1, "t": "Second derivatives: differentiate twice."}]'::jsonb WHERE video_url LIKE '%64_PkpXvW9o%';

UPDATE course_videos SET transcript = '[{"s": 1, "t": "Deriving sin inverse x formula."}, {"s": 227, "t": "Result: 1/sqrt(1-x^2)."}]'::jsonb WHERE video_url LIKE '%CpRE8PusBVU%';

UPDATE course_videos SET transcript = '[{"s": 10, "t": "Inverse derivative formula: 1/f prime of f inverse."}]'::jsonb WHERE video_url LIKE '%mxDDwsPQan8%';

UPDATE course_videos SET transcript = '[{"s": 13, "t": "Numerical example of inverse derivatives."}]'::jsonb WHERE video_url LIKE '%RrADtVHziT8%';

UPDATE course_videos SET transcript = '[{"s": 35, "t": "Steepest positive slope is at point A."}]'::jsonb WHERE video_url LIKE '%UHJ3GrTuaII%';

UPDATE course_videos SET transcript = '[{"s": 2, "t": "Slope is zero at horizontal tangents (x=2)."}]'::jsonb WHERE video_url LIKE '%3u7xNpvwbFE%';