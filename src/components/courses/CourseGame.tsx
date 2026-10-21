import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { gameDocument, MAX_GAME_BYTES } from '@/lib/courseGame';
import { Button } from '@/components/ui/button';
export default function CourseGame({ path }: { path: string }) {
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
  return <iframe title="Lesson game" className="h-[65dvh] min-h-80 w-full rounded border bg-white" sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={html} />;
}
