import { ArrowRight } from 'lucide-react';
import { Course } from './types';
import { useLanguage } from '@/contexts/LanguageContext';

export const LEVEL_ZH: Record<string, string> = { beginner: '入门', intermediate: '中级', advanced: '高级' };

// Same colours as the homepage feature tiles; cards cycle through them so neighbours differ.
const TONES = [
  'from-[hsl(var(--education-blue))] to-[hsl(212_90%_52%)] text-white',
  'from-[hsl(var(--education-teal))] to-[hsl(168_70%_40%)] text-white',
  'from-[hsl(var(--education-orange))] to-[hsl(32_95%_55%)] text-amber-950',
];

interface CourseCardProps {
  course: Course;
  index: number;
  onSelect: (course: Course) => void;
}

export function CourseCard({ course, index, onSelect }: CourseCardProps) {
  const { t } = useLanguage();
  // "AP Calculus AB" -> "AB"; titles without a short code show the subject instead.
  const mark = course.title.match(/\s([A-Z0-9]{2,3})$/)?.[1] ?? course.subject;

  return (
    <article className="group relative rounded-2xl p-3 transition-colors hover:bg-muted/60">
      <div aria-hidden="true" className={`relative h-40 overflow-hidden rounded-xl bg-gradient-to-br ${TONES[index % TONES.length]}`}>
        <div className="absolute inset-0 [background-image:linear-gradient(currentColor_1px,transparent_1px),linear-gradient(90deg,currentColor_1px,transparent_1px)] [background-size:20px_20px] opacity-10" />
        <svg viewBox="0 0 200 120" fill="none" stroke="currentColor" className="absolute -right-2 bottom-0 h-32 w-52 opacity-40 transition-transform duration-300 motion-safe:group-hover:-translate-y-1">
          <path d="M8 112C70 110 120 92 150 50S186 8 196 6" strokeWidth="3" strokeLinecap="round" />
        </svg>
        <span className="absolute left-5 top-4 text-sm font-semibold opacity-80">{course.subject}</span>
        <span className="absolute bottom-3 left-5 text-6xl font-bold tracking-tight">{mark}</span>
      </div>
      <div className="px-2 pb-2 pt-4">
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          <button
            type="button"
            onClick={() => onSelect(course)}
            className="text-left after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
          >
            {course.title}
          </button>
        </h2>
        <p className="mt-2 line-clamp-2 text-muted-foreground">{course.description}</p>
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="font-medium text-muted-foreground">{course.price === 0 ? t('Free', '免费') : `$${course.price}`}</span>
          <span className="flex items-center gap-1 font-semibold text-primary">
            {t('Open course', '打开课程')}
            <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform motion-safe:group-hover:translate-x-1" />
          </span>
        </div>
      </div>
    </article>
  );
}
