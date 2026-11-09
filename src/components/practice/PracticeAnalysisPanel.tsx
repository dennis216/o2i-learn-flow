import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { continuousPracticePath } from '@/lib/studentPractice';
import { loadPracticeAnalysis, practiceAccuracy, practiceDuration, practicePeriodBounds, type PracticeAnalysis, type PracticePeriod } from '@/lib/practiceAnalysis';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PracticePeriodFields } from './PracticePeriodFields';
import { useLanguage } from '@/contexts/LanguageContext';
export function PracticeAnalysisPanel() {
  const { t } = useLanguage();
  const accuracy = (correct: number, total: number) => total ? practiceAccuracy(correct, total) : t('No submitted answers', '没有已提交的作答');
  const duration = (seconds: number | null) => seconds === null ? t('Not recorded', '未记录') : t(practiceDuration(seconds), `${seconds.toFixed(1)} 秒`);
  const [range, setRange] = useState({ period: '30' as PracticePeriod, from: '', to: '' });
  const [data, setData] = useState<PracticeAnalysis | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(true), [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true; setData(null); setError(''); setBusy(true);
    void (async () => loadPracticeAnalysis(supabase, practicePeriodBounds(range.period, range.from, range.to)))()
      .then(value => { if (active) setData(value); }).catch(reason => { if (active) setError(String(reason.message ?? reason)); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [range, retry]);
  return <Card role="region" aria-label={t('Practice analysis', '练习分析')}><CardHeader><CardTitle>{t('Practice analysis', '练习分析')}</CardTitle></CardHeader><CardContent className="space-y-5">
    <PracticePeriodFields {...range} onChange={setRange} />
    <p className="text-sm text-muted-foreground">{t('Final correct submissions / all submissions in this period. Repeated practice counts again; distinct questions are shown separately. Active device timing includes only complete captures.', '正确率 = 这段时间内答对的提交 / 全部提交。重复练习会重复计数，不同题目数单独显示。有效用时只统计记录完整的作答。')}</p>
    {busy ? <p role="status">{t('Loading practice analysis…', '练习分析加载中…')}</p> : error ? <div role="alert"><p>{error}</p><Button variant="outline" onClick={() => setRetry(n => n + 1)}>{t('Retry analysis', '重新加载')}</Button></div> : data && <>
      <dl className="grid gap-3 sm:grid-cols-2"><div><dt>{t('Submitted answers', '已提交作答')}</dt><dd>{data.totals.attempt_count}</dd></div><div><dt>{t('Distinct questions', '不同题目')}</dt><dd>{data.totals.distinct_count}</dd></div><div><dt>{t('Final accuracy', '正确率')}</dt><dd>{accuracy(data.totals.correct_count, data.totals.attempt_count)}</dd></div><div><dt>{t('Average active time', '平均有效用时')}</dt><dd>{duration(data.totals.average_seconds)} · {t(`${data.totals.timing_count} timed answers`, `${data.totals.timing_count} 次计时作答`)}</dd></div></dl>
      <section aria-label={t('Unit practice accuracy', '各 Unit 正确率')}><h3 className="font-semibold">{t('Accuracy by Unit', '各 Unit 正确率')}</h3>{!data.units.length && <p>{t('No submitted answers in this period.', '这段时间没有提交作答。')}</p>}{data.units.map(unit => <details className="my-3 rounded border p-3" key={unit.unit_id}><summary className="cursor-pointer">Unit {unit.unit_number}: {unit.unit_title} · {accuracy(unit.correct_count, unit.attempt_count)} · {t(`${unit.distinct_count} distinct questions`, `${unit.distinct_count} 道不同的题`)}</summary><ul className="mt-3 space-y-2">{data.topics.filter(topic => topic.unit_id === unit.unit_id).map(topic => <li key={topic.topic_id}><Link className="underline" to={continuousPracticePath({ topicId: topic.topic_id })}>Topic {topic.topic_code}: {topic.topic_title}</Link> · {accuracy(topic.correct_count, topic.attempt_count)} · {t(`${topic.distinct_count} distinct questions`, `${topic.distinct_count} 道不同的题`)}</li>)}</ul></details>)}</section>
      <section aria-label={t('Current practice signals', '当前建议练习')}><h3 className="font-semibold">{t('Current types to practice', '当前建议练习的题型')}</h3><p className="text-sm text-muted-foreground">{t('These current recommendations use the latest answers to ten distinct questions per Topic across all time; the period above filters the statistics only.', '这些建议依据每个 Topic 最近 10 道不同题目的作答（不限时间）；上面的时间范围只影响统计。')}</p>{!data.signals.length && <p>{t('No current incorrect or slow-answer signals.', '目前没有需要加强的错题或慢题。')}</p>}<ul className="space-y-3">{data.signals.map(s => <li className="rounded border p-3" key={`${s.topic_id}:${s.representation_type}:${s.skill_code}:${s.kind}`}>Topic {s.topic_code} · {s.skill_description} · {s.representation_type}: {t(`${s.signal_count} ${s.kind === 'error' ? 'incorrect' : 'correct but slow'} ${s.signal_count === 1 ? 'answer' : 'answers'}`, `${s.signal_count} 次${s.kind === 'error' ? '答错' : '答对但较慢'}`)} · <Link className="underline" to={continuousPracticePath({ topicId: s.topic_id })}>{t('Practice this Topic', '练习这个 Topic')}</Link></li>)}</ul></section>
    </>}
  </CardContent></Card>;
}
