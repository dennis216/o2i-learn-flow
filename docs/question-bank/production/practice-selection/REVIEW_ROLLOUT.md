# Review account history rollout

Review shows the latest 10 account submissions. “Only incorrect” queries the latest 10 wrong answers across the full history, filtering before the limit. Each row links to the original session and saved question version, including unfinished sessions.

## Deploy

1. Run `30_review_deploy.sql` as one transaction. It requires only the recorded base student-practice migration `20261021000000`; random selection and Topic adaptation are not prerequisites. Do not replay old migrations or run a whole-database push.
2. Run `31_review_verify.sql`; require `all_checks_pass = true`. Both history RPC signatures must be authenticated-only; attempts and sessions must remain read-only for students. The deployment transaction rejects replay and records the exact migration hash.
3. Deploy the frontend after the RPC extension. Existing no-argument Practice callers remain compatible.
4. With two real accounts, check latest answers and older wrong answers, a link to an unfinished session's saved explanation, refresh, logout/account switch, and rejection of the other account's session link. Local tests do not constitute production acceptance.

## Validation

Local acceptance on 2026-10-20: 7/7 student-practice unit tests and all 22 isolated integration checks passed. The integration run used disposable authenticated accounts and synthetic published questions, actual PostgreSQL/Auth/REST, and Chrome. It verified Review fields, older wrong answers, exact saved-question solutions, error/retry/empty states, filter races, cross-tab account switching with a delayed old-account response, and mobile layout. Test containers were removed. Build, TypeScript, and scoped ESLint checks passed. Desktop/mobile screenshots and the local report are under `node_modules/.cache/student-practice/` (ignored).

These results do not claim real-content production acceptance or deployment.


- `npm run test:student-practice`
- `npm run test:student-practice:integration` (disposable local Docker Auth/REST/PostgreSQL and browser; never production). If Playwright is supplied by the desktop runtime, set `O2I_PLAYWRIGHT_MODULE` to its `playwright/index.mjs` path.
- `npm run build`
- `npx tsc --noEmit -p tsconfig.app.json`
- `npx eslint src/pages/Review.tsx src/pages/Quiz.tsx src/lib/studentPractice.ts src/integrations/supabase/types.ts`

Regenerate deploy and verification SQL with `node scripts/generate-practice-selection-deploy.mjs`. The source of truth is `supabase/migrations/20261025000000_question_practice_review_history.sql`.

No deployment is performed by these local validation commands. If the frontend ships before the RPC extension, the wrong-answer filter will show a retryable loading error.
