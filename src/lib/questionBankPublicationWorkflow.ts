import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../integrations/supabase/types.ts";
import type { QuestionBankListItem } from "./questionBankDraftRepository.ts";
import { loadAllUnpublishedQuestions } from "./questionBankDraftRepository.ts";
import { loadQuestionPublicationState, precheckQuestionPublication, recordQuestionVersionReview,
  publishQuestionVersions, type HumanQuestionReview, type PublicationPrecheck, type PublicationTarget } from "./questionBankPublication.ts";

export interface PublicationPlanItem {
  item: QuestionBankListItem; check: PublicationPrecheck; flags: string[];
  printedNumber: string | null; locator: string | null; sourceDocument: string; sourcePage: number;
  sourceType: string | null; calculator: string | null; locatorVerified: boolean;
  evidence: Json;
}
const object = (v: Json): Record<string, Json> => v && typeof v === "object" && !Array.isArray(v) ? v : {};

/** Reference only. Raw evidence is also retained and displayed, including unsupported flag formats. */
export function originalReviewFlags(evidence: Json): string[] {
  const data = object(evidence), original = object(data.original_import_evidence ?? null);
  const flags = [Object.prototype.hasOwnProperty.call(data, "ai_flags") ? data.ai_flags : [],
    Object.prototype.hasOwnProperty.call(original, "ai_flags") ? original.ai_flags : []];
  return [...new Set(flags.flatMap(value => Array.isArray(value)
    ? value.filter((flag): flag is string => typeof flag === "string" && !!flag.trim()) : []))].sort();
}
const reviewFixable = new Set(["QB_REVIEW_REQUIRED", "QB_REVIEW_STALE"]);
export const publicationContentBlockers = (plan: PublicationPlanItem) => plan.check.issues.filter(issue => !reviewFixable.has(issue.code));
export const publicationTarget = (plan: PublicationPlanItem): PublicationTarget => {
  if (!plan.check.fingerprint) throw new Error("Reload this publication target before continuing.");
  return { question_id: plan.item.id, version_id: plan.item.versionId, expected_fingerprint: plan.check.fingerprint, action: plan.check.action };
};

/** Read-only complete scope. A withdrawn question with a working revision explicitly targets that revision. */
export async function loadPublicationPlan(client: SupabaseClient<Database>, single?: QuestionBankListItem): Promise<PublicationPlanItem[]> {
  const items = single ? [single] : await loadAllUnpublishedQuestions(client);
  return Promise.all(items.map(async item => {
    const action = item.versionStatus === "approved" && item.questionStatus === "unpublished" ? "republish" : "publish";
    const [check, response] = await Promise.all([precheckQuestionPublication(client, item.id, item.versionId, action),
      client.from("question_versions").select("id, question_id, status, calculator_policy, source_type, source_locator_verified, source_question_number, source_locator, source_document, source_page, import_evidence")
        .eq("id", item.versionId).eq("question_id", item.id).single()]);
    if (response.error) throw new Error(`Could not load review evidence: ${response.error.message}`);
    const v = response.data;
    if (!v || v.status !== item.versionStatus || check.question_status !== item.questionStatus || !check.fingerprint)
      throw new Error("The selected question changed. Refresh the list before publishing.");
    return { item, check, flags: originalReviewFlags(v.import_evidence), printedNumber: v.source_question_number,
      locator: v.source_locator, locatorVerified: v.source_locator_verified, sourceDocument: v.source_document,
      sourcePage: v.source_page, calculator: v.calculator_policy, sourceType: v.source_type, evidence: v.import_evidence };
  }));
}

export function validatePublicationSelection(plans: readonly PublicationPlanItem[], selected: ReadonlySet<string>, confirmed: boolean) {
  if (confirmed !== true) throw new Error("Confirm that you checked the selected content, answers, display and Topic/Skills.");
  const chosen = plans.filter(plan => selected.has(plan.item.id));
  if (!chosen.length || chosen.length > 20 || chosen.length !== selected.size) throw new Error("Select 1–20 listed problems for one atomic publication.");
  if (new Set(chosen.map(plan => plan.item.id)).size !== chosen.length) throw new Error("A question cannot appear twice.");
  return chosen.map(plan => {
    if (publicationContentBlockers(plan).length) throw new Error(`${plan.item.externalId}: resolve the content issues before publication.`);
    return { plan, target: publicationTarget(plan), review: { confirmed: true } satisfies HumanQuestionReview };
  });
}

/** Only the final Publish click calls this. Review records are explicit writes; publication itself is one atomic RPC. */
export async function confirmPublicationPlan(client: SupabaseClient<Database>, plans: readonly PublicationPlanItem[], selected: ReadonlySet<string>, confirmed: boolean) {
  const chosen = validatePublicationSelection(plans, selected, confirmed);
  const targets: PublicationTarget[] = [];
  for (const { plan, target, review } of chosen) {
    const check = (await recordQuestionVersionReview(client, target, review)).precheck;
    if (!check.eligible || !check.fingerprint) throw new Error(`${plan.item.externalId}: server review did not pass. No publication request was made.`);
    targets.push({ ...target, expected_fingerprint: check.fingerprint });
  }
  await publishQuestionVersions(client, targets);
  // Do not show success based only on a click/RPC response. Verify the actual current pointers.
  for (const target of targets) {
    const state = await loadQuestionPublicationState(client, target.question_id);
    if (state.status !== "approved" || state.current_version_id !== target.version_id)
      throw new Error("Publication readback could not be verified. Reload the list before trying again.");
  }
  return targets.length;
}
