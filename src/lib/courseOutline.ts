import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '../integrations/supabase/types.ts';
import { youtubeId, type CourseUnit, type EditableVideo, type TopicContent } from './courseContent.ts';

export interface CanonicalTopic { id: string; code: string; title: string; is_bc_only?: boolean }
export interface OutlineEntry extends CanonicalTopic { entry_id: string; is_published: boolean; content_id?: string | null; cb_topics: CanonicalTopic[] }
export interface OutlineUnit extends Omit<CourseUnit, 'topics'> { topics: OutlineEntry[] }
export interface CourseOutline { revision: number; units: OutlineUnit[] }
export type OutlineAction = 'save' | 'merge' | 'remove' | 'restore' | 'reorder' | 'split';
// The generated Database type is extended once here until schema type generation is available.
type OutlineRpc = (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
export async function outlineRpc(client: SupabaseClient<Database>, name: string, args: Record<string, unknown>) {
  const { data, error } = await (client.rpc.bind(client) as unknown as OutlineRpc)(name, args);
  if (error) throw new Error(error.message);
  return data;
}
export async function loadCustomOutline(client: SupabaseClient<Database>, courseId: string): Promise<CourseOutline> {
  const data = await outlineRpc(client, 'get_course_outline_v2', { _course_id: courseId }) as CourseOutline;
  if (!data || !Number.isSafeInteger(data.revision) || !Array.isArray(data.units) || data.units.some(u => !Array.isArray(u.topics) || u.topics.some(e => typeof e.entry_id !== 'string' || !Array.isArray(e.cb_topics) || !e.cb_topics.length))) throw new Error('Could not verify course outline.');
  return data;
}
export async function loadOutlineEntry(client: SupabaseClient<Database>, courseId: string, entryId: string): Promise<TopicContent> {
  const data = await outlineRpc(client, 'get_course_outline_entry', { _course_id: courseId, _entry_id: entryId }) as TopicContent;
  if (!data || data.course_id !== courseId || data.entry_id !== entryId || !Array.isArray(data.videos)) throw new Error('Could not verify lesson content.');
  return data;
}
export async function editOutline(client: SupabaseClient<Database>, courseId: string, revision: number, action: OutlineAction, payload: Record<string, unknown>) {
  return await outlineRpc(client, 'edit_course_outline', { _course_id: courseId, _expected_revision: revision, _action: action, _payload: payload as Json }) as string | null;
}
export async function saveOutlineContent(client: SupabaseClient<Database>, current: TopicContent, published: boolean, videos: EditableVideo[], gamePath: string | null) {
  if (!current.entry_id || !Number.isSafeInteger(current.revision)) throw new Error('Reload this lesson before saving.');
  if (videos.some(v => !v.title.trim() || !youtubeId(v.video_url))) throw new Error('Each video needs a title and valid HTTPS YouTube URL.');
  const canonicalVideos = videos.map(v => ({ ...v, video_url: 'https://www.youtube.com/watch?v=' + youtubeId(v.video_url) }));
  await outlineRpc(client, 'save_course_outline_content', { _entry_id: current.entry_id, _is_published: published, _videos: canonicalVideos, _game_path: gamePath, _expected_revision: current.revision, _expected_lesson_id: current.lesson_id ?? null });
}
export function entryLocation(courseId: string, entryId?: string, topicId?: string) {
  return '/courses?' + new URLSearchParams({ course: courseId, ...(entryId ? { lesson: entryId } : {}), ...(topicId ? { topic: topicId } : {}) });
}
