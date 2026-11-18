import { Link } from 'react-router-dom';
import { ArrowUpRight, Gamepad2, TrendingUp, UserRound } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import Reveal from '@/components/Reveal';
import LearningGraph from '@/components/home/LearningGraph';
import ScholarCounter from '@/components/home/ScholarCounter';
import CalcQuestSection from '@/components/home/CalcQuestSection';
import AwardsSection from '@/components/home/AwardsSection';
import TeamLeadersSection from '@/components/home/TeamLeadersSection';
import ContactSection from '@/components/home/ContactSection';

// What sets O2I apart, each with the concrete thing behind it and where to try it.
const traits = [
  {
    icon: TrendingUp,
    title: ['Practice at your level', '按你的进度练习'],
    description: ['The next question adapts to how you do: easier after a mistake, harder after three correct answers.', '答错后，先做一道简单的题巩固基础；连续答对三题，再挑战更高难度。'],
    action: ['Start practicing', '开始练习'],
    link: '/practice',
  },
  {
    icon: UserRound,
    title: ['Help when you need it', '遇到难题，向老师提问'],
    description: ['See which topics need more work, and send a problem to a tutor when you get stuck.', '查看还没掌握的知识点；遇到不会的题，可以上传图片向老师提问。'],
    action: ['Ask a question', '提交问题'],
    link: '/solution-requests',
  },
  {
    icon: Gamepad2,
    title: ['Learn through play', '在游戏中练习'],
    description: ['Follow Dr. Owler through the calculus videos, then put what you learned to work in Limit Arena.', '跟着欧鸮博士看微积分动画课，再到极限竞技场试试身手。'],
    action: ['Play Limit Arena', '进入极限竞技场'],
    link: '/arena',
  },
] as const;

export default function Index() {
  const { user } = useAuth();
  const { language, t } = useLanguage();

  return (
    // Chinese: wrap only at punctuation and spaces so words like 微积分 aren't split; anywhere-wrap is the fallback for a clause too long for the line.
    <main className={`glass-home min-h-screen ${language === 'zh' ? 'break-keep [overflow-wrap:anywhere]' : ''}`}>
      {/* An editorial forest-green hero; mathematical artwork stays decorative. */}
      <section className="glass-hero relative overflow-hidden">
        <div className="hero-layout relative mx-auto grid max-w-7xl items-center gap-8 px-6 py-14 sm:px-10 sm:py-20 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-2 lg:px-12 lg:py-24">
          <div>
            <Reveal>
              <p className="glass-eyebrow mb-8"><span className="hero-eyebrow-line" />{t('O2I INSTITUTE · ONE TO INFINITY', 'O2I INSTITUTE · 从一到无穷')}</p>
              <h1 className={`hero-title ${language === 'zh' ? 'hero-title-zh' : ''}`}>
                {t('Understand the math.', '学懂数学，')}
                <span className="hero-title-accent">{t('Not just the answer.', '不只记住答案。')}</span>
              </h1>
              <p className="hero-description mt-7 max-w-md text-base leading-relaxed sm:text-lg">
                {t('Video lessons, adaptive practice and help from tutors for AP Calculus, SAT Math and AMC.', '用视频课梳理知识，用练习查漏补缺，遇到难题向老师提问。覆盖 AP 微积分、SAT 数学和 AMC。')}
              </p>
            </Reveal>
            <Reveal delay={120} className="mt-9 flex flex-wrap items-center gap-x-4 gap-y-4 sm:gap-x-7">
              <Button size="lg" asChild className="glass-primary h-12 px-5 sm:px-7 text-sm font-semibold">
                <Link to="/courses">{user ? t('Browse courses', '浏览课程') : t('Start learning', '开始学习')}<ArrowUpRight aria-hidden="true" className="ml-2 h-4 w-4" /></Link>
              </Button>
              <Link to="/practice" className="hero-secondary rounded-sm py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {user ? t('Go to practice', '去练习') : t('Try a few questions', '先做几道题')}
              </Link>
            </Reveal>
          </div>
          <Reveal delay={240} className="hero-proof-row lg:col-span-2"><ScholarCounter /></Reveal>
          <Reveal delay={180} className="hero-artwork"><LearningGraph /></Reveal>
        </div>
      </section>

      <section aria-labelledby="traits-heading" className="mx-auto max-w-7xl px-4 pt-14 sm:px-6 sm:pt-20 lg:px-8">
        <Reveal className="mb-10 flex flex-wrap items-end justify-between gap-5"><div><p className="section-kicker mb-3">{t('HOW IT WORKS', '学习方式')}</p><h2 id="traits-heading" className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{t('Lessons, practice and support.', '看课、练习、答疑。')}</h2></div><p className="max-w-xs text-sm leading-relaxed text-muted-foreground">{t('Start with a lesson, work through a few questions, or ask for help.', '可以先看一节课、做几道题，或把卡住你的问题发给老师。')}</p></Reveal>
        <div className="traits-grid grid gap-5 md:grid-cols-3">
          {traits.map((trait, i) => (
            <Reveal key={trait.link} delay={i * 100} className="h-full">
              <div className="glass-trait group relative flex h-full flex-col rounded-2xl p-7 sm:p-8">
                <div className="flex items-center justify-between"><span className="trait-number">0{i + 1}</span><trait.icon aria-hidden="true" strokeWidth={1.5} className="h-5 w-5 text-primary" /></div>
                <h3 className="mt-10 text-2xl font-semibold tracking-tight text-foreground">{t(trait.title[0], trait.title[1])}</h3>
                <p className="mt-3 text-base leading-relaxed text-muted-foreground">{t(trait.description[0], trait.description[1])}</p>
                {/* mt-auto lines the three links up; the whole panel is the link */}
                <p className="mt-auto pt-8"><Link to={trait.link} className="trait-link rounded-sm text-sm font-medium text-primary after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring">{t(trait.action[0], trait.action[1])}<ArrowUpRight aria-hidden="true" className="h-4 w-4" /></Link></p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <div aria-hidden="true" className="section-rule mx-auto max-w-7xl"><span /></div>
      <AwardsSection />

      <CalcQuestSection />

      <div aria-hidden="true" className="section-rule mx-auto max-w-7xl"><span /></div>
      <TeamLeadersSection />

      <ContactSection />
    </main>
  );
}
