import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

// Same colour tiles as the homepage panels, so each feature keeps its colour on its own page.
const TILES = {
  blue: 'from-[hsl(var(--education-blue))] to-[hsl(212_90%_52%)] text-white',
  teal: 'from-[hsl(var(--education-teal))] to-[hsl(168_70%_40%)] text-white',
  amber: 'from-[hsl(var(--education-orange))] to-[hsl(32_95%_55%)] text-amber-950',
  purple: 'from-[hsl(var(--education-purple))] to-[hsl(259_80%_58%)] text-white',
} as const;

// The top of every feature page: colour tile, title, at most one sentence, and the page's one main action on the right.
export default function PageHeader({ icon: Icon, tone, title, description, children }: {
  icon: LucideIcon; tone: keyof typeof TILES; title: string; description?: string; children?: ReactNode;
}) {
  const { language } = useLanguage();
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
      <div className="flex min-w-0 items-start gap-4">
        <div aria-hidden="true" className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br shadow-md sm:h-14 sm:w-14 ${TILES[tone]}`}><Icon strokeWidth={2.25} className="h-6 w-6 sm:h-7 sm:w-7" /></div>
        <div className="min-w-0">
          <h1 className={`text-3xl font-bold tracking-tight text-foreground sm:text-4xl ${language === 'zh' ? 'leading-[1.35]' : 'leading-tight'}`}>{title}</h1>
          {description && <p className="mt-1.5 max-w-2xl text-lg text-muted-foreground">{description}</p>}
        </div>
      </div>
      {children}
    </header>
  );
}
