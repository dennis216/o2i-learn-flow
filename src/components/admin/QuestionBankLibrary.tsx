import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import MarkdownWithMath from "@/components/MarkdownWithMath";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { QuestionBankDraftEditor } from "./QuestionBankDraftEditor";
import { loadQuestionBankPage, loadQuestionBankVersionPreview,
  type QuestionBankListItem, type QuestionBankListKind, type QuestionBankPage,
  type QuestionBankVersionPreview } from "@/lib/questionBankDraftRepository";

const PAGE_SIZE = 20;
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
const statusLabel = (item: QuestionBankListItem) => item.kind === "published" ? "Published"
  : item.versionStatus === "review" ? "Under review · Unpublished" : "Draft · Unpublished";

function QuestionBankList({ kind, refreshKey, onPreview, onEdit }: {
  kind: QuestionBankListKind; refreshKey: number; onPreview: (item: QuestionBankListItem) => void;
  onEdit: (item: QuestionBankListItem) => void;
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
    setBusy(true);
    setError("");
    setResult(null);
    void loadQuestionBankPage(supabase, kind, page, PAGE_SIZE).then(loaded => {
      if (!active) return;
      const lastPage = Math.max(0, Math.ceil(loaded.total / PAGE_SIZE) - 1);
      if (page > lastPage) { setPage(lastPage); return; }
      setResult(loaded);
    }).catch(reason => { if (active) setError(message(reason)); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [kind, page, refreshKey, retry]);

  return <section aria-label={title}>
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>{title}{result ? ` (${result.total})` : ""}</CardTitle>
          <Button type="button" variant="outline" size="sm" disabled={busy} aria-label={`Refresh ${title.toLowerCase()}`}
            onClick={() => setRetry(value => value + 1)}>Refresh</Button>
        </div>
        <CardDescription>{kind === "drafts"
          ? "Unpublished working versions, including revisions of published problems."
          : "Only the current published version of each approved question."}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {busy && <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Loading {title.toLowerCase()}…</p>}
        {error && <div role="alert" className="space-y-2 rounded border border-destructive/50 p-3 text-sm">
          <p className="text-destructive">{error}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => setRetry(value => value + 1)}>Retry</Button>
        </div>}
        {!busy && !error && result?.total === 0 && <p className="text-sm text-muted-foreground">No {title.toLowerCase()} yet.</p>}
        {!busy && !error && result && result.items.map(item => <article key={item.id} className="min-w-0 space-y-2 rounded border p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="break-all font-semibold">{item.externalId}</p>
            <p className={kind === "published" ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-400"}>
              {statusLabel(item)} · Version {item.versionNumber}
            </p>
          </div>
          <MarkdownWithMath content={item.stem} className="overflow-x-auto" strictMath />
          <p className="text-muted-foreground">{item.courseScope} · {item.difficulty} · CED {item.topicCode} · {item.topicTitle}</p>
          <p className="text-muted-foreground">Practice Skills: {item.practiceSkillCodes.join(", ") || "none"}</p>
          <Button type="button" variant="outline" size="sm" aria-label={`Preview ${item.externalId} ${kind === "drafts" ? "working" : "published"} version`}
            onClick={() => onPreview(item)}>Preview</Button>
          {kind === "drafts" && <Button type="button" variant="outline" size="sm" className="ml-2"
            aria-label={`${item.versionStatus === "draft" ? "Edit" : "Return to draft"} ${item.externalId}`}
            onClick={() => onEdit(item)}>{item.versionStatus === "draft" ? "Edit" : "Return to draft"}</Button>}
        </article>)}
        {!busy && !error && result && result.total > 0 && <nav aria-label={`${title} pagination`} className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span>Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, result.total)} of {result.total}</span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(value => value - 1)}>Previous</Button>
            <span>Page {page + 1} of {Math.ceil(result.total / PAGE_SIZE)}</span>
            <Button type="button" variant="outline" size="sm" disabled={(page + 1) * PAGE_SIZE >= result.total} onClick={() => setPage(value => value + 1)}>Next</Button>
          </div>
        </nav>}
      </CardContent>
    </Card>
  </section>;
}

function VersionPreview({ item, onClose }: { item: QuestionBankListItem; onClose: () => void }) {
  const [preview, setPreview] = useState<QuestionBankVersionPreview | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError("");
    setPreview(null);
    void loadQuestionBankVersionPreview(supabase, item).then(loaded => { if (active) setPreview(loaded); })
      .catch(reason => { if (active) setError(message(reason)); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [item, retry]);
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="break-all">{item.externalId}</DialogTitle>
        <DialogDescription>{statusLabel(item)} · Version {item.versionNumber} · Read-only administrator preview</DialogDescription>
      </DialogHeader>
      {busy && <p role="status">Loading preview…</p>}
      {error && <div role="alert" className="space-y-2 text-sm">
        <p className="text-destructive">{error}</p><Button type="button" variant="outline" onClick={() => setRetry(value => value + 1)}>Retry</Button>
      </div>}
      {preview && <div className="space-y-4 text-sm">
        <MarkdownWithMath content={preview.stem} className="overflow-x-auto" strictMath />
        <div className="space-y-2" aria-label="Question options">
          {preview.options.map(option => <div key={option.id} className={`flex gap-3 rounded border p-3 ${option.is_correct ? "border-green-500 bg-green-50 dark:bg-green-950/20" : ""}`}>
            <span className="font-semibold">{option.option_key}.</span>
            <div className="min-w-0 flex-1"><MarkdownWithMath content={option.option_text} className="overflow-x-auto" strictMath />
              {option.is_correct && <p className="mt-1 font-semibold text-green-700 dark:text-green-400">Correct answer</p>}</div>
          </div>)}
          {!preview.options.length && <p>No options recorded.</p>}
        </div>
        <div><h3 className="mb-2 font-semibold">Solution</h3><MarkdownWithMath content={preview.solution} className="overflow-x-auto" strictMath /></div>
        <div className="space-y-1 break-words rounded bg-muted/50 p-3">
          <p>Source: {preview.sourceDocument} · Physical PDF page: {preview.sourcePage}</p>
          <p>Printed question number: {preview.sourceQuestionNumber || "not recorded"} · Locator: {preview.sourceLocator || "not provided"}</p>
          {preview.sourceReference && <p>Source reference: {preview.sourceReference}</p>}
          <p>CED {item.topicCode} · {item.topicTitle} · Practice Skills: {item.practiceSkillCodes.join(", ") || "none"}</p>
        </div>
        {preview.imageUrl ? <img src={preview.imageUrl} alt="Source question figure" className="max-h-96 max-w-full object-contain" />
          : preview.requiresFigure && <p className="text-amber-700">This question requires a figure, but no figure is available.</p>}
      </div>}
      <Button type="button" variant="outline" onClick={onClose}>Close preview</Button>
    </DialogContent>
  </Dialog>;
}

/** Independent of workbook state: remounts always read the database again. */
export function QuestionBankLibrary({ refreshKey }: { refreshKey: number }) {
  const [selected, setSelected] = useState<QuestionBankListItem | null>(null);
  const [editing, setEditing] = useState<QuestionBankListItem | null>(null);
  const [editRefresh, setEditRefresh] = useState(0);
  return <>
    <QuestionBankList kind="drafts" refreshKey={refreshKey + editRefresh} onPreview={setSelected} onEdit={setEditing} />
    <QuestionBankList kind="published" refreshKey={refreshKey + editRefresh} onPreview={setSelected} onEdit={setEditing} />
    {selected && <VersionPreview key={selected.versionId} item={selected} onClose={() => setSelected(null)} />}
    {editing && <QuestionBankDraftEditor key={editing.versionId} item={editing} onClose={() => setEditing(null)} onChanged={() => setEditRefresh(value => value + 1)} />}
  </>;
}
