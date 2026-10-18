import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import type { QuestionBankListItem } from "@/lib/questionBankDraftRepository";
import { QuestionPublicationError } from "@/lib/questionBankPublication";
import { loadPublicationPlan, confirmPublicationPlan, validatePublicationSelection, publicationContentBlockers, changeReviewFacts,
  type PublicationPlanItem, type ReviewWorkCopy } from "@/lib/questionBankPublicationWorkflow";
import { QuestionBankPreviewDisclosure } from "./QuestionBankVersionDetails";

const sectionLabels = { math: "Mathematical verification", taxonomy: "Topic and Skills verification", source: "Source-use rights and provenance", render: "Formula, option and figure rendering" };
const selectClass = "w-full rounded border bg-background p-2";
function ReviewFields({ plan, disabled, onChange }: { plan: PublicationPlanItem; disabled: boolean; onChange: (form: ReviewWorkCopy) => void }) {
  const form = plan.form;
  const immutable = plan.item.versionStatus !== "draft";
  return <fieldset disabled={disabled} className="space-y-3">
    <div className="grid gap-3 sm:grid-cols-2">
      <label>Verified calculator policy<select aria-label="Verified calculator policy" className={selectClass} value={form.calculator} disabled={immutable}
        onChange={e => onChange(changeReviewFacts(form, { calculator: e.target.value }))}>
        <option value="">Choose after verification</option>{["no_calculator", "calculator_allowed", "calculator_required"].map(value => <option key={value} value={value}>{value.replace(/_/g, " ")}</option>)}
      </select></label>
      <label>Source-use category<select aria-label="Source-use category" className={selectClass} value={form.sourceType} disabled={immutable}
        onChange={e => onChange(changeReviewFacts(form, { sourceType: e.target.value }))}>
        <option value="">Choose with actual rights evidence</option>{["original", "licensed", "public_domain", "permission_granted"].map(value => <option key={value} value={value}>{value.replace(/_/g, " ")}</option>)}
      </select></label>
    </div>
    {immutable && <p>Publication facts are read-only. To change them, return the review version to draft or save a new working revision.</p>}
    {plan.printedNumber ? <label className="flex gap-2"><input type="checkbox" checked={form.printedNumberVerified}
      onChange={e => onChange({ ...form, printedNumberVerified: e.target.checked })} />I checked that question number {plan.printedNumber} is actually printed in the source.</label>
      : <label className="flex gap-2"><input type="checkbox" checked={form.locatorVerified} disabled={immutable}
        onChange={e => onChange({ ...form, locatorVerified: e.target.checked })} />I checked that locator {plan.locator || "(missing)"} uniquely identifies this unnumbered source question.</label>}
    {plan.printedNumber && plan.locator && !immutable && <label className="flex gap-2"><input type="checkbox" checked={form.locatorVerified}
      onChange={e => onChange({ ...form, locatorVerified: e.target.checked })} />I also verified the recorded locator.</label>}
    {(Object.keys(sectionLabels) as (keyof typeof sectionLabels)[]).map(key => <div key={key} className="space-y-1">
      <label className="flex gap-2"><input type="checkbox" checked={form[key].confirmed}
        onChange={e => onChange({ ...form, [key]: { ...form[key], confirmed: e.target.checked } })} />{sectionLabels[key]}</label>
      <textarea aria-label={`${sectionLabels[key]} notes`} className={`${selectClass} min-h-16`} value={form[key].notes}
        placeholder={key === "source" ? "Document the actual license, permission or other source-use basis." : "Explain what you independently checked and the result."}
        onChange={e => onChange({ ...form, [key]: { ...form[key], notes: e.target.value } })} />
    </div>)}
    {plan.flags.length > 0 && <div className="space-y-2"><h4 className="font-semibold">Resolve original AI flags</h4>
      <p>Keep the original evidence. Explain the actual verification or correction for each issue.</p>
      {plan.flags.map(flag => <label key={flag} className="block space-y-1"><span>{flag.replace(/_/g, " ")}</span>
        <textarea aria-label={`Resolution for ${flag}`} className={selectClass} value={form.resolutions[flag] ?? ""}
          onChange={e => onChange({ ...form, resolutions: { ...form.resolutions, [flag]: e.target.value } })} /></label>)}
    </div>}
  </fieldset>;
}

export function QuestionBankPublicationDialog({ single, onClose, onChanged, onSuccess }: {
  single?: QuestionBankListItem; onClose: () => void; onChanged: () => void; onSuccess: (message: string) => void;
}) {
  const writing = useRef(false);
  const [plans, setPlans] = useState<PublicationPlanItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [freshReviews, setFreshReviews] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [technical, setTechnical] = useState("");
  const [retry, setRetry] = useState(0);
  const [needsReload, setNeedsReload] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [bulkPolicy, setBulkPolicy] = useState("");
  useEffect(() => {
    let active = true;
    setBusy(true); setError(""); setTechnical(""); setConfirm(false);
    void loadPublicationPlan(supabase, single).then(loaded => {
      if (!active) return;
      setPlans(previous => loaded.map(plan => {
        const old = previous.find(p => p.item.id === plan.item.id && p.item.versionId === plan.item.versionId);
        if (!old) return plan;
        if (old.check.fingerprint === plan.check.fingerprint) return { ...plan, form: old.form };
        return { ...plan, form: { ...old.form, math: { ...old.form.math, confirmed: false }, taxonomy: { ...old.form.taxonomy, confirmed: false },
          source: { ...old.form.source, confirmed: false }, render: { ...old.form.render, confirmed: false },
          locatorVerified: plan.form.locatorVerified, printedNumberVerified: false } };
      }));
      setSelected(previous => retry ? new Set([...previous].filter(id => loaded.some(plan => plan.item.id === id)))
        : new Set(loaded.length <= 20 ? loaded.map(plan => plan.item.id) : []));
      setNeedsReload(false);
    }).catch(reason => { if (active) { setError("Could not load the publication plan. Nothing was written. Retry when access and the connection are available."); setTechnical(String(reason)); } })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [single, retry]);
  const readiness = useMemo(() => {
    try { validatePublicationSelection(plans, selected, freshReviews); return ""; }
    catch (reason) { return reason instanceof Error ? reason.message : String(reason); }
  }, [plans, selected, freshReviews]);
  const publish = async () => {
    if (writing.current || readiness || needsReload) return;
    writing.current = true; setBusy(true); setError(""); setTechnical("");
    try {
      const count = await confirmPublicationPlan(supabase, plans, selected, freshReviews);
      onChanged(); onSuccess(`Published ${count} ${count === 1 ? "problem" : "problems"} and verified the current versions.`); onClose();
    } catch (reason) {
      const code = reason instanceof QuestionPublicationError ? reason.code : "";
      setError(code === "QB_STALE" ? "This version changed. Notes are retained; reload checks and reconfirm before publishing."
        : code === "QB_FORBIDDEN" ? "Administrator permission was denied. Nothing was confirmed as published."
          : "Publication could not be confirmed. Check the refreshed list before retrying. A rejected publication batch publishes nothing; explicit review records may already have been saved.");
      setTechnical(reason instanceof Error ? reason.message : String(reason)); setNeedsReload(true); setConfirm(false); onChanged();
    } finally { writing.current = false; setBusy(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open && !writing.current) onClose(); }}>
    <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
      <DialogHeader><DialogTitle>{single ? "Publish problem" : "Publish all · Select problems"}</DialogTitle>
        <DialogDescription>Review the exact versions below. Selection, preview and Cancel write nothing. Final confirmation records explicit reviews, then publishes the selected batch atomically.</DialogDescription></DialogHeader>
      {busy && <p role="status">{writing.current ? "Recording confirmed reviews and publishing…" : "Loading the complete publication scope…"}</p>}
      {error && <div role="alert" className="space-y-2 rounded border border-destructive/50 p-3 text-sm"><p>{error}</p>
        <details><summary>Technical details</summary><p className="break-words">{technical}</p></details></div>}
      {(!busy && (error || needsReload)) && <Button type="button" variant="outline" onClick={() => setRetry(value => value + 1)}>Reload checks (keep notes)</Button>}
      {!busy && <p className="text-sm">{plans.length} problems across all pages · {selected.size} selected. Maximum 20 per atomic batch.</p>}
      {plans.length > 20 && <p className="text-sm text-amber-700">This is the full list, not just the current page. Explicitly choose up to 20 problems for this batch.</p>}
      {plans.length > 1 && <details className="rounded border p-3 text-sm"><summary>Apply calculator policy to selected problems</summary>
        <p>No review or source rights are assumed. Only selected editable draft versions are changed in this browser work copy.</p>
        <select aria-label="Batch calculator policy" className={selectClass} value={bulkPolicy} onChange={e => setBulkPolicy(e.target.value)}>
          <option value="">Choose a policy</option>{["no_calculator", "calculator_allowed", "calculator_required"].map(value => <option key={value} value={value}>{value.replace(/_/g, " ")}</option>)}
        </select><Button type="button" variant="outline" disabled={busy || !bulkPolicy || !selected.size} onClick={() => {
          setPlans(current => current.map(plan => selected.has(plan.item.id) && plan.item.versionStatus === "draft"
            ? { ...plan, form: changeReviewFacts(plan.form, { calculator: bulkPolicy }) } : plan));
          setFreshReviews(current => new Set([...current, ...plans.filter(plan => selected.has(plan.item.id) && plan.item.versionStatus === "draft").map(plan => plan.item.id)]));
          setConfirm(false);
        }}>Apply to selected drafts</Button>
      </details>}
      <div className="space-y-4">{plans.map(plan => {
        const included = selected.has(plan.item.id);
        const reuse = plan.check.eligible && plan.check.review?.current && !freshReviews.has(plan.item.id);
        const blockers = publicationContentBlockers(plan);
        return <article key={plan.item.id} aria-label={`Publication target ${plan.item.externalId}`} className="space-y-3 rounded border p-3 text-sm">
          <label className="flex items-start gap-2 font-semibold"><input type="checkbox" checked={included} disabled={busy}
            onChange={e => { setSelected(current => { const next = new Set(current); if (e.target.checked) next.add(plan.item.id); else next.delete(plan.item.id); return next; }); setConfirm(false); }} />
            {plan.item.externalId} · Version {plan.item.versionNumber} · {plan.check.action === "republish" ? "Restore retained approved version" : "Publish working version"}</label>
          <p>Source: {plan.sourceDocument} · Physical PDF page {plan.sourcePage}</p>
          {plan.check.working_version_id && plan.check.working_version_id !== plan.item.versionId && <p className="text-amber-700">Unpublished changes exist. This action explicitly restores the retained approved version, not the working revision.</p>}
          <QuestionBankPreviewDisclosure item={plan.item} />
          {blockers.length > 0 && <div role="alert" className="space-y-1 text-destructive">{blockers.map((issue, i) => <p key={i}>{issue.message}</p>)}
            <p>Resolve these content issues in Edit, or correct the XLSX and re-upload. This window cannot edit question text, options, solutions or figures.</p></div>}
          {included && (reuse ? <div className="space-y-1 rounded bg-muted/50 p-3"><p>Valid human confirmation is already bound to this version. It will be reused.</p>
            <p>Reviewed: {plan.check.review?.reviewed_at}</p><Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setFreshReviews(current => new Set(current).add(plan.item.id))}>Review again</Button></div>
            : <ReviewFields plan={plan} disabled={busy || needsReload} onChange={form => { setPlans(current => current.map(p => p.item.id === plan.item.id ? { ...p, form } : p)); setConfirm(false); }} />)}
          <details><summary>Original review evidence</summary><p>Imported review status is historical evidence, not publication approval.</p><pre className="whitespace-pre-wrap break-words text-xs">{JSON.stringify(plan.evidence, null, 2)}</pre></details>
        </article>;
      })}</div>
      <div className="sticky -bottom-6 space-y-2 border-t bg-background py-3 text-sm">
        {readiness && <p role="status">{readiness}</p>}
        {confirm && <div role="alertdialog" aria-label="Confirm publication"><p>Publish the {selected.size} exact versions selected above? Every selected problem must pass; none will be silently skipped. Review records are saved first and remain as audit evidence if publication is rejected.</p>
          <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirm(false)}>Back to review</Button>{" "}
          <Button type="button" disabled={busy || needsReload || !!readiness} onClick={() => void publish()}>Confirm and publish {selected.size} problems</Button></div>}
        <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={busy && writing.current} onClick={onClose}>Cancel</Button>
          <Button type="button" disabled={busy || !!error || needsReload || !!readiness || confirm} onClick={() => setConfirm(true)}>Publish {selected.size} problems</Button></div>
      </div>
    </DialogContent>
  </Dialog>;
}
