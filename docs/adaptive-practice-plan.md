# O2I learning loop: implementation plan

Status: interactive local prototype. No live database migration or production deployment has been made.

## Prototype now implemented

- Focused navigation: course library, review center and Quick Practice.
- Multi-subject content contracts with an AP Calculus pilot and Physics/Chemistry slots.
- Simulated lesson player ready to accept uploaded video sources.
- Timestamped long-pause, confirmed review and Ask-for-help signals mapped to skills.
- Review materials assembled from educator-authored skill cards rather than runtime AI.
- Post-lesson and stand-alone adaptive quizzes driven by the same pure selector.
- Active-time tracking with easy/medium/hard targets of 3/5/10 minutes.
- Full option-selection trajectory, including abandoned wrong options and their misconception tags.
- Per-question feedback, session summary and next-set flow.
- Prototype persistence in browser localStorage under `o2i-learning-prototype-v1`.

The prototype content is intentionally small and illustrative. Replacing it with uploaded videos and an educator-reviewed question bank is content work, not a rewrite of the learning loop.

## Scope

O2I is a multi-subject platform. AP Calculus AB/BC is the first content rollout;
physics and chemistry must use the same data model and selection engine. Do not
delete existing subjects or courses merely because they are not in this pilot.

The learning loop is: watch a lesson → save a review point → do a linked quiz →
see question and session feedback → receive the next practice set. Quick Practice
starts the same engine without requiring a prior video.

## What exists today

- `course_videos` contains lessons and some transcripts. The player supports
  YouTube and native video and knows the current timestamp.
- `practice_problems` has title/content/solution and optional video linkage, but
  not a validated answer, options, difficulty, skill tags or attempt history.
- `ExamPrep` and “Make more questions” call AI functions at runtime. They do not
  grade a student's answer or adapt a subsequent set.
- Existing `user_progress` tracks roadmap completion, not question attempts.

## Content and data contract for the pilot

Each reviewed question needs: stable ID and version, subject, course scope (AB,
BC, physics, chemistry, etc.), one or more skill IDs, difficulty, question type,
stem, answer key, solution, estimated time, status and source/reviewer. For MCQ,
each option has a stable ID and optional educator-reviewed misconception tag.
Free response needs a reliable rubric or manual/self-check mode; do not claim
automatic grading without one. Review snippets need skill IDs and optional
video time ranges. A transcript by itself is not a vetted study guide.

Store separately: practice session, every presented question, every submitted
choice in order, final answer, elapsed active time, correctness, question
version, and selected misconception tags. Store video review markers with
video ID, timestamp, mapped skill and event source. Use per-user RLS and a
clear retention policy. Do not use an entire chat transcript as an algorithm
input when a topic/skill event is enough.

## Selection rules (initial, testable heuristic)

1. Filter to approved questions in the requested subject and course scope.
2. Prioritize weak skills from correctness. Correct-but-slow gets a smaller
   review boost; it is never scored as an incorrect answer.
3. Retain selected wrong-option IDs and their author-defined misconception
   tags. Prioritize a different question testing the same skill; do not show
   the identical item repeatedly unless the bank is exhausted.
4. Treat “Ask AI” as a moderate review signal. Treat a long pause as a weak
   *possible* signal only when the video was foregrounded, actually paused
   (not buffering), and linked to a known skill. A student can pause for many
   non-learning reasons, so never equate a pause with lack of mastery.
5. Start with configurable targets of easy 3 min, medium 5 min, hard 10 min.
   Exceeding a target prompts review; it is not proof of unfamiliarity.
   Count active question time, excluding hidden-tab/idle time. Calibrate the
   thresholds using real pilot data and accommodations.
6. Return explicit selection reasons for debugging and educator review.

`src/lib/adaptivePractice.ts` is the initial subject-agnostic pure selector and
feedback contract. It does not create questions, measure player events, grade
free responses or save records. These require the later slices below.

## Delivery slices and acceptance criteria

### 1. Foundation (complete)

Local Git baseline, safe `.env` exclusion, product/data contract and tested
selection logic. No change to live data or existing website behavior.

### 2. Interactive framework (complete with placeholder content)

The browser flow is implemented end to end using local storage and reviewed placeholder data. It is suitable for product testing but not for real student deployment because it has no authenticated server persistence.

### 3. One complete AP Calculus lesson content pilot

Choose one lesson and map its video timestamps to reviewed skill IDs. Author
enough vetted questions at multiple difficulties with answer keys and tagged
distractors so two consecutive sets need not recycle the same items. Build a
review snippet for each skill. The team checks mathematical correctness and
rights to use the video and question content before import. Do not fabricate
missing questions via runtime AI.

### 4. Production data flow

Add versioned Supabase tables and RLS, an educator question-authoring/import
path, Quick Practice, post-lesson quiz, review-point save action, per-question
feedback, session summary, next-set selection, and attempt history. Connect
video pause and Ask AI events with clear consent and noise filtering. Existing
AI tools may stay available as optional help, but generating every set through
an API must not be the default path.

### 5. Pilot evaluation, then multi-subject expansion

Measure answer correctness, completion, repeated-item rate, signal usefulness,
question defects and whether next-set recommendations actually improve
performance. Review outcomes by skill/difficulty; adjust rules before scaling.
Add physics and chemistry through subject-specific skill maps, reviewed banks
and time targets without changing the core algorithm.

## Decisions needed before slice 2

- Which AP Calculus lesson and video is the pilot?
- Who owns question/solution review, and what sources may be reused?
- Should the first quiz be MCQ-only (recommended for trustworthy automatic
  grading), with FRQ added after a rubric/review process exists?
- Where will student data be stored and who can access it? A local prototype is
  not a substitute for per-user persisted attempts.
