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
    if (error) throw new Error(`${label} 读取失败：${error.message}`);
    if (!data) throw new Error(`${label} 读取失败：未返回数据`);
    rows.push(...data);
    if (data.length < PAGE_SIZE) return rows;
  }
}

/** Only SELECT queries after verifying the current authenticated user is an admin. */
export async function loadQuestionBankReferences(// eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: SupabaseClient<any>): Promise<QuestionBankReferences> {
  const { data: identity, error: identityError } = await client.auth.getUser();
  if (identityError || !identity.user) throw new Error("请先以管理员身份登录，再核对现有题目 ID");
  const { data: isAdmin, error: roleError } = await client.rpc("has_role", {
    _user_id: identity.user.id, _role: "admin",
  });
  if (roleError || isAdmin !== true) throw new Error("当前账号没有管理员权限，不能核对全部 external_id");

  const [topics, skills, questions] = await Promise.all([
    readAll("Topic", async (from, to) => await client.from("curriculum_topics")
      .select("id, topic_code, title").order("id").range(from, to)),
    readAll("Practice Skill", async (from, to) => await client.from("curriculum_practice_skills")
      .select("id, skill_code, description").order("id").range(from, to)),
    readAll("现有题目 ID", async (from, to) => await client.from("questions")
      .select("external_id").order("id").range(from, to)),
  ]);

  return {
    topics,
    skills,
    existingExternalIds: new Set(questions.map((question) => question.external_id)),
  };
}
