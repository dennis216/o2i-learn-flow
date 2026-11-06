# Custom course outline database release — 2026-10-23

Target: Supabase project `lxoaeaewcrshjkigzyqe`. Branch: `test-work`.

The published frontend called `get_course_outline_v2` and `list_course_outline_archive`, but both RPCs were absent from the target database's PostgREST schema cache. Applied the unchanged, forward-only `10_deploy.sql` package through the Supabase Management API as one transaction. Package SHA-256: `224ac873ed1ce17ecc785183ded045e821fbc02f322bc7c4c689495e3cb9058e`.

Before deployment, both `00_preflight_readonly.sql` gates passed (`prerequisite_matches=true`, `package_absent=true`). Counts were 3 courses, 1 lesson, 1 lesson binding, and 1 video. The user chose to proceed without a backup after the automated export could not read protected tables; no backup was created.

After deployment, `20_verify_readonly.sql` reported `all_checks_pass=true` for all 26 checks. The same four counts remained 3, 1, 1, and 1. The backfill created 198 active outline entries and no archived entries. The verification SELECT needed the Management API's regular query endpoint because its read-only role cannot execute the private `course_topic_in_scope` function; the SQL itself was read-only.

Anonymous PostgREST calls to `get_course_outline_v2` returned HTTP 200 for AP Calculus AB (8 Units, 87 lesson entries) and BC (10 Units, 111 lesson entries). The legacy `get_course_outline` RPC still returned HTTP 200 for both (8 and 10 Units). An anonymous call to the admin-only `list_course_outline_archive` returned a permission error rather than the previous missing-function error, confirming the RPC is registered while access remains restricted.

The public production site was opened in a browser after deployment. Both AB and BC course cards displayed their Unit and lesson outlines without the previous RPC loading error. Screenshots: [AB](2026-10-23-ab.jpg), [BC](2026-10-23-bc.jpg). A successful migration cannot be rolled back to an exact pre-release data snapshot because this release has no backup.

On 2026-10-24, an authenticated administrator opened both course cards from Courses. Course Content loaded AB's eight Units and BC's ten Units, including Unit 1's 16 lessons in each course, without the missing-RPC error. AB lesson 1.1 opened its title/CB Topic and content editor; its existing published video and game metadata loaded. Manage videos showed AB's existing `1.1 What is Limit?` video and BC's empty course library. No edit or save was performed. Screenshots: [admin AB](2026-10-24-admin-ab.jpg), [admin BC](2026-10-24-admin-bc.jpg), [admin AB videos](2026-10-24-admin-ab-videos.jpg). The write paths (renaming, combining Topics, saving video changes, publishing) were not exercised against production.

Separate observation: the AB lesson editor displayed `Course practice scope: BC`. The course-management code reads that value from `courses.practice_course_scope`, so the live AB course record appears to be misconfigured. The earlier shared-lessons migration explicitly corrected AB from BC to AB, but the current value has drifted. This was not changed during the access repair; validate and correct the AB practice scope separately before relying on AB-specific practice selection.

Follow-up on 2026-10-24: the AB scope and empty BC-only placeholders were repaired in the [lesson availability release](../availability/2026-10-24-release.md). That release records the deployed database checks and the separate, pending frontend publication step.
