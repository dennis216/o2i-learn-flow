import { useEffect, useState } from "react";
import MarkdownWithMath from "@/components/MarkdownWithMath";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { loadQuestionBankVersionPreview, type QuestionBankListItem, type QuestionBankVersionPreview } from "@/lib/questionBankDraftRepository";

/** Closed disclosures do not load every option/solution in a large publication plan. */
export function QuestionBankPreviewDisclosure({ item }: { item: QuestionBankListItem }) {
  const [open, setOpen] = useState(false);
  return <details onToggle={event => setOpen(event.currentTarget.open)}><summary className="cursor-pointer">Question preview and source</summary>
    {open && <QuestionBankVersionDetails item={item} />}
  </details>;
}

export function QuestionBankVersionDetails({ item }: { item: QuestionBankListItem }) {
  const [preview, setPreview] = useState<QuestionBankVersionPreview | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setBusy(true); setError(""); setPreview(null);
    void loadQuestionBankVersionPreview(supabase, item).then(value => { if (active) setPreview(value); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [item, retry]);
  return <div className="space-y-4 text-sm">
    {busy && <p role="status">Loading preview…</p>}
    {error && <div role="alert"><p>Could not load this preview. Check access and the connection, then retry.</p><Button type="button" variant="outline" onClick={() => setRetry(value => value + 1)}>Retry</Button>
      <details><summary>Technical details</summary><p className="break-words">{error}</p></details></div>}
    {preview && <>
      <MarkdownWithMath content={preview.stem} className="overflow-x-auto" strictMath />
      <div className="space-y-2" aria-label="Question options">{preview.options.map(option => <div key={option.id}
        className={`flex gap-3 rounded border p-3 ${option.is_correct ? "border-green-500 bg-green-50 dark:bg-green-950/20" : ""}`}>
        <span className="font-semibold">{option.option_key}.</span><div className="min-w-0 flex-1">
          <MarkdownWithMath content={option.option_text} className="overflow-x-auto" strictMath />
          {option.is_correct && <p className="mt-1 font-semibold text-green-700 dark:text-green-400">Correct answer</p>}
        </div></div>)}{!preview.options.length && <p>No options recorded.</p>}</div>
      <details><summary className="cursor-pointer font-semibold">Solution</summary><MarkdownWithMath content={preview.solution} className="mt-2 overflow-x-auto" strictMath /></details>
      <div className="space-y-1 break-words rounded bg-muted/50 p-3">
        <p>Source: {preview.sourceDocument} · Physical PDF page: {preview.sourcePage}</p>
        <p>Printed question number: {preview.sourceQuestionNumber || "not recorded"} · Locator: {preview.sourceLocator || "not provided"}</p>
        {preview.sourceReference && <p>Source reference: {preview.sourceReference}</p>}
        <p>CED {item.topicCode} · {item.topicTitle} · Practice Skills: {item.practiceSkillCodes.join(", ") || "none"}</p>
      </div>
      {preview.imageUrl ? <img src={preview.imageUrl} alt="Source question figure" className="max-h-96 max-w-full object-contain" />
        : preview.requiresFigure && <p className="text-amber-700">A required figure is missing.</p>}
    </>}
  </div>;
}
