import { QuestionPracticeStatistics } from './QuestionPracticeStatistics';
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import MarkdownWithMath from "@/components/MarkdownWithMath";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { QuestionBankDraftEditor } from "./QuestionBankDraftEditor";
import { QuestionBankVersionDetails } from "./QuestionBankVersionDetails";
import { QuestionBankPublicationDialog } from "./QuestionBankPublicationDialog";
import { QuestionBankLifecycleDialog } from "./QuestionBankLifecycleDialog";
import { loadQuestionBankPage, type QuestionBankListItem, type QuestionBankListKind, type QuestionBankPage } from "@/lib/questionBankDraftRepository";

const PAGE_SIZE = 20;
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
const statusLabel = (item: QuestionBankListItem) => item.kind === "published" ? "Published"
  : item.versionStatus === "approved" ? "Unpublished" : item.versionStatus === "review" ? "Under review · Unpublished" : "Draft · Unpublished";
type Action = "edit" | "delete" | "publish" | "unpublish" | "archive";

function QuestionBankList({ kind, refreshKey, onPreview, onAction, onPublishAll }: {
  kind: QuestionBankListKind; refreshKey: number; onPreview: (item: QuestionBankListItem) => void;
  onAction: (item: QuestionBankListItem, action: Action) => void; onPublishAll: () => void;
}) {
  const [page, setPage] = useState(0);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<QuestionBankPage | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const title = kind === "drafts" ? "Saved drafts" : "Published problems";
  useEffect(() => { setPage(0); }, [refreshKey]);
  useEffect(() => {
    let active = true;
    setBusy(true); setError(""); setResult(null);
    void loadQuestionBankPage(supabase, kind, page, PAGE_SIZE).then(loaded => {
      if (!active) return;
      const lastPage = Math.max(0, Math.ceil(loaded.total / PAGE_SIZE) - 1);
      if (page > lastPage) { setPage(lastPage); return; }
      setResult(loaded);
    }).catch(reason => { if (active) setError(message(reason)); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [kind, page, refreshKey, retry]);
  return <section aria-label={title}><Card><CardHeader>
    <div className="flex flex-wrap items-center justify-between gap-2"><CardTitle>{title}{result ? " (" + result.total + ")" : ""}</CardTitle>
      <div className="flex gap-2">{kind === "drafts" && <Button type="button" size="sm" disabled={busy || !!error || !result?.total} onClick={onPublishAll}>Publish all</Button>}
        <Button type="button" variant="outline" size="sm" disabled={busy} aria-label={"Refresh " + title.toLowerCase()} onClick={() => setRetry(value => value + 1)}>Refresh</Button></div>
    </div><CardDescription>{kind === "drafts" ? "Working drafts and withdrawn problems. Publication always requires an explicit review and confirmation."
      : "Current published problems. Changes are saved as separate unpublished revisions. Student Quiz integration is separate."}</CardDescription></CardHeader>
    <CardContent className="space-y-4">
      {busy && <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Loading {title.toLowerCase()}…</p>}
      {error && <div role="alert" className="space-y-2 rounded border border-destructive/50 p-3 text-sm"><p className="text-destructive">Could not load {title.toLowerCase()}. Check administrator access and the connection, then retry.</p>
        <Button type="button" variant="outline" size="sm" onClick={() => setRetry(value => value + 1)}>Retry</Button>
        <details><summary>Technical details</summary><p className="break-words">{error}</p></details></div>}
      {!busy && !error && result?.total === 0 && <p className="text-sm text-muted-foreground">No {title.toLowerCase()} yet.</p>}
      {!busy && !error && result && result.items.map(item => <article key={item.id} aria-label={"Problem " + item.externalId} className="min-w-0 space-y-2 rounded border p-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="break-all font-semibold">{item.externalId}</p>
          <p className={kind === "published" ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-400"}>{statusLabel(item)} · Version {item.versionNumber}</p></div>
        {item.workingVersionId && item.currentVersionId && <p className="font-medium text-amber-700">Unpublished changes{kind === "drafts" ? " · Current approved version retained" : " · A working revision is listed in Saved drafts"}</p>}
        {kind === "drafts" && item.questionStatus === "unpublished" && item.versionStatus !== "approved" && <p>Unpublished · Working revision selected for publication</p>}
        <MarkdownWithMath content={item.stem} className="overflow-x-auto" strictMath />
        <p className="text-muted-foreground">{item.courseScope} · {item.difficulty} · CED {item.topicCode} · {item.topicTitle}</p>
        <p className="text-muted-foreground">Practice Skills: {item.practiceSkillCodes.join(", ") || "none"}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" aria-label={"Preview " + item.externalId + (kind === "drafts" ? " working version" : " published version")} onClick={() => onPreview(item)}>Preview</Button>
          <Button type="button" variant="outline" size="sm" aria-label={"Edit " + item.externalId} onClick={() => onAction(item, "edit")}>Edit</Button>
          {kind === "published" ? <Button type="button" variant="outline" size="sm" onClick={() => onAction(item, "unpublish")}>Unpublish</Button>
            : <><Button type="button" size="sm" onClick={() => onAction(item, "publish")}>Publish</Button>
              {item.versionStatus === "draft" && <Button type="button" variant="outline" size="sm" onClick={() => onAction(item, "delete")}>{item.questionStatus === "draft" ? "Delete" : "Delete draft"}</Button>}
              {item.versionStatus === "review" && <span className="text-muted-foreground">Read-only review · Edit to return to draft</span>}
              {item.questionStatus === "unpublished" && <Button type="button" variant="outline" size="sm" onClick={() => onAction(item, "archive")}>Archive</Button>}</>}
        </div>
      </article>)}
      {!busy && !error && result && result.total > 0 && <nav aria-label={title + " pagination"} className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span>Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, result.total)} of {result.total}</span>
        <div className="flex items-center gap-2"><Button type="button" variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(value => value - 1)}>Previous</Button>
          <span>Page {page + 1} of {Math.ceil(result.total / PAGE_SIZE)}</span><Button type="button" variant="outline" size="sm" disabled={(page + 1) * PAGE_SIZE >= result.total} onClick={() => setPage(value => value + 1)}>Next</Button></div>
      </nav>}
    </CardContent></Card></section>;
}

/** Independent of workbook state: all lifecycle changes re-read both lists. */
export function QuestionBankLibrary({ refreshKey }: { refreshKey: number }) {
  const [selected, setSelected] = useState<QuestionBankListItem | null>(null);
  const [operation, setOperation] = useState<{ item: QuestionBankListItem; action: Action } | null>(null);
  const [all, setAll] = useState(false);
  const [changed, setChanged] = useState(0);
  const [notice, setNotice] = useState("");
  const refresh = () => setChanged(value => value + 1);
  const onAction = (item: QuestionBankListItem, action: Action) => { setNotice(""); setOperation({ item, action }); };
  return <>
    {notice && <p role="status" className="rounded border border-green-500 p-3 text-sm text-green-700">{notice}</p>}
    <QuestionBankList kind="drafts" refreshKey={refreshKey + changed} onPreview={setSelected} onAction={onAction} onPublishAll={() => { setNotice(""); setAll(true); }} />
    <QuestionBankList kind="published" refreshKey={refreshKey + changed} onPreview={setSelected} onAction={onAction} onPublishAll={() => setAll(true)} />
    {selected && <Dialog open onOpenChange={open => { if (!open) setSelected(null); }}><DialogContent scrollable className="max-h-[85vh] max-w-3xl"><DialogHeader><DialogTitle className="break-all">{selected.externalId}</DialogTitle></DialogHeader>
      <DialogBody><DialogDescription>{statusLabel(selected)} · Version {selected.versionNumber} · Read-only administrator preview</DialogDescription><QuestionBankVersionDetails key={selected.versionId} item={selected} /><QuestionPracticeStatistics key={"statistics:" + selected.id} questionId={selected.id} currentVersionId={selected.currentVersionId} previewVersionId={selected.versionId} /><Button type="button" variant="outline" onClick={() => setSelected(null)}>Close preview</Button></DialogBody>
    </DialogContent></Dialog>}
    {operation && ["edit", "delete"].includes(operation.action) && <QuestionBankDraftEditor key={operation.item.versionId} item={operation.item}
      initialAction={operation.action === "delete" ? "delete" : undefined} onClose={() => setOperation(null)} onChanged={refresh} />}
    {(all || operation?.action === "publish") && <QuestionBankPublicationDialog single={all ? undefined : operation?.item} onClose={() => { setAll(false); setOperation(null); }} onChanged={refresh} onSuccess={setNotice} />}
    {operation && (operation.action === "unpublish" || operation.action === "archive") && <QuestionBankLifecycleDialog item={operation.item} action={operation.action} onClose={() => setOperation(null)} onChanged={refresh} onSuccess={setNotice} />}
  </>;
}
