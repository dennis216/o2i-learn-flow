import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, ArrowRight, Check, CheckCircle2, Clock3, History, Lightbulb, Target, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { questions, getSkill, type QuestionDefinition } from '@/data/learningContent';
import { useLearning, type SelectionStep } from '@/contexts/LearningContext';
import { DEFAULT_TARGET_SECONDS, evaluateAttempt, recommendQuestions, type QuestionFeedback } from '@/lib/adaptivePractice';
import { cn } from '@/lib/utils';

const difficultyLabel = { easy: 'Easy · 3 min', medium: 'Medium · 5 min', hard: 'Hard · 10 min' };
const reasonLabel: Record<string, string> = {
  new_question: 'A fresh question',
  repeat_after_bank_exhausted: 'A useful revisit',
  matched_difficulty: 'The right level',
  difficulty_alternative: 'A new challenge',
  learning_signal: 'Connected to your lesson',
  misconception_review: 'A helpful follow-up',
};
const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;

interface LocalResult {
  question: QuestionDefinition;
  feedback: QuestionFeedback;
  finalOptionId: string;
  trajectory: SelectionStep[];
}

export default function Quiz() {
  const [searchParams] = useSearchParams();
  const subjectId = searchParams.get('subject') ?? 'calculus';
  const lessonId = searchParams.get('lesson') ?? undefined;
  const skillId = searchParams.get('skill') ?? undefined;
  const source = searchParams.get('source') ?? 'quick';
  const { attempts, signals, saveAttempt } = useLearning();
  const sessionId = useMemo(() => crypto.randomUUID(), []);
  const [sessionQuestions] = useState(() => {
    const scopedBank = questions.filter((question) =>
      question.subjectId === subjectId && (!lessonId || question.lessonId === lessonId) && (!skillId || question.skillIds.includes(skillId)),
    );
    return recommendQuestions(scopedBank, attempts, signals, subjectId, 5).map((item) => ({ ...item, question: item.question as QuestionDefinition }));
  });
  const [index, setIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [selected, setSelected] = useState<string>();
  const [trajectory, setTrajectory] = useState<SelectionStep[]>([]);
  const [feedback, setFeedback] = useState<QuestionFeedback>();
  const [results, setResults] = useState<LocalResult[]>([]);
  const [finished, setFinished] = useState(false);
  const current = sessionQuestions[index];

  useEffect(() => {
    if (!current || feedback || finished) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') setElapsed((value) => value + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [current, feedback, finished]);

  if (!sessionQuestions.length) {
    return <div className="flex min-h-[70vh] items-center justify-center bg-background"><Card className="max-w-md text-center"><CardContent className="p-8"><Target className="mx-auto h-10 w-10 text-muted-foreground" /><h1 className="mt-4 text-2xl font-bold">More questions are on the way</h1><p className="mt-2 text-muted-foreground">This topic will be ready as soon as its question set has been reviewed.</p><Button asChild className="mt-6"><Link to="/practice">Back to Practice</Link></Button></CardContent></Card></div>;
  }

  if (finished) {
    const correctCount = results.filter((result) => result.feedback.correct).length;
    const slowCount = results.filter((result) => result.feedback.overTarget).length;
    const misconceptionCount = new Set(results.flatMap((result) => result.feedback.misconceptionTags)).size;
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="grid gap-8 p-8 lg:grid-cols-[1fr_320px]">
              <div><CheckCircle2 className="h-10 w-10 text-green-600" /><h1 className="mt-4 text-4xl font-bold">Practice complete</h1><p className="mt-3 max-w-xl text-lg leading-7 text-muted-foreground">Nice work. Your next set will continue from here, with a little more attention on the ideas that deserve another look.</p><div className="mt-7 flex flex-wrap gap-3"><Button asChild><a href={`/quiz?subject=${subjectId}&source=next`}>Start the next set <ArrowRight /></a></Button><Button asChild variant="outline"><Link to="/review">Open your review</Link></Button></div></div>
              <div className="grid grid-cols-3 gap-3">{[{ value: `${correctCount}/${results.length}`, label: 'Correct' }, { value: slowCount.toString(), label: 'Take another look' }, { value: misconceptionCount.toString(), label: 'Ideas to revisit' }].map((stat) => <div key={stat.label} className="rounded-lg border bg-background p-4 text-center"><p className="text-3xl font-bold text-primary">{stat.value}</p><p className="mt-1 text-xs text-muted-foreground">{stat.label}</p></div>)}</div>
            </CardContent>
          </Card>

          <div className="mb-5 mt-10 flex items-center justify-between gap-4"><h2 className="text-2xl font-bold">Question review</h2><span className="text-sm text-muted-foreground">See how your thinking changed along the way</span></div>
          <div className="space-y-4">
            {results.map((result, resultIndex) => (
              <Card key={result.question.id}>
                <CardContent className="flex flex-col gap-5 p-6 md:flex-row md:items-start">
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${result.feedback.correct ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{result.feedback.correct ? <Check /> : <X />}</span>
                  <div className="flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-medium text-muted-foreground">Question {resultIndex + 1}</span>{result.feedback.overTarget && <span className="rounded-full bg-accent/20 px-2 py-1 text-xs">Worth another look</span>}</div><h3 className="mt-2 font-semibold">{result.question.prompt}</h3><p className="mt-3 text-sm leading-6 text-muted-foreground">{result.question.explanation}</p><div className="mt-4 flex flex-wrap gap-2">{result.trajectory.map((step, stepIndex) => <span key={`${step.optionId}-${stepIndex}`} className="rounded-full border px-3 py-1 text-xs text-muted-foreground">{stepIndex + 1}. Option {step.optionId.toUpperCase()} · {formatTime(step.elapsedSeconds)}</span>)}</div></div>
                  <div className="shrink-0 text-right text-sm text-muted-foreground"><p className="font-semibold text-foreground">{formatTime(result.feedback.elapsedSeconds)}</p><p>Suggested {formatTime(result.feedback.targetSeconds)}</p></div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const question = current.question;
  const targetSeconds = DEFAULT_TARGET_SECONDS[question.difficulty];
  const selectOption = (optionId: string) => {
    if (feedback) return;
    setSelected(optionId);
    setTrajectory((currentTrajectory) => [...currentTrajectory, { optionId, elapsedSeconds: elapsed }]);
  };
  const submit = () => {
    if (!selected || feedback) return;
    const isCorrect = selected === question.correctOptionId;
    const evaluated = evaluateAttempt(question, trajectory.map((step) => step.optionId), isCorrect, elapsed);
    setFeedback(evaluated);
    setResults((currentResults) => [...currentResults, { question, feedback: evaluated, finalOptionId: selected, trajectory }]);
    saveAttempt({ sessionId, questionId: question.id, lessonId: question.lessonId, subjectId: question.subjectId, skillIds: question.skillIds, difficulty: question.difficulty, correct: isCorrect, elapsedSeconds: elapsed, selectedOptionIds: trajectory.map((step) => step.optionId), misconceptionTags: evaluated.misconceptionTags, finalOptionId: selected, selectionTrajectory: trajectory, targetSeconds: evaluated.targetSeconds, overTarget: evaluated.overTarget });
  };
  const next = () => {
    if (index >= sessionQuestions.length - 1) { setFinished(true); return; }
    setIndex((value) => value + 1); setElapsed(0); setSelected(undefined); setTrajectory([]); setFeedback(undefined);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-5 flex items-center justify-between"><Button asChild variant="ghost"><Link to="/practice"><ArrowLeft />Leave practice</Link></Button><div className="text-right"><p className="text-sm text-primary">{source === 'lesson' ? 'Post-lesson quiz' : source === 'review' ? 'Review practice' : 'Quick practice'}</p><p className="text-sm font-semibold">Question {index + 1} of {sessionQuestions.length}</p></div></div>
        <Progress value={((index + (feedback ? 1 : 0)) / sessionQuestions.length) * 100} className="mb-6 h-2" />

        <div className="grid gap-6 lg:grid-cols-[1fr_290px]">
          <Card>
            <CardContent className="p-6 sm:p-8">
              <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">{question.difficulty}</span>{question.skillIds.map((id) => <span key={id} className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">{getSkill(id)?.shortName}</span>)}</div>
              <h1 className="mt-7 text-2xl font-semibold leading-9">{question.prompt}</h1>
              <div className="mt-8 space-y-3">
                {question.options.map((option) => {
                  const isSelected = selected === option.id;
                  const showCorrect = feedback && option.id === question.correctOptionId;
                  const showWrong = feedback && isSelected && option.id !== question.correctOptionId;
                  return <button key={option.id} disabled={Boolean(feedback)} onClick={() => selectOption(option.id)} className={cn('flex w-full items-start gap-4 rounded-lg border p-4 text-left transition', isSelected && !feedback && 'border-primary bg-primary/5 ring-2 ring-primary/10', !isSelected && !feedback && 'hover:border-primary/40 hover:bg-muted/30', showCorrect && 'border-green-500 bg-green-50', showWrong && 'border-red-400 bg-red-50')}><span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-full border text-sm font-bold', isSelected ? 'border-primary bg-primary text-primary-foreground' : 'bg-background text-muted-foreground', showCorrect && 'border-green-600 bg-green-600 text-white', showWrong && 'border-red-600 bg-red-600 text-white')}>{showCorrect ? <Check className="h-4 w-4" /> : showWrong ? <X className="h-4 w-4" /> : option.id.toUpperCase()}</span><span className="pt-1 text-sm font-medium leading-6 sm:text-base">{option.label}</span></button>;
                })}
              </div>

              {feedback ? (
                <div className={`mt-7 rounded-lg p-5 ${feedback.correct ? 'bg-green-50' : 'bg-red-50'}`}>
                  <div className="flex items-center gap-2 font-bold">{feedback.correct ? <CheckCircle2 className="text-green-600" /> : <AlertTriangle className="text-red-600" />}{feedback.correct ? 'That’s right' : 'Let’s take another look'}</div>
                  <p className="mt-3 text-sm leading-6">{question.explanation}</p>
                  {feedback.overTarget && <p className="mt-3 text-sm text-amber-700">You found the answer, and a little more practice here could make it feel easier next time.</p>}
                  <Button className="mt-5" onClick={next}>{index === sessionQuestions.length - 1 ? 'See your results' : 'Next question'} <ArrowRight /></Button>
                </div>
              ) : <Button disabled={!selected} className="mt-7 w-full" size="lg" onClick={submit}>Check answer</Button>}
            </CardContent>
          </Card>

          <aside className="space-y-5">
            <Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Clock3 className="h-5 w-5 text-primary" />Time</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold tabular-nums">{formatTime(elapsed)}</p><div className="mt-4 flex justify-between text-xs text-muted-foreground"><span>{difficultyLabel[question.difficulty]}</span><span>{elapsed > targetSeconds ? 'Take your time' : `${formatTime(targetSeconds - elapsed)} remaining`}</span></div><Progress value={Math.min(100, (elapsed / targetSeconds) * 100)} className="mt-2 h-2" /><p className="mt-3 text-xs leading-5 text-muted-foreground">The timer pauses when this tab is not active.</p></CardContent></Card>
            <Card><CardHeader><CardTitle className="text-lg">A good next step</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2">{current.reasons.map((reason) => <span key={reason} className="rounded-full bg-primary/10 px-3 py-1.5 text-xs text-primary">{reasonLabel[reason] ?? reason}</span>)}</CardContent></Card>
            <Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><History className="h-5 w-5 text-primary" />Your choices</CardTitle></CardHeader><CardContent className="space-y-2">{trajectory.length ? trajectory.map((step, stepIndex) => <div key={`${step.optionId}-${stepIndex}`} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm"><span>Option {step.optionId.toUpperCase()}</span><span className="font-mono text-xs text-muted-foreground">{formatTime(step.elapsedSeconds)}</span></div>) : <p className="text-sm leading-6 text-muted-foreground">Your choices will appear here as you work through the question.</p>}</CardContent></Card>
            {feedback?.misconceptionTags.length ? <Card className="border-accent bg-accent/5"><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Lightbulb className="h-5 w-5" />Worth remembering</CardTitle></CardHeader><CardContent><p className="text-sm leading-6 text-muted-foreground">We’ll bring this idea back in a future practice set.</p></CardContent></Card> : null}
          </aside>
        </div>
      </div>
    </div>
  );
}
