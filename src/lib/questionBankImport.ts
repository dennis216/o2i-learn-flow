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
  category?: "publication_review";
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
  sourceTranscriptionNotes: string;
  aiInferenceNotes: string;
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
        message: `Header column ${index + 1} must be ${headers[index]}; found ${actual[index] || "blank"}`,
      });
    }
  }
  for (let index = headers.length; index < actual.length; index += 1) {
    if (actual[index]) {
      issues.push({ severity: "error", sheet: sheet.sheet, row: 1, field: actual[index], message: "Unexpected column outside the template" });
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
      message: `${problem.message} (character ${problem.offset + 1})`, questionExternalId,
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
    issues.push({ severity: "error", sheet: "Workbook", row: 1, field: "sheet", message: `Exactly three worksheets are required; found ${sheets.length}` });
  }
  for (const name of new Set(names)) {
    if (names.filter((item) => item === name).length > 1) {
      issues.push({ severity: "error", sheet: name, row: 1, field: "sheet", message: "Duplicate worksheet name" });
    }
  }
  for (const name of expectedNames) {
    if (!names.includes(name)) {
      issues.push({ severity: "error", sheet: name, row: 1, field: "sheet", message: "Required worksheet is missing" });
    }
  }
  for (const name of names) {
    if (!expectedNames.includes(name)) {
      issues.push({ severity: "error", sheet: name, row: 1, field: "sheet", message: "Unexpected worksheet" });
    }
  }
  const questionRows = records(sheets.find((sheet) => sheet.sheet === "Questions"), QUESTION_HEADERS, issues);
  const optionRows = records(sheets.find((sheet) => sheet.sheet === "Options"), OPTION_HEADERS, issues);
  const topicVerified = canonical.topicCodes !== undefined;
  const skillVerified = canonical.practiceSkillCodes !== undefined;
  const questions: PreviewQuestion[] = [];
  const byId = new Map<string, PreviewQuestion>();

  for (const record of questionRows) {
    const get = (field: string) => text(record.cells[field]);
    const id = get("external_id").trim();
    const status = get("human_review_status").trim();
    const issue = (field: string, message: string, severity: ValidationIssue["severity"] = "error", category?: ValidationIssue["category"]) => {
      issues.push({ severity, sheet: "Questions", row: record.row, field, message, questionExternalId: id || undefined, category });
    };
    const required = (field: string, stage: "source" | "review" = "source") => {
      if (!filled(record.cells[field])) issue(field, "Required value is missing", stage === "review" && status !== "approved" ? "warning" : "error",
        field === "calculator_policy" ? "publication_review" : undefined);
    };

    for (const field of ["external_id", "source_document", "source_page", "stem", "requires_figure", "human_review_status"]) required(field);
    for (const field of ["solution", "correct_option_key", "difficulty", "course_scope", "primary_topic_code", "practice_skill_codes", "representation_type", "calculator_policy"]) required(field, "review");
    for (const field of ["stem", "solution"]) {
      if (filled(record.cells[field]) && typeof record.cells[field] !== "string") issue(field, "Content must be text, not a number, date or computed formula value");
    }
    if (id && byId.has(id)) issue("external_id", "Duplicate external_id makes option associations ambiguous");
    if (get("external_id") !== id) issue("external_id", "ID has leading or trailing spaces; the preview does not repair cells");
    if (get("source_document") && !/\.pdf$/i.test(get("source_document").trim())) issue("source_document", "Enter the original PDF filename including .pdf");

    const pageText = get("source_page").trim();
    const pageMatch = pageText.match(/^(\d+)(?:-(\d+))?$/);
    const startPage = pageMatch ? Number(pageMatch[1]) : 0;
    const endPage = pageMatch?.[2] ? Number(pageMatch[2]) : startPage;
    if (pageText && (!pageMatch || startPage < 1 || endPage < startPage)) {
      issue("source_page", "Use positive physical PDF page numbers; a page range such as 12-13 is allowed");
    }

    const locator = get("source_locator").trim();
    const printedNumber = get("source_question_number").trim();
    if (!printedNumber && !locator) issue("source_locator", "An unnumbered source question needs a source_locator; do not use the Excel row number");
    if (locator) {
      const locatorMatch = locator.match(/^p(\d{3,})-item(\d{2,})$/);
      if (!locatorMatch) issue("source_locator", "Use a locator such as p012-item03; a human must verify that it is unique");
      else if (startPage && Number(locatorMatch[1]) !== startPage) issue("source_locator", "Locator page does not match the first physical source_page");
    }

    for (const [field, allowed] of Object.entries(ENUMS)) {
      const value = get(field).trim();
      if (value && !allowed.has(value)) issue(field, `Invalid controlled value: ${value}`);
    }
    if (status && !REVIEW_VALUES.has(status)) issue("human_review_status", `Invalid review status: ${status}`);
    const gates: Record<string, string> = {};
    for (const field of REVIEW_GATES) {
      gates[field] = get(field).trim();
      if (!gates[field]) issue(field, "Review gate status is missing", status === "approved" ? "error" : "warning", "publication_review");
      else if (!GATE_VALUES.has(gates[field])) issue(field, `Invalid review gate status: ${gates[field]}`);
      if (status === "approved" && gates[field] !== "passed") issue(field, "Publication requires all four review gates to be passed", "error", "publication_review");
    }
    if (status === "approved") {
      if (!filled(record.cells.reviewed_by)) issue("reviewed_by", "Approval requires a human reviewer", "error", "publication_review");
      const reviewedAt = get("reviewed_at").trim();
      if (!isValidReviewTimestamp(reviewedAt)) issue("reviewed_at", "Approval requires a valid ISO 8601 review timestamp", "error", "publication_review");
    }

    const flags = codeList(record.cells.ai_flags);
    if (status === "approved" && flags.some((flag) => flag !== "FIGURE_REQUIRED")) {
      issue("ai_flags", "AI flags still need human review; an approved cell alone is insufficient", "error", "publication_review");
    }
    const requiresFigure = booleanValue(record.cells.requires_figure);
    if (filled(record.cells.requires_figure) && requiresFigure === null) issue("requires_figure", "Must be TRUE or FALSE");
    if (requiresFigure) {
      if (!get("figure_reference").trim()) issue("figure_reference", "A figure-dependent question must identify its source figure");
      if (!get("image_url").trim()) issue("image_url", "A figure-dependent question needs a stable, authorized image URL");
    }
    const imageUrl = get("image_url").trim();
    if (imageUrl && !/^https?:\/\/\S+$/i.test(imageUrl)) issue("image_url", "Must be an HTTP(S) URL; availability and rights need human verification");

    const topic = get("primary_topic_code").trim();
    if (topic && !/^\d+\.\d+$/.test(topic)) issue("primary_topic_code", "Use a CED Topic code such as 1.6");
    if (topic && topicVerified && !canonical.topicCodes?.has(topic)) issue("primary_topic_code", `Topic code does not exist in the loaded reference data: ${topic}`);
    if (topic && !topicVerified) issue("primary_topic_code", "Topic code is unverified because reference data is unavailable", "unverified");
    const skills = codeList(record.cells.practice_skill_codes);
    if (skills.length !== new Set(skills).size) issue("practice_skill_codes", "Duplicate Practice Skill codes");
    if (get("practice_skill_codes").includes("||") || get("practice_skill_codes").endsWith("|")) issue("practice_skill_codes", "Code list contains an empty entry");
    for (const skill of skills) {
      if (!/^\d+\.[A-Z]$/.test(skill)) issue("practice_skill_codes", `Invalid Skill code format: ${skill}`);
      else if (skillVerified && !canonical.practiceSkillCodes?.has(skill)) issue("practice_skill_codes", `Skill code does not exist in the loaded reference data: ${skill}`);
    }
    if (skills.length && !skillVerified) issue("practice_skill_codes", "Practice Skill codes are unverified because reference data is unavailable", "unverified");

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
      sourceTranscriptionNotes: get("source_transcription_notes"),
      aiInferenceNotes: get("ai_inference_notes"),
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
      if (!filled(record.cells[field])) issue(field, "Required value is missing");
    }
    if (filled(record.cells.option_text) && typeof record.cells.option_text !== "string") issue("option_text", "Option content must be text");
    const correct = booleanValue(record.cells.is_correct);
    if (filled(record.cells.is_correct) && correct === null) issue("is_correct", "Must be TRUE or FALSE");
    if (correct && get("misconception_code").trim()) issue("misconception_code", "A correct option cannot have a misconception mapping");
    addMathIssues(issues, "Options", record.row, "option_text", get("option_text"), questionId);
    addMathIssues(issues, "Options", record.row, "option_explanation", get("option_explanation"), questionId);
    const question = byId.get(questionId);
    if (!question) {
      if (questionId) issue("question_external_id", "No matching Questions.external_id (orphan option)");
      continue;
    }
    if (question.options.some((option) => option.key === key) && key) issue("option_key", "Duplicate option_key within this question");
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
    if (question.options.length < 2 || question.options.length > 6) issue("external_id", `Each question needs 2–6 options; found ${question.options.length}`);
    const correctOptions = question.options.filter((option) => option.isCorrect === true);
    if (correctOptions.length !== 1) issue("correct_option_key", `Exactly one option must be TRUE; found ${correctOptions.length}`);
    if (correctOptions.length === 1 && question.correctOptionKey.trim() !== correctOptions[0].key.trim()) {
      issue("correct_option_key", `Does not match the only correct option: ${correctOptions[0].key}`);
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
