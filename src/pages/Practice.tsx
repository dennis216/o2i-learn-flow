import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { continuousPracticePath, endContinuousPractice, loadOpenContinuousPractice, loadPracticeHome, type OpenContinuousPractice, type PracticeTopic, type RecentPracticeAnswer } from '@/lib/studentPractice';
import { practiceTopicCards, practiceTopicGroups } from '@/lib/practiceTopics';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import SignInPrompt from '@/components/SignInPrompt';
import PageHeader from '@/components/PageHeader';
import FilterChips from '@/components/FilterChips';

const LINK = 'rounded-sm py-2 font-medium text-primary underline decoration-primary/30 underline-offset-4 hover:decoration-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

// A Topic is one tappable row: name on the left, how many questions on the right.
function TopicCards({ topics }: { topics: PracticeTopic[] }) {
  const { t } = useLanguage();
  return <div className="grid gap-2 md:grid-cols-2">{topics.map(topic =>
    <Link key={topic.id} to={continuousPracticePath({ topicId: topic.id })} className="flex min-w-0 items-baseline justify-between gap-4 rounded-xl bg-[hsl(var(--education-teal)/0.07)] px-4 py-3 transition-colors hover:bg-[hsl(var(--education-teal)/0.15)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <span className="min-w-0 break-words font-semibold text-foreground">{topic.code} · {topic.title}</span>
      <span className="shrink-0 text-sm text-muted-foreground">{t(`${topic.question_count} ${topic.question_count === 1 ? 'question' : 'questions'}`, `${topic.question_count} 道题`, `${topic.question_count} ${topic.question_count === 1 ? 'pregunta' : 'preguntas'}`)}</span>
    </Link>
  )}</div>;
}

function AccountPractice() {
  const [topics, setTopics] = useState<PracticeTopic[]>([]);
  const [history, setHistory] = useState<RecentPracticeAnswer[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [unit, setUnit] = useState<number | null>(null);
  const [open, setOpen] = useState<OpenContinuousPractice | null>(null), [ending, setEnding] = useState(false), [openError, setOpenError] = useState('');
  const navigate = useNavigate();
  const { t, locale } = useLanguage();
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
    {open && <div role="status" className="mb-8 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-2xl bg-accent/15 p-4 sm:px-5">
      <p className="font-medium">{t('You have an unfinished practice session', '你有一次未完成的练习')} ({open.topic_code ? `Topic ${open.topic_code}` : t('Free practice', '自由练习')} · {t(`${open.answered_count} answered`, `已答 ${open.answered_count} 题`)})</p>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2"><Button asChild><Link to={resume!}>{t('Continue', '继续')}</Link></Button><button type="button" disabled={ending} onClick={() => void endOpen()} className={`${LINK} disabled:opacity-50`}>{t('Finish and review', '结束练习，查看结果')}</button></div>
      {openError && <p role="alert" className="w-full text-destructive">{openError}</p>}
    </div>}
    {/* one main button; the other two ways in are text links */}
    <div className="mb-10 flex flex-wrap items-center gap-x-6 gap-y-3">
      {topics.length ? <>
        <Button asChild size="lg" className="h-12 px-8 text-base font-semibold"><Link to="/quiz?subject=calculus&source=quick">{t('Try 5 questions', '先练 5 题')}</Link></Button>
        <Link to={continuousPracticePath({})} className={LINK}>{t('Free practice', '自由练习')}</Link>
      </> : <p className="w-full rounded-2xl bg-muted/60 p-6">{t('No published questions are available yet.', '暂时还没有题目。')}</p>}
      <Link to="/review" className={LINK}>{t('Review', '复习')}</Link>
    </div>
    <div className="grid gap-10 lg:grid-cols-[1fr_300px]">
      <section className="min-w-0"><h2 className="mb-4 text-xl font-semibold">{t('Practice by topic', '按知识点练习')}</h2>
        <FilterChips className="mb-5" label={t('Filter topics by unit', '按单元筛选知识点')} value={unit} onChange={setUnit}
          options={[{ value: null, label: t('All', '全部') }, ...units.map(value => ({ value, label: t(`Unit ${value}`, `第 ${value} 单元`) }))]} />
        {unit === null ? (
          // All: one foldable row per Unit; opening a Unit shows the same cards as its own filter.
          <Accordion type="multiple" className="border-t">
            {practiceTopicGroups(topics).map(group => {
              const questions = group.topics.reduce((sum, topic) => sum + topic.question_count, 0);
              return <AccordionItem key={group.unit ?? 'other'} value={String(group.unit ?? 'other')} >
                <AccordionTrigger className="px-1 text-left text-lg font-semibold hover:no-underline hover:text-primary">
                  <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">{group.unit === null ? t('Other topics', '其他知识点') : t(`Unit ${group.unit}`, `第 ${group.unit} 单元`)}
                    <span className="text-sm font-normal text-muted-foreground">{t(`${group.topics.length} ${group.topics.length === 1 ? 'Topic' : 'Topics'} · ${questions} ${questions === 1 ? 'question' : 'questions'}`, `${group.topics.length} 个知识点 · ${questions} 道题`, `${group.topics.length} temas · ${questions} preguntas`)}</span></span>
                </AccordionTrigger>
                <AccordionContent className="pt-1"><TopicCards topics={group.topics} /></AccordionContent>
              </AccordionItem>;
            })}
          </Accordion>
        ) : <TopicCards topics={cards} />}
      </section>
      <section><h2 className="mb-4 text-xl font-semibold">{t('Recent answers', '最近的答题记录')}</h2>
        {history.length ? <ul className="divide-y border-y">{history.map(answer =>
          <li key={answer.id}><Link to={`/quiz?session=${answer.session_id}&question=${answer.question_id}`} className="block py-3 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <p className="text-sm font-medium text-foreground">{answer.topic_code} · {answer.topic_title}</p>
            <p className="mt-0.5 flex items-baseline justify-between gap-3 text-sm"><span className={`font-semibold ${answer.is_correct ? 'text-[hsl(var(--education-green))]' : 'text-destructive'}`}>{answer.is_correct ? t('Correct', '正确') : t('Incorrect', '错误')}</span><span className="text-xs text-muted-foreground">{new Date(answer.submitted_at).toLocaleDateString(locale)}</span></p>
          </Link></li>
        )}</ul> : <p className="text-muted-foreground">{t('Your answers will appear here once you start practicing.', '完成练习后，可以在这里查看答题记录。')}</p>}
      </section>
    </div>
  </>;
}
export default function Practice() {
  const { user, loading } = useAuth();
  const { language, t } = useLanguage();
  if (!loading && !user) return <div className="min-h-[70vh]"><SignInPrompt icon={Target} tile="teal" returnTo="/practice"
    title={t('Quick Practice', '快速练习')}
    description={t('Sign in to practice at your level and keep a record of your progress.', '登录后即可开始练习。题目难度会随作答情况调整，答题记录也会保存下来，方便复习。')} /></div>;
  return <div className={`mx-auto min-h-[70vh] max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8 ${language === 'zh' ? 'break-keep [overflow-wrap:anywhere]' : ''}`}>
    <PageHeader icon={Target} tone="teal" title={t('Quick Practice', '快速练习')} description={t('Get instant feedback, with questions that adapt to how you do.', '每道题作答后即可查看结果，后续题目的难度会根据你的表现调整。')} />
    {loading || !user ? <p role="status">{t('Checking your account…', '正在确认登录状态…')}</p> : <AccountPractice key={user.id} />}
  </div>;
}
