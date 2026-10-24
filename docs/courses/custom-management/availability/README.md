# Lesson availability

Administrators choose **AB / BC shared** or **BC only**. There is no AB-only option. AB editors offer sharing; BC editors also offer an independent BC draft. Existing unshared AB content is retained until an administrator explicitly shares it. New content must first be saved as a draft.

Sharing previews both courses and requires a source choice if both already have content. Videos, games and publication status are shared; lesson titles and outline order remain course-specific. Switching a shared BC lesson to BC only creates an unpublished independent copy, including video metadata, and leaves AB's existing content intact. Canonical BC-only Topics cannot be shared with AB. The database also rejects adding BC-only Topics to content still used by AB, or restoring BC-only placeholders to AB.

The bounded release repairs the canonical AB course's scope and archives only empty, entirely BC-only AB outline entries. Prepared or mixed entries stop the transaction for inspection. No lesson content is automatically shared, published or deleted.

Regenerate with `node scripts/generate-course-availability-deploy.mjs`. Run `00_preflight_readonly.sql`, then `10_deploy.sql`, then `20_verify_readonly.sql`. The deployment checks the exact prior linker implementation and migration ledger, runs atomically, and verifies that the lesson/video/binding fingerprint is unchanged. Do not replay historical course migrations or run a broad database push. Archived out-of-scope placeholders intentionally remain as historical records; the original release's all-mappings scope check is superseded by this release's active-entry check.

Validation:

- `npm run test:courses`
- `O2I_COURSE_OUTLINE_DB=1 npm run test:courses:db`
- `npm run test:courses:browser`
- `O2I_COURSE_AVAILABILITY_BROWSER=1 O2I_OUTLINE_STAGE=3 node scripts/course-custom-browser.test.mjs`
- `npx tsc --noEmit -p tsconfig.app.json`
- `npx eslint src/components/admin/CourseContentManagement.tsx`
- `npm run build`

Browser screenshots use synthetic local fixtures and are not evidence of frontend publication. See [release evidence](2026-10-24-release.md) for the live database checks and remaining publication step.
