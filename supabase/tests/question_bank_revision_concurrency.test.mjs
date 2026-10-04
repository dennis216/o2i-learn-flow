import assert from "node:assert/strict"
import test from "node:test"
import pg from "pg"

const { Client } = pg

const databaseUrl =
  process.env.SUPABASE_DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
const parsedDatabaseUrl = new URL(databaseUrl)

if (!['127.0.0.1', 'localhost', '::1'].includes(parsedDatabaseUrl.hostname)) {
  throw new Error(
    `Concurrency test refuses non-local database host: ${parsedDatabaseUrl.hostname}`,
  )
}

const adminUserId = "60000000-0000-0000-0000-000000000001"
const questionId = "60000000-0000-0000-0000-000000000002"
const firstVersionId = "60000000-0000-0000-0000-000000000003"

async function setAdminTransaction(client) {
  await client.query("BEGIN")
  await client.query(
    "SELECT set_config('request.jwt.claim.sub', $1, true)",
    [adminUserId],
  )
  await client.query(
    "SELECT set_config('request.jwt.claim.role', 'authenticated', true)",
  )
  await client.query("SET LOCAL ROLE authenticated")
}

async function cleanup(client) {
  await client.query("BEGIN")
  await client.query("SET LOCAL session_replication_role = replica")
  await client.query(
    `DELETE FROM public.option_misconceptions
     WHERE option_id IN (
       SELECT qo.id
       FROM public.question_options AS qo
       JOIN public.question_versions AS qv
         ON qv.id = qo.question_version_id
       WHERE qv.question_id = $1
     )`,
    [questionId],
  )
  await client.query(
    `DELETE FROM public.question_options
     WHERE question_version_id IN (
       SELECT id FROM public.question_versions WHERE question_id = $1
     )`,
    [questionId],
  )
  await client.query(
    "DELETE FROM public.question_practice_skills WHERE question_version_id IN (SELECT id FROM public.question_versions WHERE question_id = $1)",
    [questionId],
  )
  await client.query(
    "DELETE FROM public.question_topics WHERE question_version_id IN (SELECT id FROM public.question_versions WHERE question_id = $1)",
    [questionId],
  )
  await client.query(
    "DELETE FROM public.question_versions WHERE question_id = $1",
    [questionId],
  )
  await client.query("DELETE FROM public.questions WHERE id = $1", [questionId])
  await client.query("DELETE FROM public.user_roles WHERE user_id = $1", [
    adminUserId,
  ])
  await client.query("DELETE FROM public.profiles WHERE user_id = $1", [
    adminUserId,
  ])
  await client.query("DELETE FROM auth.users WHERE id = $1", [adminUserId])
  await client.query("COMMIT")
}

async function createPublishedFixture(client) {
  await cleanup(client)

  await client.query(
    `INSERT INTO auth.users (
       id,
       email,
       raw_app_meta_data,
       raw_user_meta_data,
       created_at,
       updated_at
     ) VALUES (
       $1,
       'question-bank-concurrency@test.invalid',
       '{"provider":"email","providers":["email"]}'::jsonb,
       '{"full_name":"Question Bank Concurrency Admin"}'::jsonb,
       now(),
       now()
     )`,
    [adminUserId],
  )
  await client.query(
    "INSERT INTO public.user_roles (user_id, role) VALUES ($1, 'admin'::public.app_role)",
    [adminUserId],
  )

  await setAdminTransaction(client)
  await client.query(
    "INSERT INTO public.questions (id, external_id) VALUES ($1, 'DB-CONCURRENCY-MCQ-001')",
    [questionId],
  )
  await client.query(
    `INSERT INTO public.question_versions (
       id,
       question_id,
       version_number,
       stem,
       solution,
       difficulty,
       course_scope,
       primary_topic_id,
       representation_type,
       calculator_policy,
       source_type,
       source_document,
       source_page,
       source_question_number
     )
     SELECT
       $1,
       $2,
       1,
       'Concurrency fixture stem',
       'Concurrency fixture solution',
       'easy'::public.question_difficulty,
       'BOTH'::public.question_course_scope,
       id,
       'analytical'::public.question_representation_type,
       'no_calculator'::public.question_calculator_policy,
       'public_domain'::public.question_source_type,
       'question-bank-concurrency-source.pdf',
       1,
       '1'
     FROM public.curriculum_topics
     ORDER BY topic_code
     LIMIT 1`,
    [firstVersionId, questionId],
  )
  await client.query(
    `INSERT INTO public.question_options (
       question_version_id,
       option_key,
       option_text,
       order_index,
       is_correct
     ) VALUES
       ($1, 'A', 'Incorrect', 1, false),
       ($1, 'B', 'Correct', 2, true)`,
    [firstVersionId],
  )
  await client.query(
    "SELECT public.submit_question_version_for_review($1, $2)",
    [questionId, firstVersionId],
  )
  await client.query("SELECT public.approve_question_version($1, $2)", [
    questionId,
    firstVersionId,
  ])
  await client.query("COMMIT")
}

test("two real connections cannot create two working revisions", async () => {
  const setupClient = new Client({ connectionString: databaseUrl })
  const firstClient = new Client({ connectionString: databaseUrl })
  const secondClient = new Client({ connectionString: databaseUrl })

  await Promise.all([
    setupClient.connect(),
    firstClient.connect(),
    secondClient.connect(),
  ])

  try {
    await createPublishedFixture(setupClient)
    await setAdminTransaction(firstClient)
    await setAdminTransaction(secondClient)

    const firstResult = await firstClient.query(
      "SELECT public.create_question_revision($1) AS version_id",
      [questionId],
    )
    assert.ok(firstResult.rows[0].version_id)

    const secondAttempt = secondClient.query(
      "SELECT public.create_question_revision($1) AS version_id",
      [questionId],
    )
    const blockedState = await Promise.race([
      secondAttempt.then(
        () => "settled",
        () => "settled",
      ),
      new Promise((resolve) => setTimeout(() => resolve("blocked"), 250)),
    ])
    assert.equal(
      blockedState,
      "blocked",
      "second connection should wait on the question row lock",
    )

    await firstClient.query("COMMIT")

    await assert.rejects(secondAttempt, (error) => {
      assert.equal(error.code, "23505")
      assert.match(error.message, /already has a draft or review version/)
      return true
    })
    await secondClient.query("ROLLBACK")

    const workingRevisionCount = await setupClient.query(
      `SELECT count(*)::integer AS count
       FROM public.question_versions
       WHERE question_id = $1
         AND status IN ('draft', 'review')`,
      [questionId],
    )
    assert.equal(workingRevisionCount.rows[0].count, 1)
  } finally {
    await Promise.allSettled([
      firstClient.query("ROLLBACK"),
      secondClient.query("ROLLBACK"),
    ])
    await cleanup(setupClient)
    await Promise.allSettled([
      setupClient.end(),
      firstClient.end(),
      secondClient.end(),
    ])
  }
})
