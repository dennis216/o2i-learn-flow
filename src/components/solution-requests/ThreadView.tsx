import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Award, CheckCircle2, Eye, EyeOff, Flag, Loader2, Lock, LockOpen, Pencil, Quote, Trash2, Undo2 } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  authorLabel, errorCode, errorText, problemTypeLabel, srDeleteReply, srEditReply, srGet, srHideReply, srHideRequest, srReply,
  srResolveReport, srSetClosed, srSetSolved, srWithdraw, type Bilingual, type SrReply, type SrThread,
} from '@/lib/solutionRequests';
import ReplyComposer from './ReplyComposer';
import ReportDialog from './ReportDialog';
import RequestForm from './RequestForm';
import { ImageGallery, PostBody, StatusBadges } from './shared';
import { useBilingual, useSignedImages } from './hooks';

type Confirm = { title: Bilingual; body: Bilingual; action: Bilingual; run: () => Promise<void> } | null;

/** One question with its replies. Used by the student thread page and the admin Answers tab. */
export default function ThreadView({ id, onChanged, onGone }: { id: string; onChanged?: () => void; onGone?: () => void }) {
  const { tt, when } = useBilingual();
  const { toast } = useToast();
  const [thread, setThread] = useState<SrThread | null>(null);
  const [missing, setMissing] = useState(false);
  const [loadError, setLoadError] = useState<Bilingual | null>(null);
  const [busy, setBusy] = useState(false);
  const [quote, setQuote] = useState<SrReply | null>(null);
  const [editingReply, setEditingReply] = useState<string | null>(null);
  const [editingQuestion, setEditingQuestion] = useState(false);
  const [report, setReport] = useState<{ requestId: string; replyId: string | null; label: string } | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);

  const load = useCallback(async () => {
    try {
      setThread(await srGet(supabase, id));
      setMissing(false); setLoadError(null);
    } catch (error) {
      if (errorCode(error) === 'SR_NOT_FOUND') setMissing(true); else setLoadError(errorText(error));
    }
  }, [id]);
  useEffect(() => { setThread(null); setQuote(null); setEditingReply(null); void load(); }, [load]);

  const imagePaths = useMemo(() => thread ? [...thread.request.image_paths, ...thread.replies.map(r => r.image_path ?? '')].filter(Boolean) : [], [thread]);
  const urls = useSignedImages(imagePaths);

  /** Runs a change, reloads the thread and tells the parent list. */
  const act = async (run: () => Promise<unknown>, done?: Bilingual) => {
    setBusy(true);
    try {
      await run();
      if (done) toast({ title: tt(done) });
      await load();
      onChanged?.();
    } catch (error) {
      toast({ title: tt(errorText(error)), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  if (missing) {
    return (
      <div className="py-12 text-center">
        <p className="mb-4 text-lg font-semibold">{tt(['This question is not available.', '这个问题不存在或已被撤回。'])}</p>
        <p className="mb-6 text-muted-foreground">{tt(['It may have been withdrawn, made admins-only or hidden.', '可能已被提问人撤回、改为仅管理员可见，或被管理员隐藏。'])}</p>
        {onGone && <Button variant="outline" onClick={onGone}>{tt(['Back to questions', '返回问题列表'])}</Button>}
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="py-12 text-center">
        <p className="mb-4 text-muted-foreground">{tt(loadError)}</p>
        <Button variant="outline" onClick={() => void load()}>{tt(['Try again', '重试'])}</Button>
      </div>
    );
  }
  if (!thread) return <div className="space-y-4"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-32 w-full" /><Skeleton className="h-24 w-full" /></div>;

  const { request: r, replies, viewer } = thread;
  const others = replies.filter(reply => !reply.is_op).length;
  const loginPath = `/auth?returnTo=${encodeURIComponent(`/solution-requests/${r.id}`)}`;

  const withdraw = () => setConfirm({
    title: ['Withdraw this question?', '撤回这个问题？'],
    body: others > 0
      ? [`The question and all ${replies.length} replies, including ${others} from others, will be deleted for good.`, `问题和全部 ${replies.length} 条回复（其中 ${others} 条是别人写的）都会被永久删除。`]
      : ['The question and its replies will be deleted for good.', '问题和回复都会被永久删除。'],
    action: ['Withdraw', '撤回'],
    run: async () => {
      setBusy(true);
      try { await srWithdraw(supabase, r.id); toast({ title: tt(['Question withdrawn', '问题已撤回']) }); onChanged?.(); onGone?.(); }
      catch (error) { toast({ title: tt(errorText(error)), variant: 'destructive' }); }
      finally { setBusy(false); }
    },
  });

  return (
    <div className="space-y-6">
      <article className="space-y-4">
        <StatusBadges status={r.status} closed={r.is_closed} isPublic={r.is_public} hidden={r.is_hidden} />
        <h1 className="break-keep text-2xl font-bold leading-[1.35] tracking-tight [overflow-wrap:anywhere] sm:text-3xl">{r.title}</h1>
        <p className="text-sm text-muted-foreground">
          {tt(authorLabel(r.author))}{r.author.is_mine && tt([' (you)', '（我）'])} · {tt(problemTypeLabel(r.problem_type))} · {when(r.created_at)}
          {r.edited_at && ` · ${tt(['edited', '已编辑'])}`}
        </p>
        {r.description && <PostBody text={r.description} />}
        <ImageGallery paths={r.image_paths} urls={urls} />

        <div className="flex flex-wrap gap-2">
          {r.can_edit && <Button size="sm" variant="outline" disabled={busy} onClick={() => setEditingQuestion(true)}><Pencil aria-hidden="true" className="mr-1.5 h-4 w-4" />{tt(['Edit', '修改'])}</Button>}
          {r.can_manage && (r.status === 'solved'
            ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(() => srSetSolved(supabase, r.id, false), ['Marked as not solved', '已取消"已解决"'])}><Undo2 aria-hidden="true" className="mr-1.5 h-4 w-4" />{tt(['Not solved yet', '取消已解决'])}</Button>
            : <Button size="sm" disabled={busy} onClick={() => void act(() => srSetSolved(supabase, r.id, true), ['Marked as solved', '已标记为已解决'])}><CheckCircle2 aria-hidden="true" className="mr-1.5 h-4 w-4" />{tt(['Mark solved', '标记已解决'])}</Button>)}
          {r.can_manage && (r.is_closed
            ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(() => srSetClosed(supabase, r.id, false), ['Thread reopened', '帖子已重新打开'])}><LockOpen aria-hidden="true" className="mr-1.5 h-4 w-4" />{tt(['Reopen', '重新打开'])}</Button>
            : <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(() => srSetClosed(supabase, r.id, true), ['Thread closed', '帖子已关闭'])}><Lock aria-hidden="true" className="mr-1.5 h-4 w-4" />{tt(['Close thread', '关闭帖子'])}</Button>)}
          {r.can_moderate && <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(() => srHideRequest(supabase, r.id, !r.is_hidden), r.is_hidden ? ['Question visible again', '问题已恢复显示'] : ['Question hidden from other students', '已对其他同学隐藏'])}>
            {r.is_hidden ? <Eye aria-hidden="true" className="mr-1.5 h-4 w-4" /> : <EyeOff aria-hidden="true" className="mr-1.5 h-4 w-4" />}{tt(r.is_hidden ? ['Unhide question', '恢复显示'] : ['Hide question', '隐藏问题'])}</Button>}
          {r.can_edit && <Button size="sm" variant="ghost" className="text-destructive" disabled={busy} onClick={withdraw}><Trash2 aria-hidden="true" className="mr-1.5 h-4 w-4" />{tt(['Withdraw', '撤回问题'])}</Button>}
          {viewer.signed_in && !r.author.is_mine && <Button size="sm" variant="ghost" disabled={busy} onClick={() => setReport({ requestId: r.id, replyId: null, label: tt(['question', '问题']) })}><Flag aria-hidden="true" className="mr-1.5 h-4 w-4" />{tt(['Report', '举报'])}</Button>}
        </div>
      </article>

      {thread.reports && thread.reports.length > 0 && (
        <section aria-label={tt(['Open reports', '待处理举报'])} className="space-y-2 rounded-lg border border-destructive/40 p-4">
          <h2 className="font-semibold">{tt(['Open reports', '待处理举报'])}</h2>
          {thread.reports.map(item => (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>{item.floor ? `#${item.floor}` : tt(['Question', '问题'])} · {item.reason} · {item.reporter} · {when(item.created_at)}</span>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(() => srResolveReport(supabase, item.id), ['Report closed', '已处理'])}>{tt(['Dismiss', '不处理，关闭举报'])}</Button>
            </div>
          ))}
        </section>
      )}

      <section aria-label={tt(['Replies', '回复'])} className="space-y-3">
        <h2 className="text-lg font-semibold">{tt([`${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`, `${replies.length} 条回复`])}</h2>
        {replies.length === 0 && <p className="text-muted-foreground">{tt(['No replies yet.', '还没有回复。'])}</p>}
        {replies.map(reply => (
          <div key={reply.id} id={`floor-${reply.floor}`}
            className={`rounded-xl border p-4 ${reply.is_accepted ? 'border-primary bg-primary/5' : ''} ${reply.author.official ? 'bg-muted/40' : ''}`}>
            <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-mono text-muted-foreground">#{reply.floor}</span>
              <span className="font-medium">{tt(authorLabel(reply.author))}</span>
              {reply.author.official && <Badge className="gap-1"><Award aria-hidden="true" className="h-3.5 w-3.5" />{tt(['O2I official', 'O2I 官方'])}</Badge>}
              {reply.is_op && <Badge variant="secondary">{tt(['Asker', '楼主'])}</Badge>}
              {reply.author.is_mine && <Badge variant="outline">{tt(['You', '我'])}</Badge>}
              {reply.is_accepted && <Badge variant="outline" className="gap-1 border-primary text-primary"><CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" />{tt(['Accepted', '已采纳'])}</Badge>}
              {reply.is_hidden && <Badge variant="destructive">{tt(['Hidden', '已隐藏'])}</Badge>}
              {!!reply.open_reports && <Badge variant="destructive">{tt([`${reply.open_reports} report(s)`, `${reply.open_reports} 条举报`])}</Badge>}
              <span className="text-muted-foreground">{when(reply.created_at)}{reply.edited_at && ` · ${tt(['edited', '已编辑'])}`}</span>
            </div>
            {reply.quote && (
              <a href={reply.quote.missing ? undefined : `#floor-${reply.quote.floor}`} className="mb-2 block rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                <Quote aria-hidden="true" className="mr-1 inline h-3.5 w-3.5" />
                {reply.quote.missing ? tt([`#${reply.quote.floor} was deleted`, `#${reply.quote.floor} 已删除`]) : `#${reply.quote.floor}${reply.quote.excerpt ? `: ${reply.quote.excerpt}` : ''}`}
              </a>
            )}
            {editingReply === reply.id ? (
              <ReplyComposer id={`edit-${reply.id}`} official={reply.author.official}
                initial={{ body: reply.body ?? '', image: reply.image_path, anonymous: reply.author.anonymous }}
                onCancel={() => setEditingReply(null)}
                onSubmit={async draft => {
                  await srEditReply(supabase, reply.id, draft.body, draft.image, reply.author.official ? null : draft.anonymous);
                  setEditingReply(null); await load(); onChanged?.();
                }} />
            ) : reply.is_hidden && reply.body === null ? (
              <p className="text-sm italic text-muted-foreground">{tt(['This reply was hidden by an admin.', '这条回复已被管理员隐藏。'])}</p>
            ) : (
              <>
                {reply.body && <PostBody text={reply.body} />}
                {reply.image_path && <div className="mt-2"><ImageGallery paths={[reply.image_path]} urls={urls} size="sm" /></div>}
              </>
            )}
            {editingReply !== reply.id && (
              <div className="mt-3 flex flex-wrap gap-1">
                {r.can_reply && !reply.is_hidden && <Button size="sm" variant="ghost" onClick={() => setQuote(reply)}><Quote aria-hidden="true" className="mr-1 h-3.5 w-3.5" />{tt(['Quote', '引用'])}</Button>}
                {r.can_manage && !reply.is_hidden && !reply.is_accepted && <Button size="sm" variant="ghost" disabled={busy}
                  onClick={() => void act(() => srSetSolved(supabase, r.id, true, reply.id), ['Accepted and marked solved', '已采纳并标记为已解决'])}><CheckCircle2 aria-hidden="true" className="mr-1 h-3.5 w-3.5" />{tt(['Accept as solution', '采纳这一楼'])}</Button>}
                {reply.author.is_mine && !reply.is_hidden && !r.is_closed && <Button size="sm" variant="ghost" onClick={() => setEditingReply(reply.id)}><Pencil aria-hidden="true" className="mr-1 h-3.5 w-3.5" />{tt(['Edit', '修改'])}</Button>}
                {reply.author.is_mine && <Button size="sm" variant="ghost" className="text-destructive" disabled={busy} onClick={() => setConfirm({
                  title: ['Delete this reply?', '删除这条回复？'], body: ['It will be removed for good. Its floor number is not reused.', '删除后无法恢复，楼号不会被重新使用。'],
                  action: ['Delete', '删除'], run: () => act(() => srDeleteReply(supabase, reply.id), ['Reply deleted', '回复已删除']),
                })}><Trash2 aria-hidden="true" className="mr-1 h-3.5 w-3.5" />{tt(['Delete', '删除'])}</Button>}
                {r.can_moderate && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act(() => srHideReply(supabase, reply.id, !reply.is_hidden), reply.is_hidden ? ['Reply visible again', '回复已恢复'] : ['Reply hidden', '回复已隐藏'])}>
                  {reply.is_hidden ? <Eye aria-hidden="true" className="mr-1 h-3.5 w-3.5" /> : <EyeOff aria-hidden="true" className="mr-1 h-3.5 w-3.5" />}{tt(reply.is_hidden ? ['Unhide', '恢复显示'] : ['Hide', '隐藏'])}</Button>}
                {viewer.signed_in && !reply.author.is_mine && !reply.is_hidden && <Button size="sm" variant="ghost" onClick={() => setReport({ requestId: r.id, replyId: reply.id, label: `#${reply.floor}` })}><Flag aria-hidden="true" className="mr-1 h-3.5 w-3.5" />{tt(['Report', '举报'])}</Button>}
              </div>
            )}
          </div>
        ))}
      </section>

      <section aria-label={tt(['Write a reply', '写回复'])} className="rounded-xl border p-4">
        {!viewer.signed_in ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-foreground">{tt(['Sign in to reply or ask your own question.', '登录后可以回复，也可以提自己的问题。'])}</p>
            <Button asChild><Link to={loginPath}>{tt(['Sign in to reply', '登录后回复'])}</Link></Button>
          </div>
        ) : r.is_closed ? (
          <p className="text-muted-foreground"><Lock aria-hidden="true" className="mr-1.5 inline h-4 w-4" />{tt(['This thread is closed. The asker or an admin can reopen it.', '帖子已关闭，提问人或管理员可以重新打开。'])}</p>
        ) : (
          <ReplyComposer id="sr-reply" official={viewer.is_answerer} quote={quote} onClearQuote={() => setQuote(null)}
            submitLabel={viewer.is_answerer ? ['Post official answer', '发布官方解答'] : undefined}
            onSubmit={async draft => {
              await srReply(supabase, r.id, draft.body, draft.image, draft.anonymous, quote?.id ?? null);
              setQuote(null); await load(); onChanged?.();
            }} />
        )}
      </section>

      <RequestForm open={editingQuestion} onOpenChange={setEditingQuestion} editing={r} onSaved={() => { void load(); onChanged?.(); }} />
      <ReportDialog target={report} onClose={() => setReport(null)} />
      <AlertDialog open={confirm !== null} onOpenChange={open => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm && tt(confirm.title)}</AlertDialogTitle>
            <AlertDialogDescription>{confirm && tt(confirm.body)}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tt(['Cancel', '取消'])}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { const run = confirm?.run; setConfirm(null); if (run) void run(); }}>
              {busy && <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />}{confirm && tt(confirm.action)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
