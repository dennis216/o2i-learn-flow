import { toast } from 'sonner';
import { Instagram, Mail, MessageSquareHeart, Youtube } from 'lucide-react';
import { DouyinIcon, WechatChannelsIcon, XiaohongshuIcon } from '@/components/BrandIcons';
import Reveal from '@/components/Reveal';
import { useLanguage } from '@/contexts/LanguageContext';

// Moved here from the old About Us page.
const TILE = {
  blue: 'from-[hsl(var(--education-blue))] to-[hsl(212_90%_52%)] text-white shadow-[hsl(var(--education-blue)/0.3)]',
  teal: 'from-[hsl(var(--education-teal))] to-[hsl(168_70%_40%)] text-white shadow-[hsl(var(--education-teal)/0.3)]',
} as const;

const EMAIL = 'o2i.institute@gmail.com';

// Platform brand colours (not site tokens) so each account is recognisable at a glance.
// WeChat Channels has no web profile page, so it lists the name to search for.
const socials = [
  { icon: XiaohongshuIcon, size: 'h-10 w-10', tile: 'bg-[#FF2442] text-white', name: ['REDnote', '小红书'], handle: 'o2i education', href: 'https://www.xiaohongshu.com/user/profile/64d82484000000000100e118' },
  { icon: Instagram, tile: 'bg-gradient-to-br from-[#F58529] via-[#DD2A7B] to-[#8134AF] text-white', name: ['Instagram', 'Instagram'], handle: '@o2i.institute', href: 'https://www.instagram.com/o2i.institute/' },
  { icon: Youtube, tile: 'bg-[#FF0000] text-white', name: ['YouTube', 'YouTube'], handle: '@o2iinstitute', href: 'https://www.youtube.com/@o2iinstitute' },
  { icon: DouyinIcon, tile: 'bg-[#111111] text-white', name: ['Douyin', '抖音'], handle: 'o2i math', href: 'https://www.douyin.com/user/MS4wLjABAAAALdk18h6vnp0nxLRyGsFKCJC36yrU6bdMU3s7vZ6rxFuLmUESOWdznpcjU4v0S85V' },
  { icon: WechatChannelsIcon, size: 'h-7 w-7', tile: 'bg-white text-[#FA9D3B] ring-1 ring-border', name: ['WeChat Channels', '微信视频号'], handle: 'o2i教育' },
] as const;

const contacts = [
  { icon: Mail, tile: TILE.blue, title: ['Email us', '发邮件'], text: [EMAIL, EMAIL], subject: '' },
  { icon: MessageSquareHeart, tile: TILE.teal, title: ['Send feedback', '提意见'], text: ['Tell us what helped, what confused you, or what you want next.', '哪里有用、哪里看不懂、还想要什么内容，都告诉我们。'], subject: 'Website feedback' },
] as const;

export default function ContactSection() {
  const { language, t } = useLanguage();
  // The tiles copy the address (mailto often does nothing in Chrome); the toast offers the mail app as an option.
  const copyEmail = (subject: string) => {
    const action = { label: t('Use mail app', '用邮件 App'), onClick: () => { window.location.href = `mailto:${EMAIL}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`; } };
    const copied = () => toast.success(t('Email address copied', '邮箱地址已复制'), { action, description: t(`Paste ${EMAIL} into your mailbox to write to us.`, `把 ${EMAIL} 粘贴到你的邮箱里就能给我们写信。`) });
    const shown = () => toast(t(`Our email: ${EMAIL}`, `我们的邮箱：${EMAIL}`), { action, description: t('Send to this address from your mailbox.', '用你的邮箱发到这个地址就行。') });
    if (navigator.clipboard) navigator.clipboard.writeText(EMAIL).then(copied, shown); else shown();
  };
  return (
    <section aria-labelledby="contact-heading" className="bg-gradient-to-b from-background via-primary/5 to-accent/10 py-14 sm:py-20">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto mb-10 max-w-2xl text-center">
          <h2 id="contact-heading" className="text-2xl font-bold tracking-tight sm:text-3xl">{t('Get in touch', '联系我们')}</h2>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{t('Questions about courses, ideas for the site, or something that is not working: write to us and a team member will reply.', '课程问题、对网站的建议，或者哪里用不了，都可以写信给我们，团队成员会回复。')}</p>
        </Reveal>
        <div className="mx-auto grid max-w-3xl gap-2 sm:grid-cols-2 sm:gap-4">
          {contacts.map(({ icon: Icon, tile, title, text, subject }) => (
            <Reveal key={title[0]}>
              <div className="group relative flex items-start gap-4 rounded-2xl p-5 transition-colors hover:bg-background/80">
                <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br shadow-md ${tile}`}><Icon className="h-6 w-6" aria-hidden="true" /></div>
                <div className="min-w-0">
                  <button type="button" onClick={() => copyEmail(subject)} className="text-left text-lg font-semibold text-foreground after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring">{t(title[0], title[1])}</button>
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
                <div className={`mb-3 grid h-12 w-12 place-items-center rounded-xl shadow-md transition-transform motion-safe:group-hover:-translate-y-1 ${tile}`}>
                  {/* the Xiaohongshu mark is the Chinese wordmark; English pages show its English name instead */}
                  {Icon === XiaohongshuIcon && language === 'en'
                    ? <span aria-hidden="true" className="text-base font-extrabold tracking-tight">RED</span>
                    : <Icon className={'size' in rest ? rest.size : 'h-6 w-6'} aria-hidden="true" />}
                </div>
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
  );
}
