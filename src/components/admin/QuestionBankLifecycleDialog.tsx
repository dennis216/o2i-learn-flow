import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import type { QuestionBankListItem } from "@/lib/questionBankDraftRepository";
import { loadQuestionPublicationState, unpublishQuestion, archiveQuestion, QuestionPublicationError,
  type QuestionPublicationState, type PublicationTarget } from "@/lib/questionBankPublication";

export function QuestionBankLifecycleDialog({ item, action, onClose, onChanged, onSuccess }: {
  item: QuestionBankListItem; action: "unpublish" | "archive"; onClose: () => void; onChanged: () => void; onSuccess: (message: string) => void;
}) {
  const writing = useRef(false);
  const [state, setState] = useState<QuestionPublicationState | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [needsReload, setNeedsReload] = useState(false);
  useEffect(() => {
    let active = true;
    setBusy(true); setError(""); setState(null);
    void loadQuestionPublicationState(supabase, item.id).then(value => {
      if (!active) return;
      if (value.current_version_id !== item.currentVersionId || value.status !== (action === "unpublish" ? "approved" : "unpublished"))
        throw new Error("This question changed. Close this window and refresh the list.");
      setState(value); setNeedsReload(false);
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [item, action, retry]);
  const current = state?.versions.find(version => version.version_id === state.current_version_id && version.status === "approved");
  const working = state?.versions.some(version => ["draft", "review"].includes(version.status));
  const blocked = action === "archive" && working;
  const confirm = async () => {
    if (writing.current || !current || blocked || needsReload) return;
    writing.current = true; setBusy(true); setError("");
    const target: PublicationTarget = { question_id: item.id, version_id: current.version_id, expected_fingerprint: current.fingerprint, action: "publish" };
    try {
      await (action === "unpublish" ? unpublishQuestion(supabase, target) : archiveQuestion(supabase, target));
      const actual = await loadQuestionPublicationState(supabase, item.id);
      if (actual.status !== (action === "unpublish" ? "unpublished" : "retired")
        || actual.current_version_id !== (action === "unpublish" ? current.version_id : null)) throw new Error("Operation readback could not be verified.");
      onChanged(); onSuccess(action === "unpublish" ? "Problem unpublished. Its approved version, working revision and history are retained." : "Problem archived. Published history is retained."); onClose();
    } catch (reason) {
      setError(reason instanceof QuestionPublicationError && reason.code === "QB_STALE" ? "The question changed. Reload its state before confirming again."
        : "The operation could not be confirmed. Refresh the list and check its state before retrying. Administrator access and a working connection are required.");
      setNeedsReload(true); onChanged();
    } finally { writing.current = false; setBusy(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open && !writing.current) onClose(); }}>
    <DialogContent scrollable className="max-h-[85vh] max-w-xl"><DialogHeader><DialogTitle>{action === "unpublish" ? "Unpublish problem?" : "Archive problem?"}</DialogTitle></DialogHeader>
      <DialogBody><DialogDescription>{action === "unpublish" ? "Students will no longer be able to fetch this problem. The current approved version and all history remain available for republication. Any working revision is retained."
        : "Archive this previously published problem. All history is retained, but restoring an archived problem is not supported. This is not permanent deletion."}</DialogDescription><p className="break-all text-sm">{item.externalId} · Current approved version {current?.version_number ?? "…"}</p>
      {busy && <p role="status">{writing.current ? "Applying confirmed operation…" : "Reading current publication state…"}</p>}
      {error && <div role="alert" className="space-y-2 text-sm"><p>{error}</p><Button type="button" variant="outline" disabled={busy} onClick={() => setRetry(value => value + 1)}>Reload state</Button></div>}
      {blocked && <p role="alert" className="text-sm">A working revision exists. Delete or otherwise handle that explicit revision before archiving; it will not be silently removed.</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={writing.current} onClick={onClose}>Cancel</Button>
        <Button type="button" variant="destructive" disabled={busy || !!error || !current || !!blocked || needsReload} onClick={() => void confirm()}>{action === "unpublish" ? "Confirm unpublish" : "Confirm archive"}</Button></div>
    </DialogBody>
    </DialogContent>
  </Dialog>;
}
