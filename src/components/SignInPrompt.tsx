import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { TONE_TILE } from '@/lib/tones';

const tiles = { blue: TONE_TILE.blue, amber: TONE_TILE.amber, teal: TONE_TILE.teal } as const;

// What a signed-out visitor sees on a page that needs an account: what the page is for, then how to get in.
// returnTo must be a path allowed by src/lib/authReturnTo.ts, otherwise sign-in lands on the homepage.
export default function SignInPrompt({ icon: Icon, tile, title, description, returnTo }: {
  icon: LucideIcon;
  tile: keyof typeof tiles;
  title: string;
  description: string;
  returnTo: string;
}) {
  const { t } = useLanguage();
  const query = `returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center break-keep px-4 py-12 text-center [overflow-wrap:anywhere] sm:py-16">
      <div className={`mb-6 grid h-16 w-16 place-items-center rounded-2xl ${tiles[tile]}`}>
        <Icon aria-hidden="true" strokeWidth={1.75} className="h-8 w-8" />
      </div>
      <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">{title}</h2>
      <p className="mt-3 text-lg text-muted-foreground">{description}</p>
      {/* one main button; creating an account is the quieter second choice */}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
        <Button size="lg" asChild className="h-12 px-8 text-base font-semibold"><Link to={`/auth?${query}`}>{t('Sign in', '登录')}</Link></Button>
        <Link to={`/auth?tab=signup&${query}`} className="rounded-sm py-2 font-medium text-primary underline decoration-primary/30 underline-offset-4 hover:decoration-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t('Create account', '注册账号')}</Link>
      </div>
    </div>
  );
}
