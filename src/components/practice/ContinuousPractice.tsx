import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Clock3, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import MarkdownWithMath from '@/components/MarkdownWithMath';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { usePracticeCapture } from '@/hooks/usePracticeCapture';
import { QuestionBody, SavedAnswer } from '@/components/practice/PracticeQuestionParts';
import {
  continuousPracticePath, continuousReasonText, endContinuousPractice, nextContinuousPractice, submitPractice,
  topicStatusBasis, topicStatusLabel, type PracticeSession,
} from '@/lib/studentPractice';

/** One server-chosen question at a time until the student ends the session; then the recap. */
export function ContinuousPractice({ initial, returnTo }: { initial: PracticeSession; returnTo?: string | null }) {
  const { user } = useAuth();
  const [session, setSession] = useState(initial);
  const [busy, setBusy] = useState(false), [actionError, setActionError] = useState(''), [saveError, setSaveError] = useState('');
  const writing = useRef(false);
  const question = session.questions.find(q => !q.attempt);
  const tracking = usePracticeCapture(user!.id, session.id, session.ended_at ? undefined : question, busy || !!saveError);
  const selected = tracking.capture.selected;
  const elapsed = Math.floor(tracking.capture.milliseconds / 1000);
  useEffect(() => { setSaveError(''); }, [question?.version_id]);
  const run = async (action: () => Promise<PracticeSession>, failure: string) => {
    if (writing.current) return;
    writing.current = true; setBusy(true); setActionError('');
    try { setSession(await action()); }
    catch (reason) { setActionError(`${failure} ${reason instanceof Error ? reason.message : String(reason)}`); }
    finally { writing.current = false; setBusy(false); }
  };
  const save = async () => {
    if (!question || !selected || writing.current) return;
    const frozen = tracking.freeze();
    writing.current = true; setBusy(true); setSaveError('');
    try { setSession(await submitPractice(supabase, session.id, question.question_id, frozen.selected, Math.floor(frozen.milliseconds / 1000), { trajectory: frozen.trajectory, complete: frozen.complete })); }
    catch (reason) { setSaveError(`Save could not be confirmed. Retry the same selection. ${reason instanceof Error ? reason.message : String(reason)}`); }
    finally { writing.current = false; setBusy(false); }
  };
  const next = () => void run(() => nextContinuousPractice(supabase, session.id), 'Could not load the next question.');
  const end = () => void run(() => endContinuousPractice(supabase, session.id), 'Could not end the session.');
  if (session.ended_at) return <PracticeRecap session={session} returnTo={returnTo} />;

  const answered = session.questions.filter(q => q.attempt).length;
  const last = session.questions.at(-1);
  const scope = session.topic_id ? `Topic ${session.questions[0]?.topic.code ?? ''} practice` : 'Free practice';
  const reason = (id?: string) => continuousReasonText(session.continuous?.items.find(i => i.question_id === id)?.reason);
  const exhausted = session.next_result && !['issued', 'ended'].includes(session.next_result) && !question;
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-semibold">{scope} · {answered} answered</h1>
      <Button variant="outline" disabled={busy} onClick={end}><Square className="h-4 w-4" />End session</Button>
    </div>
    {actionError && <div role="alert" className="space-y-3"><p>{actionError}</p></div>}
    {busy && <p role="status">Checking the server…</p>}
    {question ? <>
      {reason(question.question_id) && <p aria-label="Why this question" className="text-sm text-muted-foreground">{reason(question.question_id)}</p>}
      <div className="flex flex-wrap items-center gap-3 text-sm"><h2 className="font-semibold">Question {session.questions.length}</h2><p className="flex items-center gap-2"><Clock3 className="h-4 w-4" />{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')} · Active device time</p><Button variant="outline" size="sm" disabled={busy || !!saveError || tracking.capture.frozen} onClick={tracking.pause}>{tracking.capture.paused ? 'Resume' : 'Pause'}</Button></div>
      <Card><CardContent className="space-y-5 p-4 sm:p-7">
        <QuestionBody question={question} selected={selected} disabled={busy || !tracking.ready || !!saveError || tracking.capture.frozen || tracking.capture.paused} onSelect={tracking.select} />
        {saveError && <p role="alert">{saveError}</p>}
        <Button disabled={busy || !tracking.ready || !selected || tracking.capture.paused} onClick={() => void save()}>{saveError ? 'Retry submission' : 'Submit answer'}</Button>
      </CardContent></Card>
    </> : <>
      {exhausted ? <Card><CardContent className="space-y-4 p-5">
        <h2 className="text-lg font-semibold">{session.next_result === 'topic_exhausted' ? 'You have tried every published question for this Topic.'
          : session.next_result === 'all_exhausted' ? 'You have tried every published question available here.' : 'This session reached 100 questions.'}</h2>
        <div className="flex flex-wrap gap-2">
          {session.next_result === 'topic_exhausted' && returnTo && <Button asChild variant="outline"><Link to={returnTo}>Watch the lesson</Link></Button>}
          {session.next_result === 'topic_exhausted' && <Button asChild variant="outline"><Link to="/practice">Choose another Topic</Link></Button>}
          <Button disabled={busy} onClick={end}>End session and see recap</Button>
        </div>
      </CardContent></Card>
        : session.continuous?.stuck ? <Card role="status"><CardContent className="space-y-4 p-5">
          <h2 className="text-lg font-semibold">Four in a row were incorrect on this Topic.</h2>
          <p>Watching the lesson video or reading the solutions below may help before you continue.</p>
          <div className="flex flex-wrap gap-2">{returnTo && <Button asChild variant="outline"><Link to={returnTo}>Watch the lesson</Link></Button>}<Button disabled={busy} onClick={next}>Keep practicing <ArrowRight /></Button></div>
        </CardContent></Card>
          : last && <Button disabled={busy} onClick={next}>Next question <ArrowRight /></Button>}
      {last?.attempt && <Card><CardContent className="space-y-3 p-5"><MarkdownWithMath content={last.stem} strictMath className="overflow-x-auto" /><SavedAnswer question={last} courseId={session.course_id} /></CardContent></Card>}
      {!last && <Button disabled={busy} onClick={next}>Start <ArrowRight /></Button>}
    </>}
  </div>;
}

function PracticeRecap({ session, returnTo }: { session: PracticeSession; returnTo?: string | null }) {
  const recap = session.continuous!.recap;
  const wrong = session.questions.filter(q => q.attempt && !q.attempt.is_correct);
  const skipped = session.questions.filter(q => !q.attempt).length;
  const minutes = recap.timed_seconds === null ? null : Math.max(1, Math.round(recap.timed_seconds / 60));
  const suggestion = recap.suggestion;
  return <div className="space-y-6">
    <h1 className="text-3xl font-bold">Session recap</h1>
    <section aria-label="What you did" className="space-y-1">
      <h2 className="text-xl font-semibold">What you did</h2>
      <p>{recap.answered_count} answered · {recap.new_count} new {recap.new_count === 1 ? 'question' : 'questions'}, {recap.new_correct_count} correct on the first try{skipped ? ` · ${skipped} not answered` : ''}</p>
      {minutes !== null && <p className="text-sm text-muted-foreground">About {minutes} min of active time (reported by your device; for reference only).</p>}
    </section>
    <section aria-label="By Topic" className="space-y-2">
      <h2 className="text-xl font-semibold">By Topic</h2>
      {!recap.topics.length && <p>No answers were submitted in this session.</p>}
      <ul className="space-y-2">{recap.topics.map(t => <li key={t.topic_id} className="rounded border p-3"><p className="font-medium">{t.topic_code} · {t.topic_title}: {topicStatusLabel[t.status]}</p><p className="text-sm text-muted-foreground">{topicStatusBasis(t)}</p></li>)}</ul>
    </section>
    <section aria-label="Questions to look at again" className="space-y-2">
      <h2 className="text-xl font-semibold">Questions to look at again</h2>
      {wrong.length ? <><p className="text-sm text-muted-foreground">These are also saved in Review.</p>{wrong.map(q => <details key={q.question_id} className="rounded border p-3"><summary className="cursor-pointer">Topic {q.topic.code} · Question {q.position}</summary><MarkdownWithMath content={q.stem} strictMath className="mt-3 overflow-x-auto" /><SavedAnswer question={q} courseId={session.course_id} /></details>)}</> : <p>No incorrect answers in this session.</p>}
    </section>
    <section aria-label="Next step" className="space-y-3">
      <h2 className="text-xl font-semibold">Next step</h2>
      {suggestion ? <p>Topic {suggestion.topic_code} · {suggestion.topic_title} could use more practice.</p> : <p>The Topics you practiced look fairly steady or have no new questions left. Keep going with Free practice.</p>}
      <div className="flex flex-wrap gap-2">
        {suggestion ? <Button asChild><Link to={continuousPracticePath({ topicId: suggestion.topic_id, courseId: suggestion.topic_id === session.topic_id ? session.course_id : null })}>Practice {suggestion.topic_code} <ArrowRight /></Link></Button>
          : <Button asChild><Link to={continuousPracticePath({})}>Free practice <ArrowRight /></Link></Button>}
        <Button asChild variant="outline"><Link to={returnTo ?? '/practice'}>{returnTo ? 'Back to Course' : 'Back to Practice'}</Link></Button>
      </div>
    </section>
  </div>;
}
