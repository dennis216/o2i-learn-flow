import { useEffect, useRef } from 'react';
import { OWL, OWL_BLINK, OWL_COLS, OWL_ROWS, drawSprite } from '@/lib/owlSprite';

// Dr. Owler drawn at a whole-pixel scale. On its own it blinks every few seconds; pass
// `sprite` to show a specific frame instead (the desk pet runs its own idle moods).
export default function PixelOwl({ scale = 3, className = '', sprite }: { scale?: number; className?: string; sprite?: string[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (sprite) {
      drawSprite(canvas, sprite, scale);
      return;
    }
    drawSprite(canvas, OWL, scale);
    let reopen: number | undefined;
    const timer = window.setInterval(() => {
      drawSprite(canvas, OWL_BLINK, scale);
      reopen = window.setTimeout(() => drawSprite(canvas, OWL, scale), 160);
    }, 4200);
    return () => { window.clearInterval(timer); window.clearTimeout(reopen); };
  }, [scale, sprite]);

  return (
    <canvas
      ref={canvasRef}
      width={OWL_COLS * scale}
      height={OWL_ROWS * scale}
      aria-hidden="true"
      className={`block [image-rendering:pixelated] ${className}`}
    />
  );
}
