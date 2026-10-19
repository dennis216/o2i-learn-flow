import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../integrations/supabase/types.ts';

export interface PracticeTopic { id: string; code: string; title: string; question_count: number }
export interface SavedPracticeAnswer {
  id: string; selected_option_id: string; is_correct: boolean; submitted_at: string;
  elapsed_seconds: number | null; correct_option_id: string; solution: string;
}
export interface IssuedPracticeQuestion {
  question_id: string; version_id: string; position: number; stem: string;
  difficulty: string; calculator_policy: string | null; course_scope: string;
  image_url: string | null; requires_figure: boolean;
  topic: { id: string; code: string; title: string }; skills: string[];
  options: { id: string; key: string; text: string }[];
  attempt: SavedPracticeAnswer | null;
}
export interface PracticeSession { id: string; topic_id: string | null; created_at: string; questions: IssuedPracticeQuestion[] }
export interface RecentPracticeAnswer {
  id: string; session_id: string; question_id: string; version_id: string; selected_option_id: string;
  is_correct: boolean; submitted_at: string; elapsed_seconds: number | null; topic_code: string; topic_title: string;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Old lesson/skill IDs have no canonical mapping. Never drop an unsupported filter. */
export function parsePracticeRoute(params: URLSearchParams) {
  const allowed = new Set(['subject', 'source', 'topic', 'session']);
  if ([...params.keys()].some(key => !allowed.has(key)) || [...allowed].some(key => params.getAll(key).length > 1))
    return { error: 'This practice filter is not connected to the published question bank. Choose a published Topic in Practice.' };
  if (params.has('subject') && params.get('subject') !== 'calculus') return { error: 'This subject has no published practice connection.' };
  for (const key of ['topic', 'session']) if (params.has(key) && !uuid.test(params.get(key) ?? '')) return { error: `Invalid ${key} identity. Return to Practice and choose a published Topic.` };
  return { topicId: params.get('topic') ?? undefined, sessionId: params.get('session') ?? undefined };
}
export function readPracticeSession(value: unknown, expectedId: string): PracticeSession {
  const s = value as PracticeSession;
  if (!s || s.id !== expectedId || !Array.isArray(s.questions) || s.questions.length > 5
    || new Set(s.questions.map(q => q.question_id)).size !== s.questions.length
    || s.questions.some(q => !uuid.test(q.question_id) || !uuid.test(q.version_id) || !q.stem || !q.topic?.id
      || !Array.isArray(q.skills) || !Array.isArray(q.options) || q.options.length < 2 || q.options.length > 6
      || new Set(q.options.map(o => o.id)).size !== q.options.length || q.options.some(o => !uuid.test(o.id) || !o.key || !o.text)
      || (q.attempt !== null && (!q.attempt?.id || typeof q.attempt.is_correct !== 'boolean' || !q.attempt.submitted_at || !q.attempt.solution
        || !q.options.some(o => o.id === q.attempt?.selected_option_id) || !q.options.some(o => o.id === q.attempt?.correct_option_id)))))
    throw new Error('The saved practice response could not be verified. Reload your session.');
  return s;
}
export async function startPractice(client: SupabaseClient<Database>, id: string, topicId?: string) {
  const { data, error } = await client.rpc('start_question_practice', { _session_id: id, _topic_id: topicId ?? undefined });
  if (error) throw new Error(error.message);
  return readPracticeSession(data, id);
}
export async function readPractice(client: SupabaseClient<Database>, id: string) {
  const { data, error } = await client.rpc('get_question_practice', { _session_id: id });
  if (error) throw new Error(error.message);
  return readPracticeSession(data, id);
}
export async function submitPractice(client: SupabaseClient<Database>, sessionId: string, questionId: string, optionId: string, seconds: number) {
  const { data, error } = await client.rpc('submit_question_practice', { _session_id: sessionId, _question_id: questionId, _option_id: optionId, _elapsed_seconds: seconds });
  if (error) throw new Error(error.message);
  const s = readPracticeSession(data, sessionId);
  if (!s.questions.find(q => q.question_id === questionId)?.attempt) throw new Error('The answer save could not be verified. Check the saved result.');
  return s;
}
export async function loadPracticeHome(client: SupabaseClient<Database>) {
  const [topics, history] = await Promise.all([client.rpc('list_question_practice_topics'), client.rpc('list_question_practice_attempts')]);
  if (topics.error || history.error) throw new Error(topics.error?.message ?? history.error?.message);
  if (!Array.isArray(topics.data) || !Array.isArray(history.data)) throw new Error('Could not verify account practice data.');
  return { topics: topics.data as unknown as PracticeTopic[], history: history.data as unknown as RecentPracticeAnswer[] };
}
