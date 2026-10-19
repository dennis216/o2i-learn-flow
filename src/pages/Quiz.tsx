import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Clock3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import MarkdownWithMath from '@/components/MarkdownWithMath';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { parsePracticeRoute, startPractice, readPractice, submitPractice, type IssuedPracticeQuestion, type PracticeSession } from '@/lib/studentPractice';
import { cn } from '@/lib/utils';

function SavedAnswer({ question }: { question: IssuedPracticeQuestion }) {
  if (!question.attempt) return null;
  const answer = question.options.find(o => o.id === question.attempt?.correct_option_id);
  return <section aria-label="Saved answer" className="mt-6 space-y-3 rounded border bg-muted/30 p-4">
    <p className="font-semibold">{question.attempt.is_correct ? 'Correct' : 'Incorrect'} · Saved to your account</p>
    <p>Correct answer: {answer?.key}</p><MarkdownWithMath content={answer?.text ?? ''} strictMath />
    <h2 className="font-semibold">Solution</h2><MarkdownWithMath content={question.attempt.solution} strictMath className="overflow-x-auto" />
  </section>;
}
function AccountQuiz({ sessionId, topicId, onNextSet }: { sessionId: string; topicId?: string; onNextSet: (topicId: string | null) => void }) {
  const [session, setSession] = useState<PracticeSession | null>(null);
  const [index, setIndex] = useState(0), [selected, setSelected] = useState(''), [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(true), [error, setError] = useState(''), [saveError, setSaveError] = useState('');
  const [retry, setRetry] = useState(0), [finished, setFinished] = useState(false);
  const writing = useRef(false);
  const question = session?.questions[index];
  useEffect(() => {
    let active = true; setBusy(true); setError('');
    void startPractice(supabase, sessionId, topicId).then(data => {
      if (!active) return;
      setSession(data); const first = data.questions.findIndex(q => !q.attempt); setIndex(Math.max(0, first));
      setFinished(data.questions.length > 0 && first === -1);
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [sessionId, topicId, retry]);
  useEffect(() => { setElapsed(question?.attempt?.elapsed_seconds ?? 0); setSelected(question?.attempt?.selected_option_id ?? ''); setSaveError(''); }, [question?.version_id, question?.attempt]);
  useEffect(() => {
    if (!question || question.attempt || busy || finished || saveError) return;
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') setElapsed(n => Math.min(n + 1, 86400)); }, 1000);
    return () => window.clearInterval(timer);
  }, [question, busy, finished, saveError]);
  const save = async () => {
    if (!question || question.attempt || !selected || writing.current) return;
    writing.current = true; setBusy(true); setSaveError('');
    try { setSession(await submitPractice(supabase, sessionId, question.question_id, selected, elapsed)); }
    catch (reason) { setSaveError(`Save could not be confirmed. Check the saved answer or retry the same selection. ${reason instanceof Error ? reason.message : String(reason)}`); }
    finally { writing.current = false; setBusy(false); }
  };
  const checkSaved = async () => {
    if (writing.current) return;
    writing.current = true; setBusy(true);
    try { setSession(await readPractice(supabase, sessionId)); setSaveError(''); }
    catch (reason) { setSaveError(`Could not check your saved answer. ${reason instanceof Error ? reason.message : String(reason)}`); }
    finally { writing.current = false; setBusy(false); }
  };
  if (error) return <div role="alert" className="space-y-4"><p>Could not load this practice session. {error}</p><Button onClick={() => setRetry(n => n + 1)}>Retry</Button></div>;
  if (!session) return <p role="status">Loading your published questions…</p>;
  if (!session.questions.length) return <div className="space-y-4"><h1 className="text-2xl font-bold">No published questions in this practice scope</h1><p>No sample questions have been substituted. Choose another published Topic in Practice.</p></div>;
  if (finished) return <div className="space-y-5"><h1 className="text-3xl font-bold">Practice complete</h1><p>{session.questions.filter(q => q.attempt?.is_correct).length}/{session.questions.length} correct · Answers saved to your account</p><Button onClick={() => onNextSet(session.topic_id)}>Start another set <ArrowRight /></Button>{session.questions.map(q => <Card key={q.question_id}><CardContent className="p-5"><MarkdownWithMath content={q.stem} strictMath /><SavedAnswer question={q} /></CardContent></Card>)}</div>;
  if (!question) return null;
  return <>
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-xl font-semibold">Question {index + 1} of {session.questions.length}</h1><p className="flex items-center gap-2 text-sm"><Clock3 className="h-4 w-4" />{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')} · Device time</p></div>
    <Progress className="my-5 h-2" value={session.questions.filter(q => q.attempt).length / session.questions.length * 100} />
    <Card><CardContent className="space-y-5 p-4 sm:p-7">
      <p aria-label="Saved question labels" className="break-words text-sm text-muted-foreground">{question.difficulty} · {question.calculator_policy?.replace(/_/g, ' ') ?? 'Calculator not specified'} · {question.course_scope} · Topic {question.topic.code}: {question.topic.title} · Skills {question.skills.join(', ')}</p>
      <div aria-label="Question content"><MarkdownWithMath content={question.stem} strictMath className="overflow-x-auto" /></div>
      {question.image_url && <img src={question.image_url} alt="Question figure" className="max-h-96 max-w-full object-contain" />}
      <div className="space-y-3" aria-label="Answer options">{question.options.map(option => <button type="button" key={option.id} aria-label={`Option ${option.key}`} aria-pressed={selected === option.id} disabled={busy || !!question.attempt || !!saveError} onClick={() => setSelected(option.id)} className={cn('flex w-full gap-3 rounded border p-4 text-left', selected === option.id && 'border-primary bg-primary/10', question.attempt?.correct_option_id === option.id && 'border-green-600 bg-green-50')}><span className="font-semibold">{option.key}.</span><MarkdownWithMath content={option.text} strictMath className="min-w-0 overflow-x-auto" /></button>)}</div>
      {saveError && <div role="alert" className="space-y-3"><p>{saveError}</p><Button variant="outline" disabled={busy} onClick={() => void checkSaved()}>Check saved answer</Button></div>}
      {busy && <p role="status">Checking the server…</p>}
      <SavedAnswer question={question} />
      {question.attempt ? <Button onClick={() => { if (index === session.questions.length - 1) setFinished(true); else setIndex(n => n + 1); }}>{index === session.questions.length - 1 ? 'Finish practice' : 'Next question'}<ArrowRight /></Button>
        : <Button disabled={busy || !selected} onClick={() => void save()}>{saveError ? 'Retry submission' : 'Submit answer'}</Button>}
    </CardContent></Card>
  </>;
}
export default function Quiz() {
  const { user, loading } = useAuth();
  const [params, setParams] = useSearchParams();
  const scope = parsePracticeRoute(params);
  useEffect(() => {
    if (user && !scope.error && !scope.sessionId) { const next = new URLSearchParams(params); next.set('session', crypto.randomUUID()); setParams(next, { replace: true }); }
  }, [user, scope.error, scope.sessionId, params, setParams]);
  return <div className="mx-auto min-h-[70vh] max-w-5xl px-4 py-8"><Button asChild variant="ghost" className="mb-6"><Link to="/practice"><ArrowLeft />Back to Practice</Link></Button>
    {loading ? <p role="status">Checking your account…</p> : !user ? <div className="space-y-4"><p>Sign in to practice published questions and save your answers.</p><Button asChild><Link to="/auth">Sign in</Link></Button></div>
      : scope.error ? <div role="alert" className="space-y-3"><h1 className="text-2xl font-semibold">This practice scope is not connected</h1><p>{scope.error}</p></div>
        : scope.sessionId ? <AccountQuiz key={user.id + ':' + scope.sessionId} sessionId={scope.sessionId} topicId={scope.topicId} onNextSet={topicId => setParams({ subject: 'calculus', source: 'next', ...(topicId ? { topic: topicId } : {}) })} />
          : <p role="status">Opening your practice session…</p>}
  </div>;
}
