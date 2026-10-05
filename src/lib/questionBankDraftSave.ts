import type { QuestionBankReport, PreviewQuestion } from "./questionBankImport.ts";
import type { QuestionBankReferences } from "./questionBankImportPlan.ts";

export interface DraftSaveItem {
  row: number;
  externalId: string;
  reasons: string[];
}

export interface DraftSavePlan {
  items: DraftSaveItem[];
  batchReasons: string[];
  payload: Record<string, unknown>[];
  canSave: boolean;
}

const requiredForStoredDraft: (keyof PreviewQuestion)[] = [
  "externalId", "stem", "solution", "sourceDocument", "sourcePage",
  "difficulty", "courseScope", "primaryTopicCode", "representationType",
];

/** Pure client-side gate. The database RPC repeats security and integrity checks. */
export function buildQuestionBankDraftSavePlan(
  report: QuestionBankReport,
  references: QuestionBankReferences | null,
): DraftSavePlan {
  const topicCodes = new Set(references?.topics.map((topic) => topic.topic_code) ?? []);
  const skillCodes = new Set(references?.skills.map((skill) => skill.skill_code) ?? []);
  const batchReasons = [
    ...(report.questions.length === 0 ? ["Questions 没有题目"] : []),
    ...(report.questions.length > 100 ? ["单次草稿保存最多 100 题；请先拆分工作簿"] : []),
    ...(references ? [] : ["尚未以管理员身份核对规范代码及现有 external_id"]),
    ...(report.topicVerification === "verified" && report.skillVerification === "verified"
      ? [] : ["Topic 或 Practice Skill 尚未核验"]),
    ...report.issues.filter((issue) => issue.severity === "error")
      .map((issue) => `${issue.sheet} 第 ${issue.row} 行 · ${issue.field}：${issue.message}`),
  ];

  const items = report.questions.map((question) => {
    const reasons = [
      ...requiredForStoredDraft.filter((field) => !String(question[field] ?? "").trim())
        .map((field) => `Questions 第 ${question.row} 行 · ${field}：保存草稿仍需填写`),
      ...(question.requiresFigure === null ? [`Questions 第 ${question.row} 行 · requires_figure：必须为 TRUE 或 FALSE`] : []),
      ...(question.sourceDocument !== question.sourceDocument.trim() ? [`Questions 第 ${question.row} 行 · source_document：文件名首尾有空格，请在 XLSX 中确认`] : []),
      ...(question.sourcePage !== question.sourcePage.trim() ? [`Questions 第 ${question.row} 行 · source_page：物理页码首尾有空格，请在 XLSX 中确认`] : []),
      ...(question.practiceSkillCodes.length === 0 ? [`Questions 第 ${question.row} 行 · practice_skill_codes：至少需要一个规范 Skill`] : []),
      ...(!topicCodes.has(question.primaryTopicCode) ? [`Questions 第 ${question.row} 行 · primary_topic_code：规范 Topic 未核验或不存在`] : []),
      ...question.practiceSkillCodes.filter((code) => !skillCodes.has(code))
        .map((code) => `Questions 第 ${question.row} 行 · practice_skill_codes：${code} 不存在`),
      ...(references?.existingExternalIds.has(question.externalId.trim())
        ? [`Questions 第 ${question.row} 行 · external_id：数据库中已经存在`] : []),
    ];
    return { row: question.row, externalId: question.externalId, reasons };
  });

  const canSave = batchReasons.length === 0 && items.every((item) => item.reasons.length === 0);
  return {
    items,
    batchReasons: [...new Set(batchReasons)],
    canSave,
    payload: canSave ? report.questions.map((question) => ({
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
        original_source_page: question.sourcePage,
        original_source_question_number: question.sourceQuestionNumber,
        original_source_locator: question.sourceLocator,
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
    })) : [],
  };
}
