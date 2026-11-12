import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Camera, CheckCircle2, Loader2, MessageCircleQuestion, Plus, Users } from 'lucide-react';
import Reveal from '@/components/Reveal';
import SignInPrompt from '@/components/SignInPrompt';
import RequestCard from '@/components/solution-requests/RequestCard';
import RequestForm from '@/components/solution-requests/RequestForm';
import { useBilingual } from '@/components/solution-requests/hooks';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  errorText, PROBLEM_TYPES, quotaLeft, srList, srQuota, STATUS_LABELS, STATUSES,
  type Bilingual, type ProblemType, type SrQuota, type SrStatus, type SrSummary,
} from '@/lib/solutionRequests';

const PAGE = 20;
type Tab = 'public' | 'mine';

export default function SolutionRequests() {
  const { user } = useAuth();
  const { tt, language } = useBilingual();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'mine' ? 'mine' : 'public';
  const [status, setStatus] = useState<SrStatus | 'all'>('all');
  const [type, setType] = useState<ProblemType | 'all'>('all');
  const [includeClosed, setIncludeClosed] = useState(true);
  const [items, setItems] = useState<SrSummary[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<Bilingual | null>(null);
  const [quota, setQuota] = useState<SrQuota | null>(null);
  const [asking, setAsking] = useState(false);
  const [reload, setReload] = useState(0);

  const fetchPage = useCallback((offset: number) => srList(supabase, {
    scope: tab, status: status === 'all' ? null : status, problemType: type === 'all' ? null : type,
    includeClosed, offset, limit: PAGE,
  }), [tab, status, type, includeClosed]);

  useEffect(() => {
    if (tab === 'mine' && !user) { setLoading(false); setItems([]); return; }
    let live = true;
    setLoading(true); setError(null);
    fetchPage(0)
      .then(page => { if (live) { setItems(page.items); setHasMore(page.has_more); } })
      .catch(e => { if (live) setError(errorText(e)); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [fetchPage, tab, user, reload]);

  const refreshQuota = useCallback(() => {
    if (!user) { setQuota(null); return; }
    srQuota(supabase).then(setQuota).catch(() => setQuota(null));
  }, [user]);
  useEffect(refreshQuota, [refreshQuota]);

  const more = async () => {
    setLoadingMore(true);
    try {
      const page = await fetchPage(items.length);
      setItems(list => [...list, ...page.items.filter(item => !list.some(old => old.id === item.id))]);
      setHasMore(page.has_more);
    } catch (e) { setError(errorText(e)); }
    finally { setLoadingMore(false); }
  };

  const left = quotaLeft(quota);
  const filtered = status !== 'all' || type !== 'all' || !includeClosed;

  const steps: { icon: typeof Camera; label: Bilingual }[] = [
    { icon: Camera, label: ['Snap the problem', '拍下题目'] },
    { icon: Users, label: ['Classmates and teachers reply', '同学和老师来回复'] },
    { icon: CheckCircle2, label: ['Mark it solved', '标记已解决'] },
  ];

  return (
    <main className={`min-h-screen bg-background ${language === 'zh' ? 'break-keep [overflow-wrap:anywhere]' : ''}`}>
      <section className="relative overflow-hidden bg-gradient-to-br from-primary/5 to-accent/5 py-12 sm:py-16">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 [background-image:linear-gradient(hsl(var(--primary)/0.06)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--primary)/0.06)_1px,transparent_1px)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_80%)]" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-background" />
        <Reveal className="relative mx-auto max-w-3xl px-4 text-center sm:px-6">
          <p className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-background/70 px-4 py-1.5 text-sm font-medium text-primary">
            <MessageCircleQuestion aria-hidden="true" className="h-4 w-4" />{tt(['Ask anything about your math homework', '数学题不会，就来这里问'])}
          </p>
          <h1 className={`text-balance text-4xl font-bold tracking-tight text-foreground sm:text-5xl ${language === 'zh' ? 'leading-[1.35]' : 'leading-tight'}`}>
            {tt(['Solution Requests', '答疑区'])}
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
            {tt(['Post a problem publicly so classmates can help, or only to O2I teachers. Teacher answers are marked official.',
              '可以公开提问，让同学一起帮忙；也可以只给 O2I 老师看。老师的回复会标"官方"。'])}
          </p>
          <ol className="mx-auto mt-6 flex max-w-2xl flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            {steps.map(({ icon: Icon, label }, i) => (
              <li key={label[0]} className="inline-flex items-center gap-1.5">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{i + 1}</span>
                <Icon aria-hidden="true" className="h-4 w-4" />{tt(label)}
              </li>
            ))}
          </ol>
          <div className="mt-8 flex flex-col items-center gap-2">
            {user
              ? <Button size="lg" onClick={() => setAsking(true)} disabled={left === 0}><Plus aria-hidden="true" className="mr-2 h-5 w-5" />{tt(['Ask a question', '我要提问'])}</Button>
              : <Button size="lg" asChild><Link to={`/auth?returnTo=${encodeURIComponent('/solution-requests')}`}>{tt(['Sign in to ask', '登录后提问'])}</Link></Button>}
            {left !== null && <span className="text-sm text-muted-foreground">{left === 0
              ? tt(['5 questions per 24 hours used up', '24 小时内的 5 个提问名额已用完'])
              : tt([`${left} of 5 questions left in 24 hours`, `24 小时内还能提 ${left} 个问题`])}</span>}
          </div>
        </Reveal>
      </section>

      <div className="mx-auto max-w-4xl px-4 pb-14 pt-2 sm:px-6 sm:pb-20 lg:px-8">
        <Tabs value={tab} onValueChange={value => setParams(value === 'mine' ? { tab: 'mine' } : {}, { replace: true })} className="flex justify-center">
          <TabsList className="h-11 rounded-full p-1 [&>button]:rounded-full [&>button]:px-5">
            <TabsTrigger value="public">{tt(['Public questions', '公开问答'])}</TabsTrigger>
            <TabsTrigger value="mine">{tt(['My questions', '我的问题'])}</TabsTrigger>
          </TabsList>
        </Tabs>

        {tab === 'mine' && !user ? (
          <SignInPrompt icon={MessageCircleQuestion} tile="amber" returnTo="/solution-requests"
            title={tt(['Stuck on a problem?', '有题不会？'])}
            description={tt(['Sign in to ask and to find your questions here.', '登录后就能提问，你提过的问题都会在这里。'])} />
        ) : (
          <>
            <div className="mt-6 flex flex-wrap items-end gap-3 border-b pb-4">
              <div className="space-y-1">
                <Label htmlFor="sr-filter-status" className="text-xs">{tt(['Status', '状态'])}</Label>
                <Select value={status} onValueChange={value => setStatus(value as SrStatus | 'all')}>
                  <SelectTrigger id="sr-filter-status" className="w-36 rounded-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{tt(['All', '全部'])}</SelectItem>
                    {STATUSES.map(s => <SelectItem key={s} value={s}>{tt(STATUS_LABELS[s])}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="sr-filter-type" className="text-xs">{tt(['Type', '题型'])}</Label>
                <Select value={type} onValueChange={value => setType(value as ProblemType | 'all')}>
                  <SelectTrigger id="sr-filter-type" className="w-36 rounded-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{tt(['All', '全部'])}</SelectItem>
                    {PROBLEM_TYPES.map(p => <SelectItem key={p.value} value={p.value}>{tt(p.label)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 pb-2 sm:ml-auto">
                <Switch id="sr-filter-closed" checked={includeClosed} onCheckedChange={setIncludeClosed} />
                <Label htmlFor="sr-filter-closed" className="font-normal">{tt(['Show closed', '显示已关闭'])}</Label>
              </div>
            </div>

            <div className="mt-4">
              {loading ? (
                <div className="grid gap-2" aria-busy="true">{[0, 1, 2].map(i => (
                  <div key={i} className="flex gap-4 p-4"><Skeleton className="h-11 w-11 rounded-xl" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-5 w-3/4" /><Skeleton className="h-4 w-1/2" /></div></div>
                ))}</div>
              ) : error ? (
                <div role="alert" className="py-14 text-center">
                  <p className="mb-4 text-lg text-muted-foreground">{tt(error)}</p>
                  <Button variant="outline" onClick={() => setReload(n => n + 1)}>{tt(['Try again', '重试'])}</Button>
                </div>
              ) : items.length === 0 ? (
                <div className="mx-auto flex max-w-xl flex-col items-center py-14 text-center">
                  <div className="mb-6 grid h-16 w-16 place-items-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/30">
                    <MessageCircleQuestion aria-hidden="true" className="h-8 w-8" />
                  </div>
                  <p className="mb-2 text-xl font-bold tracking-tight">{tt(filtered ? ['No questions match these filters.', '没有符合筛选条件的问题。']
                    : tab === 'mine' ? ['You have not asked anything yet.', '你还没有提过问题。'] : ['No public questions yet.', '还没有公开的问题。'])}</p>
                  <p className="text-muted-foreground">{tt(filtered ? ['Try another status or type.', '换个状态或题型试试。']
                    : ['Questions you post show up here, with every reply.', '提过的问题和所有回复都会显示在这里。'])}</p>
                  {filtered
                    ? <Button variant="outline" className="mt-6" onClick={() => { setStatus('all'); setType('all'); setIncludeClosed(true); }}>{tt(['Clear filters', '清除筛选'])}</Button>
                    : user && <Button className="mt-6" onClick={() => setAsking(true)} disabled={left === 0}><Plus aria-hidden="true" className="mr-2 h-4 w-4" />{tt(['Post the first question', '提第一个问题'])}</Button>}
                </div>
              ) : (
                <div className="grid gap-1 sm:-mx-4">
                  {items.map(item => <RequestCard key={item.id} item={item} to={`/solution-requests/${item.id}`} />)}
                  {hasMore && (
                    <Button variant="outline" className="mt-4 justify-self-center" disabled={loadingMore} onClick={() => void more()}>
                      {loadingMore && <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />}{tt(['Load more', '加载更多'])}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
      <RequestForm open={asking} onOpenChange={setAsking} quotaLeft={left}
        onSaved={id => { refreshQuota(); navigate(`/solution-requests/${id}`); }} />
    </main>
  );
}
