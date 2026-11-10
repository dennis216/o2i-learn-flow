import { entryLocation, loadCustomOutline } from '@/lib/courseOutline';
import { courseLocation } from '@/lib/courseContent';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Clock3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import MarkdownWithMath from '@/components/MarkdownWithMath';
import { ContinuousPractice } from '@/components/practice/ContinuousPractice';
import { QuestionBody, SavedAnswer } from '@/components/practice/PracticeQuestionParts';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { selectionRationale, parsePracticeRoute, startPractice, startContinuousPractice, readPractice, submitPractice, type PracticeSession } from '@/lib/studentPractice';
import { usePracticeCapture } from '@/hooks/usePracticeCapture';
import { PRACTICE_CAPTURE_PREFIX } from '@/lib/practiceCapture';

function AccountQuiz({ sessionId, topicId, questionId, courseId, continuous, returnTo, onCourseLoaded, onNextSet }: { sessionId: string; topicId?: string; questionId?: string; courseId?: string; continuous?: boolean; returnTo?: string | null; onCourseLoaded: (path: string | null) => void; onNextSet: (topicId: string | null, courseId?: string | null) => void }) {
  const [session, setSession] = useState<PracticeSession | null>(null);
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(true), [error, setError] = useState(''), [saveError, setSaveError] = useState('');
  const [retry, setRetry] = useState(0), [finished, setFinished] = useState(false);
  const writing = useRef(false);
  const question = session?.questions[index];
  // Continuous sessions own their capture; never time the same draft twice.
  const delegated = (session?.mode === 'continuous' && !questionId) || session?.source === 'arena';
  const tracking = usePracticeCapture(user!.id, sessionId, delegated ? undefined : question, busy || finished || !!saveError);
  const selected = question?.attempt?.selected_option_id ?? tracking.capture.selected;
  const elapsed = question?.attempt?.elapsed_seconds ?? Math.floor(tracking.capture.milliseconds / 1000);
  const rationale = selectionRationale(session?.selection_summary, language);
  useEffect(() => {
    let active = true; setBusy(true); setError('');
    void (questionId ? readPractice(supabase, sessionId) : continuous ? startContinuousPractice(supabase, sessionId, topicId, courseId) : startPractice(supabase, sessionId, topicId, courseId)).then(data => {
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
  }, [sessionId, topicId, questionId, courseId, continuous, onCourseLoaded, retry]);
  useEffect(() => { setSaveError(''); }, [question?.version_id, question?.attempt]);
  const save = async () => {
    if (!question || question.attempt || !selected || writing.current) return;
    const frozen = tracking.freeze();
    writing.current = true; setBusy(true); setSaveError('');
    try { setSession(await submitPractice(supabase, sessionId, question.question_id, frozen.selected, Math.floor(frozen.milliseconds / 1000), { trajectory: frozen.trajectory, complete: frozen.complete })); }
    catch (reason) { setSaveError(`${t('Save could not be confirmed. Check the saved answer or retry the same selection.', '没能确认答案是否保存成功。可以先查一下保存结果，或保持原选项再提交一次。')} ${reason instanceof Error ? reason.message : String(reason)}`); }
    finally { writing.current = false; setBusy(false); }
  };
  const checkSaved = async () => {
    if (writing.current) return;
    writing.current = true; setBusy(true);
    try { setSession(await readPractice(supabase, sessionId)); setSaveError(''); }
    catch (reason) { setSaveError(`${t('Could not check your saved answer.', '暂时查不到已保存的答案。')} ${reason instanceof Error ? reason.message : String(reason)}`); }
    finally { writing.current = false; setBusy(false); }
  };
  if (error) return <div role="alert" className="space-y-4"><p>{t('Could not load this practice session.', '这次练习加载失败。')} {error}</p><Button onClick={() => setRetry(n => n + 1)}>{t('Retry', '重试')}</Button></div>;
  if (!session) return <p role="status">{t('Loading your published questions…', '题目加载中…')}</p>;
  if (session.source === 'arena') return <section className="space-y-5">
    <h1 className="text-2xl font-bold">{t('Arena · Saved answers', '竞技场 · 答题记录')}</h1>
    <p>{t('These answers count in your learning statistics and Review. Continue playing in Arena; use Practice this Topic below for normal practice.', '这些答题会计入学习统计，也能在复习里看到。想接着玩就回竞技场；想做普通练习，点下面的“练习这个 Topic”。')}</p>
    <Button asChild variant="outline"><Link to="/arena">{t('Back to Arena', '返回竞技场')}</Link></Button>
    {(questionId ? session.questions.filter(q => q.question_id === questionId && q.attempt) : session.questions.filter(q => q.attempt)).map(q => <Card key={q.question_id}><CardContent className="space-y-4 p-5">
      <p className="text-sm text-muted-foreground">{t('Saved', '保存于')} {new Date(q.attempt!.submitted_at).toLocaleString()}</p>
      <QuestionBody question={q} selected={q.attempt!.selected_option_id} disabled onSelect={() => {}} />
      <SavedAnswer question={q} />
    </CardContent></Card>)}
  </section>;
  if (delegated) return <ContinuousPractice initial={session} returnTo={returnTo} />;
  if (!session.questions.length) return <div className="space-y-4"><h1 className="text-2xl font-bold">{t('Practice for this topic is being prepared. Stay tuned.', '这个 Topic 的练习正在准备中，敬请期待。')}</h1>{courseId && <Link className="underline" to={returnTo ?? courseLocation(courseId, topicId)}>{t('Back to Course', '返回课程')}</Link>}</div>;
  if (finished) return <div className="space-y-5"><h1 className="text-3xl font-bold">{t('Practice complete', '练习完成')}</h1>{rationale && <p aria-label="Selection rationale" className="text-sm text-muted-foreground">{rationale}</p>}<p>{session.questions.filter(q => q.attempt?.is_correct).length}/{session.questions.length} {t('correct', '正确')}</p><Button onClick={() => onNextSet(session.topic_id, session.course_id)}>{t('Start another set', '再来一组')} <ArrowRight /></Button>{session.questions.map(q => <Card key={q.question_id}><CardContent className="p-5"><MarkdownWithMath content={q.stem} strictMath /><SavedAnswer question={q} courseId={session.course_id} /></CardContent></Card>)}</div>;
  if (!question) return null;
  return <>
    {rationale && <p aria-label="Selection rationale" className="mb-4 text-sm text-muted-foreground">{rationale}</p>}
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-xl font-semibold">{t(`Question ${index + 1} of ${session.questions.length}`, `第 ${index + 1} 题，共 ${session.questions.length} 题`)}</h1><p className="flex items-center gap-2 text-sm"><Clock3 className="h-4 w-4" />{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')} · {t('Active device time', '用时（本设备）')}</p>{!question.attempt && <Button variant="outline" disabled={busy || !!saveError || tracking.capture.frozen} onClick={tracking.pause}>{tracking.capture.paused ? t('Resume', '继续') : t('Pause', '暂停')}</Button>}</div>
    {!question.attempt && !tracking.capture.complete && <p className="text-sm text-muted-foreground">{t('Timing or selection history is incomplete. This answer will not be used for speed analysis.', '计时或选项记录不完整，这道题不计入速度分析。')}</p>}
    <Progress className="my-5 h-2" value={session.questions.filter(q => q.attempt).length / session.questions.length * 100} />
    <Card><CardContent className="space-y-5 p-4 sm:p-7">
      <QuestionBody question={question} selected={selected} disabled={busy || !tracking.ready || !!question.attempt || !!saveError || tracking.capture.frozen || tracking.capture.paused} onSelect={tracking.select} />
      {saveError && <div role="alert" className="space-y-3"><p>{saveError}</p><Button variant="outline" disabled={busy} onClick={() => void checkSaved()}>{t('Check saved answer', '检查已保存的答案')}</Button></div>}
      {busy && <p role="status">{t('Checking the server…', '请稍候…')}</p>}
      <SavedAnswer question={question} courseId={session.course_id} />
      {question.attempt ? <Button onClick={() => { if (index === session.questions.length - 1) setFinished(true); else setIndex(n => n + 1); }}>{index === session.questions.length - 1 ? t('Finish practice', '完成练习') : t('Next question', '下一题')}<ArrowRight /></Button>
        : <Button disabled={busy || !tracking.ready || !selected || tracking.capture.paused} onClick={() => void save()}>{saveError ? t('Retry submission', '重新提交') : t('Submit answer', '提交答案')}</Button>}
    </CardContent></Card>
  </>;
}
export default function Quiz() {
  const { user, loading } = useAuth();
  const { t } = useLanguage();
  const [params, setParams] = useSearchParams();
  const scope = parsePracticeRoute(params);
  const [savedCourse, setSavedCourse] = useState<string | null>(null);
  useEffect(() => { setSavedCourse(null); }, [user?.id, scope.sessionId, scope.courseId]);
  const sourceEntryId = scope.entryId;
  const [returnContext, setReturnContext] = useState<{ courseId: string; topicId: string; entryId: string } | null>(null);
  useEffect(() => {
    let active = true; setReturnContext(null);
    if (scope.courseId && scope.topicId && sourceEntryId) {
      const courseId = scope.courseId, topicId = scope.topicId;
      void loadCustomOutline(supabase, courseId).then(data => {
        if (active && data.units.some(u => u.topics.some(e => e.id === sourceEntryId && e.is_published && e.cb_topics.some(t => t.id === topicId)))) setReturnContext({ courseId, topicId, entryId: sourceEntryId });
      }).catch(() => { /* The canonical course/Topic link remains available. */ });
    }
    return () => { active = false; };
  }, [scope.courseId, scope.topicId, sourceEntryId, user?.id]);
  const returnEntryId = returnContext && returnContext.courseId === scope.courseId && returnContext.topicId === scope.topicId ? returnContext.entryId : undefined;
  const backToCourse = scope.courseId ? (returnEntryId ? entryLocation(scope.courseId, returnEntryId) : courseLocation(scope.courseId, scope.topicId)) : savedCourse;
  useEffect(() => {
    if (user && !scope.error && !scope.sessionId) { const next = new URLSearchParams(params); const id = crypto.randomUUID();
      try { sessionStorage.setItem(`${PRACTICE_CAPTURE_PREFIX}${user.id}:${id}:new`, 'true'); } catch { /* Capture will be marked incomplete. */ }
      next.set('session', id); setParams(next, { replace: true }); }
  }, [user, scope.error, scope.sessionId, params, setParams]);
  return <div className="mx-auto min-h-[70vh] max-w-5xl px-4 py-8"><Button asChild variant="ghost" className="mb-6"><Link to={backToCourse ?? (scope.questionId ? '/review' : '/practice')}><ArrowLeft />{backToCourse ? t('Back to Course', '返回课程') : scope.questionId ? t('Back to Review', '返回复习') : t('Back to Practice', '返回练习')}</Link></Button>
    {loading ? <p role="status">{t('Checking your account…', '正在确认登录状态…')}</p> : !user ? <div className="space-y-4"><p>{t('Sign in to practice published questions and save your answers.', '登录后就能练习，答题记录会自动保存。')}</p><Button asChild><Link to={"/auth?returnTo=" + encodeURIComponent("/quiz?" + params.toString())}>{t('Sign in', '登录')}</Link></Button></div>
      : scope.error ? <div role="alert" className="space-y-3"><h1 className="text-2xl font-semibold">{t('This practice scope is not connected', '这个练习链接暂时用不了')}</h1><p>{scope.error}</p></div>
        : scope.sessionId ? <AccountQuiz key={user.id + ':' + scope.sessionId + ':' + (scope.questionId ?? '')} sessionId={scope.sessionId} topicId={scope.topicId} questionId={scope.questionId} courseId={scope.courseId} continuous={scope.continuous} returnTo={backToCourse} onCourseLoaded={setSavedCourse} onNextSet={(topicId, courseId) => setParams({ subject: 'calculus', source: 'next', ...(courseId ? { course: courseId } : {}), ...(topicId ? { topic: topicId } : {}), ...(returnEntryId ? { lesson: returnEntryId } : {}) })} />
          : <p role="status">{t('Opening your practice session…', '正在打开练习…')}</p>}
  </div>;
}
