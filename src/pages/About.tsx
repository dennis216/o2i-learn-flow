import { Link } from 'react-router-dom';
import { ArrowRight, BookHeart, Instagram, Mail, MessageSquareHeart, Search, Video, Youtube } from 'lucide-react';
import Reveal from '@/components/Reveal';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';

// Same gradient tiles as the homepage feature icons.
const TILE = {
  blue: 'from-[hsl(var(--education-blue))] to-[hsl(212_90%_52%)] text-white shadow-[hsl(var(--education-blue)/0.3)]',
  amber: 'from-[hsl(var(--education-orange))] to-[hsl(32_95%_55%)] text-amber-950 shadow-[hsl(var(--education-orange)/0.35)]',
  teal: 'from-[hsl(var(--education-teal))] to-[hsl(168_70%_40%)] text-white shadow-[hsl(var(--education-teal)/0.3)]',
} as const;

// The name, as a path: everyone starts at 1, then practice and questions, then no ceiling.
const stops = [
  {
    mark: '1',
    tile: TILE.blue,
    title: ['Start from the basics', '从基础开始'],
    description: ['Explore math courses and revisit lessons alongside what you are learning in school.', '配合学校进度学习数学课程，随时回看课节。'],
    links: [{ href: '/courses', label: ['Explore courses', '浏览课程'] }],
  },
  {
    mark: 'n',
    tile: TILE.amber,
    title: ['Practice and ask', '练习，提问'],
    description: ['Work through focused questions, review your answers, and bring a problem to a tutor when a step does not click.', '做有针对性的题，回看自己的答案；哪一步想不通，就把题目发给老师。'],
    links: [
      { href: '/practice', label: ['Start practicing', '开始练习'] },
      { href: '/solution-requests', label: ['Ask a question', '去答疑区'] },
    ],
  },
  {
    mark: '∞',
    tile: TILE.teal,
    title: ['Keep going, together', '一起，一直往前'],
    description: ['From school math to university-level STEM, with tutors from around the world. A different explanation can change how a problem looks.', '从学校数学一直学到大学理工科，老师来自世界各地。有时候换一种讲法，难题就清楚了。'],
    links: [{ href: '/team', label: ['Meet the team', '认识团队'] }],
  },
] as const;

const EMAIL = 'o2i.institute@gmail.com';

// Platform brand colours (not site tokens) so each account is recognisable at a glance.
// WeChat Channels has no web profile page, so it lists the name to search for.
const socials = [
  { icon: BookHeart, tile: 'bg-[#FF2442] text-white', name: ['Xiaohongshu (RED)', '小红书'], handle: 'o2i education', href: 'https://www.xiaohongshu.com/user/profile/64d82484000000000100e118' },
  { icon: Instagram, tile: 'bg-gradient-to-br from-[#F58529] via-[#DD2A7B] to-[#8134AF] text-white', name: ['Instagram', 'Instagram'], handle: '@o2i.institute', href: 'https://www.instagram.com/o2i.institute/' },
  { icon: Youtube, tile: 'bg-[#FF0000] text-white', name: ['YouTube', 'YouTube'], handle: '@o2iinstitute', href: 'https://www.youtube.com/@o2iinstitute' },
  { icon: Video, tile: 'bg-[#111111] text-white', name: ['Douyin', '抖音'], handle: 'o2i math', href: 'https://www.douyin.com/user/MS4wLjABAAAALdk18h6vnp0nxLRyGsFKCJC36yrU6bdMU3s7vZ6rxFuLmUESOWdznpcjU4v0S85V' },
  { icon: Search, tile: 'bg-[#FA9D3B] text-amber-950', name: ['WeChat Channels', '微信视频号'], handle: 'o2i教育' },
] as const;

const contacts = [
  { icon: Mail, tile: TILE.blue, title: ['Email us', '发邮件'], text: [EMAIL, EMAIL], href: `mailto:${EMAIL}` },
  { icon: MessageSquareHeart, tile: TILE.teal, title: ['Send feedback', '提意见'], text: ['Tell us what helped, what confused you, or what you want next.', '哪里有用、哪里看不懂、还想要什么内容，都告诉我们。'], href: `mailto:${EMAIL}?subject=${encodeURIComponent('Website feedback')}` },
] as const;

// Yellow highlighter stroke, same as the brand in the homepage headline.
const Highlight = ({ children }: { children: string }) => (
  <span className="whitespace-nowrap bg-[linear-gradient(transparent_58%,hsl(var(--accent)/0.6)_58%,hsl(var(--accent)/0.6)_92%,transparent_92%)] px-1 text-primary">{children}</span>
);

export default function About() {
  const { language, t } = useLanguage();
  return (
    <main className={`min-h-screen bg-background ${language === 'zh' ? 'break-keep [overflow-wrap:anywhere]' : ''}`}>
      <section className="relative overflow-hidden bg-gradient-to-br from-primary/5 to-accent/5 py-14 sm:py-20">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 [background-image:linear-gradient(hsl(var(--primary)/0.06)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--primary)/0.06)_1px,transparent_1px)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_80%)]" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-background" />
        <Reveal className="relative mx-auto max-w-3xl px-4 text-center sm:px-6">
          <p className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-background/70 px-4 py-1.5 text-sm font-medium text-primary">
            <span aria-hidden="true" className="font-semibold">1 → ∞</span>
            {t('About O2I Institute', '关于 O2I Institute')}
          </p>
          <h1 className={`text-balance text-4xl font-bold tracking-tight text-foreground sm:text-5xl ${language === 'zh' ? 'leading-[1.35]' : 'leading-tight'}`}>
            {language === 'zh' ? <>从 1 到<Highlight>无穷</Highlight>，再往前一步。</> : <>One to <Highlight>Infinity</Highlight>, and beyond.</>}
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
            {t('O2I Institute takes students from the basics all the way to university-level STEM. Our tutors teach from around the world, and every lesson comes with practice and a place to ask questions, so you learn why an answer works, not just what it is.', 'O2I Institute 帮学生把理工科从基础学到大学水平。我们的老师来自世界各地，每节课都配有练习和答疑，让你不只知道答案，还明白为什么。')}
          </p>
          <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row">
            <Button size="lg" asChild><Link to="/courses">{t('Explore courses', '浏览课程')}<ArrowRight aria-hidden="true" /></Link></Button>
            <Button size="lg" variant="outline" asChild><Link to="/team">{t('Meet the team', '认识团队')}</Link></Button>
          </div>
        </Reveal>
      </section>

      <section aria-labelledby="path-heading" className="mx-auto max-w-7xl px-4 pb-14 pt-4 sm:px-6 sm:pb-20 sm:pt-8 lg:px-8">
        <Reveal className="mx-auto mb-12 max-w-2xl text-center">
          <h2 id="path-heading" className="text-2xl font-bold tracking-tight sm:text-3xl">{t('Why “One to Infinity”', '为什么叫 One to Infinity')}</h2>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{t('Everyone starts at 1. After that, there is no ceiling.', '每个人都从 1 开始，往后没有上限。')}</p>
        </Reveal>
        <div className="relative">
        {/* the number line the three stops sit on (desktop) */}
        <div aria-hidden="true" className="pointer-events-none absolute left-[16.7%] right-[8%] top-8 hidden h-0.5 bg-gradient-to-r from-primary/40 via-primary/25 to-primary/0 md:block" />
        <ol className="relative grid gap-10 md:grid-cols-3 md:gap-8">
          {stops.map(({ mark, tile, title, description, links }, i) => (
            <li key={mark}><Reveal delay={i * 120} className="flex flex-col items-center text-center">
              <div aria-hidden="true" className={`mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br text-3xl font-bold shadow-lg ring-8 ring-background ${mark === 'n' ? 'italic' : ''} ${tile}`}>{mark}</div>
              <h3 className="text-xl font-bold tracking-tight">{t(title[0], title[1])}</h3>
              <p className="mt-2 max-w-sm leading-relaxed text-muted-foreground">{t(description[0], description[1])}</p>
              <div className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-2">
                {links.map(({ href, label }) => (
                  <Link key={href} to={href} className="group inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                    {t(label[0], label[1])}<ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform motion-safe:group-hover:translate-x-1" />
                  </Link>
                ))}
              </div>
            </Reveal></li>
          ))}
        </ol>
        </div>
      </section>

      <section aria-labelledby="contact-heading" className="bg-gradient-to-b from-background via-primary/5 to-accent/10 py-14 sm:py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <Reveal className="mx-auto mb-10 max-w-2xl text-center">
            <h2 id="contact-heading" className="text-2xl font-bold tracking-tight sm:text-3xl">{t('Get in touch', '联系我们')}</h2>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{t('Questions about courses, ideas for the site, or something that is not working: write to us and a team member will reply.', '课程问题、对网站的建议，或者哪里用不了，都可以写信给我们，团队成员会回复。')}</p>
          </Reveal>
          <div className="mx-auto grid max-w-3xl gap-2 sm:grid-cols-2 sm:gap-4">
            {contacts.map(({ icon: Icon, tile, title, text, href }) => (
              <Reveal key={href}>
                <div className="group relative flex items-start gap-4 rounded-2xl p-5 transition-colors hover:bg-background/80">
                  <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br shadow-md ${tile}`}><Icon className="h-6 w-6" aria-hidden="true" /></div>
                  <div className="min-w-0">
                    <a href={href} className="text-lg font-semibold text-foreground after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring">{t(title[0], title[1])}</a>
                    <p className="mt-1 break-words text-muted-foreground">{t(text[0], text[1])}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal className="mt-14">
            <h3 className="mb-6 text-center text-lg font-semibold">{t('Follow O2I', '关注 O2I')}</h3>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {socials.map(({ icon: Icon, tile, name, handle, ...rest }) => (
                <li key={name[0]} className="group relative flex flex-col items-center rounded-2xl p-4 text-center transition-colors hover:bg-background/80">
                  <div className={`mb-3 grid h-12 w-12 place-items-center rounded-xl shadow-md transition-transform motion-safe:group-hover:-translate-y-1 ${tile}`}><Icon className="h-6 w-6" aria-hidden="true" /></div>
                  {'href' in rest
                    ? <a href={rest.href} target="_blank" rel="noopener noreferrer" className="font-medium text-foreground after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring">{t(name[0], name[1])}</a>
                    : <p className="font-medium text-foreground">{t(name[0], name[1])}</p>}
                  <p className="mt-0.5 text-sm text-muted-foreground">{'href' in rest ? handle : t(`Search “${handle}”`, `搜索“${handle}”`)}</p>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>
    </main>
  );
}
