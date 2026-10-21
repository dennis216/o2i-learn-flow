import type { SupabaseClient } from '@supabase/supabase-js';
import type { SelectionStep } from './practiceCapture.ts';
import type { Database, Json } from '../integrations/supabase/types.ts';

export interface PracticeTopic { id: string; code: string; title: string; question_count: number }
export interface SavedPracticeAnswer {
  id: string; selected_option_id: string; is_correct: boolean; submitted_at: string;
  elapsed_seconds: number | null; correct_option_id: string; solution: string;
  selection_trajectory?: SelectionStep[] | null; timing_complete?: boolean;
}
export interface IssuedPracticeQuestion {
  question_id: string; version_id: string; position: number; stem: string;
  difficulty: string; calculator_policy: string | null; course_scope: string;
  image_url: string | null; requires_figure: boolean;
  representation_type?: string; skill_descriptions?: string[];
  topic: { id: string; code: string; title: string }; skills: string[];
  options: { id: string; key: string; text: string }[];
  attempt: SavedPracticeAnswer | null;
}
export interface LegacySelectionSummary {
  rule_version: 'topic-difficulty-v1'; target_difficulty: 'easy' | 'medium' | 'hard' | null;
  sample_count: number; correct_count: number; fallback_count: number;
}
export interface AdaptationItem {
  question_id: string; kind: 'error' | 'slow' | 'regular'; topic_code: string; representation_type: string;
  skill_code: string | null; skill_description: string | null; signal_count: number; target_difficulty: 'easy' | 'medium' | 'hard';
}
export interface AdaptationSummary {
  rule_version: 'practice-adaptation-v2'; error_count: number; slow_count: number; fallback_count: number; items: AdaptationItem[];
}
export type SelectionSummary = LegacySelectionSummary | AdaptationSummary;
export function selectionRationale(summary?: SelectionSummary | null): string | null {
  if (!summary) return null;
  if (summary.rule_version === 'practice-adaptation-v2') {
    const reasons = summary.items.filter(i => i.kind !== 'regular').map(i =>
      `Added ${i.representation_type} practice in Topic ${i.topic_code} for ${i.skill_description}, based on ${i.signal_count} recent ${i.kind === 'error' ? 'incorrect' : 'correct but slow'} ${i.signal_count === 1 ? 'answer' : 'answers'}.`);
    if (!reasons.length) reasons.push('Building your practice history with regular questions, prioritizing those you have not seen.');
    if (summary.error_count + summary.slow_count < 2) reasons.push('Other questions are included when there are not enough new matches for recent incorrect or slow answers.');
    if (summary.fallback_count) reasons.push('Other difficulties are included to prioritize unseen questions or fill this set.');
    return reasons.join(' ');
  }
  if (summary.target_difficulty === null) return 'Random practice across published Topics, prioritizing questions you have not seen.';
  const basis = summary.sample_count < 5
    ? 'Building your practice history. Starting with medium difficulty.'
    : `${summary.correct_count}/${summary.sample_count} correct on your most recently answered distinct questions in this Topic. Target difficulty: ${summary.target_difficulty}.`;
  return basis + (summary.fallback_count ? ' Other difficulties are included to prioritize unseen questions or fill this set.' : '');
}
export interface PracticeSession { id: string; topic_id: string | null; course_id?: string | null; course_scope?: string | null; created_at: string; selection_summary?: SelectionSummary | null; adaptation_summary?: AdaptationSummary | null; questions: IssuedPracticeQuestion[] }
export interface RecentPracticeAnswer {
  id: string; session_id: string; question_id: string; version_id: string; selected_option_id: string;
  is_correct: boolean; submitted_at: string; elapsed_seconds: number | null; topic_code: string; topic_title: string;
}
export interface PracticeStatistics { sessionCount: number; attemptCount: number; correctCount: number }

export async function loadPracticeStatistics(client: SupabaseClient<Database>, userId: string): Promise<PracticeStatistics> {
  if (!uuid.test(userId)) throw new Error('Sign in to load your practice statistics.');
  // shortcut: counts use separate snapshots; use one aggregate RPC if atomic reporting becomes necessary.
  const results = await Promise.all([
    client.from('question_practice_sessions').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    client.from('question_practice_attempts').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    client.from('question_practice_attempts').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('is_correct', true),
  ]);
  for (const result of results) {
    if (result.error) throw new Error(result.error.message);
    if (!Number.isSafeInteger(result.count) || result.count! < 0) throw new Error('Could not verify account practice statistics.');
  }
  const [sessionCount, attemptCount, correctCount] = results.map(result => result.count!);
  if (correctCount > attemptCount || (attemptCount > 0 && sessionCount === 0)) throw new Error('Practice statistics changed while loading. Retry to refresh them.');
  return { sessionCount, attemptCount, correctCount };
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Old lesson/skill IDs have no canonical mapping. Never drop an unsupported filter. */
export function parsePracticeRoute(params: URLSearchParams): { error?: string; topicId?: string; sessionId?: string; questionId?: string; courseId?: string } {
  const allowed = new Set(['subject', 'source', 'topic', 'session', 'question', 'course']);
  if ([...params.keys()].some(key => !allowed.has(key)) || [...allowed].some(key => params.getAll(key).length > 1))
    return { error: 'This practice filter is not connected to the published question bank. Choose a published Topic in Practice.' };
  if (params.has('subject') && params.get('subject') !== 'calculus') return { error: 'This subject has no published practice connection.' };
  for (const key of ['topic', 'session', 'question', 'course']) if (params.has(key) && !uuid.test(params.get(key) ?? '')) return { error: `Invalid ${key} identity. Return to Practice and choose a published Topic.` };
  if (params.has('question') && !params.has('session')) return { error: 'A saved question requires its original practice session.' };
  if (params.has('course') && !params.has('topic')) return { error: 'Course practice requires a canonical Topic.' };
  return { ...(params.has('course') ? { courseId: params.get('course')! } : {}), topicId: params.get('topic') ?? undefined, sessionId: params.get('session') ?? undefined, questionId: params.get('question') ?? undefined };
}
export function readPracticeSession(value: unknown, expectedId: string): PracticeSession {
  const raw = value as PracticeSession;
  const s = raw?.adaptation_summary != null ? { ...raw, selection_summary: raw.adaptation_summary } : raw;
  if (!s || s.id !== expectedId || !Array.isArray(s.questions) || s.questions.length > 5
    || new Set(s.questions.map(q => q.question_id)).size !== s.questions.length
    || s.questions.some(q => !uuid.test(q.question_id) || !uuid.test(q.version_id) || !q.stem || !q.topic?.id
      || !Array.isArray(q.skills) || !Array.isArray(q.options) || q.options.length < 2 || q.options.length > 6
      || new Set(q.options.map(o => o.id)).size !== q.options.length || q.options.some(o => !uuid.test(o.id) || !o.key || !o.text)
      || (q.attempt !== null && (!q.attempt?.id || typeof q.attempt.is_correct !== 'boolean' || !q.attempt.submitted_at || !q.attempt.solution
        || !q.options.some(o => o.id === q.attempt?.selected_option_id) || !q.options.some(o => o.id === q.attempt?.correct_option_id)))))
    throw new Error('The saved practice response could not be verified. Reload your session.');
  const summary = s.selection_summary;
  if (summary?.rule_version === 'practice-adaptation-v2') {
    if (!Array.isArray(summary.items) || summary.items.length !== s.questions.length
      || ![summary.error_count, summary.slow_count].every(n => n === 0 || n === 1)
      || !Number.isInteger(summary.fallback_count) || summary.fallback_count < 0 || summary.fallback_count > s.questions.length
      || summary.items.some((i, n) => !i || i.question_id !== s.questions[n].question_id || !['error', 'slow', 'regular'].includes(i.kind)
        || !['easy', 'medium', 'hard'].includes(i.target_difficulty) || !i.topic_code || !i.representation_type
        || !Number.isInteger(i.signal_count) || i.signal_count < 0 || i.signal_count > 10
        || (i.kind !== 'regular' && (!i.skill_code || !i.skill_description || i.signal_count === 0)))
      || summary.items.filter(i => i.kind === 'error').length !== summary.error_count
      || summary.items.filter(i => i.kind === 'slow').length !== summary.slow_count)
      throw new Error('The selection summary could not be verified. Reload your session.');
  } else if (summary != null && (summary.rule_version !== 'topic-difficulty-v1'
    || ![null, 'easy', 'medium', 'hard'].includes(summary.target_difficulty)
    || !Number.isInteger(summary.sample_count) || summary.sample_count < 0 || summary.sample_count > 10
    || !Number.isInteger(summary.correct_count) || summary.correct_count < 0 || summary.correct_count > summary.sample_count
    || !Number.isInteger(summary.fallback_count) || summary.fallback_count < 0 || summary.fallback_count > s.questions.length
    || (summary.target_difficulty === null && (summary.sample_count !== 0 || summary.correct_count !== 0 || summary.fallback_count !== 0))))
    throw new Error('The selection summary could not be verified. Reload your session.');
  for (const q of s.questions) {
    const a = q.attempt;
    if (!a) continue;
    if (a.timing_complete !== undefined && typeof a.timing_complete !== 'boolean') throw new Error('Invalid timing record.');
    if (a.timing_complete && (!Number.isInteger(a.elapsed_seconds) || a.elapsed_seconds! < 0 || a.elapsed_seconds! > 86400 || !a.selection_trajectory)) throw new Error('Invalid timing record.');
    if (a.selection_trajectory != null) {
      let last = -1, option = '';
      if (!Array.isArray(a.selection_trajectory) || a.selection_trajectory.length < 1 || a.selection_trajectory.length > 256) throw new Error('Invalid selection record.');
      for (const step of a.selection_trajectory) {
        if (!q.options.some(o => o.id === step.option_id) || option === step.option_id || !Number.isInteger(step.elapsed_seconds)
          || step.elapsed_seconds < 0 || step.elapsed_seconds < last || a.elapsed_seconds === null || step.elapsed_seconds > a.elapsed_seconds) throw new Error('Invalid selection record.');
        option = step.option_id; last = step.elapsed_seconds;
      }
      if (option !== a.selected_option_id) throw new Error('Invalid final selection record.');
    }
  }
  return s;
}
export async function startPractice(client: SupabaseClient<Database>, id: string, topicId?: string, courseId?: string) {
  const { data, error } = courseId ? await client.rpc('start_course_question_practice', { _session_id: id, _topic_id: topicId!, _course_id: courseId }) : await client.rpc('start_question_practice', { _session_id: id, _topic_id: topicId ?? undefined });
  if (error) throw new Error(error.message);
  const session = readPracticeSession(data, id);
  if (courseId && (session.course_id !== courseId || session.topic_id !== topicId)) throw new Error('This session belongs to a different course or Topic.');
  return session;
}
export async function readPractice(client: SupabaseClient<Database>, id: string) {
  const { data, error } = await client.rpc('get_question_practice', { _session_id: id });
  if (error) throw new Error(error.message);
  return readPracticeSession(data, id);
}
export async function submitPractice(client: SupabaseClient<Database>, sessionId: string, questionId: string, optionId: string, seconds: number, capture?: { trajectory: SelectionStep[] | null; complete: boolean }) {
  const { data, error } = capture ? await client.rpc('submit_question_practice_v2', { _session_id: sessionId, _question_id: questionId, _option_id: optionId, _elapsed_seconds: seconds, _selection_trajectory: capture.trajectory as unknown as Json, _timing_complete: capture.complete }) : await client.rpc('submit_question_practice', { _session_id: sessionId, _question_id: questionId, _option_id: optionId, _elapsed_seconds: seconds });
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
