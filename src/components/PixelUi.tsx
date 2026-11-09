import type { ReactNode } from 'react';

// Pixel accents in the CALC QUEST video style. Colours are the game's palette (src/lib/owlSprite.ts PIXEL).

// Double border + hard offset shadow, the panel used in the videos.
export const pixelPanel = 'border-[3px] border-[#FFF1E8] bg-[#111D35] shadow-[0_0_0_3px_#111D35,0_0_0_6px_#83769C,10px_10px_0_6px_#000]';

// Dithered pixel horizon between the light page and the navy night sky.
export function Dither({ flip = false }: { flip?: boolean }) {
  // 8px "pixels", staggered row to row so the fill reads as dithering rather than stripes.
  const rows = [
    'bg-[linear-gradient(90deg,#1D2B53_25%,transparent_25%)] bg-[length:32px_8px]',
    'bg-[linear-gradient(90deg,transparent_50%,#1D2B53_50%)] bg-[length:16px_8px]',
    'bg-[linear-gradient(90deg,#1D2B53_50%,transparent_50%,transparent_75%,#1D2B53_75%)] bg-[length:32px_8px]',
  ];
  return <div aria-hidden="true">{(flip ? [...rows].reverse() : rows).map((row) => <div key={row} className={`h-2 ${row}`} />)}</div>;
}

export function Stars({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`relative bg-[#1D2B53] [background-image:radial-gradient(#FFF1E8_1px,transparent_1.5px),radial-gradient(#FFF1E8_1px,transparent_1.5px),radial-gradient(rgba(255,241,232,0.5)_1px,transparent_1.5px)] [background-position:13px_29px,71px_83px,40px_7px] [background-size:97px_89px,157px_131px,61px_67px] ${className}`}>
      {children}
    </div>
  );
}

// "∞ o2i | TITLE", the HUD label in the top-left of every episode.
export function HudTag({ title }: { title: string }) {
  return (
    <p className="inline-flex items-center gap-2 border-2 border-[#FFEC27] px-2.5 py-1 font-pixel text-base tracking-wide text-[#FFEC27]">
      <span aria-hidden="true">∞</span> o2i <span aria-hidden="true" className="text-[#83769C]">|</span> {title}
    </p>
  );
}

// Dr. Owler's name plate above dialogue, as in the videos.
export function NameTag({ children }: { children: ReactNode }) {
  return <span className="inline-block bg-[#FFEC27] px-1.5 font-pixel text-sm text-[#1D2B53]">{children}</span>;
}

// Yellow pixel button style for the primary action on navy.
export const pixelButton = 'rounded-none bg-[#FFEC27] font-semibold text-[#1D2B53] shadow-[4px_4px_0_#000] hover:bg-[#F3EF7D] focus-visible:ring-[#FFF1E8]';
