import { useRef, useState } from "react";
import { AlertCircle, CheckCircle, FileSpreadsheet, Loader2 } from "lucide-react";
import MarkdownWithMath from "@/components/MarkdownWithMath";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import {
  parseQuestionBankWorkbook, validateQuestionBankSheets,
  type QuestionBankReport,
} from "@/lib/questionBankImport";
import { buildQuestionBankImportPlan, type QuestionBankImportPlan } from "@/lib/questionBankImportPlan";
import { loadQuestionBankReferences } from "@/lib/questionBankReferences";
import { buildQuestionBankDraftSavePlan } from "@/lib/questionBankDraftSave";
import { DraftSaveResultError, loadSavedQuestionBankDrafts, saveQuestionBankDrafts, type SavedDraft } from "@/lib/questionBankDraftRepository";
import type { QuestionBankReferences } from "@/lib/questionBankImportPlan";

const READINESS: Record<string, string> = {
  blocked: "结构错误 / 不可导入",
  pending: "待人工审核 / 不可导入",
  unverified: "规范代码未验证 / 不可导入",
  candidate: "结构检查通过 / 仅供预览",
};
const PLAN_STATUS: Record<string, string> = {
  candidate: "可导入候选 / 仅供计划",
  pending: "待人工审核 / 不可导入",
  canonical_blocked: "规范代码未通过 / 不可导入",
  duplicate_external_id: "external_id 已存在 / 不可导入",
  blocked: "其他结构或内容阻断 / 不可导入",
};

export function QuestionBankPreview() {
  const requestId = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false);
  const [fileName, setFileName] = useState("");
  const [report, setReport] = useState<QuestionBankReport | null>(null);
  const [plan, setPlan] = useState<QuestionBankImportPlan | null>(null);
  const [references, setReferences] = useState<QuestionBankReferences | null>(null);
  const [savedDrafts, setSavedDrafts] = useState<SavedDraft[]>([]);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [fileError, setFileError] = useState("");
  const [referenceError, setReferenceError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleFile = async (file: File | undefined) => {
    const currentRequest = ++requestId.current;
    setFileName(file?.name ?? "");
    setReport(null);
    setPlan(null);
    setReferences(null);
    setFileError("");
    setReferenceError("");
    setSaveMessage("");
    setSaveError("");
    setSaved(false);
    setSavedDrafts([]);
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
      setReport(validateQuestionBankSheets(parsed));
      try {
        const references = await loadQuestionBankReferences(supabase);
        if (currentRequest !== requestId.current) return;
        const verifiedReport = validateQuestionBankSheets(parsed, {
          topicCodes: new Set(references.topics.map((topic) => topic.topic_code)),
          practiceSkillCodes: new Set(references.skills.map((skill) => skill.skill_code)),
        });
        setReport(verifiedReport);
        setPlan(buildQuestionBankImportPlan(verifiedReport, references));
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
    setReport(null);
    setPlan(null);
    setReferences(null);
    setFileError("");
    setReferenceError("");
    setSaveMessage("");
    setSaveError("");
    setSaved(false);
  };

  const draftPlan = report ? buildQuestionBankDraftSavePlan(report, references) : null;
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

  const errorCount = report?.issues.filter((issue) => issue.severity === "error").length ?? 0;
  const warningCount = report?.issues.filter((issue) => issue.severity === "warning").length ?? 0;
  const planByRow = new Map(plan?.items.map((item) => [item.row, item]));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5" />题库 XLSX 校验与预览</CardTitle>
          <CardDescription>
            XLSX 先在浏览器本地解析和预览；只有点击“确认保存为未发布”才发送题目数据到当前 Supabase。即使表格标为 approved，保存后仍是未发布 draft，绝不自动批准或发布。答案仅管理员可见。
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
                <p>错误：{errorCount} · 待补：{warningCount}</p>
                <p>Topic：{report.topicVerification === "verified" ? "已验证" : "未验证"} · Skill：{report.skillVerification === "verified" ? "已验证" : "未验证"}</p>
              </div>
              {errorCount > 0 && (
                <p role="alert" className="text-sm font-medium text-destructive">工作簿有结构错误，本批次不可导入；逐题卡仍可用于定位和预览。</p>
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
            <CardTitle>校验结果</CardTitle>
            <CardDescription>每条问题保留工作表、Excel 行号、字段和原因；预览不会改动原始单元格。</CardDescription>
          </CardHeader>
          <CardContent>
            {report.issues.length === 0 ? (
              <p className="flex items-center gap-2 text-sm"><CheckCircle className="h-4 w-4" />未发现格式错误；保存为草稿不会完成审核或发布。</p>
            ) : (
              <div className="max-h-72 space-y-2 overflow-y-auto" role="list">
                {report.issues.map((issue, index) => (
                  <p key={`${issue.sheet}-${issue.row}-${issue.field}-${index}`} role="listitem" className="flex gap-2 rounded border p-2 text-sm">
                    <AlertCircle className={`mt-0.5 h-4 w-4 shrink-0 ${issue.severity === "error" ? "text-destructive" : "text-amber-600"}`} />
                    <span><strong>{issue.severity === "error" ? "错误" : issue.severity === "warning" ? "待补" : "未验证"}</strong> · {issue.sheet} · 第 {issue.row} 行 · {issue.field}：{issue.message}</span>
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
            <CardTitle>原只读正式导入计划</CardTitle>
            <CardDescription>该计划衡量人工审核后的正式导入条件；本页确认操作只保存未发布草稿，pending 仍可保存。</CardDescription>
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
        return (
        <Card key={question.row}>
          <CardHeader>
            <CardTitle className="text-lg">{question.externalId || `Questions 第 ${question.row} 行`}</CardTitle>
            <CardDescription>{planned ? PLAN_STATUS[planned.status] : READINESS[question.readiness]} · human_review_status={question.humanReviewStatus || "空"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {draftItem?.reasons.length ? <div role="alert" className="rounded border border-destructive p-3 text-destructive">草稿保存阻断：{draftItem.reasons.join("；")}</div> : null}
            {ownIssues.length > 0 && <div className="space-y-1 rounded border p-3">
              <p className="font-medium">本题错误与提示</p>
              {ownIssues.map((issue, index) => <p key={`${issue.sheet}-${issue.row}-${issue.field}-${index}`} className={issue.severity === "error" ? "text-destructive" : "text-amber-700 dark:text-amber-400"}>
                {issue.severity === "error" ? "错误" : "提示"} · {issue.sheet} 第 {issue.row} 行 · {issue.field}：{issue.message}
              </p>)}
            </div>}
            {planned && planned.status !== "candidate" && (
              <div className="rounded border border-amber-300 bg-amber-50 p-3 dark:bg-amber-950/20">
                <p className="font-medium">此题未进入可导入候选，原因：</p>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {planned.reasons.map((reason, index) => <li key={`${question.row}-${index}`}>{reason}</li>)}
                </ul>
              </div>
            )}
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
          {draftPlan?.batchReasons.length ? <div role="alert" className="max-h-32 overflow-y-auto text-sm text-destructive">{draftPlan.batchReasons.map((reason, index) => <p key={index}>{reason}</p>)}</div> : null}
          {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
          {saveMessage && <p role="status" className="text-sm text-green-700 dark:text-green-400">{saveMessage}</p>}
          <div className="flex flex-wrap justify-end gap-2">
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
