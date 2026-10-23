# Course custom management release

This package applies the four `20261101` course migrations on top of the exact `20261031000000_course_shared_lessons` release. It is forward-only; use one migration owner and a database backup before applying it. Do not run a broad `db push` or replay earlier curriculum migrations.

1. On the target database, run `00_preflight_readonly.sql`. Both Boolean gates must be `true`. Save the course, lesson, binding, and video counts. A false gate means stop and inspect schema or migration drift.
2. Run `10_deploy.sql` once. It checks the prerequisite again under a migration-ledger lock and applies all four migrations in one transaction. A failed statement rolls back the package.
3. Run `20_verify_readonly.sql`. `all_checks_pass` must be `true`; compare the four original counts with preflight. Keep the JSON check results and migration ledger as release evidence.
4. Publish the matching frontend build only after the database checks pass. Verify with real administrator and student accounts: Courses → course → outline; rename/merge and restore; video editing and referenced-video deletion guard; AB and BC remain independent unless sharing is explicitly chosen; student desktop/mobile merged title and CB labels; each Topic practice route and return; old Topic/video links. Publish a test lesson, then withdraw it and confirm student access closes.

Regenerate the SQL from checked-in migrations with `node scripts/generate-course-custom-deploy.mjs`. The isolated PostgreSQL suite executes this exact package, checks 26 final conditions, and confirms a second deploy is refused. Local browser tests use synthetic data and cannot replace real-account acceptance.
