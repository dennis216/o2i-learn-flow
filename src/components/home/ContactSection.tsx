import { toast } from 'sonner';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InstagramBrandIcon, YouTubeBrandIcon, DouyinIcon, WechatChannelsIcon, XiaohongshuIcon } from '@/components/BrandIcons';
import Reveal from '@/components/Reveal';
import { useLanguage } from '@/contexts/LanguageContext';

const EMAIL = 'o2i.institute@gmail.com';

// Platform brand colours (not site tokens) so each account is recognisable at a glance.
// WeChat Channels has no web profile page, so it lists the name to search for.
const socials = [
  { icon: XiaohongshuIcon, size: 'h-9 w-9', tile: 'bg-[#FF2442] text-white', name: ['REDnote', '小红书'], handle: 'o2i education', href: 'https://www.xiaohongshu.com/user/profile/64d82484000000000100e118' },
  { icon: InstagramBrandIcon, tile: 'bg-gradient-to-br from-[#F58529] via-[#DD2A7B] to-[#8134AF] text-white', name: ['Instagram', 'Instagram'], handle: '@o2i.institute', href: 'https://www.instagram.com/o2i.institute/' },
  { icon: YouTubeBrandIcon, size: 'h-8 w-8', tile: 'bg-transparent', name: ['YouTube', 'YouTube'], handle: '@o2iinstitute', href: 'https://www.youtube.com/@o2iinstitute' },
  { icon: DouyinIcon, tile: 'bg-[#111111] text-white', name: ['Douyin', '抖音'], handle: 'o2i math', href: 'https://www.douyin.com/user/MS4wLjABAAAALdk18h6vnp0nxLRyGsFKCJC36yrU6bdMU3s7vZ6rxFuLmUESOWdznpcjU4v0S85V' },
  { icon: WechatChannelsIcon, size: 'h-7 w-7', tile: 'bg-white text-[#FA9D3B] ring-1 ring-border', name: ['WeChat Channels', '微信视频号'], handle: 'o2i教育' },
] as const;

export default function ContactSection() {
  const { t } = useLanguage();
  // The button copies the address (mailto often does nothing in Chrome); the toast offers the mail app as an option.
  const copyEmail = () => {
    const action = { label: t('Open email app', '打开邮件应用'), onClick: () => { window.location.href = `mailto:${EMAIL}`; } };
    const copied = () => toast.success(t('Email address copied', '邮箱地址已复制'), { action, description: t(`Send your message to ${EMAIL}.`, `写信至 ${EMAIL}，与我们联系。`) });
    const shown = () => toast(t(`Our email: ${EMAIL}`, `我们的邮箱：${EMAIL}`), { action, description: t('Use this address to get in touch.', '可以通过这个邮箱联系我们。') });
    if (navigator.clipboard) navigator.clipboard.writeText(EMAIL).then(copied, shown); else shown();
  };
  return (
    <section aria-labelledby="contact-heading" className="glass-contact py-14 sm:py-20">
      <Reveal className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="glass-surface flex flex-wrap items-center justify-between gap-x-10 gap-y-6 rounded-[2rem] p-6 sm:p-10">
          <div>
            <h2 id="contact-heading" className="text-2xl font-bold tracking-tight sm:text-3xl">{t('Get in touch', '联系我们')}</h2>
            <p className="mt-2 text-lg text-muted-foreground">{t('Have a question or a suggestion? We would like to hear from you.', '无论是学习上的疑问，还是对网站的建议，都欢迎写信告诉我们。')}</p>
          </div>
          <Button size="lg" onClick={copyEmail} className="h-12 max-w-full px-6 text-base font-semibold"><Mail aria-hidden="true" className="!size-5" /><span className="truncate">{EMAIL}</span></Button>
        </div>
        <ul className="mt-10 flex flex-wrap gap-x-8 gap-y-5">
          {socials.map(({ icon: Icon, tile, name, handle, ...rest }) => (
            <li key={name[0]} className="group relative flex items-center gap-3">
              <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl shadow-sm transition-transform motion-safe:group-hover:-translate-y-0.5 ${tile}`}>
                <Icon className={'size' in rest ? rest.size : 'h-6 w-6'} aria-hidden="true" />
              </div>
              {'href' in rest
                ? <a href={rest.href} target="_blank" rel="noopener noreferrer" className="font-medium text-foreground after:absolute after:inset-0 after:rounded-xl hover:underline focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring">{t(name[0], name[1])}</a>
                : <p className="font-medium leading-tight text-foreground">{t(name[0], name[1])}<span className="block text-sm font-normal text-muted-foreground">{t(`Search “${handle}”`, `搜索“${handle}”`)}</span></p>}
            </li>
          ))}
        </ul>
      </Reveal>
    </section>
  );
}
