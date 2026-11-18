import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import PixelOwl from '@/components/PixelOwl';
import { OWL_COLS, OWL_ROWS } from '@/lib/owlSprite';
import { AI_CHAT_ENABLED } from '@/lib/aiTutor';

const STORAGE_KEY = 'o2i-desk-pet-pos';
const MARGIN = 8;

type Pos = { x: number; y: number };

function DraggableOwl() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [pats, setPats] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const lastPat = useRef(0);
  const angry = pats >= 4;
  const greet = () => {
    const now = Date.now();
    setPats(count => now - lastPat.current < 2500 ? count + 1 : 1);
    lastPat.current = now;
    setSpeaking(true);
  };
  useEffect(() => {
    if (!speaking) return;
    const timer = window.setTimeout(() => { setSpeaking(false); setPats(0); }, 5000);
    return () => window.clearTimeout(timer);
  }, [pats, speaking]);
  const pointerStart = useRef<Pos | null>(null);
  const moved = useRef(false);
  const label = t('Say hello to Dr. Owler', '和猫头鹰打招呼', 'Saluda al Dr. Owler');
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
    pointerStart.current = { x: e.clientX, y: e.clientY };
    moved.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    if (pointerStart.current && Math.hypot(e.clientX - pointerStart.current.x, e.clientY - pointerStart.current.y) > 6) moved.current = true;
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
    <>
    {speaking && <div role="status" aria-live="polite" className="fixed z-40 w-56 rounded-2xl border border-primary/30 bg-popover p-4 text-popover-foreground shadow-lg" style={{ left: Math.max(8, Math.min(pos.x + width - 224, window.innerWidth - 232)), top: pos.y > 160 ? pos.y - 150 : pos.y + height + 8 }}>
      <p className="text-sm leading-relaxed">{angry
        ? t('Hoot! Easy on the feathers. I need a little space!', '咕！再拍毛都要乱了，让我缓一缓嘛。', '¡Uhú! Cuidado con mis plumas. ¡Dame un respiro!')
        : pats > 1
          ? t('That tickles! Have a math question for me?', '有点痒！要不要问我一道数学题？', '¡Me haces cosquillas! ¿Tienes una pregunta de matemáticas?')
          : t('Hoot! Hello, I’m Dr. Owler. What are we learning today?', '咕咕，你好呀！我是欧鸮博士，今天想学点什么？', '¡Uhú! Hola, soy el Dr. Owler. ¿Qué aprendemos hoy?')}</p>
      <div className="mt-3 flex items-center justify-between gap-2">
        {AI_CHAT_ENABLED && <button type="button" onClick={() => navigate('/ai-tutor')} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t('Start a chat', '开始对话', 'Conversar')}</button>}
        <button type="button" onClick={() => { setSpeaking(false); setPats(0); }} className="rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground">{t('Close', '收起', 'Cerrar')}</button>
      </div>
    </div>}
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
      title={label}
      onClick={() => { if (!moved.current) greet(); }}
      onKeyDown={e => { if (!e.repeat && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); greet(); } }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className={`fixed z-40 select-none touch-none rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${dragging ? 'cursor-grabbing' : 'cursor-pointer'}`}
      style={{ left: pos.x, top: pos.y, width, height }}
    >
      <PixelOwl
        scale={scale}
        className={`drop-shadow-[2px_3px_0_rgba(29,43,83,0.25)] transition-transform duration-150 ${dragging ? '-rotate-6 scale-110' : angry ? 'rotate-6 scale-110 saturate-150' : 'motion-safe:animate-[owl-bob_2.4s_steps(2,end)_infinite]'}`}
      />
      {angry && <span aria-hidden="true" className="absolute -right-1 -top-2 text-xl font-bold text-destructive">!</span>}
    </div>
    </>
  );
}

export default function DeskPet() {
  // Arena includes its own owl; chat does not need a second launcher.
  const { pathname } = useLocation();
  return pathname === '/ai-tutor' || pathname === '/arena' ? null : <DraggableOwl />;
}
