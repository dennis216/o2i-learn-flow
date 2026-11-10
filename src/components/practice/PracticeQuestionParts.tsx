import { Link } from 'react-router-dom';
import MarkdownWithMath from '@/components/MarkdownWithMath';
import { continuousPracticePath, type IssuedPracticeQuestion } from '@/lib/studentPractice';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';

export function SavedAnswer({ question, courseId }: { question: IssuedPracticeQuestion; courseId?: string | null }) {
  const { t } = useLanguage();
  if (!question.attempt) return null;
  const answer = question.options.find(o => o.id === question.attempt?.correct_option_id);
  return <section aria-label={t('Saved answer', '你的答案')} className="mt-6 space-y-3 rounded border bg-muted/30 p-4">
    <p className="font-semibold">{question.attempt.is_correct ? t('Correct', '正确') : t('Incorrect', '错误')}</p>
    <p>{t('Time: ', '用时：')}{question.attempt.elapsed_seconds === null ? t('Not recorded', '未记录') : t(`${question.attempt.elapsed_seconds} seconds`, `${question.attempt.elapsed_seconds} 秒`)}{!question.attempt.timing_complete && t(' · Incomplete or legacy timing; excluded from speed analysis', ' · 计时不完整或为旧数据，不计入速度分析')}</p>
    {question.attempt.selection_trajectory ? <div aria-label={t('Selection trajectory', '选项改动记录')}><p>{t(`${Math.max(0, question.attempt.selection_trajectory.length - 1)} changes before Submit`, `提交前改了 ${Math.max(0, question.attempt.selection_trajectory.length - 1)} 次选项`)}</p><ol className="list-decimal space-y-1 pl-5">{question.attempt.selection_trajectory.map((step, n) => <li key={n}>{step.elapsed_seconds}s · {t('Option', '选项')} {question.options.find(o => o.id === step.option_id)?.key} · {step.option_id === question.attempt?.correct_option_id ? t('Correct', '正确') : t('Incorrect', '错误')}</li>)}</ol></div> : <p>{t('Selection process not recorded.', '没有选项改动记录。')}</p>}
    <p>{t('Suggested practice: ', '建议练习：')}Topic {question.topic.code} · {question.skill_descriptions?.join('; ') || question.skills.join(', ')}{question.representation_type ? ` · ${question.representation_type}` : ''}. <Link className="underline" to={continuousPracticePath({ topicId: question.topic.id, courseId })}>{t('Practice this Topic', '练习这个 Topic')}</Link></p>
    <p>{t('Correct answer: ', '正确答案：')}{answer?.key}</p><MarkdownWithMath content={answer?.text ?? ''} strictMath />
    <h2 className="font-semibold">{t('Solution', '解析')}</h2><MarkdownWithMath content={question.attempt.solution} strictMath className="overflow-x-auto" />
  </section>;
}

export function QuestionBody({ question, selected, disabled, onSelect }: { question: IssuedPracticeQuestion; selected?: string | null; disabled: boolean; onSelect: (option: string) => void }) {
  const { t } = useLanguage();
  return <>
    <p aria-label="Saved question labels" className="break-words text-sm text-muted-foreground">{question.difficulty} · {question.calculator_policy?.replace(/_/g, ' ') ?? t('Calculator not specified', '未注明是否可用计算器')} · {question.course_scope} · Topic {question.topic.code}: {question.topic.title} · Skills {question.skills.join(', ')}</p>
    <div aria-label="Question content"><MarkdownWithMath content={question.stem} strictMath className="overflow-x-auto" /></div>
    {question.image_url && <img src={question.image_url} alt={t('Question figure', '题目配图')} className="max-h-96 max-w-full object-contain" />}
    <div className="space-y-3" aria-label={t('Answer options', '选项')}>{question.options.map(option => <button type="button" key={option.id} aria-label={`${t('Option', '选项')} ${option.key}`} aria-pressed={selected === option.id} disabled={disabled} onClick={() => onSelect(option.id)} className={cn('flex w-full gap-3 rounded border p-4 text-left', selected === option.id && 'border-primary bg-primary/10', question.attempt?.correct_option_id === option.id && 'border-green-600 bg-green-50')}><span className="font-semibold">{option.key}.</span><MarkdownWithMath content={option.text} strictMath className="min-w-0 overflow-x-auto" /></button>)}</div>
  </>;
}
