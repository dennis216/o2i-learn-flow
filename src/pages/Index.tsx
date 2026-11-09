import { Link } from 'react-router-dom';
import { Book, Image, Target } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import ScholarCounter from '@/components/home/ScholarCounter';

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
      <section className="relative bg-gradient-to-br from-primary/5 to-accent/5 py-20">
        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <h1 className="mb-6 text-5xl font-bold text-foreground">
            {t('Welcome to ', '欢迎来到 ')}<span className="text-primary">O2I Institute</span>
          </h1>
          <p className="mx-auto mb-8 max-w-3xl text-xl text-muted-foreground">
            {t('Master mathematics with our comprehensive tutoring platform. Get expert help, connect with peers, and unlock your potential with personalized learning experiences.', '在这里学数学：有老师答疑，有同学一起交流，学习内容也会按你的情况调整。')}
          </p>

          <div className="mb-10"><ScholarCounter /></div>

          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
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
          </div>
        </div>
      </section>

      <section className="bg-background py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-3xl font-bold text-foreground">{t('Everything You Need to Excel in Math', '学数学需要的，这里都有')}</h2>
            <p className="mx-auto max-w-2xl text-lg text-muted-foreground">{t('Our comprehensive platform provides all the tools and support you need for mathematical success.', '课程、练习、答疑，都在一个地方。')}</p>
          </div>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            {features.map((feature) => (
              <Card key={feature.link} className="transition-shadow duration-300 hover:shadow-lg">
                <CardHeader className="text-center">
                  <div className="mx-auto mb-4 w-fit rounded-full bg-accent/10 p-3">{feature.icon}</div>
                  <CardTitle className="mb-2 text-xl">{t(feature.title[0], feature.title[1])}</CardTitle>
                  <CardDescription className="text-base">{t(feature.description[0], feature.description[1])}</CardDescription>
                </CardHeader>
                <CardContent className="text-center"><Button variant="outline" asChild><Link to={feature.link}>{t('Learn More', '了解更多')}</Link></Button></CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-gradient-to-r from-primary/10 to-accent/10 py-20">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="mb-4 text-3xl font-bold text-foreground">{t('Ready to Transform Your Math Skills?', '想把数学学得更扎实？')}</h2>
          <p className="mb-8 text-lg text-muted-foreground">{t('Join thousands of students who have improved their mathematical understanding with O2I Institute.', '已经有几千名同学在 O2I Institute 学数学。')}</p>
          {!user && <div className="flex flex-col items-center justify-center gap-4 sm:flex-row"><Button size="lg" asChild><Link to="/auth">{t('Sign Up Today', '立即注册')}</Link></Button><Button size="lg" variant="outline" asChild><Link to="/auth">{t('Sign In', '登录')}</Link></Button></div>}
        </div>
      </section>
    </main>
  );
}
