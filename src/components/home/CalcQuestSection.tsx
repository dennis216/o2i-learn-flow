import { Link } from 'react-router-dom';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import PixelOwl from '@/components/PixelOwl';
import Reveal from '@/components/Reveal';

const EPISODE_URL = 'https://youtu.be/15DBSDg6sWI';
const EPISODE_THUMB = 'https://i.ytimg.com/vi/15DBSDg6sWI/hqdefault.jpg';

export default function CalcQuestSection() {
  const { t } = useLanguage();

  return (
    <section aria-labelledby="calc-quest-title" className="calc-quest-section text-foreground">
      <div className="calc-quest-surface">
        <div className="mx-auto grid max-w-7xl items-center gap-14 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-2 lg:gap-16 lg:px-8">
          <Reveal>
            <p className="calc-quest-label">CALC QUEST</p>
            <h2 id="calc-quest-title" className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">
              {t('Learn calculus through play', '在游戏里学微积分')}
            </h2>
            <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted-foreground">
              {t('Join Dr. Owler for pixel-adventure AP Calculus lessons, then practice what you have learned in Limit Arena.', '和欧鸮博士一起看 AP 微积分动画课，再到极限竞技场练习刚学的内容。')}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
              <Button asChild size="lg" className="h-12 rounded-md px-8 text-base">
                <Link to="/arena">{t('Play Limit Arena', '进入极限竞技场')}</Link>
              </Button>
              <Link to="/courses" className="py-2 text-base font-medium text-foreground underline decoration-primary/40 underline-offset-4 hover:decoration-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t('Browse the lessons', '浏览课程')}</Link>
            </div>
          </Reveal>

          <Reveal delay={150}>
            <div className="relative pb-24 sm:pb-16">
              <a href={EPISODE_URL} target="_blank" rel="noopener noreferrer" className="quest-panel group relative block overflow-hidden rounded-lg">
                <img
                  src={EPISODE_THUMB}
                  alt={t('CALC QUEST: calculus lessons with Dr. Owler', 'CALC QUEST：欧鸮博士的微积分动画课')}
                  loading="lazy"
                  className="aspect-video w-full object-cover"
                />
                <span aria-hidden="true" className="absolute left-1/2 top-1/2 grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform group-hover:scale-110 motion-reduce:transform-none">
                  <Play className="h-7 w-7 fill-current" />
                </span>
              </a>
              <div className="quest-panel absolute bottom-0 left-3 right-3 flex items-start gap-3 rounded-lg p-4 sm:left-8 sm:right-auto sm:max-w-md">
                <div className="shrink-0 rounded border border-border bg-background p-1"><PixelOwl scale={2} /></div>
                <div>
                  <span className="text-sm font-semibold text-primary">{t('Dr. Owler', '欧鸮博士')}</span>
                  <p className="mt-1.5 text-sm leading-relaxed sm:text-base">
                    {t('Ready to try it? Take what you learned into the Arena.', '看懂了？去竞技场练几题，看看自己掌握得怎么样。')}
                  </p>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
