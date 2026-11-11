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

// Tile art in a 240×140 box: a wavy f with Riemann rectangles (integral) and a tangent line (derivative, flat at the minimum).
const f = (t: number) => 0.3 + 0.45 * t + 0.18 * Math.sin(2 * Math.PI * t);
const df = (t: number) => 0.45 + 0.36 * Math.PI * Math.cos(2 * Math.PI * t);
const X = (t: number) => 12 + 220 * t;
const Y = (t: number) => 128 - 100 * f(t);
const CURVE = 'M' + Array.from({ length: 41 }, (_, i) => `${X(i / 40).toFixed(1)} ${Y(i / 40).toFixed(1)}`).join('L');
const RECTS = [0.06, 0.16, 0.26, 0.36, 0.46].map(t => ({ x: X(t), y: Y(t + 0.05), w: X(0.1) - X(0), h: 128 - Y(t + 0.05) }));
const T0 = 0.685, DX = 26, DY = (DX / 220) * 100 * df(T0);
const TANGENT = { x1: X(T0) - DX, y1: Y(T0) + DY, x2: X(T0) + DX, y2: Y(T0) - DY };

// BC art (Unit 10, BC only): sin x and its Taylor polynomials T3, T5 peeling away from it.
const plot = (g: (x: number) => number) => 'M' + Array.from({ length: 61 }, (_, i) => { const x = -3.6 + 0.12 * i; return `${(120 + 32 * x).toFixed(1)} ${(70 - 36 * g(x)).toFixed(1)}`; }).join('L');
const SINE = plot(Math.sin);
const TAYLOR = [3, 5].map(n => plot(x => [1, 3, 5].filter(k => k <= n).reduce((s, k) => s + (k % 4 === 1 ? 1 : -1) * x ** k / [1, 1, 2, 6, 24, 120][k], 0)));

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
        <svg viewBox="0 0 240 140" fill="none" stroke="currentColor" className="absolute bottom-0 right-0 h-[88%] w-[64%] transition-transform duration-300 motion-safe:group-hover:-translate-y-1">
          {mark === 'BC' ? <>
            <path d="M4 70H236M120 4V136" strokeWidth="1" strokeOpacity="0.4" />
            {TAYLOR.map((d, i) => <path key={d} d={d} strokeWidth="1.5" strokeDasharray="4 4" strokeOpacity={0.45 + 0.2 * i} />)}
            <path d={SINE} strokeWidth="2.5" strokeLinecap="round" />
            <text x="128" y="132" fill="currentColor" stroke="none" fontSize="12" fontStyle="italic" opacity="0.8">sin x ≈ Σ aₙxⁿ</text>
          </> : <>
            <path d="M6 128H236" strokeWidth="1" strokeOpacity="0.4" />
            {RECTS.map(r => <rect key={r.x} x={r.x} y={r.y} width={r.w} height={r.h} fill="currentColor" fillOpacity="0.16" strokeOpacity="0.4" strokeWidth="1" />)}
            <path d={CURVE} strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.8" />
            <line {...TANGENT} strokeWidth="2" strokeLinecap="round" strokeDasharray="5 4" />
            <circle cx={X(T0)} cy={Y(T0)} r="4" fill="currentColor" stroke="none" />
            <text x={X(0.18)} y="120" fill="currentColor" stroke="none" fontSize="12" fontStyle="italic" opacity="0.8">∫ f(x) dx</text>
            <text x={X(T0) - 24} y={Y(T0) + 18} fill="currentColor" stroke="none" fontSize="12" fontStyle="italic" opacity="0.8">f′(x) = 0</text>
          </>}
        </svg>
        <span className="absolute left-5 top-4 text-sm font-semibold opacity-80">{course.subject === 'AP Calc' ? 'AP Calculus' : course.subject}</span>
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
