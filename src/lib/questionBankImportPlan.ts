import type { QuestionBankReport, ValidationIssue } from "./questionBankImport.ts";

export interface QuestionBankReferences {
  topics: readonly { id: string; topic_code: string; title: string }[];
  skills: readonly { id: string; skill_code: string; description: string }[];
  existingExternalIds: ReadonlySet<string>;
}

export type ImportPlanStatus =
  | "candidate"
  | "pending"
  | "canonical_blocked"
  | "duplicate_external_id"
  | "blocked";

export interface ImportPlanItem {
  row: number;
  externalId: string;
  status: ImportPlanStatus;
  reasons: string[];
  primaryTopicId: string | null;
  practiceSkillIds: string[];
}

export interface QuestionBankImportPlan {
  items: ImportPlanItem[];
  candidateCount: number;
  blockedCount: number;
  questionCount: number;
  versionCount: number;
  optionCount: number;
  practiceSkillMappingCount: number;
}

const describeIssue = (issue: ValidationIssue) =>
  `${issue.sheet} 第 ${issue.row} 行 · ${issue.field}：${issue.message}`;

/** A deterministic, read-only estimate. Database uniqueness must be rechecked by the later write workflow. */
export function buildQuestionBankImportPlan(
  report: QuestionBankReport,
  references: QuestionBankReferences,
): QuestionBankImportPlan {
  const topics = new Map(references.topics.map((topic) => [topic.topic_code, topic]));
  const skills = new Map(references.skills.map((skill) => [skill.skill_code, skill]));
  const questionIds = new Set(report.questions.map((question) => question.externalId.trim()).filter(Boolean));
  const batchErrors = report.issues.filter((issue) =>
    issue.severity === "error" && (!issue.questionExternalId || !questionIds.has(issue.questionExternalId)));

  const items = report.questions.map((question): ImportPlanItem => {
    const id = question.externalId.trim();
    const topic = topics.get(question.primaryTopicCode);
    const resolvedSkills = question.practiceSkillCodes.map((code) => skills.get(code));
    const missingSkills = question.practiceSkillCodes.filter((_, index) => !resolvedSkills[index]);
    const duplicate = Boolean(id && references.existingExternalIds.has(id));
    const canonicalBlocked = !topic || question.practiceSkillCodes.length === 0 || missingSkills.length > 0;
    const ownErrors = report.issues.filter((issue) =>
      issue.severity === "error" && issue.questionExternalId === id);
    const reasons = [
      ...batchErrors.map(describeIssue),
      ...ownErrors.map(describeIssue),
      ...(duplicate ? [`数据库已存在 external_id：${id}`] : []),
      ...(!topic ? [`primary_topic_code ${question.primaryTopicCode || "空"} 无法解析为规范 Topic UUID`] : []),
      ...(question.practiceSkillCodes.length === 0 ? ["practice_skill_codes 为空，无法解析规范 Skill UUID"] : []),
      ...missingSkills.map((code) => `practice_skill_codes ${code} 无法解析为规范 Skill UUID`),
      ...(question.humanReviewStatus !== "approved" ? [`human_review_status=${question.humanReviewStatus || "空"}，导入后仍需在 Publish 窗口确认`] : []),
    ];
    if (question.readiness === "blocked" && !ownErrors.length && !batchErrors.length) {
      reasons.push("题目未通过现有结构与内容校验");
    }
    if (question.readiness === "unverified") reasons.push("规范代码尚未验证");

    const status: ImportPlanStatus = duplicate ? "duplicate_external_id"
      : canonicalBlocked || question.readiness === "unverified" ? "canonical_blocked"
        : ownErrors.length || batchErrors.length || question.readiness === "blocked" ? "blocked"
          : question.humanReviewStatus === "pending" ? "pending"
            : reasons.length ? "blocked" : "candidate";

    return {
      row: question.row, externalId: question.externalId, status,
      reasons: [...new Set(reasons)], primaryTopicId: topic?.id ?? null,
      practiceSkillIds: resolvedSkills.flatMap((skill) => skill ? [skill.id] : []),
    };
  });

  const candidates = items.filter((item) => item.status === "candidate");
  const candidateRows = new Set(candidates.map((item) => item.row));
  return {
    items,
    candidateCount: candidates.length,
    blockedCount: items.length - candidates.length,
    questionCount: candidates.length,
    versionCount: candidates.length,
    optionCount: report.questions.filter((question) => candidateRows.has(question.row))
      .reduce((total, question) => total + question.options.length, 0),
    practiceSkillMappingCount: candidates.reduce((total, item) => total + item.practiceSkillIds.length, 0),
  };
}
