import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../integrations/supabase/types.ts";
import type { QuestionBankListItem } from "./questionBankDraftRepository.ts";
import { loadAllUnpublishedQuestions } from "./questionBankDraftRepository.ts";
import { loadQuestionPublicationState, precheckQuestionPublication, recordQuestionVersionReview,
  publishQuestionVersions, type HumanQuestionReview, type PublicationPrecheck, type PublicationTarget } from "./questionBankPublication.ts";

export interface ReviewWorkCopy {
  calculator: string; sourceType: string; locatorVerified: boolean; printedNumberVerified: boolean;
  math: { confirmed: boolean; notes: string }; taxonomy: { confirmed: boolean; notes: string };
  source: { confirmed: boolean; notes: string }; render: { confirmed: boolean; notes: string };
  resolutions: Record<string, string>;
}
export interface PublicationPlanItem {
  item: QuestionBankListItem; check: PublicationPrecheck; flags: string[];
  printedNumber: string | null; locator: string | null; sourceDocument: string; sourcePage: number;
  sourceType: string | null; calculator: string | null; locatorVerified: boolean;
  evidence: Json; form: ReviewWorkCopy;
}
const object = (v: Json): Record<string, Json> => v && typeof v === "object" && !Array.isArray(v) ? v : {};

/** Match the server's original flag union; malformed evidence is never silently treated as resolved. */
export function originalReviewFlags(evidence: Json): string[] {
  const data = object(evidence), original = object(data.original_import_evidence ?? null);
  const flags = [Object.prototype.hasOwnProperty.call(data, "ai_flags") ? data.ai_flags : [],
    Object.prototype.hasOwnProperty.call(original, "ai_flags") ? original.ai_flags : []];
  if (flags.some(value => !Array.isArray(value) || value.some(flag => typeof flag !== "string" || !flag.trim())))
    throw new Error("Original flag evidence is invalid. It cannot be cleared or ignored here.");
  return [...new Set(flags.flat() as string[])].sort();
}
export function emptyReviewWorkCopy(calculator = "", sourceType = ""): ReviewWorkCopy {
  return { calculator, sourceType, locatorVerified: false, printedNumberVerified: false,
    math: { confirmed: false, notes: "" }, taxonomy: { confirmed: false, notes: "" },
    source: { confirmed: false, notes: "" }, render: { confirmed: false, notes: "" }, resolutions: {} };
}

/** A publication-fact change invalidates browser confirmations too, not only saved server reviews. */
export function changeReviewFacts(form: ReviewWorkCopy, patch: Partial<Pick<ReviewWorkCopy, "calculator" | "sourceType">>): ReviewWorkCopy {
  return { ...form, ...patch, math: { ...form.math, confirmed: false }, taxonomy: { ...form.taxonomy, confirmed: false },
    source: { ...form.source, confirmed: false }, render: { ...form.render, confirmed: false } };
}
/** No imported status, notes, flags, reviewer or identity can set a confirmation to true. */
export function buildHumanReview(plan: PublicationPlanItem, form: ReviewWorkCopy): HumanQuestionReview {
  for (const key of ["math", "taxonomy", "source", "render"] as const)
    if (form[key].confirmed !== true || !form[key].notes.trim()) throw new Error(`Confirm ${key} review and explain the verification.`);
  if (!["no_calculator", "calculator_allowed", "calculator_required"].includes(form.calculator)) throw new Error("Choose the verified calculator policy.");
  if (!["original", "licensed", "public_domain", "permission_granted"].includes(form.sourceType)) throw new Error("Choose a supported source-use category based on actual evidence.");
  if (plan.printedNumber ? !form.printedNumberVerified : !plan.locator || !form.locatorVerified)
    throw new Error(plan.printedNumber ? "Verify the question number is printed in the source." : "Verify that the locator uniquely identifies the source question.");
  if (form.locatorVerified && !plan.locator) throw new Error("An absent locator cannot be verified.");
  if (plan.item.versionStatus !== "draft" && (form.calculator !== plan.calculator || form.sourceType !== plan.sourceType
    || form.locatorVerified !== plan.locatorVerified)) throw new Error("Publication facts are read-only for this version. Return to draft or save a revision before changing them.");
  const flag_resolutions = Object.fromEntries(plan.flags.map(flag => {
    if (!form.resolutions[flag]?.trim()) throw new Error(`Record how ${flag} was resolved.`);
    return [flag, form.resolutions[flag].trim()];
  }));
  return { math: { confirmed: true, notes: form.math.notes.trim() }, taxonomy: { confirmed: true, notes: form.taxonomy.notes.trim() },
    source: { confirmed: true, notes: form.source.notes.trim(), source_type: form.sourceType as HumanQuestionReview["source"]["source_type"],
      locator_verified: form.locatorVerified, printed_number_verified: form.printedNumberVerified },
    render: { confirmed: true, notes: form.render.notes.trim() }, calculator_policy: form.calculator as HumanQuestionReview["calculator_policy"], flag_resolutions };
}
const reviewFixable = new Set(["QB_REVIEW_REQUIRED", "QB_REVIEW_STALE", "QB_CALCULATOR_REQUIRED", "QB_SOURCE_TYPE_REQUIRED",
  "QB_LOCATOR_UNVERIFIED", "QB_PRINTED_NUMBER_UNVERIFIED", "QB_FLAG_UNRESOLVED"]);
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
    const form = emptyReviewWorkCopy(v.calculator_policy ?? "", v.source_type ?? "");
    // Existing content facts may be shown, but never infer a human confirmation.
    if (v.status !== "draft") form.locatorVerified = v.source_locator_verified;
    return { item, check, flags: originalReviewFlags(v.import_evidence), printedNumber: v.source_question_number,
      locator: v.source_locator, locatorVerified: v.source_locator_verified, sourceDocument: v.source_document,
      sourcePage: v.source_page, calculator: v.calculator_policy, sourceType: v.source_type, evidence: v.import_evidence, form };
  }));
}

export function validatePublicationSelection(plans: readonly PublicationPlanItem[], selected: ReadonlySet<string>, freshReviews: ReadonlySet<string>) {
  const chosen = plans.filter(plan => selected.has(plan.item.id));
  if (!chosen.length || chosen.length > 20 || chosen.length !== selected.size) throw new Error("Select 1–20 listed problems for one atomic publication.");
  if (new Set(chosen.map(plan => plan.item.id)).size !== chosen.length) throw new Error("A question cannot appear twice.");
  return chosen.map(plan => {
    if (publicationContentBlockers(plan).length) throw new Error(`${plan.item.externalId}: resolve the content issues before publication.`);
    const reuse = plan.check.eligible && plan.check.review?.current && !freshReviews.has(plan.item.id);
    return { plan, target: publicationTarget(plan), review: reuse ? null : buildHumanReview(plan, plan.form) };
  });
}

/** Only the FINAL confirmation calls this. Review records are explicit writes; publication itself is one atomic RPC. */
export async function confirmPublicationPlan(client: SupabaseClient<Database>, plans: readonly PublicationPlanItem[], selected: ReadonlySet<string>, freshReviews: ReadonlySet<string>) {
  const chosen = validatePublicationSelection(plans, selected, freshReviews);
  const targets: PublicationTarget[] = [];
  for (const { plan, target, review } of chosen) {
    const check = review ? (await recordQuestionVersionReview(client, target, review)).precheck : plan.check;
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
