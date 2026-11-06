import { QUESTION_HEADERS, OPTION_HEADERS, type WorkbookSheet } from "./questionBankImport.ts";

export interface ManualQuestion {
  fields: Partial<Record<typeof QUESTION_HEADERS[number], string | boolean>>;
  options: { key: string; text: string; explanation: string; misconceptionCode: string }[];
}

export function emptyManualQuestion(): ManualQuestion {
  return {
    fields: { requires_figure: false },
    options: ["A", "B", "C", "D"].map(key => ({ key, text: "", explanation: "", misconceptionCode: "" })),
  };
}

/** Use the XLSX contract in memory, without creating a file or a second validation path. */
export function manualQuestionSheets(draft: ManualQuestion): WorkbookSheet[] {
  const fields = {
    ...draft.fields,
    human_review_status: "pending", reviewed_by: "", reviewed_at: "",
    math_review_status: "pending", source_rights_status: "pending",
    taxonomy_review_status: "pending", render_review_status: "pending",
  };
  return [
    { sheet: "Questions", data: [[...QUESTION_HEADERS], QUESTION_HEADERS.map(key => fields[key] ?? null)] },
    { sheet: "Options", data: [[...OPTION_HEADERS], ...draft.options.map(option => [
      fields.external_id ?? "", option.key, option.text, option.key === fields.correct_option_key,
      option.misconceptionCode, option.explanation,
    ])] },
    { sheet: "Instructions", data: [["Manual question work copy; not an uploaded workbook."]] },
  ];
}
