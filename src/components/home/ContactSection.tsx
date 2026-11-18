import { toast } from 'sonner';
import { Instagram, Mail, Youtube } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DouyinIcon, WechatChannelsIcon, XiaohongshuIcon } from '@/components/BrandIcons';
import Reveal from '@/components/Reveal';
import { useLanguage } from '@/contexts/LanguageContext';

const EMAIL = 'o2i.institute@gmail.com';

// Platform brand colours (not site tokens) so each account is recognisable at a glance.
// WeChat Channels has no web profile page, so it lists the name to search for.
const socials = [
  { icon: XiaohongshuIcon, size: 'h-9 w-9', tile: 'bg-[#FF2442] text-white', name: ['REDnote', '小红书'], handle: 'o2i education', href: 'https://www.xiaohongshu.com/user/profile/64d82484000000000100e118' },
  { icon: Instagram, tile: 'bg-gradient-to-br from-[#F58529] via-[#DD2A7B] to-[#8134AF] text-white', name: ['Instagram', 'Instagram'], handle: '@o2i.institute', href: 'https://www.instagram.com/o2i.institute/' },
  { icon: Youtube, tile: 'bg-[#FF0000] text-white', name: ['YouTube', 'YouTube'], handle: '@o2iinstitute', href: 'https://www.youtube.com/@o2iinstitute' },
  { icon: DouyinIcon, tile: 'bg-[#111111] text-white', name: ['Douyin', '抖音'], handle: 'o2i math', href: 'https://www.douyin.com/user/MS4wLjABAAAALdk18h6vnp0nxLRyGsFKCJC36yrU6bdMU3s7vZ6rxFuLmUESOWdznpcjU4v0S85V' },
  { icon: WechatChannelsIcon, size: 'h-7 w-7', tile: 'bg-white text-[#FA9D3B] ring-1 ring-border', name: ['WeChat Channels', '微信视频号'], handle: 'o2i教育' },
] as const;

export default function ContactSection() {
  const { language, t } = useLanguage();
  // The button copies the address (mailto often does nothing in Chrome); the toast offers the mail app as an option.
  const copyEmail = () => {
    const action = { label: t('Use mail app', '用邮件 App'), onClick: () => { window.location.href = `mailto:${EMAIL}`; } };
    const copied = () => toast.success(t('Email address copied', '邮箱地址已复制'), { action, description: t(`Paste ${EMAIL} into your mailbox to write to us.`, `把 ${EMAIL} 粘贴到你的邮箱里就能给我们写信。`) });
    const shown = () => toast(t(`Our email: ${EMAIL}`, `我们的邮箱：${EMAIL}`), { action, description: t('Send to this address from your mailbox.', '用你的邮箱发到这个地址就行。') });
    if (navigator.clipboard) navigator.clipboard.writeText(EMAIL).then(copied, shown); else shown();
  };
  return (
    <section aria-labelledby="contact-heading" className="bg-muted/60 py-14 sm:py-20">
      <Reveal className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-x-10 gap-y-6">
          <div>
            <h2 id="contact-heading" className="text-2xl font-bold tracking-tight sm:text-3xl">{t('Get in touch', '联系我们')}</h2>
            <p className="mt-2 text-lg text-muted-foreground">{t('Questions, ideas, or something not working? Write to us.', '有问题、有建议，或者哪里用不了，写信给我们。')}</p>
          </div>
          <Button size="lg" onClick={copyEmail} className="h-12 max-w-full px-6 text-base font-semibold"><Mail aria-hidden="true" className="!size-5" /><span className="truncate">{EMAIL}</span></Button>
        </div>
        <ul className="mt-10 flex flex-wrap gap-x-8 gap-y-5">
          {socials.map(({ icon: Icon, tile, name, handle, ...rest }) => (
            <li key={name[0]} className="group relative flex items-center gap-3">
              <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl shadow-sm transition-transform motion-safe:group-hover:-translate-y-0.5 ${tile}`}>
                {/* the Xiaohongshu mark is the Chinese wordmark; English pages show its English name instead */}
                {Icon === XiaohongshuIcon && language === 'en'
                  ? <span aria-hidden="true" className="text-sm font-extrabold tracking-tight">RED</span>
                  : <Icon className={'size' in rest ? rest.size : 'h-6 w-6'} aria-hidden="true" />}
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
