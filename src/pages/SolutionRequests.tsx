import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, MessageCircleQuestion, Plus } from 'lucide-react';
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
  const { tt } = useBilingual();
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

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl break-keep px-4 py-12 [overflow-wrap:anywhere] sm:px-6 lg:px-8">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold leading-[1.35] tracking-tight sm:text-5xl">{tt(['Solution Requests', '答疑区'])}</h1>
            <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
              {tt(['Stuck on a problem? Post it publicly so classmates can help, or only to O2I teachers. Official answers are marked.',
                '有题不会？可以公开提问让同学一起帮忙，也可以只给 O2I 老师看。老师的回复会标"官方"。'])}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            {user
              ? <Button size="lg" onClick={() => setAsking(true)} disabled={left === 0}><Plus aria-hidden="true" className="mr-2 h-5 w-5" />{tt(['Ask a question', '我要提问'])}</Button>
              : <Button size="lg" asChild><Link to={`/auth?returnTo=${encodeURIComponent('/solution-requests')}`}>{tt(['Sign in to ask', '登录后提问'])}</Link></Button>}
            {left !== null && <span className="text-xs text-muted-foreground">{left === 0
              ? tt(['5 questions per 24 hours used up', '24 小时内的 5 个提问名额已用完'])
              : tt([`${left} of 5 questions left in 24 hours`, `24 小时内还能提 ${left} 个问题`])}</span>}
          </div>
        </header>

        <Tabs value={tab} onValueChange={value => setParams(value === 'mine' ? { tab: 'mine' } : {}, { replace: true })}>
          <TabsList>
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
            <div className="mt-4 flex flex-wrap items-end gap-4">
              <div className="space-y-1">
                <Label htmlFor="sr-filter-status" className="text-xs">{tt(['Status', '状态'])}</Label>
                <Select value={status} onValueChange={value => setStatus(value as SrStatus | 'all')}>
                  <SelectTrigger id="sr-filter-status" className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{tt(['All', '全部'])}</SelectItem>
                    {STATUSES.map(s => <SelectItem key={s} value={s}>{tt(STATUS_LABELS[s])}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="sr-filter-type" className="text-xs">{tt(['Type', '题型'])}</Label>
                <Select value={type} onValueChange={value => setType(value as ProblemType | 'all')}>
                  <SelectTrigger id="sr-filter-type" className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{tt(['All', '全部'])}</SelectItem>
                    {PROBLEM_TYPES.map(p => <SelectItem key={p.value} value={p.value}>{tt(p.label)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 pb-2">
                <Switch id="sr-filter-closed" checked={includeClosed} onCheckedChange={setIncludeClosed} />
                <Label htmlFor="sr-filter-closed" className="font-normal">{tt(['Show closed', '显示已关闭'])}</Label>
              </div>
            </div>

            <div className="mt-6">
              {loading ? (
                <div className="grid gap-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}</div>
              ) : error ? (
                <div className="py-12 text-center">
                  <p className="mb-4 text-muted-foreground">{tt(error)}</p>
                  <Button variant="outline" onClick={() => setReload(n => n + 1)}>{tt(['Try again', '重试'])}</Button>
                </div>
              ) : items.length === 0 ? (
                <div className="py-12 text-center">
                  <MessageCircleQuestion aria-hidden="true" className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                  <p className="mb-2 text-lg font-semibold">{tt(filtered ? ['No questions match these filters.', '没有符合筛选条件的问题。']
                    : tab === 'mine' ? ['You have not asked anything yet.', '你还没有提过问题。'] : ['No public questions yet.', '还没有公开的问题。'])}</p>
                  {user && !filtered && <Button className="mt-2" onClick={() => setAsking(true)} disabled={left === 0}>{tt(['Ask the first one', '来提第一个问题'])}</Button>}
                </div>
              ) : (
                <div className="grid gap-1">
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
    </div>
  );
}
