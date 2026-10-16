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
  if (!plan.canSave || plan.payload.length === 0) throw new Error("The workbook has not passed draft-save checks");
  const { data, error } = await client.rpc("save_question_bank_drafts", {
    _items: plan.payload as Json,
  });
  if (error) throw new Error(error.message);
  if (!Array.isArray(data) || data.length !== plan.payload.length) {
    throw new DraftSaveResultError("The database responded, but the saved count could not be verified. Check the question bank before submitting again");
  }
  return data.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item) || typeof item.external_id !== "string") {
      throw new DraftSaveResultError("The database responded, but question IDs could not be verified. Check the question bank before submitting again");
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
  if (questionError) throw new Error(`Saved, but reading questions failed: ${questionError.message}`);
  if (!questions || questions.length !== externalIds.length) throw new Error("Saved, but the questions readback count does not match");

  const { data: versions, error: versionError } = await client.from("question_versions")
    .select("question_id, status, stem, version_number")
    .in("question_id", questions.map((question) => question.id))
    .eq("version_number", 1);
  if (versionError) throw new Error(`Saved, but reading question_versions failed: ${versionError.message}`);
  if (!versions || versions.length !== externalIds.length) throw new Error("Saved, but the question_versions readback count does not match");
  const versionByQuestion = new Map(versions.map((version) => [version.question_id, version]));
  return questions.map((question) => {
    const version = versionByQuestion.get(question.id);
    if (!version || question.status !== "draft" || question.current_version_id !== null || version.status !== "draft") {
      throw new Error(`Saved, but ${question.external_id} has an unexpected status. Check the database before submitting again`);
    }
    return {
      id: question.id, externalId: question.external_id, stem: version.stem,
      questionStatus: question.status, versionStatus: version.status,
    };
  });
}
