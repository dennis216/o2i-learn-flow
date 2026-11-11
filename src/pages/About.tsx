import { Link } from 'react-router-dom';
import { ArrowRight, BookHeart, BookOpen, Instagram, Mail, MessageSquare, MessageSquareHeart, Search, Target, Video, Youtube } from 'lucide-react';
import Reveal from '@/components/Reveal';
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

const EMAIL = 'o2i.institute@gmail.com';

// WeChat Channels has no web profile page, so it lists the name to search for.
const socials = [
  { icon: BookHeart, name: ['Xiaohongshu (RED)', '小红书'], handle: 'o2i education', href: 'https://www.xiaohongshu.com/user/profile/64d82484000000000100e118' },
  { icon: Instagram, name: ['Instagram', 'Instagram'], handle: '@o2i.institute', href: 'https://www.instagram.com/o2i.institute/' },
  { icon: Youtube, name: ['YouTube', 'YouTube'], handle: '@o2iinstitute', href: 'https://www.youtube.com/@o2iinstitute' },
  { icon: Video, name: ['Douyin', '抖音'], handle: 'o2i math', href: 'https://www.douyin.com/user/MS4wLjABAAAALdk18h6vnp0nxLRyGsFKCJC36yrU6bdMU3s7vZ6rxFuLmUESOWdznpcjU4v0S85V' },
  { icon: Search, name: ['WeChat Channels', '微信视频号'], handle: 'o2i教育' },
] as const;

export default function About() {
  const { t } = useLanguage();
  return (
    <main className="min-h-screen bg-background">
      <section className="border-b bg-gradient-to-br from-primary/5 to-accent/5 px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-primary">{t('About Us', '关于我们')}</p>
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">{t('One to Infinity, and beyond.', '从 1 到无穷，再往前一步。')}</h1>
          <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
            {t('O2I Institute takes students from the basics all the way to university-level STEM. Our tutors teach from around the world, and every lesson comes with practice and a place to ask questions, so you learn why an answer works, not just what it is.', 'O2I Institute 帮学生把理工科从基础学到大学水平。我们的老师来自世界各地，每节课都配有练习和答疑，让你不只知道答案，还明白为什么。')}
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
      <section aria-labelledby="contact-heading" className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
        <Reveal className="mx-auto mb-10 max-w-2xl text-center">
          <h2 id="contact-heading" className="text-2xl font-bold tracking-tight sm:text-3xl">{t('Get in touch', '联系我们')}</h2>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{t('Questions about courses, ideas for the site, or something that is not working: write to us and a team member will reply.', '课程问题、对网站的建议，或者哪里用不了，都可以写信给我们，团队成员会回复。')}</p>
        </Reveal>
        <div className="grid gap-2 md:grid-cols-2 md:gap-6">
          {[
            { icon: Mail, title: ['Email us', '发邮件'], text: [EMAIL, EMAIL], href: `mailto:${EMAIL}` },
            { icon: MessageSquareHeart, title: ['Send feedback', '提意见'], text: ['Tell us what helped, what confused you, or what you want next.', '哪里有用、哪里看不懂、还想要什么内容，都告诉我们。'], href: `mailto:${EMAIL}?subject=${encodeURIComponent('Website feedback')}` },
          ].map(({ icon: Icon, title, text, href }) => (
            <Reveal key={href}>
              <div className="relative flex items-start gap-4 rounded-2xl p-6 transition-colors hover:bg-muted/60">
                <div className="rounded-xl bg-primary/10 p-3 text-primary"><Icon className="h-6 w-6" aria-hidden="true" /></div>
                <div className="min-w-0">
                  <a href={href} className="text-lg font-semibold text-foreground after:absolute after:inset-0">{t(title[0], title[1])}</a>
                  <p className="mt-1 break-words text-muted-foreground">{t(text[0], text[1])}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal className="mt-12">
          <h3 className="mb-4 text-center text-lg font-semibold">{t('Follow O2I', '关注 O2I')}</h3>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {socials.map(({ icon: Icon, name, handle, ...rest }) => (
              <li key={name[0]} className="relative flex items-center gap-3 rounded-2xl p-4 transition-colors hover:bg-muted/60">
                <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <div className="min-w-0">
                  {'href' in rest
                    ? <a href={rest.href} target="_blank" rel="noopener noreferrer" className="font-medium text-foreground after:absolute after:inset-0">{t(name[0], name[1])}</a>
                    : <p className="font-medium text-foreground">{t(name[0], name[1])}</p>}
                  <p className="truncate text-sm text-muted-foreground">{'href' in rest ? handle : t(`Search “${handle}”`, `搜索“${handle}”`)}</p>
                </div>
              </li>
            ))}
          </ul>
        </Reveal>
      </section>
    </main>
  );
}
