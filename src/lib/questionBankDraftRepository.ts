import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../integrations/supabase/types.ts";
import type { DraftSavePlan } from "./questionBankDraftSave.ts";
import { hasAdminModule } from './adminAccessRepository.ts';

export interface SavedDraft {
  id: string;
  externalId: string;
  stem: string;
  questionStatus: string;
  versionStatus: string;
}

export class DraftSaveResultError extends Error {}

/** Shared write path for manual and XLSX drafts. One RPC call is one database transaction. */
export async function saveQuestionBankDrafts(
  client: SupabaseClient<Database>,
  plan: DraftSavePlan,
): Promise<string[]> {
  if (!plan.canSave || plan.payload.length === 0) throw new Error("The question data has not passed draft-save checks");
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
    .in("status", ["draft", "review"]);
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

export type QuestionBankListKind = "drafts" | "published";

export interface QuestionBankListItem extends SavedDraft {
  kind: QuestionBankListKind;
  versionId: string;
  versionNumber: number;
  difficulty: string;
  calculatorPolicy: Database["public"]["Enums"]["question_calculator_policy"] | null;
  courseScope: string;
  topicCode: string;
  topicTitle: string;
  practiceSkillCodes: string[];
  currentVersionId: string | null;
  workingVersionId: string | null;
}

export interface QuestionBankPage {
  items: QuestionBankListItem[];
  total: number;
}

export interface QuestionBankVersionPreview extends Pick<QuestionBankListItem, "difficulty" | "calculatorPolicy" | "courseScope" | "topicCode" | "topicTitle" | "practiceSkillCodes"> {
  versionId: string;
  stem: string;
  solution: string;
  sourceDocument: string;
  sourcePage: number;
  sourceQuestionNumber: string | null;
  sourceLocator: string | null;
  sourceReference: string | null;
  requiresFigure: boolean;
  imageUrl: string | null;
  evidence: Json;
  options: Pick<Database["public"]["Tables"]["question_options"]["Row"],
    "id" | "option_key" | "option_text" | "is_correct" | "order_index">[];
}

async function requireQuestionBankAdmin(client: SupabaseClient<Database>) {
  const { data, error } = await client.auth.getUser();
  if (error) throw new Error(`Could not verify administrator sign-in: ${error.message}`);
  if (!data.user) throw new Error("Sign in as an administrator to read the question bank");
  const admin = await hasAdminModule(client, 'questions', data.user.id);
  if (admin !== true) throw new Error("Administrator access is required to read the question bank");
}

export const QUESTION_BANK_VERSION_SUMMARY = `id, question_id, status, version_number, stem, difficulty, calculator_policy, course_scope,
  topic:curriculum_topics!question_versions_primary_topic_id_fkey(topic_code, title),
  skills:question_practice_skills!question_practice_skills_question_version_id_fkey(
    skill:curriculum_practice_skills!question_practice_skills_practice_skill_id_fkey(skill_code))` as const;

/** Paginate question identities, not historical versions. All operations here are read-only.
 * A working revision and its published version can appear in their respective sections.
 * Explicit FK names disambiguate the two directions of the question/version relationship.
 */
export async function loadQuestionBankPage(
  client: SupabaseClient<Database>, kind: QuestionBankListKind, page: number, pageSize = 20,
): Promise<QuestionBankPage> {
  if (!Number.isSafeInteger(page) || page < 0 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100
    || !Number.isSafeInteger((page + 1) * pageSize)) throw new Error("Invalid question bank page");
  await requireQuestionBankAdmin(client);
  // Left embeds keep a withdrawn identity visible even without a working draft.
  // Count/page identities once, selecting the working version before the retained current version.
  const base = client.from("questions").select(
    `id, external_id, status, current_version_id,
     working:question_versions!question_versions_question_id_fkey(${QUESTION_BANK_VERSION_SUMMARY}),
     current:question_versions!questions_current_version_belongs_to_question(${QUESTION_BANK_VERSION_SUMMARY})`, { count: "exact" },
  ).in("working.status", ["draft", "review"]);
  const query = kind === "drafts"
    ? base.neq("status", "retired").or("status.eq.unpublished,working.not.is.null")
    : base.eq("status", "approved");
  const { data, error, count } = await query.order("created_at", { ascending: false })
    .order("id", { ascending: true }).range(page * pageSize, (page + 1) * pageSize - 1);
  if (error) throw new Error(`Could not load ${kind === "drafts" ? "saved drafts" : "published problems"}: ${error.message}`);
  if (!data || count === null) throw new Error("Could not load the question bank: incomplete database response");
  const items = data.map((question): QuestionBankListItem => {
    const working = question.working;
    const current = question.current;
    const version = kind === "drafts" ? working[0] ?? current : current;
    if (working.length > 1 || !version || version.question_id !== question.id
      || (kind === "drafts" && working.length ? !["draft", "review"].includes(version.status)
        : version.id !== question.current_version_id || version.status !== "approved")) {
      throw new Error(`Could not load ${question.external_id}: its active version could not be verified. Refresh the list.`);
    }
    if (!version.topic || version.skills.some(mapping => !mapping.skill)) {
      throw new Error(`Could not load taxonomy for ${question.external_id}`);
    }
    return {
      kind, id: question.id, externalId: question.external_id, questionStatus: question.status,
      versionId: version.id, versionStatus: version.status, versionNumber: version.version_number,
      stem: version.stem, difficulty: version.difficulty, calculatorPolicy: version.calculator_policy, courseScope: version.course_scope,
      topicCode: version.topic.topic_code, topicTitle: version.topic.title,
      practiceSkillCodes: [...new Set<string>(version.skills.map(mapping => mapping.skill.skill_code))].sort(),
      currentVersionId: question.current_version_id, workingVersionId: working[0]?.id ?? null,
    };
  });
  return { items, total: count };
}

/** Full scope for Publish all, never just the visible page. No writes or silent truncation. */
export async function loadAllUnpublishedQuestions(client: SupabaseClient<Database>): Promise<QuestionBankListItem[]> {
  const items: QuestionBankListItem[] = [];
  let total: number | null = null;
  for (let page = 0; ; page++) {
    const loaded = await loadQuestionBankPage(client, "drafts", page, 100);
    total ??= loaded.total;
    if (loaded.total !== total) throw new Error("The question list changed while loading. Retry the publication plan.");
    items.push(...loaded.items);
    if (new Set(items.map(item => item.id)).size !== items.length || items.length > total
      || (!loaded.items.length && items.length < total)) throw new Error("The publication scope changed. Reload before selecting targets.");
    if (items.length === total) return items;
  }
}

/** Preview exactly the selected active version; never substitute version 1 or write data. */
export async function loadQuestionBankVersionPreview(
  client: SupabaseClient<Database>, item: QuestionBankListItem,
): Promise<QuestionBankVersionPreview> {
  await requireQuestionBankAdmin(client);
  const { data: version, error } = await client.from("question_versions")
    .select(`${QUESTION_BANK_VERSION_SUMMARY}, solution, source_document, source_page, source_question_number, source_locator, source_reference, requires_figure, image_url, import_evidence`)
    .eq("id", item.versionId).eq("question_id", item.id).single();
  if (error) throw new Error(`Could not load preview: ${error.message}`);
  if (!version || version.status !== item.versionStatus) throw new Error("This version changed. Refresh the list before previewing it again.");
  if (!version.topic || version.skills.some(mapping => !mapping.skill)) throw new Error(`Could not load taxonomy for ${item.externalId}`);
  const { data: options, error: optionError } = await client.from("question_options")
    .select("id, option_key, option_text, order_index, is_correct")
    .eq("question_version_id", version.id).order("order_index").order("id");
  if (optionError) throw new Error(`Could not load preview options: ${optionError.message}`);
  if (!options) throw new Error("Could not load preview options: no database response");
  return {
    difficulty: version.difficulty, calculatorPolicy: version.calculator_policy, courseScope: version.course_scope,
    topicCode: version.topic.topic_code, topicTitle: version.topic.title,
    practiceSkillCodes: [...new Set<string>(version.skills.map(mapping => mapping.skill.skill_code))].sort(),
    evidence: version.import_evidence,
    versionId: version.id, stem: version.stem, solution: version.solution, options,
    sourceDocument: version.source_document, sourcePage: version.source_page,
    sourceQuestionNumber: version.source_question_number, sourceLocator: version.source_locator,
    sourceReference: version.source_reference, requiresFigure: version.requires_figure, imageUrl: version.image_url,
  };
}
