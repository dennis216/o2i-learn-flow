import { useEffect, useRef } from 'react';
import { OWL, OWL_BLINK, OWL_COLS, OWL_ROWS, drawSprite } from '@/lib/owlSprite';

// Dr. Owler drawn at a whole-pixel scale; blinks every few seconds.
export default function PixelOwl({ scale = 3, className = '' }: { scale?: number; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawSprite(canvas, OWL, scale);
    let reopen: number | undefined;
    const timer = window.setInterval(() => {
      drawSprite(canvas, OWL_BLINK, scale);
      reopen = window.setTimeout(() => drawSprite(canvas, OWL, scale), 160);
    }, 4200);
    return () => { window.clearInterval(timer); window.clearTimeout(reopen); };
  }, [scale]);

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
