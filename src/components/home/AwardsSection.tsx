import Reveal from '@/components/Reveal';
import { useLanguage } from '@/contexts/LanguageContext';

const RESULTS_URL = 'https://iai2o-official.org/past-events/iai2o-2026/final-results';
const CERTIFICATE_PDF = '/awards-iai2o-2026-certificate.pdf';
const LINK = 'rounded-sm font-semibold text-primary underline decoration-primary/30 underline-offset-4 hover:decoration-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

// The certificate is the picture (it opens the PDF); one line of text and a link to the organiser's results beside it.
export default function AwardsSection() {
  const { t } = useLanguage();
  return (
    <section aria-labelledby="awards-heading" className="mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
      <Reveal className="grid items-center gap-8 md:grid-cols-[300px_minmax(0,1fr)] md:gap-12">
        <a href={CERTIFICATE_PDF} target="_blank" rel="noopener" className="group mx-auto block w-full max-w-sm rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:max-w-none">
          <img src="/awards-iai2o-2026-certificate.webp" width={1200} height={927} loading="lazy"
            alt={t('Certificate of Achievement: Dennis\'s Team (Ziquan Wang, Wenyao Ma, Zixuan Luo) was awarded the Silver Medal in the AI for Business track (Virtual Session), September 26, 2026.', '获奖证书：Dennis\'s Team（Ziquan Wang、Wenyao Ma、Zixuan Luo）获 2026 年 9 月 26 日 AI for Business 赛道（线上组）银牌。')}
            className="block h-auto w-full rounded-xl shadow-lg ring-1 ring-border transition-transform group-hover:-rotate-1 group-hover:scale-[1.02] motion-reduce:transform-none" />
        </a>
        <div>
          <h2 id="awards-heading" className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{t('Silver Medal, International AI Innovation Olympiad 2026', '国际 AI 创新奥林匹克 2026 银牌')}</h2>
          <p className="mt-3 text-lg text-muted-foreground">{t('AI for Business track, Global Finals.', 'AI for Business 赛道，全球总决赛。')}</p>
          <p className="mt-5 flex flex-wrap gap-x-6 gap-y-2">
            <a href={CERTIFICATE_PDF} target="_blank" rel="noopener" className={LINK}>{t('View certificate', '查看证书')}</a>
            <a href={RESULTS_URL} target="_blank" rel="noopener noreferrer" className={LINK}>{t('Official results', '官方结果')}</a>
          </p>
        </div>
      </Reveal>
    </section>
  );
}
