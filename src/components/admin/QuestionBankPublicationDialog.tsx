import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import type { QuestionBankListItem } from "@/lib/questionBankDraftRepository";
import { QuestionPublicationError } from "@/lib/questionBankPublication";
import { loadPublicationPlan, confirmPublicationPlan, validatePublicationSelection, publicationContentBlockers,
  type PublicationPlanItem } from "@/lib/questionBankPublicationWorkflow";
import { QuestionBankPreviewDisclosure, QuestionBankVersionMetadata } from "./QuestionBankVersionDetails";

export function QuestionBankPublicationDialog({ single, onClose, onChanged, onSuccess }: {
  single?: QuestionBankListItem; onClose: () => void; onChanged: () => void; onSuccess: (message: string) => void;
}) {
  const writing = useRef(false);
  const [plans, setPlans] = useState<PublicationPlanItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [technical, setTechnical] = useState("");
  const [retry, setRetry] = useState(0);
  const [needsReload, setNeedsReload] = useState(false);
  useEffect(() => {
    let active = true;
    setBusy(true); setError(""); setTechnical(""); setConfirmed(false);
    void loadPublicationPlan(supabase, single).then(loaded => {
      if (!active) return;
      setPlans(loaded);
      setSelected(previous => retry ? new Set([...previous].filter(id => loaded.some(plan => plan.item.id === id)))
        : new Set(loaded.length <= 20 ? loaded.map(plan => plan.item.id) : []));
      setNeedsReload(false);
    }).catch(reason => { if (active) { setError("Could not load the publication plan. Nothing was written. Retry when access and the connection are available."); setTechnical(String(reason)); } })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [single, retry]);
  const readiness = useMemo(() => {
    try { validatePublicationSelection(plans, selected, confirmed); return ""; }
    catch (reason) { return reason instanceof Error ? reason.message : String(reason); }
  }, [plans, selected, confirmed]);
  const publish = async () => {
    if (writing.current || readiness || needsReload) return;
    writing.current = true; setBusy(true); setError(""); setTechnical("");
    try {
      const count = await confirmPublicationPlan(supabase, plans, selected, confirmed);
      onChanged(); onSuccess(`Published ${count} ${count === 1 ? "problem" : "problems"} and verified the current versions.`); onClose();
    } catch (reason) {
      const code = reason instanceof QuestionPublicationError ? reason.code : "";
      setError(code === "QB_STALE" ? "This version changed. Reload checks and confirm the selected problems again."
        : code === "QB_FORBIDDEN" ? "Administrator permission was denied. Nothing was confirmed as published."
          : "Publication could not be confirmed. Check the refreshed list before retrying. A rejected publication batch publishes nothing; explicit review records may already have been saved.");
      setTechnical(reason instanceof Error ? reason.message : String(reason)); setNeedsReload(true); setConfirmed(false); onChanged();
    } finally { writing.current = false; setBusy(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open && !writing.current) onClose(); }}>
    <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
      <DialogHeader><DialogTitle>{single ? "Publish problem" : "Publish all · Select problems"}</DialogTitle>
        <DialogDescription>Review the selected problems and deselect any with issues. Confirm once below, then click Publish. Opening, selection, preview and Cancel write nothing.</DialogDescription></DialogHeader>
      {busy && <p role="status">{writing.current ? "Recording confirmation and publishing…" : "Loading the complete publication scope…"}</p>}
      {error && <div role="alert" className="space-y-2 rounded border border-destructive/50 p-3 text-sm"><p>{error}</p>
        <details><summary>Technical details</summary><p className="break-words">{technical}</p></details></div>}
      {(!busy && (error || needsReload)) && <Button type="button" variant="outline" onClick={() => setRetry(value => value + 1)}>Reload checks</Button>}
      {!busy && <p className="text-sm">{plans.length} problems across all pages · {selected.size} selected. Maximum 20 per atomic batch.</p>}
      {plans.length > 20 && <p className="text-sm text-amber-700">This is the full list, not just the current page. Choose up to 20 problems for this batch.</p>}
      <div className="space-y-4">{plans.map(plan => {
        const included = selected.has(plan.item.id);
        const blockers = publicationContentBlockers(plan);
        return <article key={plan.item.id} aria-label={`Publication target ${plan.item.externalId}`} className="space-y-3 rounded border p-3 text-sm">
          <label className="flex items-start gap-2 font-semibold"><input type="checkbox" checked={included} disabled={busy || needsReload}
            onChange={e => { setSelected(current => { const next = new Set(current); if (e.target.checked) next.add(plan.item.id); else next.delete(plan.item.id); return next; }); setConfirmed(false); }} />
            {plan.item.externalId} · Version {plan.item.versionNumber} · {plan.check.action === "republish" ? "Restore retained approved version" : "Publish working version"}</label>
          {plan.check.working_version_id && plan.check.working_version_id !== plan.item.versionId && <p className="text-amber-700">Unpublished changes exist. This action restores the retained approved version. Select the working revision separately to publish its changes.</p>}
          <QuestionBankVersionMetadata item={plan.item} />
          <QuestionBankPreviewDisclosure item={plan.item} defaultOpen={!!single} />
          {blockers.length > 0 && <div role="alert" className="space-y-1 text-destructive">{blockers.map((issue, i) => <p key={i}>{plan.item.externalId} · {issue.field}: {issue.message}</p>)}
            <p>Deselect this problem, resolve metadata issues in Edit, or correct the XLSX and re-upload. This window cannot edit question text, options, solutions or figures.</p></div>}

        </article>;
      })}</div>
      <div className="sticky -bottom-6 space-y-2 border-t bg-background py-3 text-sm">
        <label className="flex items-start gap-2"><input type="checkbox" checked={confirmed} disabled={busy || needsReload || !!error || !selected.size}
          onChange={e => setConfirmed(e.target.checked)} />I have checked the selected problems' content, correct answers, display and Topic/Skills, and confirm they are ready to publish.</label>
        {readiness && <p role="status">{readiness}</p>}
        <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={busy && writing.current} onClick={onClose}>Cancel</Button>
          <Button type="button" disabled={busy || !!error || needsReload || !!readiness} onClick={() => void publish()}>Publish {selected.size} problems</Button></div>
      </div>
    </DialogContent>
  </Dialog>;
}
