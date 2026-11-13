import { Link } from 'react-router-dom';
import { Gamepad2, TrendingUp, UserRound } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import Reveal from '@/components/Reveal';
import ScholarCounter from '@/components/home/ScholarCounter';
import CalcQuestSection from '@/components/home/CalcQuestSection';
import AwardsSection from '@/components/home/AwardsSection';
import TeamLeadersSection from '@/components/home/TeamLeadersSection';
import ContactSection from '@/components/home/ContactSection';

// What sets O2I apart, each with the concrete thing behind it and where to try it.
const traits = [
  {
    icon: TrendingUp,
    tile: 'from-[hsl(var(--education-teal))] to-[hsl(168_70%_40%)] text-white',
    panel: 'bg-[hsl(var(--education-teal)/0.08)] hover:bg-[hsl(var(--education-teal)/0.15)]',
    title: ['Adaptive', '自适应'],
    description: ['Miss a question and the next one is easier. Three right in a row and it steps up.', '答错了，下一题换简单的；连对三题，难度往上升。'],
    action: ['Start practicing', '去练习'],
    link: '/practice',
  },
  {
    icon: UserRound,
    // dark icon on amber: white on yellow would fail contrast
    tile: 'from-[hsl(var(--education-orange))] to-[hsl(32_95%_55%)] text-amber-950',
    panel: 'bg-[hsl(var(--education-orange)/0.14)] hover:bg-[hsl(var(--education-orange)/0.24)]',
    title: ['Personal', '个人化'],
    description: ['See which topics still need practice, and send your own problems to a tutor.', '哪些知识点还要多练，一眼看到；自己的题不会，拍照问老师。'],
    action: ['Ask a tutor', '去提问'],
    link: '/solution-requests',
  },
  {
    icon: Gamepad2,
    tile: 'from-[hsl(var(--education-blue))] to-[hsl(212_90%_52%)] text-white',
    panel: 'bg-[hsl(var(--education-blue)/0.07)] hover:bg-[hsl(var(--education-blue)/0.13)]',
    title: ['Learn by playing', '玩中学'],
    description: ['Lessons are a pixel adventure with Dr. Owler, and Limit Arena turns limits into a game.', '视频课是欧鸮博士的像素冒险，极限竞技场把极限题变成游戏。'],
    action: ['Play Limit Arena', '进入极限竞技场'],
    link: '/arena',
  },
] as const;

export default function Index() {
  const { user } = useAuth();
  const { language, t } = useLanguage();

  return (
    // Chinese: wrap only at punctuation and spaces so words like 微积分 aren't split; anywhere-wrap is the fallback for a clause too long for the line.
    <main className={`min-h-screen bg-background ${language === 'zh' ? 'break-keep [overflow-wrap:anywhere]' : ''}`}>
      {/* The one full-colour block on the page: blue graph paper, with the yellow button as the only primary action. */}
      <section className="relative overflow-hidden bg-primary text-primary-foreground">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 [background-image:linear-gradient(hsl(0_0%_100%/0.07)_1px,transparent_1px),linear-gradient(90deg,hsl(0_0%_100%/0.07)_1px,transparent_1px)] [background-size:32px_32px]" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[minmax(0,1fr)_400px] lg:px-8">
          <div>
            <Reveal>
              <h1 className={`max-w-2xl break-keep text-balance text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl ${language === 'zh' ? 'leading-[1.35] sm:leading-[1.3] lg:leading-[1.3]' : 'leading-tight sm:leading-[1.1] lg:leading-[1.08]'}`}>
                {t('Understand the math, not just the answer.', '弄懂思路，而不只是答案。')}
              </h1>
              <p className="mt-5 max-w-xl text-lg text-primary-foreground/80 sm:text-xl">
                {t('Adaptive practice, personal help and learn-by-playing lessons for AP, SAT and AMC math.', 'AP、SAT、AMC 数学：自适应练习、个人化辅导、玩中学。')}
              </p>
            </Reveal>
            <Reveal delay={120} className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
              <Button size="lg" asChild className="h-12 bg-accent px-8 text-base font-semibold text-accent-foreground shadow-lg shadow-black/20 hover:bg-accent/90 focus-visible:ring-accent focus-visible:ring-offset-primary">
                <Link to="/courses">{user ? t('Browse courses', '浏览课程') : t('Start learning', '开始学习')}</Link>
              </Button>
              <Link to="/practice" className="rounded-sm py-2 text-base font-medium underline decoration-white/40 underline-offset-4 hover:decoration-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                {user ? t('Go to practice', '去练习') : t('Try a few questions', '先做几道题')}
              </Link>
            </Reveal>
            <Reveal delay={240} className="mt-10"><ScholarCounter /></Reveal>
          </div>
          {/* "One to Infinity": a curve that starts at 1 and runs off to ∞ */}
          <svg aria-hidden="true" viewBox="0 0 400 300" fill="none" className="hidden h-auto w-full lg:block">
            <path d="M28 272H392M52 292V12" stroke="hsl(0 0% 100% / 0.45)" strokeWidth="2" />
            <path d="M44 232H60" stroke="hsl(0 0% 100% / 0.7)" strokeWidth="2" />
            <text x="22" y="239" fill="hsl(0 0% 100% / 0.8)" fontSize="20" fontWeight="600">1</text>
            <path d="M52 232C190 228 290 190 356 38" stroke="hsl(var(--accent))" strokeWidth="6" strokeLinecap="round" />
            <path d="M336 50l20-12 4 23" stroke="hsl(var(--accent))" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="52" cy="232" r="7" fill="hsl(var(--accent))" />
            <text x="366" y="34" fill="hsl(var(--accent))" fontSize="40" fontWeight="700">∞</text>
          </svg>
        </div>
      </section>

      <section aria-labelledby="traits-heading" className="mx-auto max-w-7xl px-4 pt-14 sm:px-6 sm:pt-20 lg:px-8">
        <Reveal><h2 id="traits-heading" className="mb-8 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{t('How learning works here', '在 O2I 怎么学')}</h2></Reveal>
        <div className="grid gap-4 md:grid-cols-3">
          {traits.map((trait, i) => (
            <Reveal key={trait.link} delay={i * 100} className="h-full">
              <div className={`group relative flex h-full flex-col rounded-2xl p-6 transition-colors ${trait.panel}`}>
                <div className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br shadow-md transition-transform duration-200 group-hover:-translate-y-0.5 motion-reduce:transform-none ${trait.tile}`}>
                  <trait.icon aria-hidden="true" strokeWidth={2.25} className="h-7 w-7" />
                </div>
                <h3 className="mt-5 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{t(trait.title[0], trait.title[1])}</h3>
                <p className="mt-2 text-lg text-muted-foreground">{t(trait.description[0], trait.description[1])}</p>
                {/* mt-auto lines the three links up; the whole panel is the link */}
                <p className="mt-auto pt-5"><Link to={trait.link} className="rounded-sm font-semibold text-primary underline decoration-primary/30 underline-offset-4 after:absolute after:inset-0 after:rounded-2xl group-hover:decoration-primary focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring">{t(trait.action[0], trait.action[1])}</Link></p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <AwardsSection />

      <CalcQuestSection />

      <TeamLeadersSection />

      <ContactSection />
    </main>
  );
}
