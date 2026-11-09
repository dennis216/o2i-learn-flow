import { Link } from 'react-router-dom';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Book, MessageCircleQuestion, Target } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import ScholarCounter from '@/components/home/ScholarCounter';

// Fades and lifts its content in the first time it scrolls into view; shown immediately under reduced motion.
function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) { setShown(true); return; }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setShown(true); observer.disconnect(); }
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-[opacity,transform] duration-700 ease-out motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none ${shown ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'} ${className}`}
    >
      {children}
    </div>
  );
}

const features = [
  {
    icon: Book,
    tile: 'from-[hsl(var(--education-blue))] to-[hsl(212_90%_52%)] text-white shadow-[hsl(var(--education-blue)/0.3)]',
    title: ['Courses', '课程'],
    description: ['Video lessons organized by unit and topic, from AP Calculus to contest math.', '按单元和知识点整理的视频课，从 AP 微积分到竞赛数学。'],
    action: ['Browse courses', '浏览课程'],
    link: '/courses',
  },
  {
    icon: MessageCircleQuestion,
    // dark icon on amber: white on yellow would fail contrast
    tile: 'from-[hsl(var(--education-orange))] to-[hsl(32_95%_55%)] text-amber-950 shadow-[hsl(var(--education-orange)/0.35)]',
    title: ['Solution Requests', '答疑'],
    description: ['Upload a photo of a problem and a tutor sends back a step-by-step solution.', '拍照上传题目，老师给你分步解答。'],
    action: ['Ask a question', '去提问'],
    link: '/solution-requests',
  },
  {
    icon: Target,
    tile: 'from-[hsl(var(--education-teal))] to-[hsl(168_70%_40%)] text-white shadow-[hsl(var(--education-teal)/0.3)]',
    title: ['Quick Practice', '快速练习'],
    description: ['Questions that adjust to your progress. Your answers are saved so you can review them.', '题目会按你的进度调整，作答会保存下来，方便复习。'],
    action: ['Start practicing', '开始练习'],
    link: '/practice',
  },
] as const;

export default function Index() {
  const { user } = useAuth();
  const { t } = useLanguage();

  return (
    <main className="min-h-screen bg-background">
      <section className="relative overflow-hidden bg-gradient-to-br from-primary/5 to-accent/5 py-14 sm:py-20">
        {/* graph-paper backdrop, faded toward the edges */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 [background-image:linear-gradient(hsl(var(--primary)/0.06)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--primary)/0.06)_1px,transparent_1px)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_80%)]" />
        {/* soft fade into the next section instead of a hard edge */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-background" />
        <svg aria-hidden="true" viewBox="0 0 240 140" fill="none" stroke="currentColor" className="pointer-events-none absolute bottom-10 right-6 hidden h-36 w-60 text-primary/20 md:block">
          <path d="M0 70H240M20 0V140" strokeWidth="1" />
          <path d="M20 70Q60 -10 100 70T180 70T260 70" strokeWidth="2" />
        </svg>
        <div className="relative mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <Reveal>
            <h1 className="mx-auto mb-6 max-w-3xl break-keep text-balance text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
              {t('Understand the math, not just the answer.', '弄懂思路，而不只是答案。')}
            </h1>
          </Reveal>
          <Reveal delay={120}>
            <p className="mx-auto mb-8 max-w-2xl text-lg text-muted-foreground sm:text-xl">
              {t('Courses, practice and tutor help for AP Calculus, AP Statistics, Precalculus, SAT Math and AMC 10/12.', 'AP 微积分、AP 统计、Precalculus、SAT 数学和 AMC 10/12 的课程、练习和老师答疑，都在这里。')}
            </p>
          </Reveal>

          <Reveal delay={240} className="mb-10"><ScholarCounter /></Reveal>

          <Reveal delay={360} className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            {user ? (
              <>
                <Button size="lg" asChild><Link to="/courses"><Book className="mr-2 h-5 w-5" />{t('Browse Courses', '浏览课程')}</Link></Button>
                <Button size="lg" variant="outline" asChild><Link to="/practice"><Target className="mr-2 h-5 w-5" />{t('Go to Practice', '去练习')}</Link></Button>
              </>
            ) : (
              <>
                <Button size="lg" asChild><Link to="/courses">{t('Get Started', '开始学习')}</Link></Button>
                <Button size="lg" variant="outline" asChild><Link to="/practice">{t('Try Practice', '先做几道题')}</Link></Button>
              </>
            )}
          </Reveal>
        </div>
      </section>

      <section className="bg-background pb-14 pt-4 sm:pb-20 sm:pt-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal className="mb-10 text-center sm:mb-12">
            <h2 className="mb-4 text-2xl font-bold text-foreground sm:text-3xl">{t('Learn it, practice it, ask about it', '学、练、问，一站搞定')}</h2>
            <p className="mx-auto max-w-2xl text-lg text-muted-foreground">{t("Watch a lesson, try the questions, and send us anything you're stuck on.", '先看课，再做题，卡住了就来问。')}</p>
          </Reveal>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-8">
            {features.map((feature, i) => (
              <Reveal key={feature.link} delay={i * 120} className="h-full">
                <Card className="group relative flex h-full flex-col rounded-2xl border-0 bg-transparent shadow-none transition-colors duration-200 hover:bg-muted/60">
                  <CardHeader className="text-center">
                    <div className={`mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br shadow-lg ring-4 ring-background transition-transform duration-200 group-hover:-translate-y-1 group-hover:rotate-3 motion-reduce:transform-none ${feature.tile}`}>
                      <feature.icon aria-hidden="true" strokeWidth={2.25} className="h-8 w-8" />
                    </div>
                    <CardTitle className="mb-2 text-xl">{t(feature.title[0], feature.title[1])}</CardTitle>
                    <CardDescription className="text-base">{t(feature.description[0], feature.description[1])}</CardDescription>
                  </CardHeader>
                  {/* mt-auto pins the button to the bottom so all three line up */}
                  <CardContent className="mt-auto text-center"><Button variant="outline" asChild><Link to={feature.link} className="after:absolute after:inset-0">{t(feature.action[0], feature.action[1])}</Link></Button></CardContent>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-gradient-to-b from-background via-primary/5 to-accent/10 py-14 sm:py-20">
        <Reveal className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="mb-4 text-2xl font-bold text-foreground sm:text-3xl">{t('Ready when you are', '准备好了就开始吧')}</h2>
          <p className="mb-8 text-lg text-muted-foreground">{t('Create an account to save your progress and send questions to tutors.', '注册账号后，练习记录会保存下来，也可以向老师提问。')}</p>
          {!user && <div className="flex flex-col items-center justify-center gap-4 sm:flex-row"><Button size="lg" asChild><Link to="/auth?tab=signup">{t('Create account', '注册账号')}</Link></Button><Button size="lg" variant="outline" asChild><Link to="/auth">{t('Sign In', '登录')}</Link></Button></div>}
        </Reveal>
      </section>
    </main>
  );
}
