import { useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle, FileSpreadsheet, Loader2 } from "lucide-react";
import MarkdownWithMath from "@/components/MarkdownWithMath";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import {
  parseQuestionBankWorkbook, validateQuestionBankSheets, QUESTION_HEADERS, type WorkbookSheet,
} from "@/lib/questionBankImport";
import { buildQuestionBankImportPlan, type QuestionBankImportPlan } from "@/lib/questionBankImportPlan";
import { loadQuestionBankReferences } from "@/lib/questionBankReferences";
import { buildQuestionBankDraftSavePlan, getPublicationReviewTasks, isPublicationReviewIssue } from "@/lib/questionBankDraftSave";
import { DraftSaveResultError, loadSavedQuestionBankDrafts, saveQuestionBankDrafts, type SavedDraft } from "@/lib/questionBankDraftRepository";
import type { QuestionBankReferences } from "@/lib/questionBankImportPlan";
import { applyQuestionFieldEdit, getQuestionEditChanges, revertQuestionEdits, type EditableQuestionField } from "@/lib/questionBankPreviewEdits";

const FIELD_LABELS: Record<EditableQuestionField, string> = {
  difficulty: "难度", calculator_policy: "计算器政策", course_scope: "课程范围",
  representation_type: "表示方式", primary_topic_code: "CED Topic",
  practice_skill_codes: "Practice Skills", source_page: "PDF 物理页码", source_locator: "来源 locator",
};

const selectClassName = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

export function QuestionBankPreview() {
  const requestId = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false);
  const [fileName, setFileName] = useState("");
  const [originalSheets, setOriginalSheets] = useState<WorkbookSheet[] | null>(null);
  const [workingSheets, setWorkingSheets] = useState<WorkbookSheet[] | null>(null);
  const [references, setReferences] = useState<QuestionBankReferences | null>(null);
  const [savedDrafts, setSavedDrafts] = useState<SavedDraft[]>([]);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [fileError, setFileError] = useState("");
  const [referenceError, setReferenceError] = useState("");
  const [busy, setBusy] = useState(false);

  const report = useMemo(() => workingSheets ? validateQuestionBankSheets(workingSheets, references ? {
    topicCodes: new Set(references.topics.map((topic) => topic.topic_code)),
    practiceSkillCodes: new Set(references.skills.map((skill) => skill.skill_code)),
  } : undefined) : null, [workingSheets, references]);
  const plan: QuestionBankImportPlan | null = useMemo(() => report && references
    ? buildQuestionBankImportPlan(report, references) : null, [report, references]);
  const edits = useMemo(() => originalSheets && workingSheets
    ? getQuestionEditChanges(originalSheets, workingSheets) : [], [originalSheets, workingSheets]);
  const draftPlan = useMemo(() => report
    ? buildQuestionBankDraftSavePlan(report, references, edits) : null, [report, references, edits]);
  const questionsSheet = workingSheets?.find((sheet) => sheet.sheet === "Questions");
  const canEdit = Boolean(questionsSheet && QUESTION_HEADERS.every((header, index) => questionsSheet.data[0]?.[index] === header))
    && !saving && !saved;

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

  const handleFile = async (file: File | undefined) => {
    const currentRequest = ++requestId.current;
    setFileName(file?.name ?? "");
    setOriginalSheets(null);
    setWorkingSheets(null);
    setReferences(null);
    setFileError("");
    setReferenceError("");
    setSaveMessage("");
    setSaveError("");
    setSaved(false);
    setSavedDrafts([]);
    setBusy(false);
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setFileError("请选择 .xlsx 文件；未解析或上传此文件。");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setFileError("文件超过 10 MB，本地预览暂不处理；未上传此文件。");
      return;
    }
    setBusy(true);
    try {
      const parsed = await parseQuestionBankWorkbook(await file.arrayBuffer());
      if (currentRequest !== requestId.current) return;
      setOriginalSheets(parsed);
      setWorkingSheets(parsed);
      try {
        const references = await loadQuestionBankReferences(supabase);
        if (currentRequest !== requestId.current) return;
        setReferences(references);
      } catch (error) {
        if (currentRequest === requestId.current) {
          setReferenceError(error instanceof Error ? error.message : String(error));
        }
      }
    } catch (error) {
      if (currentRequest === requestId.current) {
        setFileError(`XLSX 无法读取：${error instanceof Error ? error.message : String(error)}`);
      }
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
    setSaveMessage("");
    setSaveError("");
    setSaved(false);
    setBusy(false);
  };

  const draftItemByRow = new Map(draftPlan?.items.map((item) => [item.row, item]));

  const confirmSave = async () => {
    if (savingRef.current || !draftPlan?.canSave || saved) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError("");
    setSaveMessage("");
    try {
      const ids = await saveQuestionBankDrafts(supabase, draftPlan);
      setSaved(true);
      try {
        setSavedDrafts(await loadSavedQuestionBankDrafts(supabase, ids));
        setSaveMessage(`已保存 ${ids.length} 题为未发布草稿；未自动批准或发布。`);
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : String(error));
      }
    } catch (error) {
      if (error instanceof DraftSaveResultError) {
        setSaved(true);
        setSaveError(error.message);
      } else {
        setSaveError(`保存未获确认：${error instanceof Error ? error.message : String(error)}。数据库拒绝会整批回滚；若是网络中断，请先核对题库，勿重复提交。`);
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const draftIssueCount = report?.issues.filter((issue) => issue.severity === "error" && !isPublicationReviewIssue(issue)).length ?? 0;
  const reviewPendingCount = report?.questions.filter((question) => getPublicationReviewTasks(question).length > 0).length ?? 0;
  const draftBlockingReasons = [...new Set([
    ...(draftPlan?.batchReasons ?? []),
    ...(draftPlan?.items.flatMap((item) => item.reasons) ?? []),
  ])];
  const planByRow = new Map(plan?.items.map((item) => [item.row, item]));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5" />题库 XLSX 校验与预览</CardTitle>
          <CardDescription>
            XLSX 在浏览器本地解析；页面修改仅作用于工作副本，不会改写原 XLSX。只有点击“确认保存为未发布”才发送最终预览值到当前 Supabase。即使表格标为 approved，保存后仍是未发布 draft，绝不自动批准或发布。答案仅管理员可见。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            ref={fileInputRef}
            aria-label="选择题库 XLSX 文件"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            disabled={saving}
            onChange={(event) => void handleFile(event.target.files?.[0])}
          />
          {fileName && <p className="text-sm text-muted-foreground">当前文件：{fileName}</p>}
          {busy && <p className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />正在处理…</p>}
          {fileError && <p role="alert" className="text-sm text-destructive">工作簿 · 第 1 行 · file：{fileError}</p>}
          {report && (
            <>
              <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <p>Questions：{report.questionRowCount} 行</p>
                <p>Options：{report.optionRowCount} 行</p>
                <p>草稿字段错误：{draftIssueCount} · 发布前待审核：{reviewPendingCount} 题</p>
                <p>Topic：{report.topicVerification === "verified" ? "已验证" : "未验证"} · Skill：{report.skillVerification === "verified" ? "已验证" : "未验证"}</p>
              </div>
              {draftBlockingReasons.length > 0 && (
                <p role="alert" className="text-sm font-medium text-destructive">当前工作副本不能保存为未发布草稿；下方列出具体阻断原因。仍可逐题预览与修正允许字段。</p>
              )}
              {plan ? (
                <p className="text-sm text-muted-foreground">已用当前管理员身份读取规范 Topic、Practice Skill 和全部现有 external_id；计划只反映此次只读快照。</p>
              ) : (
                <p className="text-sm text-amber-700 dark:text-amber-400">{referenceError ? `规范数据读取失败：${referenceError}` : "正在读取规范数据；在核对完成前不能视为可导入。"}</p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
      <div className="min-w-0 space-y-6">

      {report && (
        <Card>
          <CardHeader>
            <CardTitle>阻止保存未发布草稿</CardTitle>
            <CardDescription>只列出本次草稿保存的必要条件；pending 审核状态不属于保存错误。</CardDescription>
          </CardHeader>
          <CardContent>
            {draftBlockingReasons.length === 0 ? (
              <p className="flex items-center gap-2 text-sm"><CheckCircle className="h-4 w-4" />当前工作副本可保存为未发布草稿；保存不会完成审核或发布。</p>
            ) : (
              <div className="max-h-72 space-y-2 overflow-y-auto text-sm" role="list">
                {draftBlockingReasons.map((reason, index) => (
                  <p key={`${reason}-${index}`} role="listitem" className="flex gap-2 rounded border border-destructive/40 p-2 text-destructive">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{reason}
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {report && (
        <Card>
          <CardHeader>
            <CardTitle>正式发布前待审核</CardTitle>
            <CardDescription>这些事项不会被页面编辑自动标为 passed，也不会因保存草稿而消失。source_type 仍须在后续审核流程中核定。</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            <p>当前有 {report.questions.filter((question) => getPublicationReviewTasks(question).length > 0).length} 题仍有发布前待办；逐题卡列出审核关卡、AI flags 和其他具体事项。</p>
            <p className="mt-1 text-muted-foreground">本页不提供审核关卡编辑或发布操作；题干、选项、解析及复杂 LaTeX 错误须在 XLSX 修正后重新上传。</p>
          </CardContent>
        </Card>
      )}

      {report && report.issues.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>详细校验定位</CardTitle>
            <CardDescription>保留工作表、Excel 行号、字段和原因。审核事项与草稿字段错误分开标识。</CardDescription>
          </CardHeader>
          <CardContent className="max-h-72 space-y-2 overflow-y-auto text-sm" role="list">
            {report.issues.map((issue, index) => (
              <p key={`${issue.sheet}-${issue.row}-${issue.field}-${index}`} role="listitem" className="flex gap-2 rounded border p-2">
                <AlertCircle className={`mt-0.5 h-4 w-4 shrink-0 ${isPublicationReviewIssue(issue) ? "text-amber-600" : issue.severity === "error" ? "text-destructive" : "text-amber-600"}`} />
                <span><strong>{isPublicationReviewIssue(issue) ? "发布前待审" : issue.severity === "error" ? "草稿字段错误" : "待核验"}</strong> · {issue.sheet} · 第 {issue.row} 行 · {issue.field}：{issue.message}</span>
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      {report && (
        <Card>
          <CardHeader>
            <CardTitle>原正式导入计划（只读参考）</CardTitle>
            <CardDescription>该计划沿用原先的完整审核标准，不决定本页能否保存未发布草稿。pending 可以保存为草稿，但不能算正式候选。</CardDescription>
          </CardHeader>
          <CardContent>
            {plan ? (
              <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                <p>可导入候选：{plan.candidateCount} 题</p>
                <p>被阻断：{plan.blockedCount} 题</p>
                <p>预计 questions：{plan.questionCount} 行</p>
                <p>预计 question_versions：{plan.versionCount} 行</p>
                <p>预计 question_options：{plan.optionCount} 行</p>
                <p>预计 question_practice_skills：{plan.practiceSkillMappingCount} 行</p>
              </div>
            ) : (
              <p className="text-sm text-amber-700 dark:text-amber-400">真实规范数据和管理员可见 ID 尚未核对完成，不能生成可导入候选。</p>
            )}
          </CardContent>
        </Card>
      )}

      {report && <div className="max-h-[65vh] space-y-4 overflow-y-auto rounded-md border p-3" aria-label="题目滚动预览区">
      {report.questions.map((question) => {
        const planned = planByRow.get(question.row);
        const draftItem = draftItemByRow.get(question.row);
        const ownIssues = report.issues.filter((issue) => issue.questionExternalId === question.externalId.trim());
        const ownDraftReasons = [...new Set([
          ...(draftItem?.reasons ?? []),
          ...ownIssues.filter((issue) => issue.severity === "error" && !isPublicationReviewIssue(issue))
            .map((issue) => `${issue.sheet} 第 ${issue.row} 行 · ${issue.field}：${issue.message}`),
        ])];
        const reviewTasks = getPublicationReviewTasks(question);
        const ownEdits = edits.filter((edit) => edit.row === question.row);
        const knownSkillCodes = new Set(references?.skills.map((skill) => skill.skill_code) ?? []);
        const unknownSkills = question.practiceSkillCodes.filter((code) => !knownSkillCodes.has(code));
        return (
        <Card key={question.row}>
          <CardHeader>
            <CardTitle className="text-lg">{question.externalId || `Questions 第 ${question.row} 行`}</CardTitle>
            <CardDescription>
              草稿保存：{draftPlan?.canSave ? "本批次可保存" : ownDraftReasons.length ? "本题有阻断" : "本题字段已通过，批次仍有阻断"}
              {" · "}正式审核：{question.humanReviewStatus || "空"}，不会由本页自动通过
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {ownDraftReasons.length > 0 && <div role="alert" className="rounded border border-destructive/50 p-3 text-destructive">
              <p className="font-medium">本题草稿保存阻断</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">{ownDraftReasons.map((reason, index) => <li key={`${reason}-${index}`}>{reason}</li>)}</ul>
            </div>}
            <div className="rounded border border-amber-300 bg-amber-50 p-3 dark:bg-amber-950/20">
              <p className="font-medium">正式发布前待审核（不阻止存草稿）</p>
              {reviewTasks.length > 0 ? (
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {reviewTasks.map((task, index) => <li key={`${question.row}-review-${index}`}>{task}</li>)}
                </ul>
              ) : <p className="mt-1">XLSX 审核字段已填写；数据库草稿仍不会自动发布。</p>}
              {ownIssues.filter(isPublicationReviewIssue).map((issue, index) => (
                <p key={`${issue.field}-${index}`} className="mt-1">{issue.sheet} 第 {issue.row} 行 · {issue.field}：{issue.message}</p>
              ))}
            </div>
            <div>
              <p className="mb-1 font-medium">题干</p>
              <MarkdownWithMath content={question.stem} className="overflow-x-auto" strictMath />
            </div>
            <div className="space-y-2">
              <p className="font-medium">选项</p>
              {question.options.map((option) => (
                <div key={option.row} className={`flex gap-3 rounded border p-2 ${option.isCorrect ? "border-green-600 bg-green-50 dark:bg-green-950/30" : ""}`}>
                  <span className="w-6 shrink-0 font-semibold">{option.key || "?"}</span>
                  <div className="min-w-0 flex-1">
                    {option.isCorrect && <p className="mb-1 font-semibold text-green-700 dark:text-green-400">正确选项</p>}
                    <MarkdownWithMath content={option.text} className="overflow-x-auto" strictMath />
                    {option.explanation && <div className="mt-1 text-muted-foreground"><MarkdownWithMath content={option.explanation} className="overflow-x-auto" strictMath /></div>}
                  </div>
                </div>
              ))}
            </div>
            <div className="rounded border border-amber-300 bg-amber-50 p-3 dark:bg-amber-950/20">
              <p className="font-medium">管理员预览答案：{question.correctOptionKey || "未填"}</p>
              <p className="mt-2 font-medium">解析</p>
              <MarkdownWithMath content={question.solution} className="overflow-x-auto" strictMath />
            </div>
            <div className="grid gap-2 border-t pt-3 sm:grid-cols-2">
              <p>来源：{question.sourceDocument || "未填"} · PDF 物理页 {question.sourcePage || "未填"}</p>
              <p>{question.sourceQuestionNumber ? `来源印刷题号：${question.sourceQuestionNumber}` : `O2I locator：${question.sourceLocator || "未填"}（需人工验证）`}</p>
              <p>CED Topic：{question.primaryTopicCode || "未填"}（{planned?.primaryTopicId ? "已解析规范 UUID" : "代码未验证或不存在"}）</p>
              <p>Practice Skills：{question.practiceSkillCodes.join(" | ") || "未填"}（{planned && planned.practiceSkillIds.length === question.practiceSkillCodes.length && question.practiceSkillCodes.length > 0 ? "均已解析规范 UUID" : "代码未验证或不存在"}）</p>
              <p>难度：{question.difficulty || "未填"} · 范围：{question.courseScope || "未填"}</p>
              <p>表示方式：{question.representationType || "未填"} · 计算器：{question.calculatorPolicy || "未填"}</p>
              <p className="sm:col-span-2">AI flags：{question.aiFlags.join(" | ") || "无"}</p>
              <p className="sm:col-span-2">人工审核备注：{question.humanReviewNotes || "无"}</p>
              <p className="sm:col-span-2">四关卡：{Object.entries(question.reviewGates).map(([gate, value]) => `${gate}=${value || "空"}`).join(" · ")}</p>
            </div>
            <details className="rounded border p-3">
              <summary className="cursor-pointer font-medium">编辑此题的允许字段（仅浏览器工作副本）</summary>
              <p className="mt-2 text-muted-foreground">每次修改立即重新校验。题干、选项、解析及复杂 LaTeX 请回 XLSX 修正后重传；此处不能修改审核关卡或清除 AI flags。</p>
              {!canEdit && <p className="mt-2 text-amber-700 dark:text-amber-400">表头未通过、保存进行中或已保存时，不能继续编辑当前预览。</p>}
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="space-y-1">难度
                  <select aria-label={`${question.externalId} 难度`} className={selectClassName} value={question.difficulty} disabled={!canEdit}
                    onChange={(event) => editQuestion(question.row, "difficulty", event.target.value)}>
                    <option value="">未填写</option>
                    {!(["easy", "medium", "hard"].includes(question.difficulty) || !question.difficulty) && <option value={question.difficulty}>当前无效值：{question.difficulty}</option>}
                    <option value="easy">easy</option><option value="medium">medium</option><option value="hard">hard</option>
                  </select>
                </label>
                <label className="space-y-1">计算器政策
                  <select aria-label={`${question.externalId} 计算器政策`} className={selectClassName} value={question.calculatorPolicy} disabled={!canEdit}
                    onChange={(event) => editQuestion(question.row, "calculator_policy", event.target.value)}>
                    <option value="">未确定（草稿允许）</option>
                    {!(["no_calculator", "calculator_allowed", "calculator_required"].includes(question.calculatorPolicy) || !question.calculatorPolicy) && <option value={question.calculatorPolicy}>当前无效值：{question.calculatorPolicy}</option>}
                    <option value="no_calculator">no_calculator</option><option value="calculator_allowed">calculator_allowed</option><option value="calculator_required">calculator_required</option>
                  </select>
                </label>
                <label className="space-y-1">课程范围
                  <select aria-label={`${question.externalId} 课程范围`} className={selectClassName} value={question.courseScope} disabled={!canEdit}
                    onChange={(event) => editQuestion(question.row, "course_scope", event.target.value)}>
                    <option value="">未填写</option>
                    {!(["AB", "BC", "BOTH"].includes(question.courseScope) || !question.courseScope) && <option value={question.courseScope}>当前无效值：{question.courseScope}</option>}
                    <option value="AB">AB</option><option value="BC">BC</option><option value="BOTH">BOTH</option>
                  </select>
                </label>
                <label className="space-y-1">表示方式
                  <select aria-label={`${question.externalId} 表示方式`} className={selectClassName} value={question.representationType} disabled={!canEdit}
                    onChange={(event) => editQuestion(question.row, "representation_type", event.target.value)}>
                    <option value="">未填写</option>
                    {!(["analytical", "graphical", "numerical", "verbal", "mixed"].includes(question.representationType) || !question.representationType) && <option value={question.representationType}>当前无效值：{question.representationType}</option>}
                    <option value="analytical">analytical</option><option value="graphical">graphical</option><option value="numerical">numerical</option><option value="verbal">verbal</option><option value="mixed">mixed</option>
                  </select>
                </label>
                <label className="space-y-1">CED Topic（规范数据）
                  <select aria-label={`${question.externalId} CED Topic`} className={selectClassName} value={question.primaryTopicCode} disabled={!canEdit || !references}
                    onChange={(event) => editQuestion(question.row, "primary_topic_code", event.target.value)}>
                    <option value="">选择规范 Topic</option>
                    {question.primaryTopicCode && !references?.topics.some((topic) => topic.topic_code === question.primaryTopicCode) && <option value={question.primaryTopicCode}>当前未验证值：{question.primaryTopicCode}</option>}
                    {references?.topics.map((topic) => <option key={topic.id} value={topic.topic_code}>{topic.topic_code} · {topic.title}</option>)}
                  </select>
                </label>
                <label className="space-y-1">PDF 物理页码（跨页可写 12-13）
                  <Input aria-label={`${question.externalId} PDF 物理页码`} value={question.sourcePage} disabled={!canEdit}
                    onChange={(event) => editQuestion(question.row, "source_page", event.target.value)} />
                </label>
                <label className="space-y-1">来源 locator
                  <Input aria-label={`${question.externalId} 来源 locator`} value={question.sourceLocator} disabled={!canEdit}
                    onChange={(event) => editQuestion(question.row, "source_locator", event.target.value)} />
                </label>
                <fieldset className="space-y-1 rounded border p-2" disabled={!canEdit || !references}>
                  <legend>Practice Skills（规范数据，可多选）</legend>
                  <div className="max-h-40 space-y-1 overflow-y-auto">
                    {references?.skills.map((skill) => <label key={skill.id} className="flex items-start gap-2">
                      <input type="checkbox" checked={question.practiceSkillCodes.includes(skill.skill_code)}
                        onChange={(event) => {
                          const selected = event.target.checked
                            ? [...question.practiceSkillCodes, skill.skill_code]
                            : question.practiceSkillCodes.filter((code) => code !== skill.skill_code);
                          editQuestion(question.row, "practice_skill_codes", selected.join("|"));
                        }} />
                      <span>{skill.skill_code} · {skill.description}</span>
                    </label>)}
                  </div>
                  {unknownSkills.map((code) => <Button key={code} type="button" variant="outline" size="sm" className="mt-1" disabled={!canEdit}
                    onClick={() => editQuestion(question.row, "practice_skill_codes", question.practiceSkillCodes.filter((item) => item !== code).join("|"))}>
                    移除未验证 Skill：{code}
                  </Button>)}
                </fieldset>
              </div>
              <div className="mt-3 rounded bg-muted/50 p-2">
                <p className="font-medium">修改前后摘要：{ownEdits.length} 项</p>
                {ownEdits.length === 0 ? <p className="text-muted-foreground">本题尚未修改。</p> :
                  <ul className="mt-1 list-disc space-y-1 pl-5">{ownEdits.map((edit) => <li key={edit.field}>
                    {FIELD_LABELS[edit.field]}：{edit.before || "（空）"} → {edit.after || "（空）"}
                  </li>)}</ul>}
                <Button type="button" variant="outline" size="sm" className="mt-2" disabled={!canEdit || ownEdits.length === 0}
                  onClick={() => undoQuestion(question.row)}>撤销此题修改</Button>
              </div>
            </details>
            {question.requiresFigure && (
              <div className="border-t pt-3">
                <p>图形来源：{question.figureReference || "未填"}</p>
                {question.imageUrl ? <img src={question.imageUrl} alt={`题目 ${question.externalId} 的图形`} className="mt-2 max-h-96 max-w-full rounded border object-contain" /> : <p className="text-destructive">缺少图形 URL；不可导入。</p>}
              </div>
            )}
          </CardContent>
        </Card>
        );
      })}
      </div>}

      {report && <Card>
        <CardContent className="space-y-3 pt-6">
          <p className="text-sm">保存目标：questions 和 question_versions 均为 draft，current_version_id 为空；学生与访客不可读。</p>
          <p className="text-sm">工作副本修改：{edits.length} 项。确认时保存当前预览值及每项修改前后记录；原 XLSX 不会被改写。</p>
          {draftBlockingReasons.length > 0 ? <div role="alert" className="max-h-32 overflow-y-auto text-sm text-destructive">{draftBlockingReasons.map((reason, index) => <p key={index}>{reason}</p>)}</div> : null}
          {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
          {saveMessage && <p role="status" className="text-sm text-green-700 dark:text-green-400">{saveMessage}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" disabled={!canEdit || edits.length === 0} onClick={() => setWorkingSheets(originalSheets)}>撤销全部页面修改</Button>
            <Button variant="outline" disabled={saving} onClick={cancelPreview}>取消 / 关闭预览</Button>
            <Button disabled={!draftPlan?.canSave || saving || saved} onClick={() => void confirmSave()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}确认保存为未发布
            </Button>
          </div>
        </CardContent>
      </Card>}
      </div>

      <Card className="min-w-0 xl:sticky xl:top-4">
        <CardHeader>
          <CardTitle>本次保存的题目</CardTitle>
          <CardDescription>确认成功后从新题库 questions 和 question_versions 回读；旧 practice_problems 不变。</CardDescription>
        </CardHeader>
        <CardContent className="max-h-[65vh] space-y-3 overflow-y-auto text-sm">
          {savedDrafts.length === 0 ? <p className="text-muted-foreground">尚未保存任何题目。</p> : savedDrafts.map((item) => (
            <div key={item.id} className="rounded border p-3">
              <p className="font-semibold">{item.externalId}</p>
              <p className="truncate text-muted-foreground">{item.stem}</p>
              <p className="text-amber-700 dark:text-amber-400">未发布 · questions={item.questionStatus} · version={item.versionStatus}</p>
            </div>
          ))}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
