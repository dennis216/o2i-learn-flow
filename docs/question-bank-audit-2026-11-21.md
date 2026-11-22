# Question bank review — 2026-11-21 (#57)

The account owner authorized a complete review and publication of sound questions, plus withdrawal of confirmed errors. Review used the normal authenticated Admin interface on Dennis; preview, test and production share the question database. No migrations, schema/settings changes, student responses or personal data were written/exported.

## Scope and method

Opened all 474 listed versions: 309 saved drafts and 165 published versions, representing 473 distinct question IDs. One question has both a published version and a working revision. Read every stem, choice, answer key, solution and displayed metadata; independently checked calculations and graph interpretations. Inspected all 11 distinct graph assets. All previews had four choices, exactly one stored correct choice, populated metadata, no KaTeX errors and no horizontal preview overflow. Difficulty is a qualitative editorial judgment, not a psychometric calibration. Review does not establish source licensing.

Raw question content and authenticated account details are deliberately excluded from this repository. This report contains identifiers and review findings only. Publication requires the server's fresh metadata/fingerprint checks and explicit review confirmation; it is performed in batches of at most 20 with readback. A stored A key is not itself an error: student delivery shuffles options.

## Published versions withdrawn pending correction

| ID | Finding / required correction |
| --- | --- |
| 500APCALC-CH02-Q058 | Difference quotient increments the logarithm argument by h, not 2h. Correct answer is B, 1/(2x), rather than A, 1/x. |
| 500APCALC-CH02-Q059 | At theta = pi the polar curve has dx/dtheta = 1 and dy/dtheta = 0. Normal is vertical (D), not slope -1 (A). |
| AP500-9781260474978-CH01-Q028 | Numerator factors as (2t+3)(2t-7). Pole at 1.5 and removable hole filled continuously at 3.5. Correct intervals I and III are absent from choices. |
| 500APCALC-CH02-Q095 | Key correctly identifies equal derivatives, but explanation then treats tangent-line equations as derivative values and contradicts itself. |
| 500APCALC-CH02-Q092 | Differentiability and two zero values alone do not justify replacing a quotient limit with the derivative quotient. Add the hypotheses of L'Hopital's rule. |
| 500APCALC-CH02-Q055 | Implicit curve has two branches through the point with slopes +1 and -1. Specify a branch or ask about nonunique tangency; 0/0 alone does not prove a derivative is undefined. |
| 500APCALC-CH02-Q084 | Stem prints f^1 rather than the requested derivative f'. |
| 500APCALC-CH02-Q072 | First-derivative difference quotient is incorrectly labeled f''. |
| 500APCALC-CH02-Q093 | Clarify whether linear means nonconstant. Otherwise the second derivative can also be zero, which the answer/explanation exclude. |
| AP500-9781260474978-CH01-Q029 | Horizontal-asymptote statements incorrectly use x = ... instead of y = ...; no stated horizontal line is correct. |
| AP500-9781260474978-CH01-Q024 | Explanation repeatedly drops the square in denominator x^2 - 7x + 12, invalidating its displayed equalities. |
| AP500-9781260474978-CH01-Q019 | Explanation reports a two-sided positive infinite limit at a pole; left limit is negative infinity and right limit positive infinity. Interval key is correct. |
| AP500-9781260474978-CH01-Q030 | Missing function name and mismatched t/x variables in stem and explanation. Restore consistent f(x). |

Unpublishing preserves approved versions and all history. These versions must not be selected for republication without correction and fresh review.

## Original drafts held back

| ID | Finding / required correction |
| --- | --- |
| 500APCALC-CH02-Q083 | Complete the question prompt and distinguish MVT hypotheses from Darboux's theorem; a derivative need not be continuous for Darboux. |
| 500APCALC-CH02-Q057 | Derivative of a base-5 exponential requires ln(5); ambiguous log(5) appears in key and solution. |
| 500APCALC-CH02-Q081 | Parenthesize ln(4) multiplied by 1/x in the intermediate derivative to avoid a different logarithm argument. |
| 500APCALC-CH02-Q054 | Intermediate implicit derivative omits y squared; prose substitutes x = 4 while the problem and arithmetic use x = 3. |
| AP500-9781260474978-CH02-Q051 | Explanation names the chain rule while applying the product rule. |
| AP500-9781260474978-CH01-Q032 | Function name missing from the stem. |
| AP500-9781260474978-CH01-Q035 | Explanation compares the same right-hand limit with itself; show left negative infinity and right positive infinity. |
| AP500-9781260474978-CH01-Q037 | Explanation reverses the signs of the one-sided limits at -6: left positive infinity, right negative infinity. |
| AP500-9781260474978-CH01-Q044 | Numerator near 5 is positive; left limit positive infinity, right negative infinity. Explanation reverses signs. |
| AP500-9781260474978-CH01-Q041 | Limit variable c conflicts with the expression's x; use consistent x and one-sided notation. |

## Frontend defect found during review

Never-published drafts return null for `is_current` because there is no current version. The strict boolean schema rejected otherwise valid statistics for every such draft. The frontend now normalizes this one nullable flag to false, retaining all other shape/count validation. Regression tests cover null, true, false and invalid payloads. No database change is required.

## Verified operation result

Normal Admin publication completed for 299 original draft versions in 15 batches (14 × 20, then 19). Each batch returned “published and verified the current versions.” One slow batch finished after the initial browser wait timed out; its success state was checked before proceeding, with no repeat submission. One draft updated an existing published question, so 298 newly available questions were added.

Final fresh Admin readback: **450 published questions and 23 unpublished items**. The complete publication plan contains exactly the 10 held original drafts and the 13 withdrawn versions listed above, with no unexpected remaining item. No question was deleted, no student answer was submitted, and no production database structure/settings were changed. The shared database makes these publication changes available to the main website without a second upload.

Frontend validation: production build, TypeScript and changed-file ESLint passed; question-bank suite 92/92, student-practice suite 31/31 and dedicated statistics regression 4/4 passed. All 28 checked text-token pairs pass 4.5:1. Browser viewport checks at 1440×900 and 390×844 covered English/Chinese, light/dark appearance; no horizontal page overflow and both community badges fit on the phone first screen. These are browser viewport checks, not physical-device certification.
