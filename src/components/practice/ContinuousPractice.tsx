import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Clock3, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import MarkdownWithMath from '@/components/MarkdownWithMath';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { usePracticeCapture } from '@/hooks/usePracticeCapture';
import { QuestionBody, SavedAnswer } from '@/components/practice/PracticeQuestionParts';
import {
  continuousPracticePath, continuousReasonText, endContinuousPractice, nextContinuousPractice, submitPractice,
  topicStatusBasis, topicStatusLabel, topicStatusLabelZh, type PracticeSession,
} from '@/lib/studentPractice';

/** One server-chosen question at a time until the student ends the session; then the recap. */
export function ContinuousPractice({ initial, returnTo }: { initial: PracticeSession; returnTo?: string | null }) {
  const { user } = useAuth();
  const { language, t } = useLanguage();
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
    catch (reason) { setSaveError(`${t('Save could not be confirmed. Retry the same selection.', '没能确认答案是否保存成功，请保持原选项再提交一次。')} ${reason instanceof Error ? reason.message : String(reason)}`); }
    finally { writing.current = false; setBusy(false); }
  };
  const next = () => void run(() => nextContinuousPractice(supabase, session.id), t('Could not load the next question.', '下一题加载失败。'));
  const end = () => void run(() => endContinuousPractice(supabase, session.id), t('Could not end the session.', '结束练习失败。'));
  if (session.ended_at) return <PracticeRecap session={session} returnTo={returnTo} />;

  const answered = session.questions.filter(q => q.attempt).length;
  const last = session.questions.at(-1);
  const scope = session.topic_id ? t(`Topic ${session.questions[0]?.topic.code ?? ''} practice`, `Topic ${session.questions[0]?.topic.code ?? ''} 练习`) : t('Free practice', '自由练习');
  const reason = (id?: string) => continuousReasonText(session.continuous?.items.find(i => i.question_id === id)?.reason, language);
  const exhausted = session.next_result && !['issued', 'ended'].includes(session.next_result) && !question;
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-semibold">{scope} · {t(`${answered} answered`, `已答 ${answered} 题`)}</h1>
      <Button variant="outline" disabled={busy} onClick={end}><Square className="h-4 w-4" />{t('End session', '结束练习')}</Button>
    </div>
    {actionError && <div role="alert" className="space-y-3"><p>{actionError}</p></div>}
    {busy && <p role="status">{t('Checking the server…', '请稍候…')}</p>}
    {question ? <>
      {reason(question.question_id) && <p aria-label={t('Why this question', '出这道题的原因')} className="text-sm text-muted-foreground">{reason(question.question_id)}</p>}
      <div className="flex flex-wrap items-center gap-3 text-sm"><h2 className="font-semibold">{t(`Question ${session.questions.length}`, `第 ${session.questions.length} 题`)}</h2><p className="flex items-center gap-2"><Clock3 className="h-4 w-4" />{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')} · {t('Active device time', '用时（本设备）')}</p><Button variant="outline" size="sm" disabled={busy || !!saveError || tracking.capture.frozen} onClick={tracking.pause}>{tracking.capture.paused ? t('Resume', '继续') : t('Pause', '暂停')}</Button></div>
      <Card><CardContent className="space-y-5 p-4 sm:p-7">
        <QuestionBody question={question} selected={selected} disabled={busy || !tracking.ready || !!saveError || tracking.capture.frozen || tracking.capture.paused} onSelect={tracking.select} />
        {saveError && <p role="alert">{saveError}</p>}
        <Button disabled={busy || !tracking.ready || !selected || tracking.capture.paused} onClick={() => void save()}>{saveError ? t('Retry submission', '重新提交') : t('Submit answer', '提交答案')}</Button>
      </CardContent></Card>
    </> : <>
      {exhausted ? <Card><CardContent className="space-y-4 p-5">
        <h2 className="text-lg font-semibold">{session.next_result === 'topic_exhausted' ? t('You have tried every published question for this Topic.', '这个 Topic 的题你都做过了。')
          : session.next_result === 'all_exhausted' ? t('You have tried every published question available here.', '这里的题你都做过了。') : t('This session reached 100 questions.', '这次已经做满 100 题了。')}</h2>
        <div className="flex flex-wrap gap-2">
          {session.next_result === 'topic_exhausted' && returnTo && <Button asChild variant="outline"><Link to={returnTo}>{t('Watch the lesson', '回去看课')}</Link></Button>}
          {session.next_result === 'topic_exhausted' && <Button asChild variant="outline"><Link to="/practice">{t('Choose another Topic', '换一个 Topic')}</Link></Button>}
          <Button disabled={busy} onClick={end}>{t('End session and see recap', '结束并查看总结')}</Button>
        </div>
      </CardContent></Card>
        : session.continuous?.stuck ? <Card role="status"><CardContent className="space-y-4 p-5">
          <h2 className="text-lg font-semibold">{t('Four in a row were incorrect on this Topic.', '这个 Topic 已经连错四题了。')}</h2>
          <p>{t('Watching the lesson video or reading the solutions below may help before you continue.', '可以先看看课程视频或下面的解析，再继续。')}</p>
          <div className="flex flex-wrap gap-2">{returnTo && <Button asChild variant="outline"><Link to={returnTo}>{t('Watch the lesson', '回去看课')}</Link></Button>}<Button disabled={busy} onClick={next}>{t('Keep practicing', '继续练习')} <ArrowRight /></Button></div>
        </CardContent></Card>
          : last && <Button disabled={busy} onClick={next}>{t('Next question', '下一题')} <ArrowRight /></Button>}
      {last?.attempt && <Card><CardContent className="space-y-3 p-5"><MarkdownWithMath content={last.stem} strictMath className="overflow-x-auto" /><SavedAnswer question={last} courseId={session.course_id} /></CardContent></Card>}
      {!last && <Button disabled={busy} onClick={next}>{t('Start', '开始')} <ArrowRight /></Button>}
    </>}
  </div>;
}

function PracticeRecap({ session, returnTo }: { session: PracticeSession; returnTo?: string | null }) {
  const { language, t } = useLanguage();
  const recap = session.continuous!.recap;
  const wrong = session.questions.filter(q => q.attempt && !q.attempt.is_correct);
  const skipped = session.questions.filter(q => !q.attempt).length;
  const minutes = recap.timed_seconds === null ? null : Math.max(1, Math.round(recap.timed_seconds / 60));
  const suggestion = recap.suggestion;
  return <div className="space-y-6">
    <h1 className="text-3xl font-bold">{t('Session recap', '练习总结')}</h1>
    <section aria-label={t('What you did', '本次概况')} className="space-y-1">
      <h2 className="text-xl font-semibold">{t('What you did', '本次概况')}</h2>
      <p>{t(`${recap.answered_count} answered · ${recap.new_count} new ${recap.new_count === 1 ? 'question' : 'questions'}, ${recap.new_correct_count} correct on the first try${skipped ? ` · ${skipped} not answered` : ''}`, `已答 ${recap.answered_count} 题 · 新题 ${recap.new_count} 道，首次答对 ${recap.new_correct_count} 道${skipped ? ` · ${skipped} 题没答` : ''}`)}</p>
      {minutes !== null && <p className="text-sm text-muted-foreground">{t(`About ${minutes} min of active time (reported by your device; for reference only).`, `有效用时约 ${minutes} 分钟（由你的设备记录，仅供参考）。`)}</p>}
    </section>
    <section aria-label={t('By Topic', '按 Topic')} className="space-y-2">
      <h2 className="text-xl font-semibold">{t('By Topic', '按 Topic')}</h2>
      {!recap.topics.length && <p>{t('No answers were submitted in this session.', '这次没有答题。')}</p>}
      <ul className="space-y-2">{recap.topics.map(topic => <li key={topic.topic_id} className="rounded border p-3"><p className="font-medium">{topic.topic_code} · {topic.topic_title}: {(language === 'zh' ? topicStatusLabelZh : topicStatusLabel)[topic.status]}</p><p className="text-sm text-muted-foreground">{topicStatusBasis(topic, language)}</p></li>)}</ul>
    </section>
    <section aria-label={t('Questions to look at again', '需要再看看的题')} className="space-y-2">
      <h2 className="text-xl font-semibold">{t('Questions to look at again', '需要再看看的题')}</h2>
      {wrong.length ? <><p className="text-sm text-muted-foreground">{t('These are also saved in Review.', '这些题在复习里也能找到。')}</p>{wrong.map(q => <details key={q.question_id} className="rounded border p-3"><summary className="cursor-pointer">Topic {q.topic.code} · {t(`Question ${q.position}`, `第 ${q.position} 题`)}</summary><MarkdownWithMath content={q.stem} strictMath className="mt-3 overflow-x-auto" /><SavedAnswer question={q} courseId={session.course_id} /></details>)}</> : <p>{t('No incorrect answers in this session.', '这次没有答错的题。')}</p>}
    </section>
    <section aria-label={t('Next step', '下一步')} className="space-y-3">
      <h2 className="text-xl font-semibold">{t('Next step', '下一步')}</h2>
      {suggestion ? <p>{t(`Topic ${suggestion.topic_code} · ${suggestion.topic_title} could use more practice.`, `Topic ${suggestion.topic_code} · ${suggestion.topic_title} 还可以多练练。`)}</p> : <p>{t('The Topics you practiced look fairly steady or have no new questions left. Keep going with Free practice.', '你练过的 Topic 掌握得比较稳了，或者已经没有新题。可以接着自由练习。')}</p>}
      <div className="flex flex-wrap gap-2">
        {suggestion ? <Button asChild><Link to={continuousPracticePath({ topicId: suggestion.topic_id, courseId: suggestion.topic_id === session.topic_id ? session.course_id : null })}>{t(`Practice ${suggestion.topic_code}`, `练习 ${suggestion.topic_code}`)} <ArrowRight /></Link></Button>
          : <Button asChild><Link to={continuousPracticePath({})}>{t('Free practice', '自由练习')} <ArrowRight /></Link></Button>}
        <Button asChild variant="outline"><Link to={returnTo ?? '/practice'}>{returnTo ? t('Back to Course', '返回课程') : t('Back to Practice', '返回练习')}</Link></Button>
      </div>
    </section>
  </div>;
}
