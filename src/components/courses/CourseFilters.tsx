import FilterChips from '@/components/FilterChips';
import { useLanguage } from '@/contexts/LanguageContext';

export type Category = 'High School' | 'Contest';

export const HIGH_SCHOOL_SUBJECTS = [
  'AP Calc',
  'AP Stats',
  'Pre-Calculus 12',
  'SAT',
] as const;

export const CONTEST_SUBJECTS = [
  'AMC 10',
  'AMC 12',
] as const;

const SUBJECT_LABELS: Record<string, string> = {
  'AP Calc': 'AP Calculus',
  'AP Stats': 'AP Stats',
  'Pre-Calculus 12': 'Precalc',
  SAT: 'SAT Math',
};

export type HighSchoolSubject = typeof HIGH_SCHOOL_SUBJECTS[number];
export type ContestSubject = typeof CONTEST_SUBJECTS[number];
export type Subject = HighSchoolSubject | ContestSubject | null;

interface CourseFiltersProps {
  category: Category;
  subject: Subject;
  onCategoryChange: (category: Category) => void;
  onSubjectChange: (subject: Subject) => void;
}

// One row for every subject; the category (High School / Contest) follows from the subject, so there is no second level to pick.
export function CourseFilters({ subject, onCategoryChange, onSubjectChange }: CourseFiltersProps) {
  const { t } = useLanguage();
  const options = [...HIGH_SCHOOL_SUBJECTS, ...CONTEST_SUBJECTS].map(value => ({ value, label: SUBJECT_LABELS[value] || value }));
  const choose = (value: Exclude<Subject, null> | null) => {
    if (!value) return;
    onCategoryChange((CONTEST_SUBJECTS as readonly string[]).includes(value) ? 'Contest' : 'High School');
    onSubjectChange(value);
  };
  return <FilterChips label={t('Subject', '科目')} options={options} value={subject} onChange={choose} />;
}
