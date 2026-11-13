import { Link } from 'react-router-dom';
import { Book, MessageCircleQuestion, Target } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import Reveal from '@/components/Reveal';
import ScholarCounter from '@/components/home/ScholarCounter';
import CalcQuestSection from '@/components/home/CalcQuestSection';
import AwardsSection from '@/components/home/AwardsSection';
import TeamLeadersSection from '@/components/home/TeamLeadersSection';
import ContactSection from '@/components/home/ContactSection';

// Courses, practice, questions: the order a student uses them in. Each panel is tinted with its own colour and is one big link.
const features = [
  {
    icon: Book,
    tile: 'from-[hsl(var(--education-blue))] to-[hsl(212_90%_52%)] text-white',
    panel: 'bg-[hsl(var(--education-blue)/0.07)] hover:bg-[hsl(var(--education-blue)/0.13)]',
    title: ['Courses', '课程'],
    description: ['Video lessons by unit and topic.', '按单元和知识点整理的视频课。'],
    link: '/courses',
  },
  {
    icon: Target,
    tile: 'from-[hsl(var(--education-teal))] to-[hsl(168_70%_40%)] text-white',
    panel: 'bg-[hsl(var(--education-teal)/0.08)] hover:bg-[hsl(var(--education-teal)/0.15)]',
    title: ['Quick Practice', '快速练习'],
    description: ['Graded right away, saved for review.', '做完马上判分，记录留着复习。'],
    link: '/practice',
  },
  {
    icon: MessageCircleQuestion,
    // dark icon on amber: white on yellow would fail contrast
    tile: 'from-[hsl(var(--education-orange))] to-[hsl(32_95%_55%)] text-amber-950',
    panel: 'bg-[hsl(var(--education-orange)/0.14)] hover:bg-[hsl(var(--education-orange)/0.24)]',
    title: ['Solution Requests', '答疑'],
    description: ['Send a photo of a problem, get the steps back.', '拍照上传题目，老师给你分步解答。'],
    link: '/solution-requests',
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
                {t('Lessons, practice and tutor help for AP, SAT and AMC math.', 'AP、SAT、AMC 数学的课程、练习和答疑。')}
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

      <AwardsSection />

      <section aria-labelledby="features-heading" className="mx-auto max-w-7xl px-4 pb-14 sm:px-6 sm:pb-20 lg:px-8">
        <Reveal><h2 id="features-heading" className="mb-8 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{t('Learn it, practice it, ask about it', '学、练、问，一站搞定')}</h2></Reveal>
        <div className="grid gap-4 md:grid-cols-3">
          {features.map((feature, i) => (
            <Reveal key={feature.link} delay={i * 100} className="h-full">
              <Link to={feature.link} className={`group flex h-full items-center gap-4 rounded-2xl p-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:flex-col md:items-start md:p-6 ${feature.panel}`}>
                <div className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br shadow-md transition-transform duration-200 group-hover:-translate-y-0.5 motion-reduce:transform-none ${feature.tile}`}>
                  <feature.icon aria-hidden="true" strokeWidth={2.25} className="h-7 w-7" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xl font-semibold text-foreground">{t(feature.title[0], feature.title[1])}</h3>
                  <p className="mt-1 text-muted-foreground">{t(feature.description[0], feature.description[1])}</p>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      <CalcQuestSection />

      <TeamLeadersSection />

      <ContactSection />
    </main>
  );
}
