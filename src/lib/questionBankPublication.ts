import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../integrations/supabase/types.ts";
import type { EditableQuestionField } from "./questionBankPreviewEdits.ts";

export type PublicationAction = "publish" | "republish";
export type QuestionStatus = Database["public"]["Enums"]["question_status"];
export type VersionStatus = Database["public"]["Enums"]["question_version_status"];
export interface PublicationIssue { code: string; field: string; message: string; flag?: string }
export interface PublicationPrecheck {
  question_id: string; version_id: string; action: PublicationAction;
  question_status: QuestionStatus | null; version_status: VersionStatus | null;
  current_version_id: string | null; working_version_id: string | null;
  fingerprint: string | null; eligible: boolean; issues: PublicationIssue[];
  review: { id: string; reviewed_by: string; reviewed_at: string; current: boolean } | null;
}
export interface PublicationTarget {
  question_id: string; version_id: string; expected_fingerprint: string; action: PublicationAction;
}
export interface HumanQuestionReview {
  math: { confirmed: true; notes: string };
  taxonomy: { confirmed: true; notes: string };
  source: { confirmed: true; notes: string; source_type: Database["public"]["Enums"]["question_source_type"];
    locator_verified: boolean; printed_number_verified: boolean };
  render: { confirmed: true; notes: string };
  calculator_policy: Database["public"]["Enums"]["question_calculator_policy"];
  flag_resolutions: Record<string, string>;
}
export interface PublicationEvent {
  id: string; question_id: string; version_id: string; previous_version_id: string | null;
  action: PublicationAction | "unpublish" | "archive"; request_fingerprint: string; actor_id: string; occurred_at: string;
}
export interface QuestionPublicationState {
  question_id: string; external_id: string; status: QuestionStatus; current_version_id: string | null;
  versions: { version_id: string; version_number: number; status: VersionStatus; fingerprint: string }[];
  events: PublicationEvent[];
}
export interface PublicationResult {
  question_id: string; version_id: string; status: "approved" | "unpublished" | "retired";
  current_version_id: string | null; event_id: string; fingerprint?: string; action?: PublicationAction;
}

export class QuestionPublicationError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown>;
  constructor(code: string, message: string, details: Record<string, unknown> = {}) {
    super(message); this.name = "QuestionPublicationError"; this.code = code; this.details = details;
  }
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
function databaseError(error: { message: string; details?: string; code?: string }) {
  let details: Record<string, unknown> = {};
  try { const parsed: unknown = JSON.parse(error.details ?? "{}"); if (object(parsed)) details = parsed; } catch { /* transport/permission errors need no JSON detail */ }
  const code = typeof details.code === "string" ? details.code
    : error.code === "42501" ? "QB_FORBIDDEN" : error.code === "40001" ? "QB_STALE" : "QB_DATABASE_REJECTED";
  return new QuestionPublicationError(code, error.message, details);
}
function invalidResponse(): never {
  throw new QuestionPublicationError("QB_RESULT_UNVERIFIED", "The database result could not be verified. Read publication state before retrying; do not assume the operation failed.");
}
function precheckResult(value: unknown): PublicationPrecheck {
  if (!object(value) || typeof value.question_id !== "string" || typeof value.version_id !== "string"
    || !["publish", "republish"].includes(String(value.action)) || typeof value.eligible !== "boolean" || !Array.isArray(value.issues)
    || value.issues.some(issue => !object(issue) || typeof issue.code !== "string" || typeof issue.message !== "string" || typeof issue.field !== "string")
    || (value.fingerprint !== null && typeof value.fingerprint !== "string")) invalidResponse();
  return value as unknown as PublicationPrecheck;
}
function mutationResult(value: unknown, target: Pick<PublicationTarget, "question_id" | "version_id">,
  status: PublicationResult["status"]): PublicationResult {
  if (!object(value) || value.question_id !== target.question_id || value.version_id !== target.version_id || value.status !== status
    || value.current_version_id !== (status === "retired" ? null : target.version_id) || typeof value.event_id !== "string") invalidResponse();
  return value as unknown as PublicationResult;
}

/** Read-only, including when blocked. Reading or opening an editor never creates a revision. */
export async function precheckQuestionPublication(client: SupabaseClient<Database>, questionId: string, versionId: string,
  action: PublicationAction = "publish"): Promise<PublicationPrecheck> {
  const { data, error } = await client.rpc("precheck_question_publication", { _question_id: questionId, _version_id: versionId, _action: action });
  if (error) throw databaseError(error);
  const result = precheckResult(data);
  if (result.question_id !== questionId || result.version_id !== versionId || result.action !== action) invalidResponse();
  return result;
}
/** Use after unknown/network-interrupted mutation outcomes instead of blind retry. */
export async function loadQuestionPublicationState(client: SupabaseClient<Database>, questionId: string): Promise<QuestionPublicationState> {
  const { data, error } = await client.rpc("get_question_publication_state", { _question_id: questionId });
  if (error) throw databaseError(error);
  if (!object(data) || data.question_id !== questionId || !Array.isArray(data.versions) || !Array.isArray(data.events)
    || !["draft", "approved", "unpublished", "retired"].includes(String(data.status))) invalidResponse();
  return data as unknown as QuestionPublicationState;
}
/** Explicit human confirmation only. Never map imported pending/approved cells to this input. */
export async function recordQuestionVersionReview(client: SupabaseClient<Database>, target: PublicationTarget, review: HumanQuestionReview) {
  const { data, error } = await client.rpc("record_question_version_review", {
    _question_id: target.question_id, _version_id: target.version_id, _expected_fingerprint: target.expected_fingerprint, _review: review as unknown as Json,
  });
  if (error) throw databaseError(error);
  if (!object(data) || typeof data.review_id !== "string") invalidResponse();
  const checked = precheckResult(data.precheck);
  if (checked.question_id !== target.question_id || checked.version_id !== target.version_id) invalidResponse();
  return { reviewId: data.review_id, precheck: checked };
}
/** Explicit Save only. Server atomically clones + uses the existing Task 4B metadata validator. */
export async function saveQuestionBankRevision(client: SupabaseClient<Database>, target: PublicationTarget, metadata: Record<EditableQuestionField, unknown>) {
  const { data, error } = await client.rpc("save_question_bank_revision", {
    _question_id: target.question_id, _source_version_id: target.version_id, _expected_fingerprint: target.expected_fingerprint, _metadata: metadata as Json,
  });
  if (error) throw databaseError(error);
  if (!object(data) || data.question_id !== target.question_id || typeof data.version_id !== "string" || data.version_id === target.version_id || data.status !== "draft") invalidResponse();
  return { questionId: data.question_id, versionId: data.version_id };
}
export async function publishQuestionVersions(client: SupabaseClient<Database>, targets: readonly PublicationTarget[]): Promise<PublicationResult[]> {
  if (!targets.length || targets.length > 20) throw new QuestionPublicationError("QB_BATCH_LIMIT", "Select 1–20 explicit publication targets.");
  if (new Set(targets.map(target => target.question_id)).size !== targets.length || new Set(targets.map(target => target.version_id)).size !== targets.length)
    throw new QuestionPublicationError("QB_DUPLICATE_TARGET", "A question or version cannot occur twice in a publication batch.");
  const { data, error } = await client.rpc("publish_question_versions", { _items: targets as unknown as Json });
  if (error) throw databaseError(error);
  if (!Array.isArray(data) || data.length !== targets.length) invalidResponse();
  const byId = new Map(targets.map(target => [target.question_id, target]));
  const seen = new Set<string>();
  return data.map(value => {
    if (!object(value) || typeof value.question_id !== "string" || seen.has(value.question_id)) invalidResponse();
    seen.add(value.question_id); const target = byId.get(value.question_id);
    if (!target || value.action !== target.action) invalidResponse();
    return mutationResult(value, target, "approved");
  });
}
export async function publishQuestionVersion(client: SupabaseClient<Database>, target: PublicationTarget) {
  return (await publishQuestionVersions(client, [{ ...target, action: "publish" }]))[0];
}
export async function republishQuestion(client: SupabaseClient<Database>, target: PublicationTarget) {
  return (await publishQuestionVersions(client, [{ ...target, action: "republish" }]))[0];
}
export async function unpublishQuestion(client: SupabaseClient<Database>, target: PublicationTarget) {
  const { data, error } = await client.rpc("unpublish_question", { _question_id: target.question_id, _version_id: target.version_id, _expected_fingerprint: target.expected_fingerprint });
  if (error) throw databaseError(error); return mutationResult(data, target, "unpublished");
}
export async function archiveQuestion(client: SupabaseClient<Database>, target: PublicationTarget) {
  const { data, error } = await client.rpc("archive_question", { _question_id: target.question_id, _version_id: target.version_id, _expected_fingerprint: target.expected_fingerprint });
  if (error) throw databaseError(error); return mutationResult(data, target, "retired");
}
