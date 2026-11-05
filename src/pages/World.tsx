import { useRef } from 'react';

// CALC QUEST open world: the five AP Calculus islands (Units 1–5) and the 20 hidden Wonders.
// The game is a self-contained page in /public/games; progress is saved in the player's browser,
// so no sign-in is needed.
export default function World() {
  const frame = useRef<HTMLIFrameElement>(null);
  return (
    <iframe
      ref={frame}
      src="/games/calc-quest-world.html"
      title="CALC QUEST World"
      onLoad={() => frame.current?.focus()}
      className="block w-full border-0 bg-black"
      style={{ height: 'calc(100dvh - 4rem)' }}
      allow="autoplay; fullscreen"
    />
  );
}
