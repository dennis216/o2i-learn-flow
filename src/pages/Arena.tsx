import { useLayoutEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { isArenaRequest, replyToArenaRequest, type ArenaRpc } from '@/lib/arenaBridge';

const rpc: ArenaRpc = (name, args) => supabase.rpc(name as never, args as never);

function ArenaGame() {
  const frame = useRef<HTMLIFrameElement>(null);

  // Layout effect: the listener must exist before the iframe's first message.
  useLayoutEffect(() => {
    const onMessage = async (event: MessageEvent) => {
      const game = frame.current?.contentWindow;
      if (!game || event.source !== game || event.origin !== window.location.origin || !isArenaRequest(event.data)) return;
      game.postMessage(await replyToArenaRequest(rpc, event.data), window.location.origin);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  return (
    <iframe
      ref={frame}
      src="/games/limit-arena.html"
      title="CALC QUEST Limit Arena"
      onLoad={() => frame.current?.focus()}
      className="block w-full border-0 bg-black"
      style={{ height: 'calc(100dvh - 4rem)' }}
    />
  );
}

export default function Arena() {
  const { user, loading } = useAuth();
  if (user) return <ArenaGame key={user.id} />;
  return (
    <main className="container mx-auto max-w-xl px-4 py-16">
      <h1 className="mb-4 text-3xl font-bold">Limit Arena</h1>
      {loading
        ? <p role="status">Checking your account…</p>
        : (
          <div className="space-y-4">
            <p>Sign in to play.</p>
            <Button asChild><Link to="/auth">Sign in</Link></Button>
          </div>
        )}
    </main>
  );
}
