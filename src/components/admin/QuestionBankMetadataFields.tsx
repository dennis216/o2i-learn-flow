import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PreviewQuestion } from "@/lib/questionBankImport";
import type { QuestionBankReferences } from "@/lib/questionBankImportPlan";
import { FIELD_LABELS, type EditableQuestionField } from "@/lib/questionBankPreviewEdits";
const SELECT_VALUES = {
  difficulty: ["easy", "medium", "hard"],
  calculator_policy: ["no_calculator", "calculator_allowed", "calculator_required"],
  course_scope: ["AB", "BC", "BOTH"],
  representation_type: ["analytical", "graphical", "numerical", "verbal", "mixed"],
};
const selectClassName = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

/** The same bounded fields and canonical choices for XLSX work copies and saved drafts. */
export function QuestionBankMetadataFields({ question, references, disabled, onChange, errors, fieldHasError }: {
  question: PreviewQuestion; references: QuestionBankReferences | null; disabled: boolean;
  onChange: (field: EditableQuestionField, value: string) => void;
  errors: (field: string) => ReactNode; fieldHasError: (field: string) => boolean;
}) {
  const selectValues = { difficulty: question.difficulty, calculator_policy: question.calculatorPolicy,
    course_scope: question.courseScope, representation_type: question.representationType };
  const topicKnown = references?.topics.some(topic => topic.topic_code === question.primaryTopicCode);
  const knownSkills = new Set(references?.skills.map(skill => skill.skill_code));
  const unknownSkills = references ? question.practiceSkillCodes.filter(code => !knownSkills.has(code)) : [];
  return <div className="grid gap-3 sm:grid-cols-2">
    {(Object.keys(SELECT_VALUES) as (keyof typeof SELECT_VALUES)[]).map(field => <label key={field} className="space-y-1">{FIELD_LABELS[field]}
      <select aria-label={`${question.externalId} ${FIELD_LABELS[field]}`} aria-invalid={fieldHasError(field)} className={selectClassName}
        value={selectValues[field]} disabled={disabled} onChange={event => onChange(field, event.target.value)}>
        <option value="">{field === "calculator_policy" ? "Undecided (allowed for drafts)" : "Not provided"}</option>
        {selectValues[field] && !SELECT_VALUES[field].includes(selectValues[field]) && <option value={selectValues[field]}>Invalid value: {selectValues[field]}</option>}
        {SELECT_VALUES[field].map(value => <option key={value} value={value}>{value.replace(/_/g, " ")}</option>)}
      </select>{errors(field)}
    </label>)}
    <label className="space-y-1">CED Topic
      <select aria-label={`${question.externalId} CED Topic`} aria-invalid={fieldHasError("primary_topic_code")} className={selectClassName}
        value={question.primaryTopicCode} disabled={disabled || !references} onChange={event => onChange("primary_topic_code", event.target.value)}>
        <option value="">Choose a canonical Topic</option>
        {question.primaryTopicCode && !topicKnown && <option value={question.primaryTopicCode}>{references ? "Invalid code" : "Unverified code"}: {question.primaryTopicCode}</option>}
        {references?.topics.map(topic => <option key={topic.id} value={topic.topic_code}>{topic.topic_code} · {topic.title}</option>)}
      </select>{errors("primary_topic_code")}
    </label>
    <label className="space-y-1">Physical PDF page (ranges such as 12-13 allowed)
      <Input aria-label={`${question.externalId} Physical PDF page`} aria-invalid={fieldHasError("source_page")} value={question.sourcePage}
        disabled={disabled} onChange={event => onChange("source_page", event.target.value)} />{errors("source_page")}
    </label>
    <label className="space-y-1">Source locator
      <Input aria-label={`${question.externalId} Source locator`} aria-invalid={fieldHasError("source_locator")} value={question.sourceLocator}
        disabled={disabled} onChange={event => onChange("source_locator", event.target.value)} />{errors("source_locator")}
    </label>
    <fieldset className="space-y-2 rounded border p-2" disabled={disabled || !references}><legend>Practice Skills</legend>
      {references?.skills.map(skill => <label key={skill.id} className="flex items-start gap-2">
        <input type="checkbox" checked={question.practiceSkillCodes.includes(skill.skill_code)} onChange={event => onChange("practice_skill_codes",
          (event.target.checked ? [...question.practiceSkillCodes, skill.skill_code] : question.practiceSkillCodes.filter(code => code !== skill.skill_code)).join("|"))} />
        <span>{skill.skill_code} · {skill.description}</span>
      </label>)}
      {unknownSkills.map(code => <Button key={code} type="button" variant="outline" size="sm" disabled={disabled}
        onClick={() => onChange("practice_skill_codes", question.practiceSkillCodes.filter(item => item !== code).join("|"))}>Remove invalid Skill: {code}</Button>)}
      {!references && <p>Unverified. Canonical choices become available after reference data loads.</p>}
      {errors("practice_skill_codes")}
    </fieldset>
  </div>;
}
