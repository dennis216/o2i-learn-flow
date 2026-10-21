import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import MarkdownWithMath from "@/components/MarkdownWithMath";
import { supabase } from "@/integrations/supabase/client";
import { emptyManualQuestion, manualQuestionSheets, type ManualQuestion } from "@/lib/questionBankManual";
import { validateQuestionBankSheets } from "@/lib/questionBankImport";
import { buildQuestionBankDraftSavePlan } from "@/lib/questionBankDraftSave";
import { loadQuestionBankReferences } from "@/lib/questionBankReferences";
import { loadSavedQuestionBankDrafts, saveQuestionBankDrafts } from "@/lib/questionBankDraftRepository";
import type { QuestionBankReferences } from "@/lib/questionBankImportPlan";
import { QuestionBankMetadataFields } from "./QuestionBankMetadataFields";

export function QuestionBankManualEntry({ onClose, onChanged }: { onClose: () => void; onChanged: (message: string) => void }) {
  const [draft, setDraft] = useState(emptyManualQuestion);
  const [references, setReferences] = useState<QuestionBankReferences | null>(null);
  const [referenceError, setReferenceError] = useState("");
  const [referenceBusy, setReferenceBusy] = useState(true);
  const [retry, setRetry] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [error, setError] = useState("");
  const writing = useRef(false);
  const attemptedId = useRef("");
  const sheets = useMemo(() => manualQuestionSheets(draft), [draft]);
  const report = useMemo(() => validateQuestionBankSheets(sheets, references ? {
    topicCodes: new Set(references.topics.map(topic => topic.topic_code)),
    practiceSkillCodes: new Set(references.skills.map(skill => skill.skill_code)),
  } : undefined), [sheets, references]);
  const plan = useMemo(() => buildQuestionBankDraftSavePlan(report, references), [report, references]);
  const question = report.questions[0];
  const disabled = saving || needsVerification;

  useEffect(() => {
    let active = true;
    setReferenceBusy(true); setReferenceError("");
    void loadQuestionBankReferences(supabase).then(value => { if (active) setReferences(value); })
      .catch(reason => { if (active) { setReferences(null); setReferenceError(String(reason.message ?? reason)); } })
      .finally(() => { if (active) setReferenceBusy(false); });
    return () => { active = false; };
  }, [retry]);

  const change = (next: ManualQuestion) => { setDraft(next); setDirty(true); setError(""); };
  const field = (key: keyof ManualQuestion["fields"], value: string | boolean) => change({ ...draft, fields: { ...draft.fields, [key]: value } });
  const close = () => { if (!writing.current) { if (dirty) setDiscard(true); else onClose(); } };
  const fieldErrors = (key: string) => checked ? plan.issues.filter(issue => issue.sheet === "Questions" && issue.field === key)
    .map((issue, index) => <p key={index} className="text-sm text-destructive">{issue.message}</p>) : null;
  const input = (key: keyof ManualQuestion["fields"], label: string, multiline = false) => <label className="block space-y-1">
    <span>{label}</span>
    {multiline ? <Textarea aria-label={label} aria-invalid={checked && plan.issues.some(issue => issue.field === key)} value={String(draft.fields[key] ?? "")} disabled={disabled} rows={3}
      onChange={event => field(key, event.target.value)} />
      : <Input aria-label={label} aria-invalid={checked && plan.issues.some(issue => issue.field === key)} value={String(draft.fields[key] ?? "")} disabled={disabled}
        onChange={event => field(key, event.target.value)} />}
    {fieldErrors(key)}
  </label>;

  const save = async () => {
    if (writing.current || !checked || !plan.canSave || referenceBusy || needsVerification) return;
    writing.current = true; setSaving(true); setError("");
    attemptedId.current = question.externalId;
    try {
      const ids = await saveQuestionBankDrafts(supabase, plan);
      await loadSavedQuestionBankDrafts(supabase, ids);
      onChanged(`Saved ${ids[0]} as an unpublished draft and verified it. Nothing was published.`);
      onClose();
    } catch (reason) {
      setNeedsVerification(true);
      onChanged("");
      setError(`Save could not be confirmed. Check save status before retrying. ${reason instanceof Error ? reason.message : String(reason)}`);
    } finally { writing.current = false; setSaving(false); }
  };

  // A failed response may follow a committed transaction. Never blindly submit the same question again.
  const verify = async () => {
    if (writing.current) return;
    writing.current = true; setSaving(true);
    try {
      const refs = await loadQuestionBankReferences(supabase);
      setReferences(refs);
      if (refs.existingExternalIds.has(attemptedId.current)) {
        onChanged("");
        setError("This external ID exists in the question bank. Close this form and inspect its saved draft before continuing; do not submit it again.");
      } else {
        setNeedsVerification(false);
        setError("No question with this external ID was found. Your inputs are retained; you can retry saving.");
      }
    } catch (reason) { setError(`Could not verify save status. Keep this form and retry the check. ${reason instanceof Error ? reason.message : String(reason)}`); }
    finally { writing.current = false; setSaving(false); }
  };

  return <>
    <Dialog open onOpenChange={open => { if (!open) close(); }}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto" onPointerDownOutside={event => event.preventDefault()}>
        <DialogHeader><DialogTitle>New question</DialogTitle>
          <DialogDescription>Uses the same fields and checks as XLSX import. Saves an unpublished draft pending review. After saving, only metadata can be edited.</DialogDescription></DialogHeader>
        <div className="space-y-5 text-sm">
          {referenceBusy && <p role="status">Loading canonical Topics, Skills and existing question IDs…</p>}
          {referenceError && <div role="alert"><p className="text-destructive">{referenceError}</p>
            <Button type="button" variant="outline" disabled={disabled || referenceBusy} onClick={() => setRetry(value => value + 1)}>Retry reference data</Button></div>}
          <fieldset disabled={disabled} className="space-y-3"><legend className="mb-2 font-semibold">Identity and source</legend>
            {input("external_id", "External ID")}
            {input("source_document", "Source PDF filename")}
            {input("source_question_number", "Printed question number")}
          </fieldset>
          <fieldset disabled={disabled} className="space-y-3"><legend className="mb-2 font-semibold">Content</legend>
            {input("stem", "Question stem", true)}{input("solution", "Solution", true)}
          </fieldset>
          <fieldset disabled={disabled} className="space-y-3"><legend className="mb-2 font-semibold">Options and correct answer (2–6)</legend>
            {draft.options.map((option, index) => <div key={option.key} className="space-y-2 rounded border p-3">
              <label className="flex items-center gap-2"><input type="radio" name="manual-correct-option" checked={draft.fields.correct_option_key === option.key}
                onChange={() => field("correct_option_key", option.key)} />Correct answer {option.key}</label>
              <label className="block">Option {option.key}<Textarea aria-label={`Option ${option.key}`} value={option.text}
                onChange={event => change({ ...draft, options: draft.options.map((item, i) => i === index ? { ...item, text: event.target.value } : item) })} /></label>
              <details><summary>Optional option evidence</summary>
                {(["explanation", "misconceptionCode"] as const).map(key => <label key={key} className="block">{key === "explanation" ? "Option explanation" : "Misconception code"}
                  <Input aria-label={`${option.key} ${key}`} value={option[key]} onChange={event => change({ ...draft,
                    options: draft.options.map((item, i) => i === index ? { ...item, [key]: event.target.value } : item) })} /></label>)}
              </details>
              <Button type="button" variant="outline" size="sm" disabled={draft.options.length <= 2} onClick={() => change({ ...draft,
                fields: { ...draft.fields, correct_option_key: draft.fields.correct_option_key === option.key ? "" : draft.fields.correct_option_key },
                options: draft.options.filter((_, i) => i !== index),
              })}>Remove option {option.key}</Button>
            </div>)}
            <Button type="button" variant="outline" disabled={draft.options.length >= 6} onClick={() => {
              const key = ["A", "B", "C", "D", "E", "F"].find(value => !draft.options.some(option => option.key === value))!;
              change({ ...draft, options: [...draft.options, { key, text: "", explanation: "", misconceptionCode: "" }].sort((a, b) => a.key.localeCompare(b.key)) });
            }}>Add option</Button>
            {fieldErrors("correct_option_key")}
          </fieldset>
          <QuestionBankMetadataFields question={question} references={references} disabled={disabled}
            onChange={(key, value) => field(key, value)} errors={fieldErrors}
            fieldHasError={key => checked && plan.issues.some(issue => issue.field === key)} />
          <fieldset disabled={disabled} className="space-y-3"><legend className="mb-2 font-semibold">Figure</legend>
            <label className="flex items-center gap-2"><input type="checkbox" checked={draft.fields.requires_figure === true}
              onChange={event => field("requires_figure", event.target.checked)} />Requires figure</label>
            {input("figure_reference", "Figure reference")}{input("image_url", "Image URL")}
          </fieldset>
          <details><summary>Optional source and review notes</summary><div className="space-y-3 pt-3">
            {input("source_transcription_notes", "Source transcription notes", true)}
            {input("ai_inference_notes", "AI inference notes", true)}{input("ai_flags", "AI flags (separated by |)")}
            {input("human_review_notes", "Human review notes", true)}
            <p>Review gates and human review status remain pending. No reviewer or review date is invented.</p>
          </div></details>
          {checked && <section aria-label="New question preview" className="space-y-3 rounded border p-3">
            <h3 className="font-semibold">Preview</h3><MarkdownWithMath content={question.stem} strictMath />
            {question.options.map(option => <div key={option.key}><span>{option.key}{option.isCorrect ? " · Correct" : ""}</span><MarkdownWithMath content={option.text} strictMath /></div>)}
            <h4>Solution</h4><MarkdownWithMath content={question.solution} strictMath />
            {question.imageUrl && /^https?:\/\/\S+$/i.test(question.imageUrl) && <img src={question.imageUrl} alt={question.figureReference || "Question figure"} className="max-w-full" />}
            {!!plan.batchReasons.length && <div role="alert"><h4>Resolve before saving</h4><ul className="list-disc pl-5">{plan.batchReasons.map((reason, index) => <li key={index}>{reason.replace(/Questions row 2 · |Options row \d+ · /g, "")}</li>)}</ul></div>}
          </section>}
          {error && <p role="alert" className="text-destructive">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={close}>Cancel</Button>
            {needsVerification ? <Button type="button" disabled={saving} onClick={() => void verify()}>Check save status</Button> : <>
              <Button type="button" variant="outline" disabled={saving} onClick={() => setChecked(true)}>Check preview</Button>
              <Button type="button" disabled={saving || referenceBusy || !checked || !plan.canSave} onClick={() => void save()}>{saving ? "Saving…" : "Save draft"}</Button>
            </>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
    <AlertDialog open={discard} onOpenChange={setDiscard}><AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>Discard unsaved question?</AlertDialogTitle><AlertDialogDescription>Your form will be discarded. This action does not change the database.</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel>Keep editing</AlertDialogCancel><AlertDialogAction onClick={onClose}>Discard form</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent></AlertDialog>
  </>;
}
