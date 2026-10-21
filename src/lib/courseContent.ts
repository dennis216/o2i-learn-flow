import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '../integrations/supabase/types.ts';
import type { CourseVideo } from '../components/courses/types.ts';

export interface CourseTopic { id: string; code: string; title: string; is_published: boolean; big_idea?: string; is_bc_only?: boolean }
export interface CourseUnit { id: string; unit_number: number; title: string; topics: CourseTopic[]; ab_exam_weight_min?: number | null; ab_exam_weight_max?: number | null; bc_exam_weight_min?: number | null; bc_exam_weight_max?: number | null }
export interface TopicContent { course_id: string; topic_id: string; is_published: boolean; game_path: string | null; videos: CourseVideo[] }
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
export async function saveCourseTopic(client: SupabaseClient<Database>, courseId: string, topicId: string, published: boolean, videos: EditableVideo[], gamePath: string | null) {
  if (videos.some(v => !v.title.trim() || !youtubeId(v.video_url))) throw new Error('Each video needs a title and valid HTTPS YouTube URL.');
  const { error } = await client.rpc('save_course_topic', { _course_id: courseId, _topic_id: topicId, _is_published: published, _videos: videos.map(v => ({ ...v, video_url: 'https://www.youtube.com/watch?v=' + youtubeId(v.video_url) })) as unknown as Json, _game_path: gamePath });
  if (error) throw new Error(error.message);
}
