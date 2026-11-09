import { Link } from 'react-router-dom';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import PixelOwl from '@/components/PixelOwl';
import Reveal from '@/components/Reveal';
import { Dither, HudTag, NameTag, Stars, pixelButton, pixelPanel } from '@/components/PixelUi';

const EPISODE_URL = 'https://youtu.be/15DBSDg6sWI';
const EPISODE_THUMB = 'https://i.ytimg.com/vi/15DBSDg6sWI/hqdefault.jpg';

export default function CalcQuestSection() {
  const { t } = useLanguage();

  return (
    <section aria-labelledby="calc-quest-title" className="text-[#FFF1E8]">
      <Dither />
      <Stars>
        <div className="mx-auto grid max-w-7xl items-center gap-14 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-2 lg:gap-16 lg:px-8">
          <Reveal>
            <HudTag title="CALC QUEST" />
            <h2 id="calc-quest-title" className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">
              {t('Learn calculus through games', '在游戏里学微积分')}
            </h2>
            <p className="mt-4 max-w-xl text-lg text-[#C2C3C7]">
              {t(
                'Our AP Calculus videos are a pixel adventure: Redred gets stuck, Dr. Owler explains why. Then take what you learned into Limit Arena and put it to the test.',
                '我们的 AP 微积分视频是一场像素冒险：Redred 卡住了，欧鸮博士讲清楚为什么。学完再去极限竞技场实战一把。',
              )}
            </p>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <Button asChild size="lg" className={pixelButton}>
                <Link to="/arena">{t('Play Limit Arena', '进入极限竞技场')}</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-none border-2 border-[#FFF1E8] bg-transparent text-[#FFF1E8] hover:bg-[#FFF1E8]/10 hover:text-[#FFF1E8] focus-visible:ring-[#FFF1E8]">
                <Link to="/courses">{t('Browse the lessons', '去看更多课程')}</Link>
              </Button>
            </div>
          </Reveal>

          <Reveal delay={150}>
            <div className="relative pb-24 sm:pb-16">
              <a href={EPISODE_URL} target="_blank" rel="noopener noreferrer" className={`group relative block ${pixelPanel}`}>
                <img
                  src={EPISODE_THUMB}
                  alt={t('CALC QUEST video: Learn Calculus through games', 'CALC QUEST 视频：在游戏里学微积分')}
                  loading="lazy"
                  className="aspect-video w-full object-cover"
                />
                <span aria-hidden="true" className="absolute left-1/2 top-1/2 grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center bg-[#FFEC27] text-[#1D2B53] shadow-[4px_4px_0_#000] transition-transform group-hover:scale-110 motion-reduce:transform-none">
                  <Play className="h-7 w-7 fill-current" />
                </span>
              </a>
              <div className={`absolute bottom-0 left-3 right-3 flex items-start gap-3 p-3 sm:left-8 sm:right-auto sm:max-w-md ${pixelPanel}`}>
                <div className="shrink-0 border-2 border-[#83769C] bg-[#1D2B53] p-1"><PixelOwl scale={2} /></div>
                <div>
                  <NameTag>Dr. Owler</NameTag>
                  <p className="mt-1.5 text-sm leading-relaxed sm:text-base">
                    {t('Every topic is a level. Clear it in the video, then prove it in the Arena.', '每个知识点都是一关。视频里学懂了，就去竞技场证明给我看。')}
                  </p>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </Stars>
      <Dither flip />
    </section>
  );
}
