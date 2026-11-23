import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { TONE_TILE, type ToneName } from '@/lib/tones';

// The top of every feature page: quiet tone tile, title, at most one sentence, and the page's one main action on the right.
export default function PageHeader({ icon: Icon, tone, title, description, children }: {
  icon: LucideIcon; tone: ToneName; title: string; description?: string; children?: ReactNode;
}) {
  const { language } = useLanguage();
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
      <div className="flex min-w-0 items-start gap-4">
        <div aria-hidden="true" className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl sm:h-14 sm:w-14 ${TONE_TILE[tone]}`}><Icon strokeWidth={1.75} className="h-6 w-6 sm:h-7 sm:w-7" /></div>
        <div className="min-w-0">
          <h1 className={`text-3xl font-semibold text-foreground sm:text-4xl ${language === 'zh' ? 'leading-[1.35] tracking-[0.02em]' : 'leading-tight tracking-tight'}`}>{title}</h1>
          {description && <p className="mt-2 max-w-2xl text-lg leading-relaxed text-muted-foreground">{description}</p>}
        </div>
      </div>
      {children}
    </header>
  );
}
