# AP Calculus CED Curriculum and Question Taxonomy

## Purpose

This project uses the July 2026 College Board **AP Calculus AB and BC Course and Exam Description (CED)** as the canonical curriculum structure for AP Calculus.

The database hierarchy is:

`Framework → Course → Unit → Topic → Learning Objective`

- AP Calculus AB maps to Units 1–8 and excludes the six BC-only topics embedded in Units 6–8.
- AP Calculus BC maps to Units 1–10 and includes all 111 CED topics.
- Topics carry one CED Big Idea code: `CHA`, `LIM`, or `FUN`.
- Mathematical Practice and Practice Skill codes are stored separately because a single problem can assess multiple skills.

The core rule is simple: **content must reference canonical IDs, not free-text copies of unit names, topic names, or skill names.** This prevents spelling variants and duplicate tags from fragmenting the data.

## What belongs in the question record

Every production question should have these required fields:

| Field | Rule |
| --- | --- |
| `primary_topic_id` | Foreign key to one canonical CED topic. This determines the primary Unit and Big Idea. |
| `course_scope` | Controlled value: `AB`, `BC`, or `BOTH`. Do not infer this from a typed label. |
| `question_type` | Controlled value such as `mcq_single`, `mcq_multi`, or `frq`. |
| `difficulty` | O2I editorial level: `easy`, `medium`, or `hard`. This is not a College Board label. |
| `status` | Workflow value: `draft`, `review`, `approved`, or `retired`. Only approved questions are served to students. |
| `answer_key` | Structured correct answer data, not presentation text. |
| `solution` | Reviewed solution/explanation. |
| `version` | Incremented whenever the stem, options, answer, or solution changes. |
| `source_type` | `original`, `licensed`, or another approved provenance value. |
| `reviewed_by` | User ID of the reviewer who approved the item. |

Useful optional relations:

- secondary CED topics through a `question_topics` join table;
- one or more CED Learning Objectives;
- one or more CED Practice Skills (`1.C`, `2.B`, `3.D`, etc.);
- controlled misconception codes attached to distractor options;
- representation types such as analytical, graphical, numerical, or verbal;
- calculator policy and contextual/non-contextual classification.

Do not duplicate fields that can be derived from the primary topic. Unit, Unit title, Topic title, Big Idea, and BC-only status already live in the curriculum tables.

## Difficulty: keep editorial and empirical values separate

`easy / medium / hard` is an O2I product decision, not part of the CED. Keep two different concepts:

1. **Editorial difficulty** — assigned during authoring and review.
2. **Empirical difficulty** — calculated later from student performance, for example percent correct, median response time, and discrimination.

The current time expectations—easy 3 minutes, medium 5 minutes, hard 10 minutes—belong in an O2I practice policy table. They should not be encoded into CED topics and should be configurable without editing questions.

## Recommended production tables

The next database migration should add:

- `questions`: stable identity, workflow state, primary CED topic, course scope, type, and editorial difficulty;
- `question_versions`: immutable stem, solution, source, author, and review history;
- `question_options`: option order, content, correctness, and distractor identity;
- `question_topics`: optional secondary-topic links;
- `question_practice_skills`: many-to-many CED Practice Skill links;
- `misconceptions`: controlled misconception catalog;
- `option_misconceptions`: maps each wrong option to the misconception it diagnoses;
- `practice_sessions`: one generated quiz or practice set;
- `question_attempts`: submitted answer, correctness, elapsed time, and scoring result;
- `attempt_events`: selection/deselection trail and timing events;
- `learner_skill_state`: per-student mastery estimate by canonical CED topic.

This design preserves the full wrong-answer path required by the adaptive engine. A final incorrect answer is not enough: option changes, time spent, repeated misconceptions, and later corrections should all influence future selection.

## Current implementation boundary

The curriculum framework, Units, Topics, Mathematical Practices, and Practice Skills are now in the database. The question-bank tables above are a design contract for the next migration; they are not yet production tables.

`curriculum_learning_objectives` exists but is intentionally empty until the objective statements are extracted and reviewed topic by topic. That avoids silently publishing incorrectly paired objective codes.
