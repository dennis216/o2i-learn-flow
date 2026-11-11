import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';

// Same colour tiles as the homepage feature icons.
const tiles = {
  blue: 'from-[hsl(var(--education-blue))] to-[hsl(212_90%_52%)] text-white shadow-[hsl(var(--education-blue)/0.3)]',
  amber: 'from-[hsl(var(--education-orange))] to-[hsl(32_95%_55%)] text-amber-950 shadow-[hsl(var(--education-orange)/0.35)]',
  teal: 'from-[hsl(var(--education-teal))] to-[hsl(168_70%_40%)] text-white shadow-[hsl(var(--education-teal)/0.3)]',
} as const;

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
      <div className={`mb-6 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br shadow-lg ${tiles[tile]}`}>
        <Icon aria-hidden="true" strokeWidth={2.25} className="h-8 w-8" />
      </div>
      <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{title}</h2>
      <p className="mt-3 text-lg text-muted-foreground">{description}</p>
      <div className="mt-8 flex flex-col gap-4 sm:flex-row">
        <Button size="lg" asChild><Link to={`/auth?${query}`}>{t('Sign in', '登录')}</Link></Button>
        <Button size="lg" variant="outline" asChild><Link to={`/auth?tab=signup&${query}`}>{t('Create account', '注册账号')}</Link></Button>
      </div>
    </div>
  );
}
