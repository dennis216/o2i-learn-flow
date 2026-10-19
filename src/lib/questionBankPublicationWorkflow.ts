import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../integrations/supabase/types.ts";
import type { QuestionBankListItem } from "./questionBankDraftRepository.ts";
import { loadAllUnpublishedQuestions, QUESTION_BANK_VERSION_SUMMARY } from "./questionBankDraftRepository.ts";
import { loadQuestionPublicationState, precheckQuestionPublication, recordQuestionVersionReview,
  publishQuestionVersions, type HumanQuestionReview, type PublicationPrecheck, type PublicationTarget } from "./questionBankPublication.ts";

export interface PublicationPlanItem { item: QuestionBankListItem; check: PublicationPrecheck }
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
    // Read labels after the checked snapshot; later changes fail the publication fingerprint guard.
    const check = await precheckQuestionPublication(client, item.id, item.versionId, action);
    const response = await client.from("question_versions").select(QUESTION_BANK_VERSION_SUMMARY)
      .eq("id", item.versionId).eq("question_id", item.id).single();
    if (response.error) throw new Error(`Could not load saved question metadata: ${response.error.message}`);
    const v = response.data;
    if (!v || v.status !== item.versionStatus || check.question_status !== item.questionStatus || !check.fingerprint)
      throw new Error("The selected question changed. Refresh the list before publishing.");
    if (!v.topic || v.skills.some(mapping => !mapping.skill)) throw new Error(`Could not load taxonomy for ${item.externalId}`);
    return { item: { ...item, stem: v.stem, difficulty: v.difficulty, calculatorPolicy: v.calculator_policy, courseScope: v.course_scope,
      topicCode: v.topic.topic_code, topicTitle: v.topic.title,
      practiceSkillCodes: [...new Set<string>(v.skills.map(mapping => mapping.skill.skill_code))].sort() }, check };
  }));
}

export function validatePublicationSelection(plans: readonly PublicationPlanItem[], selected: ReadonlySet<string>, confirmed: boolean) {
  if (confirmed !== true) throw new Error("Confirm that you checked the selected content, answers, display and Topic/Skills.");
  const chosen = plans.filter(plan => selected.has(plan.item.id));
  if (!chosen.length || chosen.length > 20 || chosen.length !== selected.size) throw new Error("Select 1–20 listed problems for one atomic publication.");
  if (new Set(chosen.map(plan => plan.item.id)).size !== chosen.length) throw new Error("A question cannot appear twice.");
  return chosen.map(plan => {
    const blockers = publicationContentBlockers(plan);
    if (blockers.length) throw new Error(`${plan.item.externalId}: ${blockers.map(issue => `${issue.field}: ${issue.message}`).join("; ")}`);
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
