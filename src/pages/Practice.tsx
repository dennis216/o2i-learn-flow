import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, BookOpen, History, Infinity as Endless, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { continuousPracticePath, endContinuousPractice, loadOpenContinuousPractice, loadPracticeHome, type OpenContinuousPractice, type PracticeTopic, type RecentPracticeAnswer } from '@/lib/studentPractice';
import { practiceTopicCards } from '@/lib/practiceTopics';

function AccountPractice() {
  const [topics, setTopics] = useState<PracticeTopic[]>([]);
  const [history, setHistory] = useState<RecentPracticeAnswer[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [unit, setUnit] = useState<number | null>(null);
  const [open, setOpen] = useState<OpenContinuousPractice | null>(null), [ending, setEnding] = useState(false), [openError, setOpenError] = useState('');
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { units, cards } = practiceTopicCards(topics, unit);
  useEffect(() => {
    let active = true; setBusy(true); setError('');
    void loadPracticeHome(supabase).then(data => { if (active) { setTopics(data.topics); setHistory(data.history); } })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (active) setBusy(false); });
    // Before the continuous-practice migration this RPC is missing; the page still works without the reminder.
    void loadOpenContinuousPractice(supabase).then(value => { if (active) setOpen(value); }).catch(() => { if (active) setOpen(null); });
    return () => { active = false; };
  }, [retry]);
  if (busy) return <p role="status">{t('Loading published topics and your saved answers…', '正在加载题目和答题记录…')}</p>;
  if (error) return <div role="alert" className="space-y-3"><p>{t('Could not load your practice data.', '练习数据加载失败。')} {error}</p><Button onClick={() => setRetry(n => n + 1)}>{t('Retry', '重试')}</Button></div>;
  const resume = open && continuousPracticePath({ sessionId: open.id, topicId: open.topic_id, courseId: open.course_id });
  const endOpen = async () => {
    if (!open || ending) return;
    setEnding(true); setOpenError('');
    try { await endContinuousPractice(supabase, open.id); navigate(resume!); }
    catch (reason) { setOpenError(`${t('Could not end that session.', '结束练习失败。')} ${reason instanceof Error ? reason.message : String(reason)}`); }
    finally { setEnding(false); }
  };
  return <>
    {open && <div role="status" className="mb-6 space-y-3 rounded border bg-muted/30 p-4">
      <p>{t('You have an unfinished practice session', '你有一次未完成的练习')} ({open.topic_code ? `Topic ${open.topic_code}` : t('Free practice', '自由练习')} · {t(`${open.answered_count} answered`, `已答 ${open.answered_count} 题`)})</p>
      <div className="flex flex-wrap gap-2"><Button asChild><Link to={resume!}>{t('Continue', '继续')}</Link></Button><Button variant="outline" disabled={ending} onClick={() => void endOpen()}>{t('End and see recap', '结束并查看总结')}</Button></div>
      {openError && <p role="alert">{openError}</p>}
    </div>}
    <div className="mb-8 flex flex-wrap items-center gap-3">
      {topics.length ? <>
        <Button asChild size="lg"><Link to="/quiz?subject=calculus&source=quick">{t('Start 5 questions', '快速做 5 题')} <ArrowRight /></Link></Button>
        <Button asChild size="lg" variant="secondary"><Link to={continuousPracticePath({})}><Endless className="h-4 w-4" />{t('Free practice', '自由练习')}</Link></Button>
      </> : <p className="rounded border p-6">{t('No published questions are available yet.', '暂时还没有题目。')}</p>}
      <Button asChild size="lg" variant="outline"><Link to="/review"><History className="h-4 w-4" />{t('Review', '复习')}</Link></Button>
    </div>
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <section className="min-w-0"><h2 className="mb-5 text-xl font-semibold">{t('Choose a published Topic', '选择一个 Topic')}</h2>
        <div role="group" aria-label={t('Filter Topics by Unit', '按 Unit 筛选 Topic')} className="mb-5 flex flex-wrap gap-2">
          <Button variant={unit === null ? 'default' : 'outline'} aria-pressed={unit === null} onClick={() => setUnit(null)}>{t('All', '全部')}</Button>
          {units.map(value => <Button key={value} variant={unit === value ? 'default' : 'outline'} aria-pressed={unit === value} onClick={() => setUnit(value)}>Unit {value}</Button>)}
        </div>
        <div className="grid gap-4 md:grid-cols-2">{cards.map(topic =>
        <Link className="min-w-0" key={topic.id} to={continuousPracticePath({ topicId: topic.id })}><Card className="h-full hover:border-primary"><CardHeader><BookOpen className="h-5 w-5 text-primary" /><CardTitle className="break-words text-lg">{topic.code} · {topic.title}</CardTitle></CardHeader><CardContent>{t(`${topic.question_count} published ${topic.question_count === 1 ? 'question' : 'questions'}`, `${topic.question_count} 道题`)}</CardContent></Card></Link>
      )}</div></section>
      <section><h2 className="mb-5 flex items-center gap-2 text-xl font-semibold"><History className="h-5 w-5" />{t('Recent account answers', '最近答题')}</h2><Card><CardContent className="space-y-3 p-5">{history.length ? history.map(answer =>
        <Link key={answer.id} to={`/quiz?session=${answer.session_id}&question=${answer.question_id}`} className="block rounded border p-3"><p className="text-sm font-medium">{answer.topic_code} · {answer.topic_title}</p><p className="text-xs text-muted-foreground">{answer.source === 'arena' ? t('Arena', '竞技场') : t('Practice', '练习')}</p><p className={answer.is_correct ? 'text-green-700' : 'text-destructive'}>{answer.is_correct ? t('Correct', '正确') : t('Incorrect', '错误')} · {t('Saved', '已保存')}</p><p className="text-xs text-muted-foreground">{new Date(answer.submitted_at).toLocaleString()}</p></Link>
      ) : <p>{t('Your saved answers will appear here after you submit a published question.', '提交答案后，记录会显示在这里。')}</p>}</CardContent></Card></section>
    </div>
  </>;
}
export default function Practice() {
  const { user, loading } = useAuth();
  const { t } = useLanguage();
  return <div className="mx-auto min-h-[70vh] max-w-6xl space-y-6 px-4 py-10"><header><h1 className="flex items-center gap-3 text-4xl font-bold"><Target />{t('Quick Practice', '快速练习')}</h1><p className="mt-3 text-muted-foreground">{t('Practice published questions. Answers are graded and saved to your account by the server.', '做完题系统自动判分，记录保存在你的账号里。')}</p></header>
    {loading ? <p role="status">{t('Checking your account…', '正在确认登录状态…')}</p> : user ? <AccountPractice key={user.id} /> : <div className="space-y-4"><p>{t('Sign in to start practice and read your saved answers.', '登录后就能开始练习，也能看到之前的答题记录。')}</p><Button asChild><Link to="/auth">{t('Sign in', '登录')}</Link></Button></div>}
  </div>;
}
