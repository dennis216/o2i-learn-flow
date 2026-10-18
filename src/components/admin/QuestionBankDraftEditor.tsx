import { useEffect, useMemo, useRef, useState } from "react";
import MarkdownWithMath from "@/components/MarkdownWithMath";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { loadQuestionBankReferences } from "@/lib/questionBankReferences";
import { draftSnapshotSheets, loadQuestionBankDraft, updateQuestionBankDraft, deleteQuestionBankDraft,
  returnQuestionBankDraft, validateDraftMetadata, type DraftSnapshot } from "@/lib/questionBankDraftManagement";
import { loadQuestionBankEditor } from "@/lib/questionBankDraftManagement";
import { saveQuestionBankRevision, type PublicationTarget } from "@/lib/questionBankPublication";
import { FIELD_LABELS, applyQuestionFieldEdit, getQuestionEditChanges } from "@/lib/questionBankPreviewEdits";
import type { WorkbookSheet } from "@/lib/questionBankImport";
import type { QuestionBankReferences } from "@/lib/questionBankImportPlan";
import type { QuestionBankListItem } from "@/lib/questionBankDraftRepository";
import { QuestionBankMetadataFields } from "./QuestionBankMetadataFields";

const message = (reason: unknown) => reason instanceof Error ? reason.message : String(reason);

export function QuestionBankDraftEditor({ item, onClose, onChanged, initialAction }: {
  item: QuestionBankListItem; onClose: () => void; onChanged: () => void; initialAction?: "delete";
}) {
  const writing = useRef(false);
  const [snapshot, setSnapshot] = useState<DraftSnapshot | null>(null);
  const [revisionTarget, setRevisionTarget] = useState<PublicationTarget | null>(null);
  const [references, setReferences] = useState<QuestionBankReferences | null>(null);
  const [original, setOriginal] = useState<WorkbookSheet[]>([]);
  const [working, setWorking] = useState<WorkbookSheet[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState(0);
  const [needsReload, setNeedsReload] = useState(false);
  const [confirm, setConfirm] = useState<"delete" | "return" | null>(null);
  const validated = useMemo(() => working.length ? validateDraftMetadata(working, references) : null, [working, references]);
  const changes = useMemo(() => getQuestionEditChanges(original, working), [original, working]);
  const question = validated?.report.questions[0];
  const issues = validated?.plan.issues ?? [];
  const readOnly = !revisionTarget && snapshot?.version.status !== "draft";

  useEffect(() => {
    let active = true;
    setBusy(true); setError(""); setSnapshot(null); setReferences(null); setConfirm(null);
    void Promise.all([loadQuestionBankEditor(supabase, item.id, item.versionId), loadQuestionBankReferences(supabase)])
      .then(([loaded, refs]) => {
        if (!active) return;
        const latest = loaded.snapshot;
        setRevisionTarget(loaded.revisionTarget);
        setSnapshot(latest); setReferences(refs);
        const sheets = draftSnapshotSheets(latest); setOriginal(sheets); setWorking(sheets); setNeedsReload(false);
        if (initialAction && latest.version.status === "draft") setConfirm("delete");
      }).catch(reason => { if (active) setError(message(reason)); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [item.id, item.versionId, retry, initialAction]);

  const act = async (action: "save" | "delete" | "return") => {
    if (writing.current || !snapshot) return;
    writing.current = true; setBusy(true); setError(""); setNotice("");
    let committed = false;
    try {
      let savedVersionId = snapshot.version.id;
      if (action === "save" && revisionTarget) {
        if (!validated?.plan.canSave || !validated.metadata) throw new Error("Resolve metadata issues before saving a revision.");
        savedVersionId = (await saveQuestionBankRevision(supabase, revisionTarget, validated.metadata)).versionId;
      } else if (action === "save") await updateQuestionBankDraft(supabase, snapshot, working, references);
      else if (action === "delete") await deleteQuestionBankDraft(supabase, snapshot);
      else await returnQuestionBankDraft(supabase, snapshot);
      committed = true; onChanged();
      if (action === "delete") { onClose(); return; }
      // Success is shown only after reading the actual saved values back from the database.
      const latest = await loadQuestionBankDraft(supabase, item.id, savedVersionId);
      setRevisionTarget(null);
      setSnapshot(latest);
      const sheets = draftSnapshotSheets(latest); setOriginal(sheets); setWorking(sheets);
      setConfirm(null); setNotice(action === "save" ? "Changes saved and read back. This version is still unpublished." : "Returned to draft. Review is required again before publication.");
    } catch (reason) {
      setError(committed ? `The operation completed, but readback failed. Reload before continuing. ${message(reason)}` : message(reason));
      if (committed) setNeedsReload(true);
    } finally { writing.current = false; setBusy(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open && !writing.current) onClose(); }}>
    <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
      <DialogHeader><DialogTitle className="break-all">{item.externalId} · Draft metadata</DialogTitle>
        <DialogDescription>Only the browser work copy changes until Save changes. Stems, choices and solutions are read-only. The original XLSX is never modified.</DialogDescription></DialogHeader>
      {busy && <p role="status">{writing.current ? "Applying confirmed operation…" : "Loading latest draft and canonical choices…"}</p>}
      {error && <div role="alert" className="space-y-2 text-sm"><p className="text-destructive">{error}</p>
        <Button type="button" variant="outline" disabled={busy} onClick={() => { setNotice(""); setRetry(value => value + 1); }}>Reload latest (discard local changes)</Button></div>}
      {notice && <p role="status" className="text-sm text-green-700">{notice}</p>}
      {snapshot && question && <div className="space-y-4 text-sm">
        <p>Version {snapshot.version.version_number} · {revisionTarget ? "Current approved version · Revision work copy" : readOnly ? "Under review · Read-only" : "Draft · Unpublished"}</p>
        {revisionTarget && <p className="rounded border p-3">Save creates a new unpublished revision. The current published version stays unchanged. Opening or cancelling creates nothing.</p>}
        {snapshot.version.id !== item.versionId && <p className="rounded border p-3">Editing existing working version {snapshot.version.version_number}; the current approved version is not overwritten.</p>}
        <MarkdownWithMath content={question.stem} strictMath className="overflow-x-auto" />
        <p className="break-words text-muted-foreground">Source: {question.sourceDocument} · Printed question number: {question.sourceQuestionNumber || "not recorded"}</p>
        {readOnly && <p className="rounded border p-3">Review versions cannot be edited or deleted. Explicitly return this version to draft first.</p>}
        <QuestionBankMetadataFields question={question} references={references} disabled={busy || readOnly || needsReload}
          onChange={(field, value) => { setWorking(current => applyQuestionFieldEdit(current, 2, field, value)); setNotice(""); setError(""); }}
          fieldHasError={field => issues.some(issue => issue.field === field)}
          errors={field => issues.filter(issue => issue.field === field).map((issue, index) => <p key={index} className="text-destructive">{issue.message}</p>)} />
        {issues.some(issue => !(issue.field in FIELD_LABELS)) && <div role="alert">
          {issues.filter(issue => !(issue.field in FIELD_LABELS)).map((issue, index) => <p key={index} className="text-destructive">{issue.field}: {issue.message} (outside this editor)</p>)}
        </div>}
        <div className="space-y-1 rounded bg-muted/50 p-3"><p>Changes: {changes.length}</p>
          {changes.map(change => <p key={change.field}>{FIELD_LABELS[change.field]}: {change.before || "(blank)"} → {change.after || "(blank)"}</p>)}
          <Button type="button" size="sm" variant="outline" disabled={busy || readOnly || !changes.length || needsReload} onClick={() => { setWorking(original); setError(""); }}>Undo changes</Button>
        </div>
        <p className="text-muted-foreground">Changes invalidate affected review conclusions. AI flags, reviewer notes and original import evidence are retained. Saving does not publish.</p>
        {confirm && <div role="alertdialog" aria-label={confirm === "delete" ? "Confirm draft deletion" : "Confirm return to draft"} className="space-y-3 rounded border border-destructive/50 p-3">
          <p>{confirm === "return" ? "Return this review version to editable draft? This does not publish or delete anything."
            : snapshot.delete_scope === "question" ? "Permanently delete this never-published question and its exclusive draft records?"
              : "Delete only this working draft? The current published version and all published history will be retained."}</p>
          <p className="break-all">{snapshot.question.external_id} · Version {snapshot.version.version_number} · {snapshot.version.id}</p>
          {changes.length > 0 && confirm === "delete" && <p>Unsaved browser changes will be discarded.</p>}
          <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirm(null)}>Keep draft</Button>{" "}
          <Button type="button" variant={confirm === "delete" ? "destructive" : "default"} disabled={busy || needsReload}
            onClick={() => void act(confirm)}>{confirm === "delete" ? "Confirm deletion" : "Confirm return to draft"}</Button>
        </div>}
        <div className="flex flex-wrap justify-between gap-2 border-t pt-3">
          {revisionTarget ? <span /> : readOnly ? <Button type="button" variant="outline" disabled={busy || needsReload} onClick={() => setConfirm("return")}>Return to draft</Button>
            : <Button type="button" variant="destructive" disabled={busy || needsReload} onClick={() => setConfirm("delete")}>{snapshot.delete_scope === "question" ? "Delete" : "Delete draft"}</Button>}
          <div className="flex gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button>
            {!readOnly && <Button type="button" disabled={busy || needsReload || !changes.length || !validated?.plan.canSave || !!confirm} onClick={() => void act("save")}>Save changes</Button>}</div>
        </div>
      </div>}
      {!snapshot && <Button type="button" variant="outline" disabled={writing.current} onClick={onClose}>Cancel</Button>}
    </DialogContent>
  </Dialog>;
}
