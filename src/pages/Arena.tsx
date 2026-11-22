import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
// Height of the floating site header in Navbar.tsx (12px top gap + 64px bar + 1px border),
// so the embedded game fills the rest of the screen without scrolling the page.
const SITE_NAV_HEIGHT = '77px';

// The game reads its own same-origin language key on load; keep it on the site's choice.
function ArenaGame({ language, admin, email }: { language: Language; admin: boolean; email?: string }) {
  const [testCoins, setTestCoins] = useState(false);
  useEffect(() => {
    if (!email || location.hostname !== 'brian.o2i-website.pages.dev' || !crypto.subtle) return;
    let active = true;
    const bytes = new TextEncoder().encode(email.trim().toLowerCase());
    void crypto.subtle.digest('SHA-256', bytes).then((digest) => {
      const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
      if (active) setTestCoins([
        '977d71156e66e6481718578647a6c7971906d9d453bd564f7c14d5e5370d539a',
        '8cc7976e576051c7b1243c9fc705bc61ffe933c13da3ee5ff722f8995c833293',
        "068febbc135164aaf5fab2b8a460cf15d74838db0e9c0988430e2f846b035406",
      ].includes(fingerprint));
    }).catch(() => {});
    return () => { active = false; };
  }, [email]);
  useState(() => {
    try { localStorage.setItem('cq-arena-lang', language === 'zh' ? 'zh' : 'en'); } catch { /* the game falls back to the browser language */ }
    return language;
  });
  // Admins get a test-speed row on the game's setup screen (arena-knowledge.js ADMIN_KEY).
  // It only speeds up their own local run, and test runs are never recorded.
  useEffect(() => {
    try {
      if (admin) localStorage.setItem('cq-arena-admin', '1');
      else localStorage.removeItem('cq-arena-admin');
    } catch { /* no test speed without storage */ }
  }, [admin]);
  const frame = useRef<HTMLIFrameElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [viewport, setViewport] = useState<{ width: number; height: number; top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    if (!expanded) { setViewport(null); return; }
    let queued = 0;
    const update = () => {
      cancelAnimationFrame(queued);
      queued = requestAnimationFrame(() => {
        const view = window.visualViewport;
        setViewport({ width: view?.width || window.innerWidth, height: view?.height || window.innerHeight,
          top: view?.offsetTop || 0, left: view?.offsetLeft || 0 });
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    return () => {
      cancelAnimationFrame(queued);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
    };
  }, [expanded]);
  useEffect(() => {
    if (!expanded) return;
    const root = document.documentElement;
    const previousOverflow = document.body.style.overflow;
    const previousOverscroll = root.style.overscrollBehavior;
    document.body.style.overflow = 'hidden';
    root.style.overscrollBehavior = 'none';
    // Hides the site header while the game covers the screen (index.css).
    root.classList.add('arena-expanded');
    return () => {
      document.body.style.overflow = previousOverflow;
      root.style.overscrollBehavior = previousOverscroll;
      root.classList.remove('arena-expanded');
      // Leaving full screen can leave the page scrolled so the header covers the
      // top of the game; bring the whole game back into view.
      requestAnimationFrame(() => window.scrollTo(0, 0));
    };
  }, [expanded]);

  // Layout effect: the listener must exist before the iframe's first message.
  useLayoutEffect(() => {
    const onMessage = async (event: MessageEvent) => {
      const game = frame.current?.contentWindow;
      if (!game || event.source !== game || event.origin !== window.location.origin) return;
      if (event.data?.source === 'limit-arena-display') {
        if (event.data.action === 'expand') setExpanded(true);
        if (event.data.action === 'restore') setExpanded(false);
        return;
      }
      if (!isArenaRequest(event.data)) return;
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
      data-arena-test-coins={testCoins ? "true" : undefined}
      src="/games/limit-arena.html"
      title="CALC QUEST Limit Arena"
      allowFullScreen
      allow="fullscreen"
      onLoad={() => {
        const doc = frame.current?.contentDocument;
        if (doc) {
          const style = doc.createElement('style');
          style.textContent = katexStyles + '.math-content{min-width:0;max-width:100%;overflow-wrap:anywhere}.qz .katex:not(.katex-display){overflow:visible;max-width:none}.qz .math-content p{line-height:1.65}.math-content p{margin:.35em 0}.math-content table{border-collapse:collapse}.math-content th,.math-content td{border:1px solid currentColor;padding:.4em}.qz img{max-width:100%;max-height:45vh;object-fit:contain}.qz .katex-display{overflow-x:auto;overflow-y:hidden}';
          doc.head.append(style);
        }
        frame.current?.focus();
      }}
      className={`${expanded ? 'fixed inset-0 z-[100]' : 'block'} w-full border-0 bg-black`}
      style={expanded ? { height: viewport?.height ?? '100dvh', width: viewport?.width ?? '100%',
        top: viewport?.top ?? 0, left: viewport?.left ?? 0, right: 'auto', bottom: 'auto' }
        : { height: `calc(100dvh - ${SITE_NAV_HEIGHT})` }}
    />
  );
}

export default function Arena() {
  const { user, loading, isAdmin } = useAuth();
  const { language, t } = useLanguage();
  if (user) return <ArenaGame key={user.id + language} language={language} admin={isAdmin} email={user.email} />;
  return (
    <main className="text-[#FFF1E8]">
      <Stars className="grid min-h-[calc(100dvh-77px)] place-items-center px-4 py-16">
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
