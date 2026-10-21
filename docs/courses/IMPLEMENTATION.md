# Course content delivery

Approved behavior: canonical Course → Unit → Topic, YouTube URL videos shared across Topics within a course, one self-contained HTML game per Topic, notes deferred. Draft Topic titles stay in the outline with no expandable content. Published saves take effect immediately. First real pilot: AP Calculus BC Unit 1, 2–3 Topics supplied and reviewed by the content team.

| Task | Deliverable | Status |
|---|---|---|
| 1 | Canonical associations, publication, RLS, read/save contracts | Passed: isolated DB permissions, URL tests, TypeScript |
| 2 | Course content administration | Passed: browser form fixture, URL rejection, canonical publish payload; TypeScript |
| 3 | Student outline and lazy loading | Pending |
| 4 | Topic practice with course scope | Pending |
| 5 | Single-file HTML game upload and isolation | Pending |
| 6 | Prototype retirement and legacy links | Pending |
| 7 | Release package and real pilot acceptance | Pending |

No production migration, publication or real-content acceptance has occurred. Never replay the historical curriculum migration: it contains a course-video deletion. Use only the forward package in `production/`, after its readonly preflight.

Local checks: `node --experimental-strip-types --test src/lib/courseContent.test.mjs`, `node scripts/course-content-db.test.mjs` (isolated Docker container, automatically removed), and `npx tsc -p tsconfig.app.json --noEmit`.
