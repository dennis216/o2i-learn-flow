import { ExternalLink, Medal } from 'lucide-react';
import Reveal from '@/components/Reveal';
import { useLanguage } from '@/contexts/LanguageContext';

const RESULTS_URL = 'https://iai2o-official.org/past-events/iai2o-2026/final-results';

// The row from the organiser's results page, as a picture; the whole card opens the official results.
export default function AwardsSection() {
  const { t } = useLanguage();
  return (
    <section aria-labelledby="awards-heading" className="mx-auto max-w-7xl px-4 pb-14 pt-2 sm:px-6 sm:pb-20 lg:px-8">
      <Reveal>
        <a href={RESULTS_URL} target="_blank" rel="noopener noreferrer" className="group block rounded-2xl p-4 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-6">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            {/* silver medal colours, not site tokens */}
            <div aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-slate-200 to-slate-400 text-slate-800 shadow-md"><Medal className="h-6 w-6" /></div>
            <div className="min-w-0 flex-1 basis-48">
              <h2 id="awards-heading" className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">{t('Silver Medal, International AI Innovation Olympiad 2026', '2026 国际人工智能创新奥林匹克（IAI²O）银牌')}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t('AI for Business track (remote session), inaugural IAI²O Global Finals, September 2026.', '首届 IAI²O 全球总决赛 AI for Business 赛道（线上组），2026 年 9 月。')}</p>
            </div>
            <span className="inline-flex w-full items-center gap-1 text-sm font-semibold text-primary group-hover:underline sm:w-auto">
              {t('Official results', '查看官方结果')}<ExternalLink aria-hidden="true" className="h-4 w-4" />
            </span>
          </div>
          {/* Wide table row: on phones it scrolls sideways inside the card instead of shrinking to unreadable text. */}
          <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-border">
            <img src="/awards-iai2o-2026.png" width={2639} height={203} loading="lazy"
              alt={t('Official results: Rank 1, Silver, Dennis\'s Team (Ziquan Wang, Wenyao Ma, Zixuan Luo), Canada and USA, certificate available.', '官方结果：第 1 名，银牌，Dennis\'s Team（Ziquan Wang、Wenyao Ma、Zixuan Luo），加拿大和美国，可下载证书。')}
              className="block h-auto w-full min-w-[760px]" />
          </div>
        </a>
      </Reveal>
    </section>
  );
}
