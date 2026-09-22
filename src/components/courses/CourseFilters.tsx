import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type Category = 'High School' | 'Contest';

export const HIGH_SCHOOL_SUBJECTS = [
  'AP Calc',
  'Pre-Calculus 12',
] as const;

export const CONTEST_SUBJECTS = [] as const;

export type HighSchoolSubject = typeof HIGH_SCHOOL_SUBJECTS[number];
export type ContestSubject = string;
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
  const subjects: readonly string[] =
    category === 'High School' ? HIGH_SCHOOL_SUBJECTS : CONTEST_SUBJECTS;

  const handleCategoryChange = (newCategory: string) => {
    const cat = newCategory as Category;
    onCategoryChange(cat);
    // Set to first subject of new category
    onSubjectChange(cat === 'High School' ? HIGH_SCHOOL_SUBJECTS[0] : null);
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
            {subj}
          </Button>
        ))}
      </div>
    </div>
  );
}
