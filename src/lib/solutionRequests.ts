import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../integrations/supabase/types.ts';

// Answers live as numbered replies; all reads and writes go through the sr_* database functions.
export type SrClient = SupabaseClient<Database>;
export type SrStatus = 'awaiting' | 'replied' | 'answered' | 'solved';
export type ProblemType = Database['public']['Enums']['problem_type'];
export type Bilingual = readonly [en: string, zh: string];

export const BUCKET = 'solution-images';
export const LIMITS = {
  title: 120, body: 5000, reportReason: 500, questionImages: 3, replyImages: 1,
  imageBytes: 5 * 1024 * 1024, dailyQuestions: 5,
} as const;
export const IMAGE_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };

export const PROBLEM_TYPES: readonly { value: ProblemType; label: Bilingual }[] = [
  { value: 'calculus', label: ['Calculus', '微积分'] },
  { value: 'pre_calculus', label: ['Pre-Calculus', '预备微积分'] },
  { value: 'algebra', label: ['Algebra', '代数'] },
  { value: 'geometry', label: ['Geometry', '几何'] },
  { value: 'statistics', label: ['Statistics', '统计'] },
  { value: 'number_theory', label: ['Number Theory', '数论'] },
  { value: 'combinatorics', label: ['Combinatorics', '组合'] },
  { value: 'other', label: ['Other', '其他'] },
];
export const STATUSES: readonly SrStatus[] = ['awaiting', 'replied', 'answered', 'solved'];
export const STATUS_LABELS: Record<SrStatus, Bilingual> = {
  awaiting: ['Awaiting answer', '等待解答'],
  replied: ['Has replies', '有同学回复'],
  answered: ['Answered', '已解答'],
  solved: ['Solved', '已解决'],
};

export interface SrAuthor { name: string | null; anonymous: boolean; official: boolean; is_mine: boolean }
export interface SrSummary {
  id: string; title: string; description: string; problem_type: ProblemType | null; status: SrStatus;
  is_public: boolean; is_anonymous: boolean; is_closed: boolean; is_hidden: boolean;
  created_at: string; edited_at: string | null; last_activity_at: string; reply_count: number;
  image_paths: string[]; has_official: boolean; author: SrAuthor; open_reports: number | null;
}
export interface SrQuote { floor: number; excerpt: string | null; missing: boolean }
export interface SrReply {
  id: string; floor: number; body: string | null; image_path: string | null; is_hidden: boolean;
  is_op: boolean; is_accepted: boolean; created_at: string; edited_at: string | null;
  author: SrAuthor; quote: SrQuote | null; open_reports: number | null;
}
export interface SrReport { id: string; reply_id: string | null; floor: number | null; reason: string; created_at: string; reporter: string }
export interface SrThread {
  request: SrSummary & {
    accepted_reply_id: string | null; solved_at: string | null; closed_at: string | null;
    can_edit: boolean; can_manage: boolean; can_moderate: boolean; can_reply: boolean;
  };
  replies: SrReply[];
  reports: SrReport[] | null;
  viewer: { signed_in: boolean; is_answerer: boolean };
}
export interface SrListResult { items: SrSummary[]; has_more: boolean }
export interface SrQuota { limit: number; used: number; unlimited: boolean }
export interface SrQueueReport extends SrReport { request_id: string; request_title: string; excerpt: string }
export interface SrListOptions {
  scope: 'mine' | 'public' | 'admin'; status?: SrStatus | 'needs_answer' | null; problemType?: ProblemType | null;
  includeClosed?: boolean; visibility?: 'public' | 'private' | null; offset?: number; limit?: number;
}
export interface QuestionDraft {
  title: string; description: string; problemType: ProblemType | ''; isPublic: boolean; isAnonymous: boolean;
}

// ---- Pure helpers (unit tested) ----

const ERRORS: Record<string, Bilingual> = {
  SR_AUTH: ['Sign in first.', '请先登录。'],
  SR_NOT_FOUND: ['This question no longer exists or is not visible to you.', '这个问题已被删除，或者你没有权限查看。'],
  SR_FORBIDDEN: ["You can't do that here.", '你没有权限进行这个操作。'],
  SR_CLOSED: ['This thread is closed. Reopen it to reply.', '帖子已关闭，重新打开后才能回复。'],
  SR_DAILY_LIMIT: ['You have asked 5 questions in the last 24 hours. Try again later.', '24 小时内最多提 5 个问题，请稍后再来。'],
  SR_RATE_LIMIT: ['You are replying too fast. Wait a while and try again.', '回复太频繁了，请稍后再试。'],
  SR_IMAGE: ['An image could not be attached. Upload it again.', '图片没有附上，请重新上传。'],
  SR_IMAGE_COUNT: ['Too many images.', '图片数量超过上限。'],
  SR_REQUIRED: ['Fill in the required fields.', '请填写必填内容。'],
  SR_TOO_LONG: ['The text is too long.', '内容太长了。'],
  SR_INVALID: ['That request is not valid.', '请求无效。'],
};
const FALLBACK: Bilingual = ['Something went wrong. Try again.', '出错了，请重试。'];

export function errorCode(error: unknown): string | null {
  const message = error && typeof error === 'object' && 'message' in error ? String((error as { message: unknown }).message) : '';
  const match = /^(SR_[A-Z_]+)/.exec(message);
  return match ? match[1] : null;
}
export function errorText(error: unknown): Bilingual {
  const code = errorCode(error);
  return (code && ERRORS[code]) || FALLBACK;
}

export function problemTypeLabel(value: string | null | undefined): Bilingual {
  return PROBLEM_TYPES.find(type => type.value === value)?.label ?? ['Other', '其他'];
}

/** Label for a post's author. Admins get the real name next to "Anonymous". */
export function authorLabel(author: SrAuthor): Bilingual {
  if (author.official) return [author.name ?? 'O2I', author.name ?? 'O2I'];
  if (author.anonymous) return author.name ? [`Anonymous (${author.name})`, `匿名（${author.name}）`] : ['Anonymous', '匿名同学'];
  return author.name ? [author.name, author.name] : ['Student', '同学'];
}

export function validateQuestion(draft: QuestionDraft, imageCount: number): Bilingual[] {
  const errors: Bilingual[] = [];
  const title = draft.title.trim();
  if (!title) errors.push(['Add a title.', '请填写标题。']);
  if (title.length > LIMITS.title) errors.push([`Keep the title within ${LIMITS.title} characters.`, `标题不超过 ${LIMITS.title} 字。`]);
  if (draft.description.trim().length > LIMITS.body) errors.push([`Keep the description within ${LIMITS.body} characters.`, `描述不超过 ${LIMITS.body} 字。`]);
  if (!draft.problemType) errors.push(['Choose a problem type.', '请选择题目类型。']);
  if (imageCount > LIMITS.questionImages) errors.push([`At most ${LIMITS.questionImages} images.`, `最多 ${LIMITS.questionImages} 张图片。`]);
  return errors;
}

export function validateReply(body: string, hasImage: boolean): Bilingual | null {
  if (!body.trim() && !hasImage) return ['Write something or attach an image.', '请写点内容或附一张图。'];
  if (body.trim().length > LIMITS.body) return [`Keep replies within ${LIMITS.body} characters.`, `回复不超过 ${LIMITS.body} 字。`];
  return null;
}

export function validateImage(file: { type: string; size: number }): Bilingual | null {
  if (!IMAGE_TYPES[file.type]) return ['Use a JPG, PNG, WebP or GIF image.', '请上传 JPG、PNG、WebP 或 GIF 图片。'];
  if (file.size > LIMITS.imageBytes) return ['Each image must be 5 MB or smaller.', '每张图片不能超过 5MB。'];
  return null;
}

/** New uploads never carry the user id in the path, so anonymous posts stay anonymous. */
export function newImagePath(type: string, uuid: () => string = () => crypto.randomUUID()): string {
  const ext = IMAGE_TYPES[type];
  if (!ext) throw new Error('Unsupported image type');
  return `r/${uuid()}.${ext}`;
}

export function quotaLeft(quota: SrQuota | null): number | null {
  if (!quota || quota.unlimited) return null;
  return Math.max(0, quota.limit - quota.used);
}

export function excerpt(text: string | null | undefined, max = 140): string {
  const flat = (text ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

// ---- Database calls ----

async function rpc<T>(promise: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await promise;
  if (error) throw error;
  return data as T;
}

export const srList = (client: SrClient, o: SrListOptions) => rpc<SrListResult>(client.rpc('sr_list', {
  _scope: o.scope, _status: o.status ?? null, _problem_type: o.problemType ?? null, _include_closed: o.includeClosed ?? true,
  _visibility: o.visibility ?? null, _offset: o.offset ?? 0, _limit: o.limit ?? 20,
}));
export const srGet = (client: SrClient, id: string) => rpc<SrThread>(client.rpc('sr_get', { _id: id }));
export const srQuota = (client: SrClient) => rpc<SrQuota>(client.rpc('sr_quota'));
export const srAdminSummary = (client: SrClient) => rpc<{ needs_answer: number; open_reports: number }>(client.rpc('sr_admin_summary'));
export const srListReports = (client: SrClient) => rpc<SrQueueReport[]>(client.rpc('sr_list_reports'));

export const srCreate = (client: SrClient, d: QuestionDraft, images: string[]) => rpc<string>(client.rpc('sr_create', {
  _title: d.title, _description: d.description, _problem_type: (d.problemType || 'other') as ProblemType,
  _image_paths: images, _is_public: d.isPublic, _is_anonymous: d.isAnonymous,
}));
export async function srUpdate(client: SrClient, id: string, d: QuestionDraft, images: string[]) {
  const out = await rpc<{ removed_images: string[] }>(client.rpc('sr_update', {
    _id: id, _title: d.title, _description: d.description, _problem_type: (d.problemType || 'other') as ProblemType,
    _image_paths: images, _is_public: d.isPublic, _is_anonymous: d.isAnonymous,
  }));
  await removeImages(client, out.removed_images);
}
export async function srWithdraw(client: SrClient, id: string) {
  const out = await rpc<{ removed_images: string[] }>(client.rpc('sr_withdraw', { _id: id }));
  await removeImages(client, out.removed_images);
}
export const srSetSolved = (client: SrClient, id: string, solved: boolean, acceptedReply: string | null = null) =>
  rpc<null>(client.rpc('sr_set_solved', { _id: id, _solved: solved, _accepted_reply: acceptedReply }));
export const srSetClosed = (client: SrClient, id: string, closed: boolean) => rpc<null>(client.rpc('sr_set_closed', { _id: id, _closed: closed }));
export const srHideRequest = (client: SrClient, id: string, hidden: boolean) => rpc<null>(client.rpc('sr_hide_request', { _id: id, _hidden: hidden }));
export const srReply = (client: SrClient, requestId: string, body: string, image: string | null, anonymous: boolean, quoted: string | null) =>
  rpc<string>(client.rpc('sr_reply', { _request: requestId, _body: body, _image_path: image, _is_anonymous: anonymous, _quoted_reply: quoted }));
export async function srEditReply(client: SrClient, replyId: string, body: string, image: string | null, anonymous: boolean | null) {
  const out = await rpc<{ removed_images: string[] }>(client.rpc('sr_edit_reply', { _reply: replyId, _body: body, _image_path: image, _is_anonymous: anonymous }));
  await removeImages(client, out.removed_images);
}
export async function srDeleteReply(client: SrClient, replyId: string) {
  const out = await rpc<{ removed_images: string[] }>(client.rpc('sr_delete_reply', { _reply: replyId }));
  await removeImages(client, out.removed_images);
}
export const srHideReply = (client: SrClient, replyId: string, hidden: boolean) => rpc<null>(client.rpc('sr_hide_reply', { _reply: replyId, _hidden: hidden }));
export const srReport = (client: SrClient, requestId: string, replyId: string | null, reason: string) =>
  rpc<{ status: 'reported' | 'already_reported' }>(client.rpc('sr_report', { _request: requestId, _reply: replyId, _reason: reason }));
export const srResolveReport = (client: SrClient, reportId: string) => rpc<null>(client.rpc('sr_resolve_report', { _report: reportId }));

/** Uploads in order; if one fails, the ones already uploaded are removed again. */
export async function uploadImages(client: SrClient, files: File[]): Promise<string[]> {
  const paths: string[] = [];
  try {
    for (const file of files) {
      const problem = validateImage(file);
      if (problem) throw new Error(problem[0]);
      const path = newImagePath(file.type);
      const { error } = await client.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      paths.push(path);
    }
    return paths;
  } catch (error) {
    await removeImages(client, paths);
    throw error;
  }
}

/** Best effort: a file left behind is unreadable once nothing references it. */
export async function removeImages(client: SrClient, paths: string[] | null | undefined) {
  if (!paths?.length) return;
  try { await client.storage.from(BUCKET).remove(paths); } catch { /* ignored */ }
}

export async function signImages(client: SrClient, paths: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length) return {};
  const { data, error } = await client.storage.from(BUCKET).createSignedUrls(unique, 3600);
  if (error || !data) return {};
  return Object.fromEntries(data.filter(item => item.signedUrl && item.path).map(item => [item.path as string, item.signedUrl]));
}
