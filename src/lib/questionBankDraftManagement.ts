import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../integrations/supabase/types.ts";
import { OPTION_HEADERS, QUESTION_HEADERS, validateQuestionBankSheets, type WorkbookSheet } from "./questionBankImport.ts";
import type { QuestionBankReferences } from "./questionBankImportPlan.ts";
import { buildQuestionBankDraftSavePlan } from "./questionBankDraftSave.ts";
import { EDITABLE_QUESTION_FIELDS, type EditableQuestionField } from "./questionBankPreviewEdits.ts";

type Version = Database["public"]["Tables"]["question_versions"]["Row"];
type Option = Database["public"]["Tables"]["question_options"]["Row"];
export interface DraftSnapshot {
  question: Database["public"]["Tables"]["questions"]["Row"];
  version: Version; topic_code: string; skill_codes: string[]; options: Option[];
  fingerprint: string; delete_scope: "question" | "revision";
}

const object = (value: Json): Record<string, Json> => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const text = (value: Json | undefined): string => typeof value === "string" ? value : "";

/** Round-trip the intake range encoding, never replace it with the Excel row number. */
export function draftSourcePage(version: Pick<Version, "source_page" | "source_reference">): string {
  const range = version.source_reference?.match(/^(\d+)-(\d+)$/);
  return range && Number(range[1]) === version.source_page && Number(range[2]) >= version.source_page
    ? version.source_reference! : String(version.source_page);
}

/** Adapt stored data to the existing validator. No alternative parser or validation rules. */
export function draftSnapshotSheets(snapshot: DraftSnapshot): WorkbookSheet[] {
  const v = snapshot.version;
  const evidence = object(v.import_evidence);
  const gates = object(evidence.review_gates ?? null);
  const values: Record<string, WorkbookSheet["data"][number][number]> = {
    external_id: snapshot.question.external_id, stem: v.stem, solution: v.solution,
    difficulty: v.difficulty, calculator_policy: v.calculator_policy,
    course_scope: v.course_scope, representation_type: v.representation_type,
    primary_topic_code: snapshot.topic_code, practice_skill_codes: snapshot.skill_codes.join("|"),
    source_document: v.source_document, source_page: draftSourcePage(v),
    source_question_number: v.source_question_number, source_locator: v.source_locator,
    requires_figure: v.requires_figure, image_url: v.image_url,
    correct_option_key: snapshot.options.find(option => option.is_correct)?.option_key ?? "",
    figure_reference: text(evidence.figure_reference), human_review_status: text(evidence.human_review_status) || "pending",
    human_review_notes: text(evidence.human_review_notes), reviewed_by: text(evidence.reviewed_by_text),
    reviewed_at: text(evidence.reviewed_at_text), source_transcription_notes: text(evidence.source_transcription_notes),
    ai_inference_notes: text(evidence.ai_inference_notes),
    ai_flags: Array.isArray(evidence.ai_flags) ? evidence.ai_flags.map(text).join("|") : text(evidence.ai_flags),
    ...Object.fromEntries(["math_review_status", "source_rights_status", "taxonomy_review_status", "render_review_status"]
      .map(key => [key, text(gates[key])])),
  };
  return [
    { sheet: "Questions", data: [[...QUESTION_HEADERS], QUESTION_HEADERS.map(header => values[header] ?? null)] },
    { sheet: "Options", data: [[...OPTION_HEADERS], ...snapshot.options.map(option => {
      const evidence = object(option.import_evidence);
      const values: Record<string, WorkbookSheet["data"][number][number]> = {
        question_external_id: snapshot.question.external_id, option_key: option.option_key, option_text: option.option_text,
        is_correct: option.is_correct, misconception_code: text(evidence.misconception_code), option_explanation: text(evidence.option_explanation),
      };
      return OPTION_HEADERS.map(header => values[header] ?? null);
    })] },
    { sheet: "Instructions", data: [["Database work copy; original intake evidence remains on the server."]] },
  ];
}

export function validateDraftMetadata(sheets: readonly WorkbookSheet[], references: QuestionBankReferences | null) {
  const report = validateQuestionBankSheets(sheets, references ? {
    topicCodes: new Set(references.topics.map(topic => topic.topic_code)),
    practiceSkillCodes: new Set(references.skills.map(skill => skill.skill_code)),
  } : undefined);
  // This identity already exists: do not apply the NEW-import duplicate-ID check to editing it.
  const plan = buildQuestionBankDraftSavePlan(report, references ? { ...references, existingExternalIds: new Set() } : null);
  const source = plan.payload[0];
  const metadata = source ? Object.fromEntries(EDITABLE_QUESTION_FIELDS.map(field => [field, source[field]])) : null;
  return { report, plan, metadata: metadata as Record<EditableQuestionField, unknown> | null };
}

export async function loadQuestionBankDraft(client: SupabaseClient<Database>, questionId: string, versionId: string): Promise<DraftSnapshot> {
  const { data, error } = await client.rpc("get_question_bank_draft", { _question_id: questionId, _version_id: versionId });
  if (error) throw new Error(`Could not load latest draft: ${error.message}`);
  const snapshot = data as unknown as DraftSnapshot;
  if (!snapshot?.fingerprint || snapshot.question?.id !== questionId || snapshot.version?.id !== versionId
    || snapshot.version.question_id !== questionId || !["draft", "review"].includes(snapshot.version.status)
    || !Array.isArray(snapshot.options) || !Array.isArray(snapshot.skill_codes)
    || !["question", "revision"].includes(snapshot.delete_scope)) throw new Error("Invalid draft snapshot; refresh the list.");
  return snapshot;
}

/** Called only by explicit confirmation, never by loading, validation, undo or Cancel. */
export async function updateQuestionBankDraft(client: SupabaseClient<Database>, snapshot: DraftSnapshot,
  sheets: readonly WorkbookSheet[], references: QuestionBankReferences | null): Promise<void> {
  const { plan, metadata } = validateDraftMetadata(sheets, references);
  if (!plan.canSave || !metadata || snapshot.version.status !== "draft") throw new Error("Resolve draft field issues before saving changes.");
  const { data, error } = await client.rpc("update_question_bank_draft_metadata", {
    _question_id: snapshot.question.id, _version_id: snapshot.version.id,
    _expected_fingerprint: snapshot.fingerprint, _metadata: metadata as Json,
  });
  if (error) throw new Error(`Changes were not saved: ${error.message}`);
  if (data !== snapshot.version.id) throw new Error("Save response could not be verified. Reload before trying again.");
}

export async function deleteQuestionBankDraft(client: SupabaseClient<Database>, snapshot: DraftSnapshot): Promise<void> {
  if (snapshot.version.status !== "draft") throw new Error("Return this review version to draft before deleting.");
  const { data, error } = await client.rpc("delete_question_bank_draft", {
    _question_id: snapshot.question.id, _version_id: snapshot.version.id,
    _expected_fingerprint: snapshot.fingerprint, _delete_question: snapshot.delete_scope === "question",
  });
  if (error) throw new Error(`Draft was not deleted: ${error.message}`);
  const result = object(data);
  if (result.version_id !== snapshot.version.id || result.question_id !== snapshot.question.id
    || result.deleted_question !== (snapshot.delete_scope === "question")) throw new Error("Deletion response could not be verified. Refresh the list before retrying.");
}

export async function returnQuestionBankDraft(client: SupabaseClient<Database>, snapshot: DraftSnapshot): Promise<void> {
  const { error } = await client.rpc("return_question_version_to_draft", {
    _question_id: snapshot.question.id, _version_id: snapshot.version.id,
  });
  if (error) throw new Error(`Could not return to draft: ${error.message}`);
}
