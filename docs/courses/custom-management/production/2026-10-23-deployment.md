# Custom course outline database release — 2026-10-23

Target: Supabase project `lxoaeaewcrshjkigzyqe`. Branch: `test-work`.

The published frontend called `get_course_outline_v2` and `list_course_outline_archive`, but both RPCs were absent from the target database's PostgREST schema cache. Applied the unchanged, forward-only `10_deploy.sql` package through the Supabase Management API as one transaction. Package SHA-256: `224ac873ed1ce17ecc785183ded045e821fbc02f322bc7c4c689495e3cb9058e`.

Before deployment, both `00_preflight_readonly.sql` gates passed (`prerequisite_matches=true`, `package_absent=true`). Counts were 3 courses, 1 lesson, 1 lesson binding, and 1 video. The user chose to proceed without a backup after the automated export could not read protected tables; no backup was created.

After deployment, `20_verify_readonly.sql` reported `all_checks_pass=true` for all 26 checks. The same four counts remained 3, 1, 1, and 1. The backfill created 198 active outline entries and no archived entries. The verification SELECT needed the Management API's regular query endpoint because its read-only role cannot execute the private `course_topic_in_scope` function; the SQL itself was read-only.

Anonymous PostgREST calls to `get_course_outline_v2` returned HTTP 200 for AP Calculus AB (8 Units, 87 lesson entries) and BC (10 Units, 111 lesson entries). The legacy `get_course_outline` RPC still returned HTTP 200 for both (8 and 10 Units). An anonymous call to the admin-only `list_course_outline_archive` returned a permission error rather than the previous missing-function error, confirming the RPC is registered while access remains restricted.

The public production site was opened in a browser after deployment. Both AB and BC course cards displayed their Unit and lesson outlines without the previous RPC loading error. Screenshots: [AB](2026-10-23-ab.jpg), [BC](2026-10-23-bc.jpg). Real administrator UI operations remain unverified because no administrator session was available. A successful migration cannot be rolled back to an exact pre-release data snapshot because this release has no backup.
