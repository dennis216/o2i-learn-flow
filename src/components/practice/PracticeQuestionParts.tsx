import { Link } from 'react-router-dom';
import MarkdownWithMath from '@/components/MarkdownWithMath';
import { continuousPracticePath, type IssuedPracticeQuestion } from '@/lib/studentPractice';
import { cn } from '@/lib/utils';

export function SavedAnswer({ question, courseId }: { question: IssuedPracticeQuestion; courseId?: string | null }) {
  if (!question.attempt) return null;
  const answer = question.options.find(o => o.id === question.attempt?.correct_option_id);
  return <section aria-label="Saved answer" className="mt-6 space-y-3 rounded border bg-muted/30 p-4">
    <p className="font-semibold">{question.attempt.is_correct ? 'Correct' : 'Incorrect'}</p>
    <p>Time: {question.attempt.elapsed_seconds === null ? 'Not recorded' : `${question.attempt.elapsed_seconds} seconds`}{!question.attempt.timing_complete && ' · Incomplete or legacy timing; excluded from speed analysis'}</p>
    {question.attempt.selection_trajectory ? <div aria-label="Selection trajectory"><p>{Math.max(0, question.attempt.selection_trajectory.length - 1)} changes before Submit</p><ol className="list-decimal space-y-1 pl-5">{question.attempt.selection_trajectory.map((step, n) => <li key={n}>{step.elapsed_seconds}s · Option {question.options.find(o => o.id === step.option_id)?.key} · {step.option_id === question.attempt?.correct_option_id ? 'Correct' : 'Incorrect'}</li>)}</ol></div> : <p>Selection process not recorded.</p>}
    <p>Suggested practice: Topic {question.topic.code} · {question.skill_descriptions?.join('; ') || question.skills.join(', ')}{question.representation_type ? ` · ${question.representation_type}` : ''}. <Link className="underline" to={continuousPracticePath({ topicId: question.topic.id, courseId })}>Practice this Topic</Link></p>
    <p>Correct answer: {answer?.key}</p><MarkdownWithMath content={answer?.text ?? ''} strictMath />
    <h2 className="font-semibold">Solution</h2><MarkdownWithMath content={question.attempt.solution} strictMath className="overflow-x-auto" />
  </section>;
}

export function QuestionBody({ question, selected, disabled, onSelect }: { question: IssuedPracticeQuestion; selected?: string | null; disabled: boolean; onSelect: (option: string) => void }) {
  return <>
    <p aria-label="Saved question labels" className="break-words text-sm text-muted-foreground">{question.difficulty} · {question.calculator_policy?.replace(/_/g, ' ') ?? 'Calculator not specified'} · {question.course_scope} · Topic {question.topic.code}: {question.topic.title} · Skills {question.skills.join(', ')}</p>
    <div aria-label="Question content"><MarkdownWithMath content={question.stem} strictMath className="overflow-x-auto" /></div>
    {question.image_url && <img src={question.image_url} alt="Question figure" className="max-h-96 max-w-full object-contain" />}
    <div className="space-y-3" aria-label="Answer options">{question.options.map(option => <button type="button" key={option.id} aria-label={`Option ${option.key}`} aria-pressed={selected === option.id} disabled={disabled} onClick={() => onSelect(option.id)} className={cn('flex w-full gap-3 rounded border p-4 text-left', selected === option.id && 'border-primary bg-primary/10', question.attempt?.correct_option_id === option.id && 'border-green-600 bg-green-50')}><span className="font-semibold">{option.key}.</span><MarkdownWithMath content={option.text} strictMath className="min-w-0 overflow-x-auto" /></button>)}</div>
  </>;
}
