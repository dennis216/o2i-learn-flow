# Course content delivery

Current follow-up: [course management and shared lesson delivery](improvements/STATUS.md). The original acceptance below is historical; live checks confirmed published AB 1.1 content. The shared-lesson migration is now deployed and the incorrect AB scope has been repaired; the new frontend and real-account acceptance remain separately tracked.

Approved behavior: canonical Course → Unit → Topic, YouTube URL videos shared across Topics within a course, one self-contained HTML game per Topic, notes deferred. Draft Topic titles stay in the outline with no expandable content. Published saves take effect immediately. First real pilot: AP Calculus BC Unit 1, 2–3 Topics supplied and reviewed by the content team.

| Task | Deliverable | Status |
|---|---|---|
| 1 | Canonical associations, publication, RLS, read/save contracts | Passed: isolated DB permissions, URL tests, TypeScript |
| 2 | Course content administration | Passed: browser form fixture, URL rejection, canonical publish payload; TypeScript |
| 3 | Student outline and lazy loading | Passed: browser network assertions, unmount, deep-link refresh, phone/tablet layout; TypeScript |
| 4 | Topic practice with course scope | Passed: real SQL selector/grading/isolation and browser course→quiz→course; requires adaptation-v2 prerequisite |
| 5 | Single-file HTML game upload and isolation | Passed: storage RLS, file boundary tests, admin upload widget, interactive iframe isolation and deferred download |
| 6 | Prototype retirement and legacy links | Passed: Learn/Lesson redirects, legacy video/practice mapping, TypeScript and scoped SQL/browser regression |
| 7 | Release package and real pilot acceptance | Technical package, local acceptance and production directory repair passed; real teaching pilot pending team assets |

Production schema was deployed and the public course list/outline verified on 2026-10-21; see `PRODUCTION_ACCEPTANCE.md`. No lesson publication or real-content acceptance has occurred. Never replay the historical curriculum migration: it contains a course-video deletion. Use only the forward package in `production/`, after its readonly preflight.

Local checks: `node --experimental-strip-types --test src/lib/courseContent.test.mjs`, `node scripts/course-content-db.test.mjs` (isolated Docker container, automatically removed), and `npx tsc -p tsconfig.app.json --noEmit`.

Final evidence: see `VALIDATION.md` and `screenshots/README.md`. The user confirmed real materials are not ready. Production directory acceptance is recorded separately; no sample publication is claimed.
