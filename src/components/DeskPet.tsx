import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import PixelOwl from '@/components/PixelOwl';
import { OWL_COLS, OWL_ROWS } from '@/lib/owlSprite';

const STORAGE_KEY = 'o2i-desk-pet-pos';
const MARGIN = 8;

type Pos = { x: number; y: number };

function DraggableOwl() {
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const [scale] = useState(() => (window.innerWidth < 640 ? 2 : 4));
  const width = OWL_COLS * scale;
  const height = OWL_ROWS * scale;

  const clamp = useCallback((p: Pos): Pos => ({
    x: Math.min(Math.max(MARGIN, p.x), window.innerWidth - width - MARGIN),
    y: Math.min(Math.max(MARGIN, p.y), window.innerHeight - height - MARGIN),
  }), [width, height]);

  const corner = useCallback((): Pos => ({ x: window.innerWidth - width - 24, y: window.innerHeight - height - 24 }), [width, height]);
  // Until someone drags the owl it lives in the bottom-right corner, wherever that is after a resize.
  const placed = useRef(false);
  const [pos, setPos] = useState<Pos>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
      if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') { placed.current = true; return saved; }
    } catch { /* storage blocked: fall back to the default corner */ }
    return corner();
  });
  const [dragging, setDragging] = useState(false);

  // Keep the owl on screen after a resize or when a saved position came from a bigger window.
  useEffect(() => {
    const fit = () => setPos((p) => clamp(placed.current ? p : corner()));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [clamp, corner]);

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
    placed.current = true;
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
      <PixelOwl
        scale={scale}
        className={`drop-shadow-[2px_3px_0_rgba(29,43,83,0.25)] transition-transform duration-150 ${dragging ? '-rotate-6 scale-110' : 'motion-safe:animate-[owl-bob_2.4s_steps(2,end)_infinite]'}`}
      />
    </div>
  );
}

export default function DeskPet() {
  // The Arena game fills the screen and has its own Dr. Owler; keep the pet out of its way.
  return useLocation().pathname === '/arena' ? null : <DraggableOwl />;
}
