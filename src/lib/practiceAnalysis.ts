import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../integrations/supabase/types.ts';
export type PracticePeriod = '7' | '30' | 'all' | 'custom';
export function practicePeriodBounds(period: PracticePeriod, from: string, to: string, now = new Date()) {
  if (period === 'all') return {};
  const date = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Choose both dates.');
    const [year, month, day] = value.split('-').map(Number);
    const result = new Date(year, month - 1, day);
    if (result.getFullYear() !== year || result.getMonth() !== month - 1 || result.getDate() !== day) throw new Error('Choose valid dates.');
    return result;
  };
  const end = period === 'custom' ? date(to) : new Date(now.getFullYear(), now.getMonth(), now.getDate());
  end.setDate(end.getDate() + 1);
  const start = period === 'custom' ? date(from) : new Date(now.getFullYear(), now.getMonth(), now.getDate() - Number(period) + 1);
  if (start >= end) throw new Error('Start date must not be after end date.');
  return { _from: start.toISOString(), _to: end.toISOString() };
}
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const seconds = z.number().nonnegative().max(86400).nullable();
const totals = z.object({ attempt_count: count, distinct_count: count, correct_count: count });
const consistent = (t: z.infer<typeof totals>) => t.correct_count <= t.attempt_count && t.distinct_count <= t.attempt_count;
const unit = totals.extend({ unit_id: z.string().uuid(), unit_number: count, unit_title: z.string().min(1) }).refine(consistent);
const topic = totals.extend({ unit_id: z.string().uuid(), topic_id: z.string().uuid(), topic_code: z.string().min(1), topic_title: z.string().min(1) }).refine(consistent);
const signal = z.object({ topic_id: z.string().uuid(), topic_code: z.string().min(1), topic_title: z.string().min(1), representation_type: z.string().min(1), skill_code: z.string().min(1), skill_description: z.string().min(1), kind: z.enum(['error', 'slow']), signal_count: count.min(1).max(10), last_signal: z.string().datetime({ offset: true }) });
const analysisSchema = z.object({
  totals: totals.extend({ timing_count: count, average_seconds: seconds }).refine(t => consistent(t) && t.timing_count <= t.attempt_count && (t.timing_count === 0 ? t.average_seconds === null : t.average_seconds !== null)),
  units: z.array(unit), topics: z.array(topic), signals: z.array(signal),
}).refine(a => a.units.reduce((n, u) => n + u.attempt_count, 0) === a.totals.attempt_count
  && a.units.reduce((n, u) => n + u.correct_count, 0) === a.totals.correct_count
  && new Set(a.units.map(u => u.unit_id)).size === a.units.length
  && new Set(a.topics.map(t => t.topic_id)).size === a.topics.length
  && a.topics.every(t => a.units.some(u => u.unit_id === t.unit_id))
  && a.units.every(u => a.topics.filter(t => t.unit_id === u.unit_id).reduce((n, t) => n + t.attempt_count, 0) === u.attempt_count));
const adminSchema = z.object({ version_id: z.string().uuid(), versions: z.array(z.object({ id: z.string().uuid(), version_number: count.min(1), is_current: z.boolean() })), attempt_count: count, correct_count: count, student_count: count, timing_count: count, average_seconds: seconds, median_seconds: seconds })
  .refine(a => a.correct_count <= a.attempt_count && a.student_count <= a.attempt_count && a.timing_count <= a.attempt_count
    && (a.timing_count === 0 ? a.average_seconds === null && a.median_seconds === null : a.average_seconds !== null && a.median_seconds !== null)
    && a.versions.some(v => v.id === a.version_id));
export type PracticeAnalysis = z.infer<typeof analysisSchema>;
export type AdminPracticeStatistics = z.infer<typeof adminSchema>;
export async function loadPracticeAnalysis(client: SupabaseClient<Database>, bounds: { _from?: string; _to?: string }) {
  const { data, error } = await client.rpc('get_question_practice_analysis', bounds);
  if (error) throw new Error(error.message);
  const result = analysisSchema.safeParse(data);
  if (!result.success) throw new Error('Could not verify practice analysis. Retry.');
  return result.data;
}
export async function loadAdminPracticeStatistics(client: SupabaseClient<Database>, questionId: string, versionId: string | undefined, bounds: { _from?: string; _to?: string }) {
  const { data, error } = await client.rpc('get_question_practice_admin_statistics', { _question_id: questionId, ...bounds, ...(versionId ? { _version_id: versionId } : {}) });
  if (error) throw new Error(error.message);
  const result = adminSchema.safeParse(data);
  if (!result.success) throw new Error('Could not verify question statistics. Retry.');
  return result.data;
}
export const practiceAccuracy = (correct: number, total: number) => total ? `${(100 * correct / total).toFixed(1)}% (${correct}/${total})` : 'No submitted answers';
export const practiceDuration = (seconds: number | null) => seconds === null ? 'Not recorded' : `${seconds.toFixed(1)} seconds`;
