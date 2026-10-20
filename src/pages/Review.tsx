import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { loadPracticeHistory, type RecentPracticeAnswer } from '@/lib/studentPractice';

function AnswerHistory({ incorrectOnly }: { incorrectOnly: boolean }) {
  const [history, setHistory] = useState<RecentPracticeAnswer[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setBusy(true); setError('');
    void loadPracticeHistory(supabase, incorrectOnly)
      .then(data => { if (active) setHistory(data); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [incorrectOnly, retry]);
  if (busy) return <p role="status">Loading your saved answers…</p>;
  if (error) return <div role="alert" className="space-y-3"><p>Could not load your saved answers. {error}</p><Button onClick={() => setRetry(n => n + 1)}>Retry</Button></div>;
  if (!history.length) return <p className="rounded border p-6">{incorrectOnly ? 'No incorrect answers in your account history.' : 'Your saved answers will appear here after you submit a published question.'}</p>;
  return <ul aria-label="Saved answer history" className="space-y-3">{history.map(answer =>
    <li key={answer.id}><Link to={`/quiz?session=${answer.session_id}&question=${answer.question_id}`} className="block rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
      <Card className="hover:border-primary"><CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="min-w-0"><p className="break-words font-medium">Topic {answer.topic_code} · {answer.topic_title}</p><p className={answer.is_correct ? 'text-green-700' : 'text-destructive'}>{answer.is_correct ? 'Correct' : 'Incorrect'}</p><time dateTime={answer.submitted_at} className="text-sm text-muted-foreground">{new Date(answer.submitted_at).toLocaleString()}</time></div>
        <span className="flex items-center gap-2 text-sm text-primary">View solution <ArrowRight className="h-4 w-4" /></span>
      </CardContent></Card>
    </Link></li>
  )}</ul>;
}

function AccountReview() {
  const [incorrectOnly, setIncorrectOnly] = useState(false);
  return <section className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-4"><h2 className="text-xl font-semibold">{incorrectOnly ? 'Latest 10 incorrect answers' : 'Latest 10 answers'}</h2><Button variant={incorrectOnly ? 'default' : 'outline'} aria-pressed={incorrectOnly} onClick={() => setIncorrectOnly(value => !value)}>Only incorrect</Button></div>
    <p className="text-sm text-muted-foreground">{incorrectOnly ? 'The latest 10 incorrect answers across your full account history.' : 'Your latest 10 submitted answers, newest first.'} Times are shown in your local time zone.</p>
    <AnswerHistory key={String(incorrectOnly)} incorrectOnly={incorrectOnly} />
  </section>;
}

export default function Review() {
  const { user, loading } = useAuth();
  return <div className="mx-auto min-h-[70vh] max-w-5xl space-y-8 px-4 py-10">
    <header><h1 className="flex items-center gap-3 text-4xl font-bold"><BookOpen className="text-primary" />Your Review</h1><p className="mt-3 text-muted-foreground">Review answers saved to your account and revisit their solutions.</p><Button asChild className="mt-5"><Link to="/practice">Choose published practice <ArrowRight /></Link></Button></header>
    {loading ? <p role="status">Checking your account…</p> : user ? <AccountReview key={user.id} /> : <div className="space-y-4"><p>Sign in to review your saved answers.</p><Button asChild><Link to="/auth">Sign in</Link></Button></div>}
  </div>;
}
