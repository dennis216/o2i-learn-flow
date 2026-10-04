import readExcelFile from "read-excel-file/universal";
import { analyzeQuestionBankMath } from "./questionBankMath.ts";

export const QUESTION_HEADERS = [
  "external_id", "source_document", "source_page", "source_question_number", "source_locator",
  "stem", "solution", "correct_option_key", "difficulty", "course_scope", "primary_topic_code",
  "practice_skill_codes", "representation_type", "calculator_policy", "requires_figure",
  "figure_reference", "image_url", "source_transcription_notes", "ai_inference_notes", "ai_flags",
  "math_review_status", "source_rights_status", "taxonomy_review_status", "render_review_status",
  "human_review_status", "human_review_notes", "reviewed_by", "reviewed_at",
] as const;

export const OPTION_HEADERS = [
  "question_external_id", "option_key", "option_text", "is_correct", "misconception_code",
  "option_explanation",
] as const;

type Cell = string | number | boolean | Date | null | undefined;
export interface WorkbookSheet {
  sheet: string;
  data: Cell[][];
}

export interface ValidationIssue {
  severity: "error" | "warning" | "unverified";
  sheet: string;
  row: number;
  field: string;
  message: string;
  questionExternalId?: string;
}

export interface CanonicalTaxonomy {
  topicCodes?: ReadonlySet<string>;
  practiceSkillCodes?: ReadonlySet<string>;
}

export interface PreviewOption {
  row: number;
  key: string;
  text: string;
  isCorrect: boolean | null;
  misconceptionCode: string;
  explanation: string;
}

export interface PreviewQuestion {
  row: number;
  externalId: string;
  stem: string;
  solution: string;
  correctOptionKey: string;
  sourceDocument: string;
  sourcePage: string;
  sourceQuestionNumber: string;
  sourceLocator: string;
  primaryTopicCode: string;
  practiceSkillCodes: string[];
  difficulty: string;
  courseScope: string;
  representationType: string;
  calculatorPolicy: string;
  requiresFigure: boolean | null;
  figureReference: string;
  imageUrl: string;
  aiFlags: string[];
  humanReviewStatus: string;
  humanReviewNotes: string;
  reviewedBy: string;
  reviewedAt: string;
  reviewGates: Record<string, string>;
  options: PreviewOption[];
  readiness: "blocked" | "pending" | "unverified" | "candidate";
}

export interface QuestionBankReport {
  questions: PreviewQuestion[];
  issues: ValidationIssue[];
  questionRowCount: number;
  optionRowCount: number;
  topicVerification: "verified" | "unverified";
  skillVerification: "verified" | "unverified";
}

const REVIEW_GATES = [
  "math_review_status", "source_rights_status", "taxonomy_review_status", "render_review_status",
] as const;
const GATE_VALUES = new Set(["pending", "passed", "failed", "blocked"]);
const REVIEW_VALUES = new Set(["pending", "needs_correction", "blocked", "approved", "rejected"]);
const ENUMS: Record<string, ReadonlySet<string>> = {
  difficulty: new Set(["easy", "medium", "hard"]),
  course_scope: new Set(["AB", "BC", "BOTH"]),
  representation_type: new Set(["analytical", "graphical", "numerical", "verbal", "mixed"]),
  calculator_policy: new Set(["no_calculator", "calculator_allowed", "calculator_required"]),
};

type RecordRow = { row: number; cells: Record<string, Cell> };
const text = (value: Cell): string => value == null ? "" : value instanceof Date ? value.toISOString() : String(value);
const filled = (value: Cell): boolean => text(value).trim().length > 0;
const codeList = (value: Cell): string[] => text(value).split("|").map((part) => part.trim()).filter(Boolean);
const booleanValue = (value: Cell): boolean | null =>
  value === true || value === "TRUE" ? true : value === false || value === "FALSE" ? false : null;

export function isValidReviewTimestamp(value: string): boolean {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/);
  if (!match || Number.isNaN(Date.parse(value))) return false;
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    && hour < 24 && minute < 60 && second < 60;
}

function records(sheet: WorkbookSheet | undefined, headers: readonly string[], issues: ValidationIssue[]): RecordRow[] {
  if (!sheet) return [];
  const actual = (sheet.data[0] ?? []).map((cell) => text(cell));
  for (let index = 0; index < headers.length; index += 1) {
    if (actual[index] !== headers[index]) {
      issues.push({
        severity: "error", sheet: sheet.sheet, row: 1, field: headers[index],
        message: `表头第 ${index + 1} 列应为 ${headers[index]}，实际为 ${actual[index] || "空"}`,
      });
    }
  }
  for (let index = headers.length; index < actual.length; index += 1) {
    if (actual[index]) {
      issues.push({ severity: "error", sheet: sheet.sheet, row: 1, field: actual[index], message: "模板外的多余列" });
    }
  }
  const positions = new Map(actual.map((name, index) => [name, index]));
  return sheet.data.slice(1).flatMap((row, index) => {
    if (!row.some(filled)) return [];
    const cells: Record<string, Cell> = {};
    for (const header of headers) cells[header] = row[positions.get(header) ?? -1];
    return [{ row: index + 2, cells }];
  });
}

function addMathIssues(
  issues: ValidationIssue[], sheet: string, row: number, field: string, value: string, questionExternalId?: string,
) {
  for (const problem of analyzeQuestionBankMath(value).issues) {
    issues.push({
      severity: "error", sheet, row, field,
      message: `${problem.message}（字符位置 ${problem.offset + 1}）`, questionExternalId,
    });
  }
}

/** Read all sheets locally; the selected file is never uploaded. */
export async function parseQuestionBankWorkbook(bytes: ArrayBuffer): Promise<WorkbookSheet[]> {
  return await readExcelFile(bytes) as WorkbookSheet[];
}

/** Pure validation: it neither repairs cells nor writes to Supabase. */
export function validateQuestionBankSheets(
  sheets: readonly WorkbookSheet[], canonical: CanonicalTaxonomy = {},
): QuestionBankReport {
  const issues: ValidationIssue[] = [];
  const expectedNames = ["Questions", "Options", "Instructions"];
  const names = sheets.map((sheet) => sheet.sheet);
  if (sheets.length !== expectedNames.length) {
    issues.push({ severity: "error", sheet: "工作簿", row: 1, field: "sheet", message: `必须恰好三张工作表，当前 ${sheets.length} 张` });
  }
  for (const name of new Set(names)) {
    if (names.filter((item) => item === name).length > 1) {
      issues.push({ severity: "error", sheet: name, row: 1, field: "sheet", message: "工作表名称重复" });
    }
  }
  for (const name of expectedNames) {
    if (!names.includes(name)) {
      issues.push({ severity: "error", sheet: name, row: 1, field: "sheet", message: "缺少必需工作表" });
    }
  }
  for (const name of names) {
    if (!expectedNames.includes(name)) {
      issues.push({ severity: "error", sheet: name, row: 1, field: "sheet", message: "不允许的额外工作表" });
    }
  }
  const questionRows = records(sheets.find((sheet) => sheet.sheet === "Questions"), QUESTION_HEADERS, issues);
  const optionRows = records(sheets.find((sheet) => sheet.sheet === "Options"), OPTION_HEADERS, issues);
  const topicVerified = Boolean(canonical.topicCodes?.size);
  const skillVerified = Boolean(canonical.practiceSkillCodes?.size);
  const questions: PreviewQuestion[] = [];
  const byId = new Map<string, PreviewQuestion>();

  for (const record of questionRows) {
    const get = (field: string) => text(record.cells[field]);
    const id = get("external_id").trim();
    const status = get("human_review_status").trim();
    const issue = (field: string, message: string, severity: ValidationIssue["severity"] = "error") => {
      issues.push({ severity, sheet: "Questions", row: record.row, field, message, questionExternalId: id || undefined });
    };
    const required = (field: string, stage: "source" | "review" = "source") => {
      if (!filled(record.cells[field])) issue(field, "必填值缺失", stage === "review" && status !== "approved" ? "warning" : "error");
    };

    for (const field of ["external_id", "source_document", "source_page", "stem", "requires_figure", "human_review_status"]) required(field);
    for (const field of ["solution", "correct_option_key", "difficulty", "course_scope", "primary_topic_code", "practice_skill_codes", "representation_type", "calculator_policy"]) required(field, "review");
    for (const field of ["stem", "solution"]) {
      if (filled(record.cells[field]) && typeof record.cells[field] !== "string") issue(field, "内容必须是文本，不能用数字、日期或公式计算值代替");
    }
    if (id && byId.has(id)) issue("external_id", "external_id 重复，选项关联存在歧义");
    if (get("external_id") !== id) issue("external_id", "ID 首尾有空格；预览不会自动修改单元格");
    if (get("source_document") && !/\.pdf$/i.test(get("source_document").trim())) issue("source_document", "应填写原始 PDF 文件名（含 .pdf）");

    const pageText = get("source_page").trim();
    const pageMatch = pageText.match(/^(\d+)(?:-(\d+))?$/);
    const startPage = pageMatch ? Number(pageMatch[1]) : 0;
    const endPage = pageMatch?.[2] ? Number(pageMatch[2]) : startPage;
    if (pageText && (!pageMatch || startPage < 1 || endPage < startPage)) {
      issue("source_page", "必须是正整数 PDF 物理页码，跨页可写 12-13");
    }

    const locator = get("source_locator").trim();
    const printedNumber = get("source_question_number").trim();
    if (!printedNumber && !locator) issue("source_locator", "无印刷题号时需要独立的 source_locator；不能用 Excel 行号代替");
    if (locator) {
      const locatorMatch = locator.match(/^p(\d{3,})-item(\d{2,})$/);
      if (!locatorMatch) issue("source_locator", "格式应为 p012-item03，且必须由人工验证唯一性");
      else if (startPage && Number(locatorMatch[1]) !== startPage) issue("source_locator", "locator 的页码与 source_page 起始物理页不一致");
    }

    for (const [field, allowed] of Object.entries(ENUMS)) {
      const value = get(field).trim();
      if (value && !allowed.has(value)) issue(field, `无效受控值：${value}`);
    }
    if (status && !REVIEW_VALUES.has(status)) issue("human_review_status", `无效审核状态：${status}`);
    const gates: Record<string, string> = {};
    for (const field of REVIEW_GATES) {
      gates[field] = get(field).trim();
      if (!gates[field]) issue(field, "审核关卡状态缺失", status === "approved" ? "error" : "warning");
      else if (!GATE_VALUES.has(gates[field])) issue(field, `无效关卡状态：${gates[field]}`);
      if (status === "approved" && gates[field] !== "passed") issue(field, "最终批准要求四个关卡均为 passed");
    }
    if (status === "approved") {
      if (!filled(record.cells.reviewed_by)) issue("reviewed_by", "approved 必须有人工审核人");
      const reviewedAt = get("reviewed_at").trim();
      if (!isValidReviewTimestamp(reviewedAt)) issue("reviewed_at", "approved 必须有有效 ISO 8601 审核时间");
    }

    const flags = codeList(record.cells.ai_flags);
    if (status === "approved" && flags.some((flag) => flag !== "FIGURE_REQUIRED")) {
      issue("ai_flags", "仍有待人工处理的 AI 标记；不能仅凭 approved 单元格视为通过");
    }
    const requiresFigure = booleanValue(record.cells.requires_figure);
    if (filled(record.cells.requires_figure) && requiresFigure === null) issue("requires_figure", "必须为 TRUE 或 FALSE");
    if (requiresFigure) {
      if (!get("figure_reference").trim()) issue("figure_reference", "图形题必须定位来源图形");
      if (!get("image_url").trim()) issue("image_url", "图形题缺少稳定、已授权的图片 URL；不可导入");
    }
    const imageUrl = get("image_url").trim();
    if (imageUrl && !/^https?:\/\/\S+$/i.test(imageUrl)) issue("image_url", "必须是 HTTP(S) URL；可访问性和授权仍需人工核验");

    const topic = get("primary_topic_code").trim();
    if (topic && !/^\d+\.\d+$/.test(topic)) issue("primary_topic_code", "须使用 CED Topic 代码，如 1.6");
    if (topic && topicVerified && !canonical.topicCodes?.has(topic)) issue("primary_topic_code", `规范 Topic 中不存在 ${topic}`);
    if (topic && !topicVerified) issue("primary_topic_code", "未读取到规范 Topic 数据，代码未验证", "unverified");
    const skills = codeList(record.cells.practice_skill_codes);
    if (skills.length !== new Set(skills).size) issue("practice_skill_codes", "Practice Skill 代码重复");
    if (get("practice_skill_codes").includes("||") || get("practice_skill_codes").endsWith("|")) issue("practice_skill_codes", "代码列表有空项");
    for (const skill of skills) {
      if (!/^\d+\.[A-Z]$/.test(skill)) issue("practice_skill_codes", `无效 Skill 代码格式：${skill}`);
      else if (skillVerified && !canonical.practiceSkillCodes?.has(skill)) issue("practice_skill_codes", `规范 Skill 中不存在 ${skill}`);
    }
    if (skills.length && !skillVerified) issue("practice_skill_codes", "未读取到规范 Practice Skill 数据，代码未验证", "unverified");

    addMathIssues(issues, "Questions", record.row, "stem", get("stem"), id);
    addMathIssues(issues, "Questions", record.row, "solution", get("solution"), id);

    const question: PreviewQuestion = {
      row: record.row, externalId: get("external_id"), stem: get("stem"), solution: get("solution"),
      correctOptionKey: get("correct_option_key"), sourceDocument: get("source_document"),
      sourcePage: get("source_page"), sourceQuestionNumber: get("source_question_number"),
      sourceLocator: get("source_locator"), primaryTopicCode: topic, practiceSkillCodes: skills,
      difficulty: get("difficulty"), courseScope: get("course_scope"),
      representationType: get("representation_type"), calculatorPolicy: get("calculator_policy"),
      requiresFigure, figureReference: get("figure_reference"), imageUrl,
      aiFlags: flags, humanReviewStatus: status, humanReviewNotes: get("human_review_notes"),
      reviewedBy: get("reviewed_by").trim(), reviewedAt: get("reviewed_at").trim(),
      reviewGates: gates, options: [], readiness: "pending",
    };
    questions.push(question);
    if (id && !byId.has(id)) byId.set(id, question);
  }

  for (const record of optionRows) {
    const get = (field: string) => text(record.cells[field]);
    const questionId = get("question_external_id").trim();
    const key = get("option_key").trim();
    const issue = (field: string, message: string) => issues.push({
      severity: "error", sheet: "Options", row: record.row, field, message,
      questionExternalId: questionId || undefined,
    });
    for (const field of ["question_external_id", "option_key", "option_text", "is_correct"]) {
      if (!filled(record.cells[field])) issue(field, "必填值缺失");
    }
    if (filled(record.cells.option_text) && typeof record.cells.option_text !== "string") issue("option_text", "选项必须是文本");
    const correct = booleanValue(record.cells.is_correct);
    if (filled(record.cells.is_correct) && correct === null) issue("is_correct", "必须为 TRUE 或 FALSE");
    if (correct && get("misconception_code").trim()) issue("misconception_code", "正确选项不得映射 misconception");
    addMathIssues(issues, "Options", record.row, "option_text", get("option_text"), questionId);
    addMathIssues(issues, "Options", record.row, "option_explanation", get("option_explanation"), questionId);
    const question = byId.get(questionId);
    if (!question) {
      if (questionId) issue("question_external_id", "找不到关联的 Questions.external_id（孤儿选项）");
      continue;
    }
    if (question.options.some((option) => option.key === key) && key) issue("option_key", "同一题的 option_key 重复");
    question.options.push({
      row: record.row, key: get("option_key"), text: get("option_text"), isCorrect: correct,
      misconceptionCode: get("misconception_code"), explanation: get("option_explanation"),
    });
  }

  for (const question of questions) {
    const id = question.externalId.trim();
    const issue = (field: string, message: string) => issues.push({
      severity: "error", sheet: "Questions", row: question.row, field, message,
      questionExternalId: id || undefined,
    });
    if (question.options.length < 2 || question.options.length > 6) issue("external_id", `每题必须有 2–6 个选项，当前 ${question.options.length} 个`);
    const correctOptions = question.options.filter((option) => option.isCorrect === true);
    if (correctOptions.length !== 1) issue("correct_option_key", `必须恰好一个 TRUE 选项，当前 ${correctOptions.length} 个`);
    if (correctOptions.length === 1 && question.correctOptionKey.trim() !== correctOptions[0].key.trim()) {
      issue("correct_option_key", `与唯一正确选项 ${correctOptions[0].key} 不一致`);
    }
  }

  // Readiness must use the complete workbook result, including errors on orphan rows.
  const batchHasErrors = issues.some((item) => item.severity === "error");
  const workbookStructureHasErrors = issues.some((item) => item.severity === "error" && !item.questionExternalId);
  for (const question of questions) {
    const id = question.externalId.trim();
    const ownIssues = issues.filter((item) => item.questionExternalId === id);
    question.readiness = workbookStructureHasErrors || ownIssues.some((item) => item.severity === "error") ? "blocked"
      : question.humanReviewStatus !== "approved" ? "pending"
        : batchHasErrors ? "blocked"
          : ownIssues.some((item) => item.severity === "unverified") ? "unverified" : "candidate";
  }

  return {
    questions, issues, questionRowCount: questionRows.length, optionRowCount: optionRows.length,
    topicVerification: topicVerified ? "verified" : "unverified",
    skillVerification: skillVerified ? "verified" : "unverified",
  };
}
