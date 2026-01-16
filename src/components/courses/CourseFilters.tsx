import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronRight } from 'lucide-react';

export type Category = 'High School' | 'Contest';

// Main subjects without SAT subsections (they are nested)
export const HIGH_SCHOOL_SUBJECTS = [
  'AP Calc',
  'AP Stats',
  'Pre-Calculus 12',
  'SAT',
  'SAT M1',
  'SAT M2',
  'Geo 1 (Intro)',
  'Geo 2 (Int)',
  'Alg 1 (Intro)',
  'Alg 2 (Int)',
  'Counting & Prob 1',
  'Counting & Prob 2',
] as const;

export const CONTEST_SUBJECTS = [
  'AMC 10',
  'AMC 12',
  'Euclid',
  'Fermat',
  'Cayley',
  'Pascal',
  'Gauss',
] as const;

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
  const [satExpanded, setSatExpanded] = useState(
    subject === 'SAT M1' || subject === 'SAT M2'
  );

  const handleCategoryChange = (newCategory: string) => {
    const cat = newCategory as Category;
    onCategoryChange(cat);
    // Set to first subject of new category
    if (cat === 'High School') {
      onSubjectChange('AP Calc');
    } else {
      onSubjectChange('AMC 10');
    }
    setSatExpanded(false);
  };

  const handleSubjectClick = (subj: string) => {
    if (subj === 'SAT') {
      // Toggle SAT expansion and select SAT M1 by default
      if (!satExpanded) {
        setSatExpanded(true);
        onSubjectChange('SAT M1');
      } else {
        setSatExpanded(false);
        onSubjectChange('SAT M1'); // Keep selection on M1
      }
    } else {
      onSubjectChange(subj as Subject);
      // Collapse SAT if selecting non-SAT subject
      if (subj !== 'SAT M1' && subj !== 'SAT M2') {
        setSatExpanded(false);
      }
    }
  };

  // Filter subjects for display - hide M1/M2 unless SAT is expanded
  const getDisplaySubjects = () => {
    if (category !== 'High School') {
      return CONTEST_SUBJECTS as unknown as string[];
    }
    
    return HIGH_SCHOOL_SUBJECTS.filter(subj => {
      if (subj === 'SAT M1' || subj === 'SAT M2') {
        return satExpanded;
      }
      return true;
    }) as unknown as string[];
  };

  const displaySubjects = getDisplaySubjects();

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
        {displaySubjects.map((subj) => {
          const isSATSubsection = subj === 'SAT M1' || subj === 'SAT M2';
          const isSATParent = subj === 'SAT';
          const isSelected = subject === subj || (isSATParent && (subject === 'SAT M1' || subject === 'SAT M2'));
          
          return (
            <Button
              key={subj}
              variant={isSelected ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleSubjectClick(subj)}
              className={cn(
                'rounded-full transition-all',
                isSelected && 'bg-primary text-primary-foreground shadow-md',
                isSATSubsection && 'ml-4 text-xs border-dashed'
              )}
            >
              {isSATParent && (
                satExpanded ? 
                  <ChevronDown className="h-3 w-3 mr-1" /> : 
                  <ChevronRight className="h-3 w-3 mr-1" />
              )}
              {isSATSubsection ? subj.replace('SAT ', '') : subj}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
