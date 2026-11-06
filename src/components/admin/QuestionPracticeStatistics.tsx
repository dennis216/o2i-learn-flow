import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { loadAdminPracticeStatistics, practiceAccuracy, practiceDuration, practicePeriodBounds, type AdminPracticeStatistics, type PracticePeriod } from '@/lib/practiceAnalysis';
import { PracticePeriodFields } from '@/components/practice/PracticePeriodFields';
import { Button } from '@/components/ui/button';
export function QuestionPracticeStatistics({ questionId, currentVersionId, previewVersionId }: { questionId: string; currentVersionId: string | null; previewVersionId: string }) {
  const [version, setVersion] = useState(currentVersionId ?? previewVersionId);
  const [range, setRange] = useState({ period: 'all' as PracticePeriod, from: '', to: '' });
  const [data, setData] = useState<AdminPracticeStatistics | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(true), [retry, setRetry] = useState(0);
  const [versions, setVersions] = useState<AdminPracticeStatistics['versions']>([]);
  useEffect(() => {
    let active = true; setData(null); setError(''); setBusy(true);
    void (async () => loadAdminPracticeStatistics(supabase, questionId, version, practicePeriodBounds(range.period, range.from, range.to)))()
      .then(value => { if (active) { setData(value); setVersions(value.versions); } }).catch(reason => { if (active) setError(String(reason.message ?? reason)); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [questionId, version, range, retry]);
  return <section role="region" aria-label="Question practice statistics" className="space-y-4 rounded border p-4"><h3 className="font-semibold">Student practice statistics</h3>
    {!!versions.length && <label className="block text-sm">Question version <select aria-label="Statistics version" className="ml-2 rounded border bg-background p-2" value={version} onChange={e => setVersion(e.target.value)}>{versions.map(v => <option key={v.id} value={v.id}>Version {v.version_number}{v.is_current ? ' (current)' : ''}</option>)}</select></label>}
    <PracticePeriodFields {...range} onChange={setRange} />
    <p className="text-sm text-muted-foreground">Selected version only. Repeat submissions in different sets count again. Timing excludes legacy and incomplete captures; use sample sizes before reviewing difficulty.</p>
    {busy ? <p role="status">Loading question statistics…</p> : error ? <div role="alert"><p>{error}</p><Button variant="outline" onClick={() => setRetry(n => n + 1)}>Retry statistics</Button></div> : data && <dl className="grid gap-3 sm:grid-cols-2"><div><dt>Overall accuracy</dt><dd>{practiceAccuracy(data.correct_count, data.attempt_count)}</dd></div><div><dt>Students / submissions</dt><dd>{data.student_count} / {data.attempt_count}</dd></div><div><dt>Average active time</dt><dd>{practiceDuration(data.average_seconds)}</dd></div><div><dt>Median active time</dt><dd>{practiceDuration(data.median_seconds)}</dd></div><div><dt>Valid timed answers</dt><dd>{data.timing_count}</dd></div></dl>}
  </section>;
}
