import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '../integrations/supabase/types.ts';
import type { CourseVideo } from '../components/courses/types.ts';

export interface CourseTopic { id: string; code: string; title: string; is_published: boolean; big_idea?: string; is_bc_only?: boolean }
export interface CourseUnit { id: string; unit_number: number; title: string; topics: CourseTopic[]; ab_exam_weight_min?: number | null; ab_exam_weight_max?: number | null; bc_exam_weight_min?: number | null; bc_exam_weight_max?: number | null }
export interface TopicContent { course_id: string; topic_id: string; is_published: boolean; game_path: string | null; videos: CourseVideo[]; lesson_id?: string | null; revision?: number; owner_course_id?: string; linked_courses?: { id: string; title: string }[]; shared_video_topics?: { video_id: string; topic_code: string }[] }
export interface EditableVideo { id?: string; title: string; video_url: string }
export function youtubeId(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    let id: string | null = null;
    if (url.hostname === 'youtu.be') id = url.pathname.slice(1);
    if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname)) {
      if (url.pathname === '/watch') { if (url.searchParams.getAll('v').length !== 1) return null; id = url.searchParams.get('v'); }
      else id = url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)$/)?.[1] ?? null;
    }
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}
export function courseLocation(courseId: string, topicId?: string) {
  return '/courses?' + new URLSearchParams({ course: courseId, ...(topicId ? { topic: topicId } : {}) });
}
export async function loadCourseOutline(client: SupabaseClient<Database>, courseId: string): Promise<CourseUnit[]> {
  const { data, error } = await client.rpc('get_course_outline', { _course_id: courseId });
  if (error) throw new Error(error.message);
  if (!Array.isArray(data)) throw new Error('Could not verify course outline.');
  return data as unknown as CourseUnit[];
}
export async function loadCourseTopic(client: SupabaseClient<Database>, courseId: string, topicId: string): Promise<TopicContent> {
  const { data, error } = await client.rpc('get_course_topic', { _course_id: courseId, _topic_id: topicId });
  if (error) throw new Error(error.message);
  const content = data as unknown as TopicContent;
  if (content?.course_id !== courseId || content.topic_id !== topicId || !Array.isArray(content.videos)) throw new Error('Could not verify lesson content.');
  return content;
}
export async function saveCourseTopic(client: SupabaseClient<Database>, courseId: string, topicId: string, published: boolean, videos: EditableVideo[], gamePath: string | null, current?: TopicContent) {
  if (videos.some(v => !v.title.trim() || !youtubeId(v.video_url))) throw new Error('Each video needs a title and valid HTTPS YouTube URL.');
  if (current && (!Number.isSafeInteger(current.revision) || !Array.isArray(current.linked_courses))) throw new Error('Shared lesson migration is required before editing. Reload after deployment.');
  const args = { _course_id: courseId, _topic_id: topicId, _is_published: published, _videos: videos.map(v => ({ ...v, video_url: 'https://www.youtube.com/watch?v=' + youtubeId(v.video_url) })) as unknown as Json, _game_path: gamePath };
  const { error } = current ? await client.rpc('save_course_lesson', { ...args, _expected_revision: current.revision!, _expected_lesson_id: current.lesson_id ?? null }) : await client.rpc('save_course_topic', args);
  if (error) throw new Error(error.message);
}

export interface SavedCourseLesson {
  lesson_id: string; topic_id: string; topic_code: string; topic_title: string; is_published: boolean; revision: number;
  owner_course_id: string; owner_course_title: string; updated_at: string; archived: boolean; courses: { id: string; title: string }[];
}
export async function listSavedCourseLessons(client: SupabaseClient<Database>): Promise<SavedCourseLesson[]> {
  const { data, error } = await client.rpc('list_saved_course_lessons');
  if (error) throw new Error(error.message);
  if (!Array.isArray(data) || data.some(l => !l || typeof l !== 'object' || Array.isArray(l) || typeof l.lesson_id !== 'string' || typeof l.topic_id !== 'string' || typeof l.archived !== 'boolean' || !Array.isArray(l.courses))) throw new Error('Could not verify saved lessons.');
  return data as unknown as SavedCourseLesson[];
}
export async function shareCourseLesson(client: SupabaseClient<Database>, current: TopicContent, other: TopicContent, useOther: boolean) {
  const { error } = await client.rpc('share_course_lesson', { _course_id: current.course_id, _topic_id: current.topic_id, _other_course_id: other.course_id, _use_other: useOther, _expected_lesson_id: current.lesson_id ?? null, _expected_revision: current.revision!, _expected_other_lesson_id: other.lesson_id ?? null, _expected_other_revision: other.revision! });
  if (error) throw new Error(error.message);
}
export async function restoreCourseLesson(client: SupabaseClient<Database>, current: TopicContent, source: { lesson_id: string; revision: number }) {
  const { error } = await client.rpc('restore_course_lesson', { _course_id: current.course_id, _topic_id: current.topic_id, _source_lesson_id: source.lesson_id, _source_revision: source.revision, _expected_lesson_id: current.lesson_id ?? null, _expected_revision: current.revision! });
  if (error) throw new Error(error.message);
}
