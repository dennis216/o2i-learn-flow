import { useCallback, useEffect, useRef, useState } from 'react';

// Dr. Owler, same 24×19 sprite and palette as the Limit Arena game (public/games/limit-arena.html).
const OWL = [
  '.....kkkkkkkkkkk........',
  '...kknnnnnnnnnnnkk......',
  '.kknnnnnnnyynnnnnnkk....',
  '...kknnnnnnnnnnnkk.g....',
  '.....kkkkkkkkkkk...g....',
  '....k.kttttk.k.....g....',
  '...ktkttttttktk....g....',
  '..kttttttttttttk...YY...',
  '..ktwwwkttkwwwtk...YY...',
  '.ktwwkwwkkwwkwwtk.......',
  '.ktwwkwwkkwwkwwtk...Y...',
  '.kttwwwtyytwwwttk..YY...',
  '.ktttttttyytttttk.YYY...',
  '.kttccccttccccttkY.YY...',
  '.kttcTccccccTcttk..YY...',
  '.ktttccccccccttt...YY...',
  '..kttcTccccTcttk...YY.Y.',
  '..kttttttttttttk....YYY.',
  '...kkooookkookk.........',
];
const COLORS: Record<string, string> = {
  k: '#000000', n: '#1D2B53', y: '#FFEC27', Y: '#FFEC27', t: '#A28879', T: '#A28879',
  w: '#FFF1E8', c: '#FFCCAA', o: '#FFA300', g: '#FFA300',
};
const withPrefix = (row: string, prefix: string) => prefix + row.slice(prefix.length);
const BLINK = OWL.map((row, i) =>
  i === 9 ? withPrefix(row, '.kttttttkkttttttk') : i === 10 ? withPrefix(row, '.ktkkkkkkkkkkkktk') : row);

const COLS = OWL[0].length;
const ROWS = OWL.length;
const STORAGE_KEY = 'o2i-desk-pet-pos';
const MARGIN = 8;

function draw(canvas: HTMLCanvasElement, sprite: string[], scale: number) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  sprite.forEach((row, y) => [...row].forEach((ch, x) => {
    const color = COLORS[ch];
    if (!color) return;
    ctx.fillStyle = color;
    ctx.fillRect(x * scale, y * scale, scale, scale);
  }));
}

type Pos = { x: number; y: number };

export default function DeskPet() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const [scale] = useState(() => (window.innerWidth < 640 ? 2 : 3));
  const width = COLS * scale;
  const height = ROWS * scale;

  const clamp = useCallback((p: Pos): Pos => ({
    x: Math.min(Math.max(MARGIN, p.x), window.innerWidth - width - MARGIN),
    y: Math.min(Math.max(MARGIN, p.y), window.innerHeight - height - MARGIN),
  }), [width, height]);

  const [pos, setPos] = useState<Pos>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
      if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') return saved;
    } catch { /* storage blocked: fall back to the default corner */ }
    return { x: window.innerWidth - width - 24, y: window.innerHeight - height - 24 };
  });
  const [dragging, setDragging] = useState(false);

  // Keep the owl on screen after a resize or when a saved position came from a bigger window.
  useEffect(() => {
    const fit = () => setPos((p) => clamp(p));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [clamp]);

  // Draw, and blink every few seconds.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    draw(canvas, OWL, scale);
    let close: number | undefined;
    const timer = window.setInterval(() => {
      draw(canvas, BLINK, scale);
      close = window.setTimeout(() => draw(canvas, OWL, scale), 160);
    }, 4200);
    return () => { window.clearInterval(timer); window.clearTimeout(close); };
  }, [scale]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    setPos(clamp({ x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy }));
  };
  const onPointerUp = () => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(pos)); } catch { /* position lasts for this visit only */ }
  };

  return (
    <div
      role="img"
      aria-label="Dr. Owler"
      title="Dr. Owler"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className={`fixed z-40 select-none touch-none ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      style={{ left: pos.x, top: pos.y, width, height }}
    >
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className={`block [image-rendering:pixelated] drop-shadow-[2px_3px_0_rgba(29,43,83,0.25)] transition-transform duration-150 ${dragging ? '-rotate-6 scale-110' : 'motion-safe:animate-[owl-bob_2.4s_steps(2,end)_infinite]'}`}
      />
    </div>
  );
}
