import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
  'AP Stats': 'Stats',
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

export function CourseFilters({
  category,
  subject,
  onCategoryChange,
  onSubjectChange,
}: CourseFiltersProps) {
  const subjects = category === 'High School' ? HIGH_SCHOOL_SUBJECTS : CONTEST_SUBJECTS;

  const handleCategoryChange = (newCategory: string) => {
    const cat = newCategory as Category;
    onCategoryChange(cat);
    // Set to first subject of new category
    if (cat === 'High School') {
      onSubjectChange(HIGH_SCHOOL_SUBJECTS[0]);
    } else {
      onSubjectChange(CONTEST_SUBJECTS[0]);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top-level category tabs */}
      <Tabs value={category} onValueChange={handleCategoryChange} className="w-full">
        <TabsList className="grid w-full max-w-md mx-auto grid-cols-2 h-12">
          <TabsTrigger 
            value="High School" 
            className="text-base font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            High School
          </TabsTrigger>
          <TabsTrigger 
            value="Contest" 
            className="text-base font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            Contest
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Subject sub-filters */}
      <div className="flex flex-wrap justify-center gap-2">
        {subjects.map((subj) => (
          <Button
            key={subj}
            variant={subject === subj ? 'default' : 'outline'}
            size="sm"
            onClick={() => onSubjectChange(subj)}
            className={cn(
              'rounded-full transition-all',
              subject === subj && 'bg-primary text-primary-foreground shadow-md'
            )}
          >
            {SUBJECT_LABELS[subj] || subj}
          </Button>
        ))}
      </div>
    </div>
  );
}
