import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../integrations/supabase/types.ts";
import type { DraftSavePlan } from "./questionBankDraftSave.ts";

export interface SavedDraft {
  id: string;
  externalId: string;
  stem: string;
  questionStatus: string;
  versionStatus: string;
}

export class DraftSaveResultError extends Error {}

/** The only write path for XLSX drafts. One RPC call is one database transaction. */
export async function saveQuestionBankDrafts(
  client: SupabaseClient<Database>,
  plan: DraftSavePlan,
): Promise<string[]> {
  if (!plan.canSave || plan.payload.length === 0) throw new Error("当前工作簿未通过草稿保存检查");
  const { data, error } = await client.rpc("save_question_bank_drafts", {
    _items: plan.payload as Json,
  });
  if (error) throw new Error(error.message);
  if (!Array.isArray(data) || data.length !== plan.payload.length) {
    throw new DraftSaveResultError("数据库已响应，但保存数量无法核实；请先核对题库，勿重复提交");
  }
  return data.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item) || typeof item.external_id !== "string") {
      throw new DraftSaveResultError("数据库已响应，但题目 ID 无法识别；请先核对题库，勿重复提交");
    }
    return item.external_id;
  });
}

/** Fresh admin read after a successful RPC; never infer persistence from the preview. */
export async function loadSavedQuestionBankDrafts(
  client: SupabaseClient<Database>,
  externalIds: string[],
): Promise<SavedDraft[]> {
  const { data: questions, error: questionError } = await client.from("questions")
    .select("id, external_id, status, current_version_id")
    .in("external_id", externalIds)
    .order("external_id");
  if (questionError) throw new Error(`已保存，但读取 questions 失败：${questionError.message}`);
  if (!questions || questions.length !== externalIds.length) throw new Error("已保存，但 questions 回读数量不一致");

  const { data: versions, error: versionError } = await client.from("question_versions")
    .select("question_id, status, stem, version_number")
    .in("question_id", questions.map((question) => question.id))
    .eq("version_number", 1);
  if (versionError) throw new Error(`已保存，但读取 question_versions 失败：${versionError.message}`);
  if (!versions || versions.length !== externalIds.length) throw new Error("已保存，但 question_versions 回读数量不一致");
  const versionByQuestion = new Map(versions.map((version) => [version.question_id, version]));
  return questions.map((question) => {
    const version = versionByQuestion.get(question.id);
    if (!version || question.status !== "draft" || question.current_version_id !== null || version.status !== "draft") {
      throw new Error(`已保存，但 ${question.external_id} 状态异常；请在数据库中核对，勿重复提交`);
    }
    return {
      id: question.id, externalId: question.external_id, stem: version.stem,
      questionStatus: question.status, versionStatus: version.status,
    };
  });
}
