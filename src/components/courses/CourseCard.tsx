import { useRef, useState, type PointerEvent } from 'react';
import { Course } from './types';

export const LEVEL_ZH: Record<string, string> = { beginner: '入门', intermediate: '中级', advanced: '高级' };

// Covers read like cloth-bound books: deep forest / slate / bronze with gold or ivory line
// art, the same in both themes. Cards cycle through them so neighbours differ.
const TONES = [
  'from-[hsl(160_34%_18%)] to-[hsl(166_30%_10%)] text-[hsl(44_45%_76%)]',
  'from-[hsl(172_20%_21%)] to-[hsl(176_22%_11%)] text-[hsl(40_30%_86%)]',
  'from-[hsl(30_24%_23%)] to-[hsl(26_20%_12%)] text-[hsl(40_48%_76%)]',
];

// Tile art in a 240×140 box: a wavy f with Riemann rectangles (integral) and a tangent line (derivative, flat at the minimum).
const f = (t: number) => 0.3 + 0.45 * t + 0.18 * Math.sin(2 * Math.PI * t);
const df = (t: number) => 0.45 + 0.36 * Math.PI * Math.cos(2 * Math.PI * t);
const X = (t: number) => 12 + 220 * t;
const Y = (t: number) => 128 - 100 * f(t);
const CURVE = 'M' + Array.from({ length: 41 }, (_, i) => `${X(i / 40).toFixed(1)} ${Y(i / 40).toFixed(1)}`).join('L');
const RECTS = [0.06, 0.16, 0.26, 0.36, 0.46].map(t => ({ x: X(t), y: Y(t + 0.05), w: X(0.1) - X(0), h: 128 - Y(t + 0.05) }));
const T0 = 0.685, DX = 26;
const tangentAt = (t: number) => { const dy = (DX / 220) * 100 * df(t); return { x1: X(t) - DX, y1: Y(t) + dy, x2: X(t) + DX, y2: Y(t) - dy }; };
// Slope as shown on the cover: one decimal, and a clean 0 at the minimum.
const slopeLabel = (t: number) => { const s = df(t); return Math.abs(s) < 0.05 ? '0' : s.toFixed(1).replace('-', '−'); };

// BC art (polar, BC only): the three-petal rose r = cos 3θ, centred at (140, 70).
const ROSE = 'M' + Array.from({ length: 181 }, (_, i) => { const th = (Math.PI * i) / 180, r = 62 * Math.cos(3 * th); return `${(140 + r * Math.cos(th)).toFixed(1)} ${(70 - r * Math.sin(th)).toFixed(1)}`; }).join('L') + 'Z';

interface CourseCardProps {
  course: Course;
  index: number;
  onSelect: (course: Course) => void;
}

export function CourseCard({ course, index, onSelect }: CourseCardProps) {
  // "AP Calculus AB" -> "AB"; titles without a short code show the subject instead.
  const mark = course.title.match(/\s([A-Z0-9]{2,3})$/)?.[1] ?? course.subject;
  const cover = useRef<HTMLDivElement>(null);
  const art = useRef<SVGSVGElement>(null);
  // AB: where the point sits along f (0–1). BC: the angle θ of the point on the rose, once moved.
  const [t, setT] = useState(T0);
  const [theta, setTheta] = useState<number | null>(null);

  // A small extra: press on the cover and drag to move the point (sideways on a phone).
  // Hovering does nothing; a plain tap still opens the course, a drag does not.
  const press = useRef<{ x: number; y: number } | null>(null);
  const dragged = useRef(false);
  const inCover = (event: PointerEvent<HTMLElement>) => {
    const box = cover.current?.getBoundingClientRect();
    return !!box && event.clientY >= box.top && event.clientY <= box.bottom && event.clientX >= box.left && event.clientX <= box.right;
  };
  const start = (event: PointerEvent<HTMLElement>) => {
    dragged.current = false;
    press.current = inCover(event) ? { x: event.clientX, y: event.clientY } : null;
  };
  const end = () => { press.current = null; };
  const follow = (event: PointerEvent<HTMLElement>) => {
    if (!press.current || !inCover(event)) return;
    if (!dragged.current && Math.hypot(event.clientX - press.current.x, event.clientY - press.current.y) < 4) return;
    dragged.current = true;
    const matrix = art.current?.getScreenCTM();
    if (!matrix) return;
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    if (mark === 'BC') setTheta(Math.atan2(70 - p.y, p.x - 140));
    else setT(Math.min(0.97, Math.max(0.03, (p.x - 12) / 220)));
  };
  const swallowDragClick = (event: React.MouseEvent) => {
    if (!dragged.current) return;
    dragged.current = false;
    event.preventDefault();
    event.stopPropagation();
  };
  const tangent = tangentAt(t);
  // Follow the pointer's direction: on a petal the point sits on the rose; between petals
  // (cos 3θ < 0, where a negative r would jump to the opposite side) it rests at the centre.
  const r = theta === null ? 0 : 62 * Math.max(0, Math.cos(3 * theta));
  const roseX = 140 + r * Math.cos(theta ?? 0), roseY = 70 - r * Math.sin(theta ?? 0);
  const degrees = theta === null ? 0 : Math.round((((theta * 180) / Math.PI) % 360 + 360) % 360);

  return (
    <article
      className="group relative touch-pan-y rounded-2xl p-3 transition-colors hover:bg-muted/60"
      onPointerDown={start}
      onPointerMove={follow}
      onPointerUp={end}
      onPointerCancel={end}
      onPointerLeave={end}
      onClickCapture={swallowDragClick}
    >
      <div ref={cover} aria-hidden="true" className={`relative h-40 overflow-hidden rounded-xl bg-gradient-to-br ring-1 ring-inset ring-white/[0.06] ${TONES[index % TONES.length]}`}>
        <div className="absolute inset-0 [background-image:linear-gradient(currentColor_1px,transparent_1px),linear-gradient(90deg,currentColor_1px,transparent_1px)] [background-size:20px_20px] opacity-[0.07]" />
        <svg ref={art} viewBox="0 0 240 140" fill="none" stroke="currentColor" className="absolute bottom-0 right-0 h-[88%] w-[64%] transition-transform duration-300 motion-safe:group-hover:-translate-y-1">
          {mark === 'BC' ? <>
            <path d="M60 70H230M140 8V132" strokeWidth="1" strokeOpacity="0.4" />
            <path d={ROSE} fill="currentColor" fillOpacity="0.16" strokeWidth="2.5" strokeLinejoin="round" />
            {theta !== null && <>
              <line x1="140" y1="70" x2={roseX} y2={roseY} strokeWidth="1.5" strokeDasharray="4 3" />
              <circle cx={roseX} cy={roseY} r="4" fill="currentColor" stroke="none" />
              {/* top right is the gap between petals (60°), so the point never covers the label */}
              <text x="176" y="20" fill="currentColor" stroke="none" fontSize="12" fontStyle="italic" opacity="0.85">θ = {degrees}°</text>
            </>}
            <text x="164" y="128" fill="currentColor" stroke="none" fontSize="12" fontStyle="italic" opacity="0.8">r = cos 3θ</text>
          </> : <>
            <path d="M6 128H236" strokeWidth="1" strokeOpacity="0.4" />
            {RECTS.map(r => <rect key={r.x} x={r.x} y={r.y} width={r.w} height={r.h} fill="currentColor" fillOpacity="0.16" strokeOpacity="0.4" strokeWidth="1" />)}
            <path d={CURVE} strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.8" />
            <line {...tangent} strokeWidth="2" strokeLinecap="round" strokeDasharray="5 4" />
            <circle cx={X(t)} cy={Y(t)} r="4" fill="currentColor" stroke="none" />
            <text x={X(0.18)} y="120" fill="currentColor" stroke="none" fontSize="12" fontStyle="italic" opacity="0.8">∫ f(x) dx</text>
            <text x={Math.min(Math.max(X(t) - 24, 8), 170)} y={Math.min(Y(t) + 18, 112)} fill="currentColor" stroke="none" fontSize="12" fontStyle="italic" opacity="0.8">f′(x) = {slopeLabel(t)}</text>
          </>}
        </svg>
        <span className="absolute left-5 top-4 text-xs font-medium uppercase tracking-[0.18em] opacity-80">{course.subject === 'AP Calc' ? 'AP Calculus' : course.subject}</span>
        <span className="absolute bottom-2 left-5 font-display text-6xl font-medium">{mark}</span>
      </div>
      <div className="px-2 pb-2 pt-4">
        <h2 className="text-[1.375rem] font-semibold leading-snug text-foreground">
          <button
            type="button"
            onClick={() => onSelect(course)}
            className="text-left after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
          >
            {course.title}
          </button>
        </h2>
        <p className="mt-2 line-clamp-3 text-[0.95rem] leading-relaxed text-muted-foreground">{course.description}</p>
        {/* the whole card opens the course; only a paid course needs a price line */}
        {course.price > 0 && <p className="mt-3 text-sm font-medium text-muted-foreground">${course.price}</p>}
      </div>
    </article>
  );
}
