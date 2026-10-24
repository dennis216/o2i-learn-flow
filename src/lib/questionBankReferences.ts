import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../integrations/supabase/types.ts";
import type { QuestionBankReferences } from "./questionBankImportPlan";

const PAGE_SIZE = 1000;

type ReadPage<T> = { data: T[] | null; error: { message: string } | null };

async function readAll<T>(
  label: string,
  fetchPage: (from: number, to: number) => Promise<ReadPage<T>>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Could not load ${label}: ${error.message}`);
    if (!data) throw new Error(`Could not load ${label}: no data returned`);
    rows.push(...data);
    if (data.length < PAGE_SIZE) return rows;
  }
}

/** Only SELECT queries after verifying the current authenticated user is an admin. */
export async function loadQuestionBankReferences(client: SupabaseClient<Database>): Promise<QuestionBankReferences> {
  const { data: identity, error: identityError } = await client.auth.getUser();
  if (identityError || !identity.user) throw new Error("Sign in as an administrator to verify reference data and existing question IDs");
  const { data: isAdmin, error: roleError } = await client.rpc("has_admin_module", { _module: "questions" });
  if (roleError) throw new Error(`Could not verify administrator access: ${roleError.message}`);
  if (isAdmin !== true) throw new Error("Administrator access is required to check all existing external_id values");

  const [topics, skills, questions] = await Promise.all([
    readAll("Topic", async (from, to) => await client.from("curriculum_topics")
      .select("id, topic_code, title").order("id").range(from, to)),
    readAll("Practice Skill", async (from, to) => await client.from("curriculum_practice_skills")
      .select("id, skill_code, description").order("id").range(from, to)),
    readAll("existing question IDs", async (from, to) => await client.from("questions")
      .select("external_id").order("id").range(from, to)),
  ]);

  return {
    topics,
    skills,
    existingExternalIds: new Set(questions.map((question) => question.external_id)),
  };
}
