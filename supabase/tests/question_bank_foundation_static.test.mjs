import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const migrationUrl = new URL(
  "../migrations/20260926000000_question_bank_foundation.sql",
  import.meta.url,
)
const migration = readFileSync(migrationUrl, "utf8")

const questionBankTables = [
  "questions",
  "question_versions",
  "question_options",
  "question_practice_skills",
  "question_topics",
  "misconceptions",
  "option_misconceptions",
  "question_course_videos",
]

test("all normalized tables are created and protected by RLS", () => {
  for (const table of questionBankTables) {
    assert.match(migration, new RegExp(`CREATE TABLE public\\.${table} \\(`))
    assert.ok(
      migration.includes(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`),
      `RLS is not enabled on ${table}`,
    )
  }
  assert.doesNotMatch(migration, /TO anon/)
})

test("core foreign keys and uniqueness constraints remain present", () => {
  for (const fragment of [
    "FOREIGN KEY (current_version_id, id)",
    "REFERENCES public.question_versions (id, question_id)",
    "UNIQUE (question_id, version_number)",
    "UNIQUE (question_version_id, option_key)",
    "UNIQUE (question_version_id, order_index)",
    "PRIMARY KEY (question_version_id, practice_skill_id)",
    "PRIMARY KEY (question_version_id, topic_id)",
    "PRIMARY KEY (option_id, misconception_id)",
    "PRIMARY KEY (question_id, course_video_id)",
    "CREATE UNIQUE INDEX question_options_one_correct_per_version",
  ]) {
    assert.ok(migration.includes(fragment), `missing constraint: ${fragment}`)
  }
})

test("question and version lifecycle enums are separated", () => {
  assert.match(
    migration,
    /CREATE TYPE public\.question_status AS ENUM \(\s*'draft',\s*'approved',\s*'retired'\s*\)/,
  )
  assert.match(
    migration,
    /CREATE TYPE public\.question_version_status AS ENUM \(\s*'draft',\s*'review',\s*'approved',\s*'superseded'\s*\)/,
  )
})

test("only one working revision and one approved version can exist", () => {
  assert.match(
    migration,
    /CREATE UNIQUE INDEX question_versions_one_working_revision[\s\S]*WHERE status IN \([\s\S]*'draft'[\s\S]*'review'/,
  )
  assert.match(
    migration,
    /CREATE UNIQUE INDEX question_versions_one_approved_version[\s\S]*WHERE status = 'approved'/,
  )
})

test("revision creation locks and clones the complete published version", () => {
  const start = migration.indexOf(
    "CREATE OR REPLACE FUNCTION public.create_question_revision",
  )
  const end = migration.indexOf(
    "CREATE OR REPLACE FUNCTION public.submit_question_version_for_review",
  )
  const body = migration.slice(start, end)

  assert.ok(start >= 0 && end > start)
  assert.match(body, /FROM public\.questions[\s\S]*FOR UPDATE;/)
  assert.match(body, /COALESCE\(max\(version_number\), 0\) \+ 1/)
  for (const table of [
    "question_versions",
    "question_options",
    "question_practice_skills",
    "question_topics",
    "option_misconceptions",
  ]) {
    assert.ok(body.includes(`INSERT INTO public.${table}`), `missing clone for ${table}`)
  }
  assert.doesNotMatch(body, /UPDATE public\.questions/)
})

test("approval targets a review version and atomically switches publication", () => {
  const start = migration.indexOf(
    "CREATE OR REPLACE FUNCTION public.approve_question_version",
  )
  const end = migration.indexOf(
    "CREATE OR REPLACE FUNCTION public.retire_question",
  )
  const body = migration.slice(start, end)

  assert.ok(start >= 0 && end > start)
  assert.match(body, /_question_id uuid,\s*_version_id uuid/)
  assert.match(body, /target_version\.status <> 'review'/)
  assert.match(body, /FROM public\.questions[\s\S]*FOR UPDATE;/)
  assert.match(body, /FROM public\.question_versions[\s\S]*FOR UPDATE;/)
  const supersede = body.indexOf("SET status = 'superseded'")
  const approve = body.indexOf("SET status = 'approved'")
  const publish = body.indexOf("current_version_id = target_version.id")
  assert.ok(supersede >= 0 && supersede < approve && approve < publish)
  assert.match(body, /reviewed_by = auth\.uid\(\)/)
  assert.match(body, /approved_at = now\(\)/)
})

test("approval still enforces MCQ, provenance, figure, and misconception integrity", () => {
  const start = migration.indexOf(
    "CREATE OR REPLACE FUNCTION public.validate_question_version_approval",
  )
  const end = migration.indexOf(
    "CREATE OR REPLACE FUNCTION public.enforce_question_lifecycle",
  )
  const body = migration.slice(start, end)

  assert.match(body, /option_count < 2 OR option_count > 6/)
  assert.match(body, /correct_count <> 1/)
  assert.match(body, /source_page IS NULL OR version_record\.source_page <= 0/)
  assert.match(body, /source_locator_verified/)
  assert.match(body, /requires_figure[\s\S]*image_url/)
  assert.match(body, /correct option cannot have a misconception mapping/)
})

test("only drafts are editable and published history is immutable", () => {
  assert.match(migration, /Only draft question-version content may be edited/)
  assert.match(migration, /Review versions are read-only/)
  assert.match(migration, /Approved versions are immutable/)
  assert.match(migration, /Superseded versions are immutable historical records/)
  assert.match(
    migration,
    /CREATE TRIGGER enforce_question_version_lifecycle_trigger\s*BEFORE INSERT OR UPDATE OR DELETE/,
  )
})

test("direct question publication-state changes are rejected when no RPC context exists", () => {
  assert.match(
    migration,
    /lifecycle_context IS DISTINCT FROM 'approve_version'\s*AND lifecycle_context IS DISTINCT FROM 'retire_question'/,
  )
  assert.match(
    migration,
    /Question publication state can only change through a controlled lifecycle function/,
  )
})

test("lifecycle RPCs restore their transaction-local guard context", () => {
  for (const functionName of [
    "create_question_revision",
    "submit_question_version_for_review",
    "return_question_version_to_draft",
    "approve_question_version",
    "retire_question",
  ]) {
    const start = migration.indexOf(
      `CREATE OR REPLACE FUNCTION public.${functionName}`,
    )
    const nextFunction = migration.indexOf("CREATE OR REPLACE FUNCTION", start + 1)
    const body = migration.slice(
      start,
      nextFunction === -1 ? migration.length : nextFunction,
    )

    assert.ok(start >= 0, `missing ${functionName}`)
    assert.match(body, /previous_transition_context/)
    assert.match(
      body,
      /set_config\(\s*'o2i\.question_version_transition',\s*COALESCE\(previous_transition_context, ''\)/,
    )
  }

  for (const functionName of ["approve_question_version", "retire_question"]) {
    const start = migration.indexOf(
      `CREATE OR REPLACE FUNCTION public.${functionName}`,
    )
    const nextFunction = migration.indexOf("CREATE OR REPLACE FUNCTION", start + 1)
    const body = migration.slice(
      start,
      nextFunction === -1 ? migration.length : nextFunction,
    )

    assert.match(body, /previous_lifecycle_context/)
    assert.match(
      body,
      /set_config\(\s*'o2i\.question_lifecycle',\s*COALESCE\(previous_lifecycle_context, ''\)/,
    )
  }
})

test("student RLS exposes only the current approved version and children", () => {
  assert.match(
    migration,
    /Authenticated users read current approved versions[\s\S]*q\.current_version_id = question_versions\.id[\s\S]*question_versions\.status = 'approved'/,
  )
  for (const relation of [
    "question_options",
    "question_practice_skills",
    "question_topics",
    "option_misconceptions",
  ]) {
    const policyPosition = migration.indexOf(
      `Authenticated users read approved ${
        relation === "question_practice_skills"
          ? "question practice skills"
          : relation === "question_topics"
            ? "secondary question topics"
            : relation === "option_misconceptions"
              ? "option misconceptions"
              : "question options"
      }`,
    )
    assert.ok(policyPosition >= 0, `missing student policy for ${relation}`)
    const policyBody = migration.slice(policyPosition, policyPosition + 900)
    assert.match(policyBody, /q\.current_version_id = qv\.id/)
    assert.match(policyBody, /qv\.status = 'approved'/)
  }
})

test("admin authorization protects all lifecycle RPCs", () => {
  for (const functionName of [
    "create_question_revision",
    "submit_question_version_for_review",
    "return_question_version_to_draft",
    "approve_question_version",
    "retire_question",
  ]) {
    const start = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${functionName}`)
    assert.ok(start >= 0, `missing ${functionName}`)
    const body = migration.slice(start, start + 1800)
    assert.match(body, /PERFORM public\.assert_question_bank_admin\(\)/)
  }
  assert.match(migration, /public\.has_role\(auth\.uid\(\), 'admin'/)
})

test("retirement hides publication but retains history", () => {
  const start = migration.indexOf("CREATE OR REPLACE FUNCTION public.retire_question")
  const end = migration.indexOf("REVOKE ALL ON FUNCTION", start)
  const body = migration.slice(start, end)
  assert.match(body, /SET status = 'superseded'/)
  assert.match(body, /SET status = 'retired'/)
  assert.match(body, /current_version_id = NULL/)
  assert.doesNotMatch(body, /DELETE FROM public\.question_versions/)
})

test("legacy practice problems remain untouched", () => {
  assert.doesNotMatch(migration, /DROP TABLE(?: IF EXISTS)? public\.practice_problems/i)
  assert.doesNotMatch(migration, /ALTER TABLE public\.practice_problems/i)
})

test("PL/pgSQL function blocks are structurally balanced", () => {
  const openingBlocks = migration.match(/AS \$\$/g) ?? []
  const closingBlocks = migration.match(/\$\$;/g) ?? []
  assert.equal(openingBlocks.length, closingBlocks.length)
})
