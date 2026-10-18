import type { WorkbookSheet } from "./questionBankImport.ts";

export const EDITABLE_QUESTION_FIELDS = [
  "difficulty", "calculator_policy", "course_scope", "representation_type",
  "primary_topic_code", "practice_skill_codes", "source_page", "source_locator",
] as const;

export type EditableQuestionField = typeof EDITABLE_QUESTION_FIELDS[number];

export const FIELD_LABELS: Record<EditableQuestionField, string> = {
  difficulty: "Difficulty", calculator_policy: "Calculator policy", course_scope: "Course scope",
  representation_type: "Representation", primary_topic_code: "CED Topic",
  practice_skill_codes: "Practice Skills", source_page: "Physical PDF page", source_locator: "Source locator",
};

export interface QuestionEditChange {
  row: number;
  field: EditableQuestionField;
  before: string;
  after: string;
}

const asText = (value: WorkbookSheet["data"][number][number]): string =>
  value == null ? "" : value instanceof Date ? value.toISOString() : String(value);

const questionsSheet = (sheets: readonly WorkbookSheet[]) =>
  sheets.find((sheet) => sheet.sheet === "Questions");

/** Changes only one Questions cell in a new in-memory sheet tree. The imported XLSX stays untouched. */
export function applyQuestionFieldEdit(
  sheets: readonly WorkbookSheet[], row: number, field: EditableQuestionField, value: string,
): WorkbookSheet[] {
  const source = questionsSheet(sheets);
  const column = source?.data[0]?.indexOf(field) ?? -1;
  if (!source || column < 0 || row < 2 || row > source.data.length) return [...sheets];
  return sheets.map((sheet) => sheet !== source ? sheet : {
    ...sheet,
    data: sheet.data.map((cells, index) => index !== row - 1 ? cells :
      cells.map((cell, cellIndex) => cellIndex === column ? value : cell)),
  });
}

/** Restore only the editable cells of one question from the original parsed workbook. */
export function revertQuestionEdits(
  original: readonly WorkbookSheet[], working: readonly WorkbookSheet[], row: number,
): WorkbookSheet[] {
  const originalRow = questionsSheet(original)?.data[row - 1];
  if (!originalRow) return [...working];
  const header = questionsSheet(original)?.data[0] ?? [];
  const editableColumns = new Set(EDITABLE_QUESTION_FIELDS.map((field) => header.indexOf(field)).filter((column) => column >= 0));
  return working.map((sheet) => sheet.sheet !== "Questions" ? sheet : {
    ...sheet,
    data: sheet.data.map((cells, index) => index !== row - 1 ? cells :
      cells.map((cell, column) => editableColumns.has(column) ? originalRow[column] : cell)),
  });
}

/** Field-level before/after evidence, keyed by the original Excel row number. */
export function getQuestionEditChanges(
  original: readonly WorkbookSheet[], working: readonly WorkbookSheet[],
): QuestionEditChange[] {
  const source = questionsSheet(original);
  const current = questionsSheet(working);
  if (!source || !current) return [];
  const changes: QuestionEditChange[] = [];
  for (let index = 1; index < Math.min(source.data.length, current.data.length); index += 1) {
    for (const field of EDITABLE_QUESTION_FIELDS) {
      const column = source.data[0]?.indexOf(field) ?? -1;
      if (column < 0) continue;
      const before = asText(source.data[index]?.[column]);
      const after = asText(current.data[index]?.[column]);
      if (before !== after) changes.push({ row: index + 1, field, before, after });
    }
  }
  return changes;
}
