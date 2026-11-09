import { useLayoutEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage, type Language } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import katexStyles from 'katex/dist/katex.min.css?inline';
import { arenaQuestionContent } from '@/components/courses/ArenaQuestionContent';
import { isArenaRequest, replyToArenaRequest, type ArenaRpc } from '@/lib/arenaBridge';

const rpc: ArenaRpc = (name, args) => supabase.rpc(name as never, args as never);

// The game reads its own same-origin language key on load; keep it on the site's choice.
function ArenaGame({ language }: { language: Language }) {
  try { localStorage.setItem('cq-arena-lang', language); } catch { /* the game falls back to the browser language */ }
  const frame = useRef<HTMLIFrameElement>(null);

  // Layout effect: the listener must exist before the iframe's first message.
  useLayoutEffect(() => {
    const onMessage = async (event: MessageEvent) => {
      const game = frame.current?.contentWindow;
      if (!game || event.source !== game || event.origin !== window.location.origin || !isArenaRequest(event.data)) return;
      const request = event.data;
      const renderRpc: ArenaRpc = async (name, args) => {
        const result = await rpc(name, args);
        return { ...result, data: result.error ? null : arenaQuestionContent(request.action, result.data) };
      };
      const reply = await replyToArenaRequest(renderRpc, request);
      if (frame.current?.contentWindow === game) game.postMessage(reply, window.location.origin);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  return (
    <iframe
      ref={frame}
      src="/games/limit-arena.html"
      title="CALC QUEST Limit Arena"
      onLoad={() => {
        const doc = frame.current?.contentDocument;
        if (doc) {
          const style = doc.createElement('style');
          style.textContent = katexStyles + '.math-content{overflow-x:auto;overflow-wrap:anywhere}.math-content p{margin:.35em 0}.math-content table{border-collapse:collapse}.math-content th,.math-content td{border:1px solid currentColor;padding:.4em}.qz img{max-width:100%;max-height:45vh;object-fit:contain}.qz .katex-display{overflow-x:auto;overflow-y:hidden}';
          doc.head.append(style);
        }
        frame.current?.focus();
      }}
      className="block w-full border-0 bg-black"
      style={{ height: 'calc(100dvh - 4rem)' }}
    />
  );
}

export default function Arena() {
  const { user, loading } = useAuth();
  const { language, t } = useLanguage();
  if (user) return <ArenaGame key={user.id + language} language={language} />;
  return (
    <main className="container mx-auto max-w-xl px-4 py-16">
      <h1 className="mb-4 text-3xl font-bold">{t('Limit Arena', '极限竞技场')}</h1>
      {loading
        ? <p role="status">{t('Checking your account…', '正在确认登录状态…')}</p>
        : (
          <div className="space-y-4">
            <p>{t('Sign in to play.', '登录后就能开玩。')}</p>
            <Button asChild><Link to="/auth">{t('Sign in', '登录')}</Link></Button>
          </div>
        )}
    </main>
  );
}
