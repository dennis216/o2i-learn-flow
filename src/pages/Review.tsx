import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { loadPracticeHistory, type RecentPracticeAnswer } from '@/lib/studentPractice';

function AnswerHistory({ incorrectOnly }: { incorrectOnly: boolean }) {
  const [history, setHistory] = useState<RecentPracticeAnswer[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const { t } = useLanguage();
  useEffect(() => {
    let active = true;
    setBusy(true); setError('');
    void loadPracticeHistory(supabase, incorrectOnly)
      .then(data => { if (active) setHistory(data); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [incorrectOnly, retry]);
  if (busy) return <p role="status">{t('Loading your saved answers…', '作答记录加载中…')}</p>;
  if (error) return <div role="alert" className="space-y-3"><p>{t('Could not load your saved answers.', '无法加载作答记录。')} {error}</p><Button onClick={() => setRetry(n => n + 1)}>{t('Retry', '重试')}</Button></div>;
  if (!history.length) return <p className="rounded border p-6">{incorrectOnly ? t('No incorrect answers in your account history.', '你的账号里还没有答错的题。') : t('Your saved answers will appear here after you submit a published question.', '提交题目后，你的作答记录会显示在这里。')}</p>;
  return <ul aria-label={t('Saved answer history', '作答记录')} className="space-y-3">{history.map(answer =>
    <li key={answer.id}><Link to={`/quiz?session=${answer.session_id}&question=${answer.question_id}`} className="block rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
      <Card className="hover:border-primary"><CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="min-w-0"><p className="break-words font-medium">Topic {answer.topic_code} · {answer.topic_title}</p><p className="text-sm text-muted-foreground">{answer.source === 'arena' ? t('Arena', '竞技场') : t('Practice', '练习')}</p><p className={answer.is_correct ? 'text-green-700' : 'text-destructive'}>{answer.is_correct ? t('Correct', '正确') : t('Incorrect', '错误')}</p><time dateTime={answer.submitted_at} className="text-sm text-muted-foreground">{new Date(answer.submitted_at).toLocaleString()}</time></div>
        <span className="flex items-center gap-2 text-sm text-primary">{t('View solution', '查看解析')} <ArrowRight className="h-4 w-4" /></span>
      </CardContent></Card>
    </Link></li>
  )}</ul>;
}

function AccountReview() {
  const [incorrectOnly, setIncorrectOnly] = useState(false);
  const { t } = useLanguage();
  return <section className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-4"><h2 className="text-xl font-semibold">{incorrectOnly ? t('Latest 10 incorrect answers', '最近 10 道错题') : t('Latest 10 answers', '最近 10 次作答')}</h2><Button variant={incorrectOnly ? 'default' : 'outline'} aria-pressed={incorrectOnly} onClick={() => setIncorrectOnly(value => !value)}>{t('Only incorrect', '只看错题')}</Button></div>
    <p className="text-sm text-muted-foreground">{incorrectOnly ? t('The latest 10 incorrect answers across your full account history.', '你账号全部记录中最近的 10 道错题。') : t('Your latest 10 submitted answers, newest first.', '你最近提交的 10 次作答，最新的在前。')} {t('Times are shown in your local time zone.', '时间按你所在的时区显示。')}</p>
    <AnswerHistory key={String(incorrectOnly)} incorrectOnly={incorrectOnly} />
  </section>;
}

export default function Review() {
  const { user, loading } = useAuth();
  const { t } = useLanguage();
  return <div className="mx-auto min-h-[70vh] max-w-5xl space-y-8 px-4 py-10">
    <header><h1 className="flex items-center gap-3 text-4xl font-bold"><BookOpen className="text-primary" />{t('Your Review', '我的复习')}</h1><p className="mt-3 text-muted-foreground">{t('Review answers saved to your account and revisit their solutions.', '回顾账号里保存的作答，重温解析。')}</p><Button asChild className="mt-5"><Link to="/practice">{t('Choose published practice', '去选练习')} <ArrowRight /></Link></Button></header>
    {loading ? <p role="status">{t('Checking your account…', '正在检查账号…')}</p> : user ? <AccountReview key={user.id} /> : <div className="space-y-4"><p>{t('Sign in to review your saved answers.', '登录后查看你的作答记录。')}</p><Button asChild><Link to="/auth">{t('Sign in', '登录')}</Link></Button></div>}
  </div>;
}
