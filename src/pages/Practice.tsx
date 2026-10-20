import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, History, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { loadPracticeHome, type PracticeTopic, type RecentPracticeAnswer } from '@/lib/studentPractice';

function AccountPractice() {
  const [topics, setTopics] = useState<PracticeTopic[]>([]);
  const [history, setHistory] = useState<RecentPracticeAnswer[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true; setBusy(true); setError('');
    void loadPracticeHome(supabase).then(data => { if (active) { setTopics(data.topics); setHistory(data.history); } })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [retry]);
  if (busy) return <p role="status">Loading published topics and your saved answers…</p>;
  if (error) return <div role="alert" className="space-y-3"><p>Could not load your practice data. {error}</p><Button onClick={() => setRetry(n => n + 1)}>Retry</Button></div>;
  return <>
    {topics.length ? <Button asChild size="lg" className="mb-8"><Link to="/quiz?subject=calculus&source=quick">Start up to 5 questions <ArrowRight /></Link></Button>
      : <p className="mb-8 rounded border p-6">No published questions are available yet.</p>}
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <section><h2 className="mb-5 text-xl font-semibold">Choose a published Topic</h2><div className="grid gap-4 md:grid-cols-2">{topics.map(topic =>
        <Link key={topic.id} to={`/quiz?subject=calculus&topic=${topic.id}&source=quick`}><Card className="h-full hover:border-primary"><CardHeader><BookOpen className="h-5 w-5 text-primary" /><CardTitle className="text-lg">{topic.code} · {topic.title}</CardTitle></CardHeader><CardContent>{topic.question_count} published {topic.question_count === 1 ? 'question' : 'questions'}</CardContent></Card></Link>
      )}</div></section>
      <section><h2 className="mb-5 flex items-center gap-2 text-xl font-semibold"><History className="h-5 w-5" />Recent account answers</h2><Card><CardContent className="space-y-3 p-5">{history.length ? history.map(answer =>
        <Link key={answer.id} to={`/quiz?session=${answer.session_id}`} className="block rounded border p-3"><p className="text-sm font-medium">{answer.topic_code} · {answer.topic_title}</p><p className={answer.is_correct ? 'text-green-700' : 'text-destructive'}>{answer.is_correct ? 'Correct' : 'Incorrect'} · Saved</p><p className="text-xs text-muted-foreground">{new Date(answer.submitted_at).toLocaleString()}</p></Link>
      ) : <p>Your saved answers will appear here after you submit a published question.</p>}</CardContent></Card></section>
    </div>
  </>;
}
export default function Practice() {
  const { user, loading } = useAuth();
  return <div className="mx-auto min-h-[70vh] max-w-6xl space-y-6 px-4 py-10"><header><h1 className="flex items-center gap-3 text-4xl font-bold"><Target />Quick Practice</h1><p className="mt-3 text-muted-foreground">Practice published questions. Answers are graded and saved to your account by the server.</p></header>
    {loading ? <p role="status">Checking your account…</p> : user ? <AccountPractice key={user.id} /> : <div className="space-y-4"><p>Sign in to start practice and read your saved answers.</p><Button asChild><Link to="/auth">Sign in</Link></Button></div>}
  </div>;
}
