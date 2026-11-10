import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, MessageSquare, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLanguage } from '@/contexts/LanguageContext';

const learningPaths = [
  {
    icon: BookOpen,
    title: ['Build understanding', '理解概念'],
    description: ['Explore math courses and revisit lessons alongside what you are learning in school.', '配合学校进度学习数学课程，随时回看课节。'],
    href: '/courses',
    action: ['Explore courses', '浏览课程'],
  },
  {
    icon: Target,
    title: ['Put ideas into practice', '动手练习'],
    description: ['Work through focused questions, review your answers, and find the concepts that need another look.', '做有针对性的题，回看自己的答案，找出还要再巩固的地方。'],
    href: '/practice',
    action: ['Start practicing', '开始练习'],
  },
  {
    icon: MessageSquare,
    title: ['Work through questions', '解决疑问'],
    description: ['Bring a math problem to Solution Requests when you need help understanding the steps.', '看不懂解题步骤时，可以把题目发到答疑区。'],
    href: '/solution-requests',
    action: ['View solution requests', '去答疑区'],
  },
] as const;

export default function About() {
  const { t } = useLanguage();
  return (
    <main className="min-h-screen bg-background">
      <section className="border-b bg-gradient-to-br from-primary/5 to-accent/5 px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-primary">{t('About Us', '关于我们')}</p>
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">{t('Math makes more sense together.', '一起学，数学更好懂。')}</h1>
          <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
            {t('O2I Institute brings math lessons, focused practice, and peer support into one place. Our goal is to help students understand the reasoning behind an answer and build the confidence to try the next problem.', 'O2I Institute 把数学课程、针对性练习和同学互助放在一起。我们希望学生不只知道答案，还能弄懂背后的思路，有底气去做下一道题。')}
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button size="lg" asChild><Link to="/courses">{t('Explore courses', '浏览课程')}<ArrowRight aria-hidden="true" /></Link></Button>
            <Button size="lg" variant="outline" asChild><Link to="/team">{t('Meet the team', '认识团队')}</Link></Button>
          </div>
        </div>
      </section>

      <section aria-labelledby="approach-heading" className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <h2 id="approach-heading" className="text-3xl font-bold tracking-tight">{t('Support for the way you learn', '跟着你的节奏来学')}</h2>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            {t('Use O2I alongside your school learning: revisit a lesson, test your understanding, or ask for help when a step does not click.', '可以配合学校进度用 O2I：回看讲解、做题检验，哪一步想不通就来提问。')}
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {learningPaths.map(({ icon: Icon, title, description, href, action }) => (
            <Card key={href} className="flex flex-col">
              <CardHeader>
                <div className="mb-4 w-fit rounded-xl bg-primary/10 p-3 text-primary"><Icon className="h-6 w-6" aria-hidden="true" /></div>
                <CardTitle className="text-xl">{t(title[0], title[1])}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col items-start">
                <p className="mb-6 flex-1 leading-relaxed text-muted-foreground">{t(description[0], description[1])}</p>
                <Button variant="outline" asChild><Link to={href}>{t(action[0], action[1])}<ArrowRight aria-hidden="true" /></Link></Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="community-heading" className="border-t bg-muted/30 px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h2 id="community-heading" className="text-3xl font-bold tracking-tight">{t('Learning is a shared effort', '学习不是一个人的事')}</h2>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            {t('A useful explanation can change how a problem looks. We want O2I to be a place where students can ask questions, learn from others, and keep building their mathematical understanding.', '有时候换一种讲法，难题就清楚了。我们希望 O2I 是一个可以随时提问、互相学习、把数学越学越透的地方。')}
          </p>
          <Button className="mt-6" variant="outline" asChild><Link to="/team">{t('Meet the people behind O2I', '认识 O2I 背后的人')}<ArrowRight aria-hidden="true" /></Link></Button>
        </div>
      </section>
    </main>
  );
}
