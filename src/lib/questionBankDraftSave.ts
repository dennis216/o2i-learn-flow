import type { QuestionBankReport, PreviewQuestion, ValidationIssue } from "./questionBankImport.ts";
import type { QuestionBankReferences } from "./questionBankImportPlan.ts";
import type { QuestionEditChange } from "./questionBankPreviewEdits.ts";

export interface DraftSaveItem {
  row: number;
  externalId: string;
  reasons: string[];
}

export interface DraftSavePlan {
  items: DraftSaveItem[];
  issues: ValidationIssue[];
  batchReasons: string[];
  payload: Record<string, unknown>[];
  canSave: boolean;
}

const requiredForStoredDraft: (keyof PreviewQuestion)[] = [
  "externalId", "stem", "solution", "sourceDocument", "sourcePage",
  "difficulty", "courseScope", "primaryTopicCode", "representationType",
];

/** Editorial approval metadata is evidence, not a prerequisite for storing an unpublished draft. */
export function isPublicationReviewIssue(issue: ValidationIssue): boolean {
  return issue.category === "publication_review";
}

export const describeQuestionBankIssue = (issue: ValidationIssue): string =>
  `${issue.sheet} row ${issue.row} · ${issue.field}: ${issue.message}`;

export function getPublicationReviewTasks(): string[] {
  return ["Before publishing, check the content, correct answer, display and Topic/Skills, then confirm once in the Publish window."];
}

/** Pure client-side gate. The database RPC repeats security and integrity checks. */
export function buildQuestionBankDraftSavePlan(
  report: QuestionBankReport,
  references: QuestionBankReferences | null,
  edits: readonly QuestionEditChange[] = [],
): DraftSavePlan {
  const topicCodes = new Set(references?.topics.map((topic) => topic.topic_code) ?? []);
  const skillCodes = new Set(references?.skills.map((skill) => skill.skill_code) ?? []);
  const issues = report.issues.filter((issue) => issue.severity === "error" && !isPublicationReviewIssue(issue));
  const addIssue = (question: PreviewQuestion, field: string, message: string) => {
    if (!issues.some((issue) => issue.sheet === "Questions" && issue.row === question.row && issue.field === field)) {
      issues.push({ severity: "error", sheet: "Questions", row: question.row, field, message, questionExternalId: question.externalId.trim() });
    }
  };
  const storedFields: Partial<Record<keyof PreviewQuestion, string>> = {
    externalId: "external_id", sourceDocument: "source_document", sourcePage: "source_page",
    courseScope: "course_scope", primaryTopicCode: "primary_topic_code", representationType: "representation_type",
  };
  for (const question of report.questions) {
    for (const field of requiredForStoredDraft) {
      if (!String(question[field] ?? "").trim()) addIssue(question, storedFields[field] ?? field, "Required to save a draft");
    }
    if (question.requiresFigure === null) addIssue(question, "requires_figure", "Must be TRUE or FALSE");
    if (question.sourceDocument !== question.sourceDocument.trim()) addIssue(question, "source_document", "Filename has leading or trailing spaces; check the XLSX");
    if (question.sourcePage !== question.sourcePage.trim()) addIssue(question, "source_page", "Physical page has leading or trailing spaces; check the XLSX");
    if (!question.practiceSkillCodes.length) addIssue(question, "practice_skill_codes", "At least one canonical Practice Skill is required");
    // Unavailable references are a single batch-level problem, never evidence that codes do not exist.
    if (references) {
      if (!topicCodes.has(question.primaryTopicCode)) addIssue(question, "primary_topic_code", `Topic code does not exist in the loaded reference data: ${question.primaryTopicCode}`);
      for (const code of question.practiceSkillCodes.filter((code) => !skillCodes.has(code))) {
        addIssue(question, "practice_skill_codes", `Skill code does not exist in the loaded reference data: ${code}`);
      }
      if (references.existingExternalIds.has(question.externalId.trim())) addIssue(question, "external_id", "external_id already exists in the database");
    }
  }
  const batchReasons = [
    ...(report.questions.length === 0 ? ["Questions contains no questions"] : []),
    ...(report.questions.length > 100 ? ["Save at most 100 drafts at a time; split the workbook first"] : []),
    ...(!references || report.topicVerification !== "verified" || report.skillVerification !== "verified"
      ? ["Reference data is unverified; saving is disabled"] : []),
    ...issues.map(describeQuestionBankIssue),
  ];
  const items = report.questions.map((question) => ({
    row: question.row, externalId: question.externalId,
    reasons: issues.filter((issue) => issue.sheet === "Questions" ? issue.row === question.row : issue.questionExternalId === question.externalId.trim())
      .map(describeQuestionBankIssue),
  }));

  const canSave = batchReasons.length === 0;
  return {
    items,
    issues,
    batchReasons: [...new Set(batchReasons)],
    canSave,
    payload: canSave ? report.questions.map((question) => {
      const manualEdits = edits.filter((edit) => edit.row === question.row);
      const originalValue = (field: QuestionEditChange["field"], current: string) =>
        manualEdits.find((edit) => edit.field === field)?.before ?? current;
      return {
        external_id: question.externalId,
        correct_option_key: question.correctOptionKey,
        stem: question.stem,
        solution: question.solution,
        difficulty: question.difficulty,
        course_scope: question.courseScope,
        primary_topic_code: question.primaryTopicCode,
        practice_skill_codes: question.practiceSkillCodes,
        representation_type: question.representationType,
        calculator_policy: question.calculatorPolicy || null,
        source_document: question.sourceDocument,
        source_page: question.sourcePage,
        source_question_number: question.sourceQuestionNumber || null,
        source_locator: question.sourceLocator || null,
        requires_figure: question.requiresFigure,
        image_url: question.imageUrl || null,
        import_evidence: {
          original_source_page: originalValue("source_page", question.sourcePage),
          original_source_question_number: question.sourceQuestionNumber,
          original_source_locator: originalValue("source_locator", question.sourceLocator),
          manual_edits: manualEdits,
          correct_option_key: question.correctOptionKey,
          figure_reference: question.figureReference,
          source_transcription_notes: question.sourceTranscriptionNotes,
          ai_inference_notes: question.aiInferenceNotes,
          ai_flags: question.aiFlags,
          human_review_status: question.humanReviewStatus,
          human_review_notes: question.humanReviewNotes,
          reviewed_by_text: question.reviewedBy,
          reviewed_at_text: question.reviewedAt,
          review_gates: question.reviewGates,
        },
        options: question.options.map((option) => ({
          option_key: option.key,
          option_text: option.text,
          is_correct: option.isCorrect,
          import_evidence: {
            misconception_code: option.misconceptionCode,
            option_explanation: option.explanation,
          },
        })),
      };
    }) : [],
  };
}
