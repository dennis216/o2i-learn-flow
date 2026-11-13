import { useLayoutEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage, type Language } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import katexStyles from 'katex/dist/katex.min.css?inline';
import { arenaQuestionContent } from '@/components/courses/ArenaQuestionContent';
import { isArenaRequest, replyToArenaRequest, type ArenaRpc } from '@/lib/arenaBridge';
import PixelOwl from '@/components/PixelOwl';
import { HudTag, NameTag, Stars, pixelButton, pixelPanel } from '@/components/PixelUi';

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
    <main className="text-[#FFF1E8]">
      <Stars className="grid min-h-[calc(100dvh-4rem)] place-items-center px-4 py-16">
        <div className={`w-full max-w-lg p-6 sm:p-8 ${pixelPanel}`}>
          <HudTag title="LIMIT ARENA" />
          <h1 className="mt-5 text-3xl font-bold tracking-tight">{t('Limit Arena', '极限竞技场')}</h1>
          <div className="mt-6 flex items-start gap-3">
            <div className="shrink-0 border-2 border-[#83769C] bg-[#1D2B53] p-1"><PixelOwl scale={2} /></div>
            <div>
              <NameTag>Dr. Owler</NameTag>
              {loading
                ? <p role="status" className="mt-1.5">{t('Checking your account…', '正在确认登录状态…')}</p>
                : <p className="mt-1.5 leading-relaxed">{t('Dodge attacks, collect XP, and answer limit questions to pick upgrades.', '躲开攻击、收集经验，答对极限题就能选升级。')}</p>}
            </div>
          </div>
          {!loading && (
            <Button asChild size="lg" className={`mt-8 w-full sm:w-auto ${pixelButton}`}>
              <Link to={`/auth?returnTo=${encodeURIComponent('/arena')}`}>{t('Sign in to play', '登录开玩')}</Link>
            </Button>
          )}
        </div>
      </Stars>
    </main>
  );
}
