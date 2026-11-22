import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import PixelOwl from '@/components/PixelOwl';
import {
  OWL, OWL_BLINK, OWL_COLS, OWL_HAPPY, OWL_LOOK_LEFT, OWL_LOOK_RIGHT, OWL_PREEN_A, OWL_PREEN_B,
  OWL_ROWS, OWL_SLEEPY, OWL_STEP_A, OWL_STEP_B,
} from '@/lib/owlSprite';
import { AI_CHAT_ENABLED } from '@/lib/aiTutor';

const STORAGE_KEY = 'o2i-desk-pet-pos';
const MARGIN = 8;
// The owl strolls at most this far either side of where it lives, slowly, then comes back.
const WANDER = 70;
const WALK_SPEED = 26; // px per second
const rand = (min: number, max: number) => min + Math.random() * (max - min);

type Pos = { x: number; y: number };
type Mood = '' | 'preen' | 'walk';

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

  // Quiet idle life while nobody is touching it: every 6–14 s one small thing — a blink
  // (sometimes two), a glance left or right, content ^ ^ eyes, heavy lids, a short preen,
  // or now and then a slow stroll a little way and back. Nothing runs while it talks, is
  // dragged or is cross, or while the tab is hidden; reduced motion keeps only the face.
  const [frame, setFrame] = useState<string[]>(OWL);
  const [mood, setMood] = useState<Mood>('');
  const [wander, setWander] = useState(0);
  const wanderRef = useRef(0);
  const posRef = useRef(pos);
  posRef.current = pos;
  const busy = speaking || dragging || angry;
  useEffect(() => {
    setFrame(OWL);
    setMood('');
    if (busy) return;
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timers: number[] = [];
    let stopped = false;
    const later = (fn: () => void, ms: number) => { timers.push(window.setTimeout(() => { if (!stopped) fn(); }, ms)); };
    const shift = (x: number) => { wanderRef.current = x; setWander(x); };

    function schedule(min = 6000, max = 14000) { later(act, rand(min, max)); }
    function rest() { setFrame(OWL); setMood(''); schedule(); }
    function blink(twice: boolean) {
      setFrame(OWL_BLINK);
      later(() => {
        setFrame(OWL);
        if (twice) later(() => { setFrame(OWL_BLINK); later(rest, 130); }, 200);
        else rest();
      }, 140);
    }
    function cycle(frames: string[][], stepMs: number, steps: number, done: () => void) {
      let i = 0;
      const next = () => { setFrame(frames[i % frames.length]); i += 1; if (i > steps) done(); else later(next, stepMs); };
      next();
    }
    function preen() {
      setMood('preen');
      cycle([OWL_PREEN_A, OWL_PREEN_B], 260, 8, rest);
    }
    function walk() {
      const width = OWL_COLS * scale;
      const here = wanderRef.current;
      const lo = Math.max(-WANDER, MARGIN - posRef.current.x);
      const hi = Math.min(WANDER, window.innerWidth - width - MARGIN - posRef.current.x);
      // Pick a side with room (in the default corner that is the left), and lean back
      // toward home once it has wandered off a bit.
      let dir = Math.random() < 0.5 ? -1 : 1;
      if (dir > 0 && hi - here < 24) dir = -1;
      else if (dir < 0 && here - lo < 24) dir = 1;
      const target = Math.abs(here) > 30 && Math.random() < 0.7 ? 0 : here + dir * rand(24, WANDER);
      const to = Math.min(hi, Math.max(lo, target));
      if (Math.abs(to - here) < 8) { rest(); return; }
      setMood('walk');
      const start = performance.now(), duration = (Math.abs(to - here) / WALK_SPEED) * 1000;
      // Timer steps rather than animation frames: a slow pixel walk needs no more, and a
      // walk never stalls half-way while the page is in the background.
      const tick = () => {
        const elapsed = performance.now() - start;
        const k = Math.min(1, elapsed / duration);
        shift(here + (to - here) * k);
        setFrame(Math.floor(elapsed / 220) % 2 ? OWL_STEP_B : OWL_STEP_A);
        if (k < 1) later(tick, 50);
        else rest();
      };
      tick();
    }
    function act() {
      if (document.hidden) { schedule(); return; }
      const r = Math.random();
      if (r < 0.36) blink(Math.random() < 0.25);
      else if (r < 0.58) { setFrame(Math.random() < 0.5 ? OWL_LOOK_LEFT : OWL_LOOK_RIGHT); later(rest, rand(1200, 2200)); }
      else if (r < 0.68) { setFrame(OWL_HAPPY); later(rest, 1600); }
      else if (r < 0.76) { setFrame(OWL_SLEEPY); later(() => blink(false), 2200); }
      else if (r < 0.88) { if (calm) blink(false); else preen(); }
      else if (calm) schedule();
      else walk();
    }

    schedule(3000, 7000);
    return () => { stopped = true; timers.forEach(window.clearTimeout); };
  }, [busy, scale]);

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
    // Measure from where the owl is drawn, including any stroll offset.
    drag.current = { dx: e.clientX - (pos.x + wanderRef.current), dy: e.clientY - pos.y };
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    if (pointerStart.current && Math.hypot(e.clientX - pointerStart.current.x, e.clientY - pointerStart.current.y) > 6) moved.current = true;
    if (!moved.current) return;
    // A real drag becomes the owl's home; the stroll offset folds into it.
    if (wanderRef.current) { wanderRef.current = 0; setWander(0); }
    setPos(clamp({ x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy }));
  };
  const onPointerUp = () => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    if (!moved.current) return; // a tap greets; only a drag moves the owl's home
    placed.current = true;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(pos)); } catch { /* position lasts for this visit only */ }
  };
  const drawnX = pos.x + wander;

  return (
    <>
    {speaking && <div role="status" aria-live="polite" className="fixed z-40 w-56 rounded-2xl border border-primary/30 bg-popover p-4 text-popover-foreground shadow-lg" style={{ left: Math.max(8, Math.min(drawnX + width - 224, window.innerWidth - 232)), top: pos.y > 160 ? pos.y - 150 : pos.y + height + 8 }}>
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
      style={{ left: drawnX, top: pos.y, width, height }}
    >
      <PixelOwl
        scale={scale}
        sprite={frame}
        className={`drop-shadow-[2px_3px_0_rgba(29,43,83,0.25)] transition-transform duration-150 ${dragging ? '-rotate-6 scale-110' : angry ? 'rotate-6 scale-110 saturate-150'
          : mood === 'walk' ? 'motion-safe:animate-[owl-waddle_0.44s_steps(2,end)_infinite]'
          : mood === 'preen' ? 'motion-safe:animate-[owl-preen_0.52s_steps(2,end)_infinite]'
          : 'motion-safe:animate-[owl-bob_2.4s_steps(2,end)_infinite]'}`}
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
