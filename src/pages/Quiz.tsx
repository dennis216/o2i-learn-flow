import { courseLocation } from '@/lib/courseContent';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Clock3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import MarkdownWithMath from '@/components/MarkdownWithMath';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { selectionRationale, parsePracticeRoute, startPractice, readPractice, submitPractice, type IssuedPracticeQuestion, type PracticeSession } from '@/lib/studentPractice';
import { usePracticeCapture } from '@/hooks/usePracticeCapture';
import { PRACTICE_CAPTURE_PREFIX } from '@/lib/practiceCapture';
import { cn } from '@/lib/utils';

function SavedAnswer({ question, courseId }: { question: IssuedPracticeQuestion; courseId?: string | null }) {
  if (!question.attempt) return null;
  const answer = question.options.find(o => o.id === question.attempt?.correct_option_id);
  return <section aria-label="Saved answer" className="mt-6 space-y-3 rounded border bg-muted/30 p-4">
    <p className="font-semibold">{question.attempt.is_correct ? 'Correct' : 'Incorrect'}</p>
    <p>Time: {question.attempt.elapsed_seconds === null ? 'Not recorded' : `${question.attempt.elapsed_seconds} seconds`}{!question.attempt.timing_complete && ' · Incomplete or legacy timing; excluded from speed analysis'}</p>
    {question.attempt.selection_trajectory ? <div aria-label="Selection trajectory"><p>{Math.max(0, question.attempt.selection_trajectory.length - 1)} changes before Submit</p><ol className="list-decimal space-y-1 pl-5">{question.attempt.selection_trajectory.map((step, n) => <li key={n}>{step.elapsed_seconds}s · Option {question.options.find(o => o.id === step.option_id)?.key} · {step.option_id === question.attempt?.correct_option_id ? 'Correct' : 'Incorrect'}</li>)}</ol></div> : <p>Selection process not recorded.</p>}
    <p>Suggested practice: Topic {question.topic.code} · {question.skill_descriptions?.join('; ') || question.skills.join(', ')}{question.representation_type ? ` · ${question.representation_type}` : ''}. <Link className="underline" to={"/quiz?" + new URLSearchParams({ topic: question.topic.id, ...(courseId ? { course: courseId } : {}) })}>Practice this Topic</Link></p>
    <p>Correct answer: {answer?.key}</p><MarkdownWithMath content={answer?.text ?? ''} strictMath />
    <h2 className="font-semibold">Solution</h2><MarkdownWithMath content={question.attempt.solution} strictMath className="overflow-x-auto" />
  </section>;
}
function AccountQuiz({ sessionId, topicId, questionId, courseId, onCourseLoaded, onNextSet }: { sessionId: string; topicId?: string; questionId?: string; courseId?: string; onCourseLoaded: (path: string | null) => void; onNextSet: (topicId: string | null, courseId?: string | null) => void }) {
  const [session, setSession] = useState<PracticeSession | null>(null);
  const { user } = useAuth();
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(true), [error, setError] = useState(''), [saveError, setSaveError] = useState('');
  const [retry, setRetry] = useState(0), [finished, setFinished] = useState(false);
  const writing = useRef(false);
  const question = session?.questions[index];
  const tracking = usePracticeCapture(user!.id, sessionId, question, busy || finished || !!saveError);
  const selected = question?.attempt?.selected_option_id ?? tracking.capture.selected;
  const elapsed = question?.attempt?.elapsed_seconds ?? Math.floor(tracking.capture.milliseconds / 1000);
  const rationale = selectionRationale(session?.selection_summary);
  useEffect(() => {
    let active = true; setBusy(true); setError('');
    void (questionId ? readPractice(supabase, sessionId) : startPractice(supabase, sessionId, topicId, courseId)).then(data => {
      if (!active) return;
      onCourseLoaded(data.course_id ? courseLocation(data.course_id, data.topic_id ?? undefined) : null);
      if (questionId) {
        const target = data.questions.findIndex(q => q.question_id === questionId && q.attempt);
        if (target === -1) throw new Error('This saved answer is not available in this session.');
        setSession(data); setIndex(target); setFinished(false); return;
      }
      setSession(data); const first = data.questions.findIndex(q => !q.attempt); setIndex(Math.max(0, first));
      setFinished(data.questions.length > 0 && first === -1);
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [sessionId, topicId, questionId, courseId, onCourseLoaded, retry]);
  useEffect(() => { setSaveError(''); }, [question?.version_id, question?.attempt]);
  const save = async () => {
    if (!question || question.attempt || !selected || writing.current) return;
    const frozen = tracking.freeze();
    writing.current = true; setBusy(true); setSaveError('');
    try { setSession(await submitPractice(supabase, sessionId, question.question_id, frozen.selected, Math.floor(frozen.milliseconds / 1000), { trajectory: frozen.trajectory, complete: frozen.complete })); }
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
  if (!session.questions.length) return <div className="space-y-4"><h1 className="text-2xl font-bold">Practice for this topic is being prepared. Stay tuned.</h1>{courseId && <Link className="underline" to={courseLocation(courseId, topicId)}>Back to Course</Link>}</div>;
  if (finished) return <div className="space-y-5"><h1 className="text-3xl font-bold">Practice complete</h1>{rationale && <p aria-label="Selection rationale" className="text-sm text-muted-foreground">{rationale}</p>}<p>{session.questions.filter(q => q.attempt?.is_correct).length}/{session.questions.length} correct</p><Button onClick={() => onNextSet(session.topic_id, session.course_id)}>Start another set <ArrowRight /></Button>{session.questions.map(q => <Card key={q.question_id}><CardContent className="p-5"><MarkdownWithMath content={q.stem} strictMath /><SavedAnswer question={q} courseId={session.course_id} /></CardContent></Card>)}</div>;
  if (!question) return null;
  return <>
    {rationale && <p aria-label="Selection rationale" className="mb-4 text-sm text-muted-foreground">{rationale}</p>}
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-xl font-semibold">Question {index + 1} of {session.questions.length}</h1><p className="flex items-center gap-2 text-sm"><Clock3 className="h-4 w-4" />{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')} · Active device time</p>{!question.attempt && <Button variant="outline" disabled={busy || !!saveError || tracking.capture.frozen} onClick={tracking.pause}>{tracking.capture.paused ? 'Resume' : 'Pause'}</Button>}</div>
    {!question.attempt && !tracking.capture.complete && <p className="text-sm text-muted-foreground">Timing or selection history is incomplete. This answer will not be used for speed analysis.</p>}
    <Progress className="my-5 h-2" value={session.questions.filter(q => q.attempt).length / session.questions.length * 100} />
    <Card><CardContent className="space-y-5 p-4 sm:p-7">
      <p aria-label="Saved question labels" className="break-words text-sm text-muted-foreground">{question.difficulty} · {question.calculator_policy?.replace(/_/g, ' ') ?? 'Calculator not specified'} · {question.course_scope} · Topic {question.topic.code}: {question.topic.title} · Skills {question.skills.join(', ')}</p>
      <div aria-label="Question content"><MarkdownWithMath content={question.stem} strictMath className="overflow-x-auto" /></div>
      {question.image_url && <img src={question.image_url} alt="Question figure" className="max-h-96 max-w-full object-contain" />}
      <div className="space-y-3" aria-label="Answer options">{question.options.map(option => <button type="button" key={option.id} aria-label={`Option ${option.key}`} aria-pressed={selected === option.id} disabled={busy || !tracking.ready || !!question.attempt || !!saveError || tracking.capture.frozen || tracking.capture.paused} onClick={() => tracking.select(option.id)} className={cn('flex w-full gap-3 rounded border p-4 text-left', selected === option.id && 'border-primary bg-primary/10', question.attempt?.correct_option_id === option.id && 'border-green-600 bg-green-50')}><span className="font-semibold">{option.key}.</span><MarkdownWithMath content={option.text} strictMath className="min-w-0 overflow-x-auto" /></button>)}</div>
      {saveError && <div role="alert" className="space-y-3"><p>{saveError}</p><Button variant="outline" disabled={busy} onClick={() => void checkSaved()}>Check saved answer</Button></div>}
      {busy && <p role="status">Checking the server…</p>}
      <SavedAnswer question={question} courseId={session.course_id} />
      {question.attempt ? <Button onClick={() => { if (index === session.questions.length - 1) setFinished(true); else setIndex(n => n + 1); }}>{index === session.questions.length - 1 ? 'Finish practice' : 'Next question'}<ArrowRight /></Button>
        : <Button disabled={busy || !tracking.ready || !selected || tracking.capture.paused} onClick={() => void save()}>{saveError ? 'Retry submission' : 'Submit answer'}</Button>}
    </CardContent></Card>
  </>;
}
export default function Quiz() {
  const { user, loading } = useAuth();
  const [params, setParams] = useSearchParams();
  const scope = parsePracticeRoute(params);
  const [savedCourse, setSavedCourse] = useState<string | null>(null);
  useEffect(() => { setSavedCourse(null); }, [user?.id, scope.sessionId, scope.courseId]);
  const backToCourse = scope.courseId ? courseLocation(scope.courseId, scope.topicId) : savedCourse;
  useEffect(() => {
    if (user && !scope.error && !scope.sessionId) { const next = new URLSearchParams(params); const id = crypto.randomUUID();
      try { sessionStorage.setItem(`${PRACTICE_CAPTURE_PREFIX}${user.id}:${id}:new`, 'true'); } catch { /* Capture will be marked incomplete. */ }
      next.set('session', id); setParams(next, { replace: true }); }
  }, [user, scope.error, scope.sessionId, params, setParams]);
  return <div className="mx-auto min-h-[70vh] max-w-5xl px-4 py-8"><Button asChild variant="ghost" className="mb-6"><Link to={backToCourse ?? (scope.questionId ? '/review' : '/practice')}><ArrowLeft />{backToCourse ? 'Back to Course' : scope.questionId ? 'Back to Review' : 'Back to Practice'}</Link></Button>
    {loading ? <p role="status">Checking your account…</p> : !user ? <div className="space-y-4"><p>Sign in to practice published questions and save your answers.</p><Button asChild><Link to={"/auth?returnTo=" + encodeURIComponent("/quiz?" + params.toString())}>Sign in</Link></Button></div>
      : scope.error ? <div role="alert" className="space-y-3"><h1 className="text-2xl font-semibold">This practice scope is not connected</h1><p>{scope.error}</p></div>
        : scope.sessionId ? <AccountQuiz key={user.id + ':' + scope.sessionId + ':' + (scope.questionId ?? '')} sessionId={scope.sessionId} topicId={scope.topicId} questionId={scope.questionId} courseId={scope.courseId} onCourseLoaded={setSavedCourse} onNextSet={(topicId, courseId) => setParams({ subject: 'calculus', source: 'next', ...(courseId ? { course: courseId } : {}), ...(topicId ? { topic: topicId } : {}) })} />
          : <p role="status">Opening your practice session…</p>}
  </div>;
}
