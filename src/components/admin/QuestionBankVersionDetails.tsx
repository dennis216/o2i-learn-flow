import { useEffect, useState } from "react";
import MarkdownWithMath from "@/components/MarkdownWithMath";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { loadQuestionBankVersionPreview, type QuestionBankListItem, type QuestionBankVersionPreview } from "@/lib/questionBankDraftRepository";

/** Closed disclosures do not load every option/solution in a large publication plan. */
export function QuestionBankPreviewDisclosure({ item, defaultOpen = false }: { item: QuestionBankListItem; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return <details open={open} onToggle={event => setOpen(event.currentTarget.open)}><summary className="cursor-pointer">Question preview</summary>
    {open && <QuestionBankVersionDetails item={item} publication />}
  </details>;
}

export function QuestionBankVersionMetadata({ item }: { item: Pick<QuestionBankListItem, "difficulty" | "calculatorPolicy" | "courseScope" | "topicCode" | "topicTitle" | "practiceSkillCodes"> }) {
  return <dl aria-label="Saved question metadata" className="grid gap-2 rounded bg-muted/50 p-3 text-sm sm:grid-cols-2">
    <div><dt className="font-semibold">Difficulty</dt><dd>{item.difficulty}</dd></div>
    <div><dt className="font-semibold">Calculator policy</dt><dd>{item.calculatorPolicy?.replace(/_/g, " ") || "Not specified (optional)"}</dd></div>
    <div><dt className="font-semibold">AB/BC</dt><dd>{item.courseScope === "BOTH" ? "AB & BC" : item.courseScope}</dd></div>
    <div><dt className="font-semibold">Topic</dt><dd>{item.topicCode} · {item.topicTitle}</dd></div>
    <div className="sm:col-span-2"><dt className="font-semibold">Skills</dt><dd>{item.practiceSkillCodes.join(", ") || "None recorded"}</dd></div>
  </dl>;
}

export function QuestionBankVersionDetails({ item, publication = false }: { item: QuestionBankListItem; publication?: boolean }) {
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
      <details open={publication}><summary className="cursor-pointer font-semibold">Solution</summary><MarkdownWithMath content={preview.solution} className="mt-2 overflow-x-auto" strictMath /></details>
      {!publication && <QuestionBankVersionMetadata item={preview} />}
      <details className="space-y-1 break-words rounded bg-muted/50 p-3"><summary>Source details</summary>
        <p>Source: {preview.sourceDocument} · Physical PDF page: {preview.sourcePage}</p>
        <p>Printed question number: {preview.sourceQuestionNumber || "not recorded"} · Locator: {preview.sourceLocator || "not provided"}</p>
        {preview.sourceReference && <p>Source reference: {preview.sourceReference}</p>}
      </details>
      {!publication && <details><summary>Original import evidence</summary>
        <p>Historical source information; these flags do not determine whether saved fields are missing.</p>
        <pre className="whitespace-pre-wrap break-words text-xs">{JSON.stringify(preview.evidence, null, 2)}</pre>
      </details>}
      {preview.imageUrl ? <img src={preview.imageUrl} alt="Source question figure" className="max-h-96 max-w-full object-contain" />
        : preview.requiresFigure && <p className="text-amber-700">A required figure is missing.</p>}
    </>}
  </div>;
}
