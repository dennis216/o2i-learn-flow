import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { loadPracticeAnalysis, practiceAccuracy, practiceDuration, practicePeriodBounds, type PracticeAnalysis, type PracticePeriod } from '@/lib/practiceAnalysis';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PracticePeriodFields } from './PracticePeriodFields';
export function PracticeAnalysisPanel() {
  const [range, setRange] = useState({ period: '30' as PracticePeriod, from: '', to: '' });
  const [data, setData] = useState<PracticeAnalysis | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(true), [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true; setData(null); setError(''); setBusy(true);
    void (async () => loadPracticeAnalysis(supabase, practicePeriodBounds(range.period, range.from, range.to)))()
      .then(value => { if (active) setData(value); }).catch(reason => { if (active) setError(String(reason.message ?? reason)); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [range, retry]);
  return <Card role="region" aria-label="Practice analysis"><CardHeader><CardTitle>Practice analysis</CardTitle></CardHeader><CardContent className="space-y-5">
    <PracticePeriodFields {...range} onChange={setRange} />
    <p className="text-sm text-muted-foreground">Final correct submissions / all submissions in this period. Repeated practice counts again; distinct questions are shown separately. Active device timing includes only complete captures.</p>
    {busy ? <p role="status">Loading practice analysis…</p> : error ? <div role="alert"><p>{error}</p><Button variant="outline" onClick={() => setRetry(n => n + 1)}>Retry analysis</Button></div> : data && <>
      <dl className="grid gap-3 sm:grid-cols-2"><div><dt>Submitted answers</dt><dd>{data.totals.attempt_count}</dd></div><div><dt>Distinct questions</dt><dd>{data.totals.distinct_count}</dd></div><div><dt>Final accuracy</dt><dd>{practiceAccuracy(data.totals.correct_count, data.totals.attempt_count)}</dd></div><div><dt>Average active time</dt><dd>{practiceDuration(data.totals.average_seconds)} · {data.totals.timing_count} timed answers</dd></div></dl>
      <section aria-label="Unit practice accuracy"><h3 className="font-semibold">Accuracy by Unit</h3>{!data.units.length && <p>No submitted answers in this period.</p>}{data.units.map(unit => <details className="my-3 rounded border p-3" key={unit.unit_id}><summary className="cursor-pointer">Unit {unit.unit_number}: {unit.unit_title} · {practiceAccuracy(unit.correct_count, unit.attempt_count)} · {unit.distinct_count} distinct questions</summary><ul className="mt-3 space-y-2">{data.topics.filter(t => t.unit_id === unit.unit_id).map(t => <li key={t.topic_id}><Link className="underline" to={`/quiz?topic=${t.topic_id}`}>Topic {t.topic_code}: {t.topic_title}</Link> · {practiceAccuracy(t.correct_count, t.attempt_count)} · {t.distinct_count} distinct questions</li>)}</ul></details>)}</section>
      <section aria-label="Current practice signals"><h3 className="font-semibold">Current types to practice</h3><p className="text-sm text-muted-foreground">These current recommendations use the latest answers to ten distinct questions per Topic across all time; the period above filters the statistics only.</p>{!data.signals.length && <p>No current incorrect or slow-answer signals.</p>}<ul className="space-y-3">{data.signals.map(s => <li className="rounded border p-3" key={`${s.topic_id}:${s.representation_type}:${s.skill_code}:${s.kind}`}>Topic {s.topic_code} · {s.skill_description} · {s.representation_type}: {s.signal_count} {s.kind === 'error' ? 'incorrect' : 'correct but slow'} {s.signal_count === 1 ? 'answer' : 'answers'} · <Link className="underline" to={`/quiz?topic=${s.topic_id}`}>Practice this Topic</Link></li>)}</ul></section>
    </>}
  </CardContent></Card>;
}
