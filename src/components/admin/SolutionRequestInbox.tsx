import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import RequestCard from '@/components/solution-requests/RequestCard';
import ThreadView from '@/components/solution-requests/ThreadView';
import { useBilingual } from '@/components/solution-requests/hooks';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import {
  errorText, excerpt, PROBLEM_TYPES, srList, srListReports, STATUS_LABELS, STATUSES,
  type Bilingual, type ProblemType, type SrQueueReport, type SrStatus, type SrSummary,
} from '@/lib/solutionRequests';

type View = 'queue' | 'all' | 'reports';
const PAGE = 30;

/** Admin "Answers" tab: questions waiting for an official answer, all questions, and open reports. */
export default function SolutionRequestInbox({ summary, onChanged }: {
  summary: { needs_answer: number; open_reports: number } | null; onChanged: () => void;
}) {
  const { tt, when } = useBilingual();
  const [view, setView] = useState<View>('queue');
  const [status, setStatus] = useState<SrStatus | 'all'>('all');
  const [visibility, setVisibility] = useState<'all' | 'public' | 'private'>('all');
  const [type, setType] = useState<ProblemType | 'all'>('all');
  const [items, setItems] = useState<SrSummary[]>([]);
  const [reports, setReports] = useState<SrQueueReport[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Bilingual | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async (offset = 0) => {
    if (offset === 0) setLoading(true);
    setError(null);
    try {
      if (view === 'reports') { setReports(await srListReports(supabase)); return; }
      const page = await srList(supabase, {
        scope: 'admin', status: view === 'queue' ? 'needs_answer' : status === 'all' ? null : status,
        problemType: type === 'all' ? null : type, visibility: visibility === 'all' ? null : visibility, offset, limit: PAGE,
      });
      setItems(list => offset === 0 ? page.items : [...list, ...page.items.filter(i => !list.some(o => o.id === i.id))]);
      setHasMore(page.has_more);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [view, status, type, visibility]);
  useEffect(() => { void load(0); }, [load]);

  const changed = () => { onChanged(); void load(0); };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className={selected ? 'hidden lg:block' : ''}>
        <Tabs value={view} onValueChange={value => { setView(value as View); setSelected(null); }}>
          <TabsList className="flex h-auto flex-wrap">
            <TabsTrigger value="queue">{tt(['Needs answer', '待解答'])}{summary ? ` (${summary.needs_answer})` : ''}</TabsTrigger>
            <TabsTrigger value="all">{tt(['All questions', '全部问题'])}</TabsTrigger>
            <TabsTrigger value="reports">{tt(['Reports', '举报'])}{summary ? ` (${summary.open_reports})` : ''}</TabsTrigger>
          </TabsList>
        </Tabs>
        {view !== 'reports' && (
          <div className="mt-4 flex flex-wrap gap-3">
            {view === 'all' && (
              <div className="space-y-1">
                <Label htmlFor="inbox-status" className="text-xs">{tt(['Status', '状态'])}</Label>
                <Select value={status} onValueChange={v => setStatus(v as SrStatus | 'all')}>
                  <SelectTrigger id="inbox-status" className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="all">{tt(['All', '全部'])}</SelectItem>{STATUSES.map(s => <SelectItem key={s} value={s}>{tt(STATUS_LABELS[s])}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="inbox-visibility" className="text-xs">{tt(['Visible to', '可见范围'])}</Label>
              <Select value={visibility} onValueChange={v => setVisibility(v as typeof visibility)}>
                <SelectTrigger id="inbox-visibility" className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{tt(['All', '全部'])}</SelectItem>
                  <SelectItem value="public">{tt(['Public', '公开'])}</SelectItem>
                  <SelectItem value="private">{tt(['Admins only', '仅管理员'])}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="inbox-type" className="text-xs">{tt(['Type', '题型'])}</Label>
              <Select value={type} onValueChange={v => setType(v as ProblemType | 'all')}>
                <SelectTrigger id="inbox-type" className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">{tt(['All', '全部'])}</SelectItem>{PROBLEM_TYPES.map(p => <SelectItem key={p.value} value={p.value}>{tt(p.label)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        )}
        <div className="mt-4">
          {loading ? <div className="grid gap-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}</div>
            : error ? (
              <div className="py-8 text-center">
                <p className="mb-3 text-muted-foreground">{tt(error)}</p>
                <Button variant="outline" onClick={() => void load(0)}>{tt(['Try again', '重试'])}</Button>
              </div>
            ) : view === 'reports' ? (
              reports.length === 0 ? <p className="py-8 text-center text-muted-foreground">{tt(['No open reports.', '没有待处理的举报。'])}</p> : (
                <div className="grid gap-1">
                  {reports.map(report => (
                    <button key={report.id} type="button" onClick={() => setSelected(report.request_id)}
                      className={`rounded-2xl p-4 text-left hover:bg-muted/60 ${selected === report.request_id ? 'bg-muted' : ''}`}>
                      <p className="font-semibold">{report.request_title}</p>
                      <p className="text-sm text-muted-foreground">{report.floor ? `#${report.floor}: ` : `${tt(['Question', '问题'])}: `}{excerpt(report.excerpt, 100)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{report.reason} · {report.reporter} · {when(report.created_at)}</p>
                    </button>
                  ))}
                </div>
              )
            ) : items.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">{tt(view === 'queue' ? ['Nothing is waiting for an answer.', '没有等待解答的问题。'] : ['No questions match.', '没有符合条件的问题。'])}</p>
            ) : (
              <div className="grid gap-1">
                {items.map(item => <RequestCard key={item.id} item={item} selected={selected === item.id} showWaiting={view === 'queue'} onOpen={() => setSelected(item.id)} />)}
                {hasMore && <Button variant="outline" className="mt-2 justify-self-center" onClick={() => void load(items.length)}>{tt(['Load more', '加载更多'])}</Button>}
              </div>
            )}
          {loading && items.length > 0 && <Loader2 aria-hidden="true" className="mx-auto mt-2 h-4 w-4 animate-spin" />}
        </div>
      </div>
      <div className={selected ? '' : 'hidden lg:block'}>
        {selected ? (
          <>
            <Button variant="ghost" size="sm" className="mb-4 lg:hidden" onClick={() => setSelected(null)}><ArrowLeft aria-hidden="true" className="mr-1.5 h-4 w-4" />{tt(['Back to list', '返回列表'])}</Button>
            <ThreadView key={selected} id={selected} onChanged={changed} onGone={() => { setSelected(null); changed(); }} />
          </>
        ) : (
          <p className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">{tt(['Pick a question to read it and answer.', '选择一个问题查看并解答。'])}</p>
        )}
      </div>
    </div>
  );
}
