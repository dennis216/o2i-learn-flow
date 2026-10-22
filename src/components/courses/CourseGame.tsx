import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { gameDocument, MAX_GAME_BYTES } from '@/lib/courseGame';
import { Button } from '@/components/ui/button';
export default function CourseGame({ path }: { path: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  useEffect(() => {
    if (!expanded) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = container.current?.parentElement?.closest('[role=dialog]') as HTMLElement | null;
    const overflow = dialog?.style.overflow, scrollTop = dialog?.scrollTop;
    // A scrolled dialog can clip a descendant fixed iframe in WebKit/Chromium.
    if (dialog) { dialog.style.overflow = 'visible'; dialog.scrollTop = 0; }
    container.current?.querySelector('button')?.focus();
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.fullscreenElement) { e.preventDefault(); e.stopImmediatePropagation(); setExpanded(false); } };
    document.addEventListener('keydown', escape, true);
    return () => { document.removeEventListener('keydown', escape, true); previous?.focus(); if (dialog) { dialog.style.overflow = overflow ?? ''; dialog.scrollTop = scrollTop ?? 0; } };
  }, [expanded]);
  useEffect(() => { const changed = () => setNativeFullscreen(document.fullscreenElement === container.current); document.addEventListener('fullscreenchange', changed); return () => document.removeEventListener('fullscreenchange', changed); }, []);
  const [html, setHtml] = useState<string | null>(null), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true; setHtml(null); setError('');
    void supabase.storage.from('course-games').download(path).then(async ({ data, error }) => {
      if (error) throw error;
      if (!data || data.size > MAX_GAME_BYTES) throw new Error('Game file is unavailable or too large.');
      const text = await data.text();
      if (active) setHtml(gameDocument(text));
    }).catch(e => { if (active) setError(e.message ?? 'Could not load game.'); });
    return () => { active = false; };
  }, [path, retry]);
  if (error) return <div role="alert" className="space-y-2"><p>{error}</p><Button onClick={() => setRetry(n => n + 1)}>Retry game</Button></div>;
  if (html === null) return <p role="status">Loading game…</p>;
  return <div ref={container} role={expanded ? 'dialog' : undefined} aria-label={expanded ? 'Expanded lesson game' : undefined} className={expanded ? '!m-0 fixed inset-0 z-[60] flex h-[100dvh] flex-col gap-2 bg-background p-2 pt-[max(.5rem,env(safe-area-inset-top))]' : 'space-y-2'}>
    <div className="flex shrink-0 flex-wrap gap-2"><Button variant="outline" onClick={async () => { if (nativeFullscreen) await document.exitFullscreen(); setExpanded(v => !v); }}>{expanded ? 'Exit expanded game' : 'Expand game'}</Button>{expanded && document.fullscreenEnabled && <Button variant="outline" onClick={async () => { try { if (nativeFullscreen) await document.exitFullscreen(); else await container.current?.requestFullscreen(); } catch { /* Web expansion remains available when native fullscreen is denied. */ } }}>{nativeFullscreen ? 'Exit device fullscreen' : 'Device fullscreen'}</Button>}</div>
    <iframe title="Lesson game" className={expanded ? 'min-h-0 w-full flex-1 rounded border bg-white' : 'h-[65dvh] min-h-80 w-full rounded border bg-white'} sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={html} />
  </div>;
}
