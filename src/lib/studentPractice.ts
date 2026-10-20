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
export interface SelectionSummary {
  rule_version: 'topic-difficulty-v1'; target_difficulty: 'easy' | 'medium' | 'hard' | null;
  sample_count: number; correct_count: number; fallback_count: number;
}
export function selectionRationale(summary?: SelectionSummary | null): string | null {
  if (!summary) return null;
  if (summary.target_difficulty === null) return 'Random practice across published Topics, prioritizing questions you have not seen.';
  const basis = summary.sample_count < 5
    ? 'Building your practice history. Starting with medium difficulty.'
    : `${summary.correct_count}/${summary.sample_count} correct on your most recently answered distinct questions in this Topic. Target difficulty: ${summary.target_difficulty}.`;
  return basis + (summary.fallback_count ? ' Other difficulties are included to prioritize unseen questions or fill this set.' : '');
}
export interface PracticeSession { id: string; topic_id: string | null; created_at: string; selection_summary?: SelectionSummary | null; questions: IssuedPracticeQuestion[] }
export interface RecentPracticeAnswer {
  id: string; session_id: string; question_id: string; version_id: string; selected_option_id: string;
  is_correct: boolean; submitted_at: string; elapsed_seconds: number | null; topic_code: string; topic_title: string;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Old lesson/skill IDs have no canonical mapping. Never drop an unsupported filter. */
export function parsePracticeRoute(params: URLSearchParams) {
  const allowed = new Set(['subject', 'source', 'topic', 'session', 'question']);
  if ([...params.keys()].some(key => !allowed.has(key)) || [...allowed].some(key => params.getAll(key).length > 1))
    return { error: 'This practice filter is not connected to the published question bank. Choose a published Topic in Practice.' };
  if (params.has('subject') && params.get('subject') !== 'calculus') return { error: 'This subject has no published practice connection.' };
  for (const key of ['topic', 'session', 'question']) if (params.has(key) && !uuid.test(params.get(key) ?? '')) return { error: `Invalid ${key} identity. Return to Practice and choose a published Topic.` };
  if (params.has('question') && !params.has('session')) return { error: 'A saved question requires its original practice session.' };
  return { topicId: params.get('topic') ?? undefined, sessionId: params.get('session') ?? undefined, questionId: params.get('question') ?? undefined };
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
  const summary = s.selection_summary;
  if (summary != null && (summary.rule_version !== 'topic-difficulty-v1'
    || ![null, 'easy', 'medium', 'hard'].includes(summary.target_difficulty)
    || !Number.isInteger(summary.sample_count) || summary.sample_count < 0 || summary.sample_count > 10
    || !Number.isInteger(summary.correct_count) || summary.correct_count < 0 || summary.correct_count > summary.sample_count
    || !Number.isInteger(summary.fallback_count) || summary.fallback_count < 0 || summary.fallback_count > s.questions.length
    || (summary.target_difficulty === null && (summary.sample_count !== 0 || summary.correct_count !== 0 || summary.fallback_count !== 0))))
    throw new Error('The selection summary could not be verified. Reload your session.');
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
  const [topics, history] = await Promise.all([client.rpc('list_question_practice_topics'), loadPracticeHistory(client)]);
  if (topics.error) throw new Error(topics.error.message);
  if (!Array.isArray(topics.data)) throw new Error('Could not verify account practice data.');
  return { topics: topics.data as unknown as PracticeTopic[], history };
}
export async function loadPracticeHistory(client: SupabaseClient<Database>, incorrectOnly = false): Promise<RecentPracticeAnswer[]> {
  const { data, error } = await client.rpc('list_question_practice_attempts', incorrectOnly ? { _incorrect_only: true } : {});
  if (error) throw new Error(error.message);
  const rows = data as unknown as RecentPracticeAnswer[];
  if (!Array.isArray(rows) || rows.length > 10 || new Set(rows.map(a => a?.id)).size !== rows.length
    || rows.some(a => !a || typeof a !== 'object' || Array.isArray(a)
      || ![a.id, a.session_id, a.question_id, a.version_id, a.selected_option_id].every(value => typeof value === 'string' && uuid.test(value))
      || typeof a.is_correct !== 'boolean' || (incorrectOnly && a.is_correct)
      || typeof a.submitted_at !== 'string' || !Number.isFinite(Date.parse(a.submitted_at))
      || typeof a.topic_code !== 'string' || !a.topic_code.trim() || typeof a.topic_title !== 'string' || !a.topic_title.trim()))
    throw new Error('Could not verify account practice history.');
  return rows;
}
