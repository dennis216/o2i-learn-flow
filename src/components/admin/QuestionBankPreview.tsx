import { useMemo, useRef, useState } from "react";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import MarkdownWithMath from "@/components/MarkdownWithMath";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { parseQuestionBankWorkbook, validateQuestionBankSheets, hasQuestionBankHeaders, type WorkbookSheet } from "@/lib/questionBankImport";
import { loadQuestionBankReferences } from "@/lib/questionBankReferences";
import { buildQuestionBankDraftSavePlan, describeQuestionBankIssue, getPublicationReviewTasks, isPublicationReviewIssue } from "@/lib/questionBankDraftSave";
import { DraftSaveResultError, loadSavedQuestionBankDrafts, saveQuestionBankDrafts } from "@/lib/questionBankDraftRepository";
import { QuestionBankLibrary } from "./QuestionBankLibrary";
import { QuestionBankManualEntry } from "./QuestionBankManualEntry";
import { QuestionBankMetadataFields } from "./QuestionBankMetadataFields";
import type { QuestionBankReferences } from "@/lib/questionBankImportPlan";
import { FIELD_LABELS, applyQuestionFieldEdit, getQuestionEditChanges, revertQuestionEdits, type EditableQuestionField } from "@/lib/questionBankPreviewEdits";

export function QuestionBankPreview() {
  const requestId = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false);
  const [fileName, setFileName] = useState("");
  const [originalSheets, setOriginalSheets] = useState<WorkbookSheet[] | null>(null);
  const [workingSheets, setWorkingSheets] = useState<WorkbookSheet[] | null>(null);
  const [references, setReferences] = useState<QuestionBankReferences | null>(null);
  const [referenceBusy, setReferenceBusy] = useState(false);
  const [referenceError, setReferenceError] = useState("");
  const [libraryRefresh, setLibraryRefresh] = useState(0);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [fileError, setFileError] = useState("");
  const [busy, setBusy] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualMessage, setManualMessage] = useState("");

  const report = useMemo(() => workingSheets ? validateQuestionBankSheets(workingSheets, references ? {
    topicCodes: new Set(references.topics.map((topic) => topic.topic_code)),
    practiceSkillCodes: new Set(references.skills.map((skill) => skill.skill_code)),
  } : undefined) : null, [workingSheets, references]);
  const edits = useMemo(() => originalSheets && workingSheets
    ? getQuestionEditChanges(originalSheets, workingSheets) : [], [originalSheets, workingSheets]);
  const draftPlan = useMemo(() => report
    ? buildQuestionBankDraftSavePlan(report, references, edits) : null, [report, references, edits]);
  const questionsSheet = workingSheets?.find((sheet) => sheet.sheet === "Questions");
  const canEdit = Boolean(questionsSheet && hasQuestionBankHeaders(questionsSheet.data[0] ?? []))
    && !saving && !saved;
  const blockers = draftPlan?.issues ?? [];
  const questionIds = new Set(report?.questions.map((question) => question.externalId.trim()));
  const batchIssues = blockers.filter((issue) => issue.row === 1 || !issue.questionExternalId || !questionIds.has(issue.questionExternalId));

  const editQuestion = (row: number, field: EditableQuestionField, value: string) => {
    if (!canEdit) return;
    setWorkingSheets((current) => current ? applyQuestionFieldEdit(current, row, field, value) : current);
    setSaveError("");
  };
  const undoQuestion = (row: number) => {
    if (!canEdit || !originalSheets) return;
    setWorkingSheets((current) => current ? revertQuestionEdits(originalSheets, current, row) : current);
    setSaveError("");
  };

  // Retry only reloads read-only references. Never reset the workbook or its manual edits here.
  const refreshReferences = async (currentRequest = requestId.current) => {
    setReferenceBusy(true);
    setReferenceError("");
    try {
      const loaded = await loadQuestionBankReferences(supabase);
      if (currentRequest === requestId.current) setReferences(loaded);
    } catch (error) {
      if (currentRequest === requestId.current) {
        setReferences(null);
        setReferenceError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (currentRequest === requestId.current) setReferenceBusy(false);
    }
  };

  const handleFile = async (file: File | undefined) => {
    if (savingRef.current) return;
    const currentRequest = ++requestId.current;
    setFileName(file?.name ?? "");
    setOriginalSheets(null);
    setWorkingSheets(null);
    setReferences(null);
    setReferenceError("");
    setReferenceBusy(false);
    setFileError("");
    setSaveMessage("");
    setSaveError("");
    setSaved(false);
    setBusy(false);
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setFileError("Choose an .xlsx file. This file has not been uploaded.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setFileError("The file exceeds the 10 MB preview limit. This file has not been uploaded.");
      return;
    }
    setBusy(true);
    try {
      const parsed = await parseQuestionBankWorkbook(await file.arrayBuffer());
      if (currentRequest !== requestId.current) return;
      setOriginalSheets(parsed);
      setWorkingSheets(parsed);
      await refreshReferences(currentRequest);
    } catch (error) {
      if (currentRequest === requestId.current) setFileError(`Could not read XLSX: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (currentRequest === requestId.current) setBusy(false);
    }
  };

  const cancelPreview = () => {
    if (savingRef.current) return;
    requestId.current += 1;
    if (fileInputRef.current) fileInputRef.current.value = "";
    setFileName("");
    setOriginalSheets(null);
    setWorkingSheets(null);
    setReferences(null);
    setFileError("");
    setReferenceError("");
    setReferenceBusy(false);
    setSaveMessage("");
    setSaveError("");
    setSaved(false);
    setBusy(false);
  };

  const confirmSave = async () => {
    if (savingRef.current || !draftPlan?.canSave || referenceBusy || saved) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError("");
    setSaveMessage("");
    try {
      const ids = await saveQuestionBankDrafts(supabase, draftPlan);
      setSaved(true);
      setLibraryRefresh(value => value + 1);
      try {
        await loadSavedQuestionBankDrafts(supabase, ids);
        setSaveMessage(`Saved ${ids.length} unpublished drafts. Nothing was approved or published.`);
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : String(error));
      }
    } catch (error) {
      if (error instanceof DraftSaveResultError) {
        setSaved(true);
        setLibraryRefresh(value => value + 1);
        setSaveError(error.message);
      } else {
        setSaveError(`Save could not be confirmed: ${error instanceof Error ? error.message : String(error)}. Database rejection rolls back the entire batch. After a network interruption, check the question bank before submitting again.`);
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 pb-40" aria-label="Question bank">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Create one question or import XLSX. Both save to the same question bank.</p>
        <Button type="button" disabled={saving} onClick={() => { setManualMessage(""); setManualOpen(true); }}>New question</Button>
      </div>
      {manualMessage && <p role="status" className="text-sm text-green-700">{manualMessage}</p>}
      {manualOpen && <QuestionBankManualEntry onClose={() => setManualOpen(false)} onChanged={message => {
        setManualMessage(message); setLibraryRefresh(value => value + 1);
      }} />}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5" />Import XLSX</CardTitle>
          <CardDescription>Import XLSX → Preview &amp; adjust → Save drafts. Edits affect this browser work copy only; the original XLSX stays unchanged.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input ref={fileInputRef} aria-label="Choose question bank XLSX" type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={saving}
            onChange={(event) => void handleFile(event.target.files?.[0])} />
          {fileName && <p className="break-all text-sm text-muted-foreground">File: {fileName}</p>}
          {busy && !report && <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Reading workbook…</p>}
          {fileError && <p role="alert" className="text-sm text-destructive">{fileError}</p>}
          {report && <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <span>Questions: {report.questionRowCount}</span><span>Options: {report.optionRowCount}</span>
            <span>Reference data: {references ? "verified" : "unverified"}</span>
          </div>}
          {report && !references && <div role={referenceError ? "alert" : "status"} className="rounded border border-amber-300 bg-amber-50 p-3 text-sm dark:bg-amber-950/20">
            <p className="font-medium">{referenceError ? "Reference data could not be verified. You can preview and adjust this workbook, but saving is disabled." : "Reference data is unverified. Loading…"}</p>
            {referenceError && <>
              <Button type="button" variant="outline" size="sm" className="mt-2" disabled={referenceBusy} onClick={() => void refreshReferences()}>
                {referenceBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Retry
              </Button>
              <details className="mt-2"><summary className="cursor-pointer">Technical details</summary><p className="mt-1 break-words">{referenceError}</p></details>
            </>}
          </div>}
          {report && (blockers.length > 0 || !report.questions.length || report.questions.length > 100) && <div role="alert" className="rounded border border-destructive/50 p-3 text-sm">
            <p className="font-medium text-destructive">{blockers.length} field issue(s) block draft saving.</p>
            {!report.questions.length && <p>Questions contains no questions.</p>}
            {report.questions.length > 100 && <p>Save at most 100 drafts at a time; split the workbook first.</p>}
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {blockers.filter((issue) => !batchIssues.includes(issue)).slice(0, 6).map((issue) => <a key={blockers.indexOf(issue)} className="underline" href={`#issue-${blockers.indexOf(issue)}`}>
                {issue.sheet} row {issue.row} · {issue.field}
              </a>)}
            </div>
            {batchIssues.map((issue, index) => <p key={index} id={`issue-${blockers.indexOf(issue)}`} className="mt-1 text-destructive">{describeQuestionBankIssue(issue)}</p>)}
          </div>}
        </CardContent>
      </Card>

      {report && <section className="space-y-5" aria-label="Preview and adjust">
        {report.questions.map((question) => {
          const ownEdits = edits.filter((edit) => edit.row === question.row);
          const ownIssues = blockers.filter((issue) => issue.sheet === "Questions" ? issue.row === question.row : issue.questionExternalId === question.externalId.trim());
          const editableErrors = ownIssues.some((issue) => issue.sheet === "Questions" && issue.field in FIELD_LABELS);
          const errors = (field: string, sheet = "Questions", row = question.row) => ownIssues.filter((issue) => issue.field === field && issue.sheet === sheet && issue.row === row).map((issue) => (
            <p key={blockers.indexOf(issue)} id={`issue-${blockers.indexOf(issue)}`} className="scroll-mt-20 text-sm text-destructive">{describeQuestionBankIssue(issue)}</p>
          ));
          const fieldHasError = (field: string) => ownIssues.some((issue) => issue.sheet === "Questions" && issue.field === field);
          const topicKnown = references?.topics.some((topic) => topic.topic_code === question.primaryTopicCode);
          const knownSkillCodes = new Set(references?.skills.map((skill) => skill.skill_code));
          const unknownSkills = references ? question.practiceSkillCodes.filter((code) => !knownSkillCodes.has(code)) : [];
          return <Card key={question.row} id={`question-${question.row}`}>
            <CardHeader className="pb-3">
              <CardTitle className="break-all text-base">{question.externalId || `Questions row ${question.row}`}</CardTitle>
              {errors("external_id")}
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div><MarkdownWithMath content={question.stem} className="overflow-x-auto" strictMath />{errors("stem")}</div>
              <div className="space-y-2" aria-label={`${question.externalId} options`}>
                {question.options.map((option) => <div key={option.row} className={`flex gap-3 rounded border p-3 ${option.isCorrect ? "border-green-600 bg-green-50 dark:bg-green-950/30" : ""}`}>
                  <span className="w-5 shrink-0 font-semibold">{option.key || "?"}</span>
                  <div className="min-w-0 flex-1">
                    {option.isCorrect && <p className="mb-1 font-semibold text-green-700 dark:text-green-400">Correct answer</p>}
                    <MarkdownWithMath content={option.text} className="overflow-x-auto" strictMath />
                    {["question_external_id", "option_key", "option_text", "is_correct", "misconception_code", "option_explanation"].map((field) => <div key={field}>{errors(field, "Options", option.row)}</div>)}
                  </div>
                </div>)}
                <p className="text-muted-foreground">Answer key: {question.correctOptionKey || "not provided"} · Administrator preview only</p>
                {errors("correct_option_key")}
              </div>
              {question.requiresFigure && <div className="space-y-1">
                <p>Figure source: {question.figureReference || "not provided"}</p>
                {errors("figure_reference")}{errors("image_url")}
                {question.imageUrl && <img src={question.imageUrl} alt={`Source figure for ${question.externalId}`} className="max-h-96 max-w-full rounded border object-contain" />}
              </div>}
              {errors("requires_figure")}
              {!question.requiresFigure && <>{errors("image_url")}{errors("figure_reference")}</>}
              <details open={fieldHasError("solution") || undefined} className="rounded border p-3">
                <summary className="cursor-pointer font-medium">Solution</summary>
                <div className="mt-3"><MarkdownWithMath content={question.solution} className="overflow-x-auto" strictMath />{errors("solution")}</div>
                {question.options.filter((option) => option.explanation).map((option) => <div key={option.row} className="mt-3">
                  <p className="font-medium">Option {option.key} explanation</p><MarkdownWithMath content={option.explanation} className="overflow-x-auto" strictMath />
                </div>)}
              </details>
              <div className="grid gap-2 border-t pt-3 sm:grid-cols-2">
                <div><p>Source: {question.sourceDocument || "not provided"} · Physical PDF page: {question.sourcePage || "not provided"}</p>{errors("source_document")}</div>
                <div><p>{question.sourceQuestionNumber ? `Printed question number: ${question.sourceQuestionNumber}` : `Source locator: ${question.sourceLocator || "not provided"}`}</p>{errors("source_question_number")}</div>
                <p>CED Topic: {question.primaryTopicCode || "not provided"} · {references ? topicKnown ? "verified" : "invalid" : "unverified"}</p>
                <p>Practice Skills: {question.practiceSkillCodes.join(" | ") || "not provided"} · {references ? question.practiceSkillCodes.length && !unknownSkills.length ? "verified" : "invalid" : "unverified"}</p>
                <p>Difficulty: {question.difficulty || "not provided"} · Course: {question.courseScope || "not provided"}</p>
                <p>Representation: {question.representationType || "not provided"} · Calculator: {question.calculatorPolicy || "undecided"}</p>
              </div>
              <details open={editableErrors || undefined} className="rounded border p-3">
                <summary className="cursor-pointer font-medium">Adjust metadata</summary>
                <p className="mt-2 text-muted-foreground">Changes are revalidated immediately. Correct stems, options, solutions and complex LaTeX in the XLSX, then upload it again.</p>
                <div className="mt-3"><QuestionBankMetadataFields question={question} references={references} disabled={!canEdit}
                  showSourceLocator={Boolean(questionsSheet?.data[0]?.includes("source_locator"))}
                  onChange={(field, value) => editQuestion(question.row, field, value)} errors={errors} fieldHasError={fieldHasError} /></div>
                <div className="mt-3 space-y-1 rounded bg-muted/50 p-2">
                  <p className="font-medium">Changes: {ownEdits.length}</p>
                  {ownEdits.length ? ownEdits.map((edit) => <p key={edit.field}>{FIELD_LABELS[edit.field]}: {edit.before || "(blank)"} → {edit.after || "(blank)"}</p>) : <p>No changes to this question.</p>}
                  <Button type="button" variant="outline" size="sm" disabled={!canEdit || !ownEdits.length} onClick={() => undoQuestion(question.row)}>Undo question changes</Button>
                </div>
              </details>
              <details open={ownIssues.some((issue) => issue.field.endsWith("_status")) || undefined} className="rounded border p-3">
                <summary className="cursor-pointer font-medium">Review details</summary>
                <div className="mt-3 space-y-2 break-words">
                  <p>Pending review does not block a valid draft. Saving never approves review gates or clears AI flags.</p>
                  <p>Human review status: {question.humanReviewStatus || "not provided"}</p>{errors("human_review_status")}
                  <p>AI flags: {question.aiFlags.join(" | ") || "none"}</p>
                  <p>Human review notes: {question.humanReviewNotes || "none"}</p>
                  <p>Source transcription notes: {question.sourceTranscriptionNotes || "none"}</p>
                  <p>AI inference notes: {question.aiInferenceNotes || "none"}</p>
                  <p>Reviewer: {question.reviewedBy || "not provided"} · Reviewed at: {question.reviewedAt || "not provided"}</p>
                  {Object.entries(question.reviewGates).map(([gate, value]) => <div key={gate}><p>{gate}: {value || "not provided"}</p>{errors(gate)}</div>)}
                  <p className="font-medium">Before publication</p>
                  <ul className="list-disc space-y-1 pl-5">{getPublicationReviewTasks().map((task) => <li key={task}>{task}</li>)}</ul>
                  {report.issues.filter((issue) => issue.questionExternalId === question.externalId.trim() && isPublicationReviewIssue(issue)).map((issue, index) => <p key={index}>{describeQuestionBankIssue(issue)}</p>)}
                  {question.options.some((option) => option.misconceptionCode) && <p>Option misconception evidence: {question.options.filter((option) => option.misconceptionCode).map((option) => `${option.key}: ${option.misconceptionCode}`).join(" · ")}</p>}
                </div>
              </details>
            </CardContent>
          </Card>;
        })}
      </section>}

      <QuestionBankLibrary refreshKey={libraryRefresh} />

      {report && <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-4 py-3 shadow-lg" aria-label="Draft save actions">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 text-sm">
            <p>{edits.length} manual change(s) · Saves unpublished drafts only</p>
            {saveError && <p role="alert" className="max-w-3xl text-destructive">{saveError}</p>}
            {saveMessage && <p role="status" className="text-green-700 dark:text-green-400">{saveMessage}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={!canEdit || !edits.length} onClick={() => setWorkingSheets(originalSheets)}>Undo all changes</Button>
            <Button variant="outline" disabled={saving} onClick={cancelPreview}>Cancel</Button>
            <Button disabled={!draftPlan?.canSave || referenceBusy || saving || saved} onClick={() => void confirmSave()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save {report.questions.length} drafts
            </Button>
          </div>
        </div>
      </div>}
    </div>
  );
}
