import { Link } from 'react-router-dom';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Book, Image, Target } from 'lucide-react';
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
    icon: <Book className="h-8 w-8 text-primary" />,
    title: ['Expert Courses', '精品课程'],
    description: ['Comprehensive math courses from beginner to advanced levels taught by experienced instructors.', '从入门到进阶的系统数学课程，由经验丰富的老师讲授。'],
    link: '/courses',
  },
  {
    icon: <Image className="h-8 w-8 text-accent" />,
    title: ['Solution Requests', '答疑'],
    description: ['Upload math problems and get step-by-step solutions from our expert tutors.', '上传数学题，由我们的老师给出分步解答。'],
    link: '/solution-requests',
  },
  {
    icon: <Target className="h-8 w-8 text-primary" />,
    title: ['Quick Practice', '快速练习'],
    description: ['Build confidence with focused practice that responds to your progress.', '题目会根据你的进度调整，越练越有底。'],
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
            <h1 className="mb-6 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
              {t('Welcome to ', '欢迎来到 ')}<span className="text-primary">O2I Institute</span>
            </h1>
          </Reveal>
          <Reveal delay={120}>
            <p className="mx-auto mb-8 max-w-3xl text-lg text-muted-foreground sm:text-xl">
              {t('Master mathematics with our comprehensive tutoring platform. Get expert help, connect with peers, and unlock your potential with personalized learning experiences.', '在这里学数学：有老师答疑，有同学一起交流，学习内容也会按你的情况调整。')}
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
            <h2 className="mb-4 text-2xl font-bold text-foreground sm:text-3xl">{t('Everything You Need to Excel in Math', '学数学需要的，这里都有')}</h2>
            <p className="mx-auto max-w-2xl text-lg text-muted-foreground">{t('Our comprehensive platform provides all the tools and support you need for mathematical success.', '课程、练习、答疑，都在一个地方。')}</p>
          </Reveal>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-8">
            {features.map((feature, i) => (
              <Reveal key={feature.link} delay={i * 120}>
              <Card className="relative h-full rounded-2xl border-0 bg-transparent shadow-none transition-colors duration-200 hover:bg-muted/60">
                <CardHeader className="text-center">
                  <div className="mx-auto mb-4 w-fit rounded-full bg-accent/10 p-3">{feature.icon}</div>
                  <CardTitle className="mb-2 text-xl">{t(feature.title[0], feature.title[1])}</CardTitle>
                  <CardDescription className="text-base">{t(feature.description[0], feature.description[1])}</CardDescription>
                </CardHeader>
                <CardContent className="text-center"><Button variant="outline" asChild><Link to={feature.link} className="after:absolute after:inset-0">{t('Learn More', '了解更多')}</Link></Button></CardContent>
              </Card>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-gradient-to-b from-background via-primary/5 to-accent/10 py-14 sm:py-20">
        <Reveal className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="mb-4 text-2xl font-bold text-foreground sm:text-3xl">{t('Ready to Transform Your Math Skills?', '想把数学学得更扎实？')}</h2>
          <p className="mb-8 text-lg text-muted-foreground">{t('Join thousands of students who have improved their mathematical understanding with O2I Institute.', '已经有几千名同学在 O2I Institute 学数学。')}</p>
          {!user && <div className="flex flex-col items-center justify-center gap-4 sm:flex-row"><Button size="lg" asChild><Link to="/auth">{t('Sign Up Today', '立即注册')}</Link></Button><Button size="lg" variant="outline" asChild><Link to="/auth">{t('Sign In', '登录')}</Link></Button></div>}
        </Reveal>
      </section>
    </main>
  );
}
