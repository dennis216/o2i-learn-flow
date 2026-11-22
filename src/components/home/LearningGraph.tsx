import { useEffect, useRef, useState, type PointerEvent } from 'react';

const CURVE = 'M65 255C190 255 282 225 340 159S408 59 442 35';
const REST = { x: 340, y: 159 };

// Flat mathematical illustration for the editorial green concept. A small extra: press and
// drag (sideways on a phone) to slide the marked point along f(x) with its tangent. Hovering
// or a plain tap does nothing. The f(x) label rides above-left of the point so the curve
// never covers it.
export default function LearningGraph() {
  const svg = useRef<SVGSVGElement>(null);
  const curve = useRef<SVGPathElement>(null);
  const samples = useRef<{ x: number; y: number }[]>([]);
  const pressed = useRef(false);
  const [point, setPoint] = useState(REST);

  useEffect(() => {
    const path = curve.current;
    if (!path?.getTotalLength) return;
    const length = path.getTotalLength();
    samples.current = Array.from({ length: 241 }, (_, i) => {
      const p = path.getPointAtLength((length * i) / 240);
      return { x: p.x, y: p.y };
    });
  }, []);

  const press = (event: PointerEvent<SVGSVGElement>) => {
    pressed.current = true;
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* keep working without capture */ }
  };
  const release = () => { pressed.current = false; };
  const follow = (event: PointerEvent<SVGSVGElement>) => {
    if (!pressed.current) return;
    const matrix = svg.current?.getScreenCTM();
    const list = samples.current;
    if (!matrix || !list.length) return;
    const x = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()).x;
    // Stop short of both ends so the tangent and label stay inside the grid.
    let best = list[8];
    for (const p of list.slice(8, -14)) if (Math.abs(p.x - x) < Math.abs(best.x - x)) best = p;
    setPoint(best);
  };

  // Tangent from the neighbouring samples, drawn ±56 units along the curve direction.
  const list = samples.current;
  const at = list.findIndex(p => p === point);
  const a = list[Math.max(0, at - 3)] ?? { x: point.x - 1, y: point.y };
  const b = list[Math.min(list.length - 1, at + 3)] ?? { x: point.x + 1, y: point.y };
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
  const moved = at >= 0;
  const labelX = Math.min(Math.max(point.x - 54, 72), 400);
  const labelY = Math.max(point.y - 16, 52);

  return (
    <div className="learning-graph" aria-hidden="true">
      <div className="graph-heading"><span>ONE TO INFINITY</span><span>01 / ∞</span></div>
      <svg
        ref={svg}
        viewBox="0 0 500 340"
        fill="none"
        className="w-full cursor-grab touch-pan-y select-none active:cursor-grabbing"
        onPointerDown={press}
        onPointerMove={follow}
        onPointerUp={release}
        onPointerCancel={release}
      >
        <path d="M65 65H455M65 125H455M65 185H455M65 245H455M145 35V285M225 35V285M305 35V285M385 35V285" stroke="hsl(var(--studio-white) / .07)" />
        <path d="M65 255C190 255 282 225 340 159S408 59 442 35V285H65Z" fill="hsl(var(--accent-text) / .035)" />
        <path d="M145 281V289M225 281V289M305 281V289M385 281V289M61 65H69M61 125H69M61 185H69" stroke="hsl(var(--accent-text) / .4)" />
        <path d="M40 285H465M65 310V30" stroke="hsl(var(--studio-white) / .35)" strokeWidth="1" />
        <path ref={curve} d={CURVE} stroke="hsl(var(--accent-text))" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M65 255C170 254 270 233 360 206S420 185 450 171" stroke="hsl(var(--studio-white) / .2)" strokeWidth="1" strokeDasharray="4 7" />
        <path d="M431 35H442V46" stroke="hsl(var(--accent-text))" strokeWidth="2" />
        <circle cx="65" cy="255" r="5" fill="hsl(var(--accent-text))" />
        <circle cx="442" cy="35" r="4" fill="hsl(var(--accent-text))" />
        {moved && <path d={`M${point.x - ux * 56} ${point.y - uy * 56}L${point.x + ux * 56} ${point.y + uy * 56}`} stroke="hsl(var(--accent-text) / .7)" strokeWidth="1.25" strokeLinecap="round" strokeDasharray="5 4" />}
        <circle cx={point.x} cy={point.y} r="13" stroke="hsl(var(--accent-text) / .16)" />
        <circle cx={point.x} cy={point.y} r="4" fill="hsl(var(--studio-ink))" stroke="hsl(var(--accent-text))" strokeWidth="1.5" />
        <path d={`M${point.x} ${point.y + 14}V285`} stroke="hsl(var(--accent-text) / .25)" strokeDasharray="3 5" />
        <text x="45" y="260" fill="hsl(var(--accent-text))" fontSize="14" fontFamily="Georgia, serif">1</text>
        <text x="430" y="18" fill="hsl(var(--accent-text))" fontSize="26" fontFamily="Georgia, serif">∞</text>
        <text x={labelX} y={labelY} textAnchor="end" fill="hsl(var(--studio-muted))" fontSize="14" fontStyle="italic" fontFamily="Georgia, serif">f(x)</text>
        <text x="460" y="308" fill="hsl(var(--studio-muted))" fontSize="13" fontStyle="italic" fontFamily="Georgia, serif">x</text>
      </svg>
      <div className="graph-subjects"><span>AP CALCULUS</span><span>SAT MATH</span><span>AMC</span></div>
    </div>
  );
}
