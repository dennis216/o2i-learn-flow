import { useRef, useState } from "react";
import { AlertCircle, CheckCircle, FileSpreadsheet, Loader2 } from "lucide-react";
import MarkdownWithMath from "@/components/MarkdownWithMath";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import {
  parseQuestionBankWorkbook, validateQuestionBankSheets,
  type QuestionBankReport,
} from "@/lib/questionBankImport";
import { buildQuestionBankImportPlan, type QuestionBankImportPlan } from "@/lib/questionBankImportPlan";
import { loadQuestionBankReferences } from "@/lib/questionBankReferences";

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
  const [fileName, setFileName] = useState("");
  const [report, setReport] = useState<QuestionBankReport | null>(null);
  const [plan, setPlan] = useState<QuestionBankImportPlan | null>(null);
  const [fileError, setFileError] = useState("");
  const [referenceError, setReferenceError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleFile = async (file: File | undefined) => {
    const currentRequest = ++requestId.current;
    setFileName(file?.name ?? "");
    setReport(null);
    setPlan(null);
    setFileError("");
    setReferenceError("");
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

  const errorCount = report?.issues.filter((issue) => issue.severity === "error").length ?? 0;
  const warningCount = report?.issues.filter((issue) => issue.severity === "warning").length ?? 0;
  const planByRow = new Map(plan?.items.map((item) => [item.row, item]));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5" />题库 XLSX 校验与预览</CardTitle>
          <CardDescription>
            XLSX 只在浏览器本地读取；仅从当前 Supabase 读取规范代码与现有 ID，不上传题目、不写题库。此处显示答案，仅管理员可见。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            aria-label="选择题库 XLSX 文件"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
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

      {report && (
        <Card>
          <CardHeader>
            <CardTitle>校验结果</CardTitle>
            <CardDescription>每条问题保留工作表、Excel 行号、字段和原因；预览不会改动原始单元格。</CardDescription>
          </CardHeader>
          <CardContent>
            {report.issues.length === 0 ? (
              <p className="flex items-center gap-2 text-sm"><CheckCircle className="h-4 w-4" />未发现格式问题；仍需人工审核，Task 3B 导入尚未实现。</p>
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
            <CardTitle>只读导入计划</CardTitle>
            <CardDescription>这是导入计划，不会写入数据库；正式写入属于 Task 3B-B。</CardDescription>
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

      {report?.questions.map((question) => {
        const planned = planByRow.get(question.row);
        return (
        <Card key={question.row}>
          <CardHeader>
            <CardTitle className="text-lg">{question.externalId || `Questions 第 ${question.row} 行`}</CardTitle>
            <CardDescription>{planned ? PLAN_STATUS[planned.status] : READINESS[question.readiness]} · human_review_status={question.humanReviewStatus || "空"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
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
                <div key={option.row} className="flex gap-3 rounded border p-2">
                  <span className="w-6 shrink-0 font-semibold">{option.key || "?"}</span>
                  <div className="min-w-0 flex-1">
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
    </div>
  );
}
