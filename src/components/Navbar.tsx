import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { AI_CHAT_ENABLED } from '@/lib/aiTutor';
import { Book, Bot, ChevronDown, FlaskConical, Gamepad2, Languages, LogOut, Menu, MessageCircleQuestion, Shield, Target, User, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { useTheme } from 'next-themes';
import { useAppearance } from '@/contexts/AppearanceContext';
import { Moon, Sun } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

// Quick Practice and Arena share one menu entry so the header stays short.
const PRACTICE_LINKS = [
  { to: '/practice', icon: Target, label: ['Quick Practice', '快速练习'] },
  { to: '/arena', icon: Gamepad2, label: ['Arena', '竞技场'] },
] as const;

export default function Navbar() {
  const { user, signOut, isAdmin, accessError, accessLoading, retryAdminAccess } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { language, setLanguage, t } = useLanguage();
  const { resolvedTheme, forcedTheme } = useTheme();
  const { mode, selectMode, solarStatus } = useAppearance();
  const isDark = (forcedTheme ?? resolvedTheme) !== 'light';
  const themeLabel = t('Appearance', '外观', 'Apariencia');

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/');
      setMobileMenuOpen(false);
      toast({ title: t('Signed out', '已退出登录'), description: t('You can sign back in whenever you like.', '需要时可以随时重新登录。') });
    } catch {
      toast({ title: t('Error', '出错了'), description: t('Failed to sign out. Please try again.', '退出失败，请重试。'), variant: 'destructive' });
    }
  };

  const closeMobileMenu = () => setMobileMenuOpen(false);

  // Desktop: a dropdown. Phone menu: a section that folds open in place.
  const PracticeMenu = ({ mobile = false }: { mobile?: boolean }) => mobile ? (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="group w-full justify-start"><Target className="mr-2 h-4 w-4" />{t('Practice', '练习')}<ChevronDown aria-hidden="true" className="ml-auto h-4 w-4 transition-transform group-data-[state=open]:rotate-180" /></Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-1 pl-6 pt-1">
        {PRACTICE_LINKS.map(({ to, icon: Icon, label }) => (
          <Link key={to} to={to} onClick={closeMobileMenu}><Button variant="ghost" className="w-full justify-start"><Icon className="mr-2 h-4 w-4" />{t(label[0], label[1])}</Button></Link>
        ))}
      </CollapsibleContent>
    </Collapsible>
  ) : (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="group">{t('Practice', '练习')}<ChevronDown aria-hidden="true" className="ml-1 h-4 w-4 transition-transform group-data-[state=open]:rotate-180" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="glass-surface glass-menu min-w-[11rem] p-2">
        {PRACTICE_LINKS.map(({ to, icon: Icon, label }) => (
          <DropdownMenuItem key={to} asChild className="cursor-pointer"><Link to={to}><Icon className="mr-2 h-4 w-4" />{t(label[0], label[1])}</Link></DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const NavLinks = ({ mobile = false }: { mobile?: boolean }) => (
    <>
      <Link to="/courses" onClick={closeMobileMenu}><Button variant="ghost" className={mobile ? 'w-full justify-start' : ''}><Book className="nav-icon mr-2 h-4 w-4" />{t('Courses', '课程')}</Button></Link>
      <PracticeMenu mobile={mobile} />
      {AI_CHAT_ENABLED && <Link to="/ai-tutor" onClick={closeMobileMenu}><Button variant="ghost" className={mobile ? 'w-full justify-start' : ''}><Bot className="nav-icon mr-2 h-4 w-4" />{t('AI Tutor', 'AI 助教')}</Button></Link>}
      <Link to="/playground" onClick={closeMobileMenu}><Button variant="ghost" className={mobile ? 'w-full justify-start' : ''}><FlaskConical className="nav-icon mr-2 h-4 w-4" />{t('Explore', '互动模型')}</Button></Link>
      <Link to="/solution-requests" onClick={closeMobileMenu}><Button variant="ghost" className={mobile ? 'w-full justify-start' : ''}><MessageCircleQuestion className="nav-icon mr-2 h-4 w-4" />{t('Solution Request', '答疑')}</Button></Link>
      <Link to="/team" onClick={closeMobileMenu}><Button variant="ghost" className={mobile ? 'w-full justify-start' : ''}><Users className="nav-icon mr-2 h-4 w-4" />{t('Team', '团队')}</Button></Link>
      {isAdmin && <Link to="/admin" onClick={closeMobileMenu}><Button variant="ghost" className={mobile ? 'w-full justify-start' : ''}><Shield className="nav-icon mr-2 h-4 w-4" />Admin</Button></Link>}
      {user && accessError && <Button variant="ghost" disabled={accessLoading} onClick={retryAdminAccess} title={accessError}>{t('Retry permissions', '重新加载权限')}</Button>}
    </>
  );

  const LanguageToggle = () => (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="px-2" aria-label={t('Language', '语言', 'Idioma')}>
          <Languages className="h-4 w-4" /><span>{language === 'zh' ? '中文' : language.toUpperCase()}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="glass-surface glass-menu min-w-[10rem] p-2">
        <DropdownMenuRadioGroup value={language} onValueChange={value => { if (value === 'en' || value === 'zh' || value === 'es') setLanguage(value); }}>
          <DropdownMenuRadioItem value="en" lang="en">English</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="zh" lang="zh-CN">简体中文</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="es" lang="es">Español</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const ThemeToggle = () => (
    <DropdownMenu modal={false}>
    <DropdownMenuTrigger asChild><Button variant="ghost" size="sm" className="shrink-0 px-2" aria-label={themeLabel} title={themeLabel}>
      {isDark ? <Sun aria-hidden="true" className="h-4 w-4" /> : <Moon aria-hidden="true" className="h-4 w-4" />}
      <span className="hidden xl:inline">{mode === 'auto' ? t('Auto', '自动', 'Auto') : isDark ? t('Dark mode', '深色模式', 'Modo oscuro') : t('Light mode', '浅色模式', 'Modo claro')}</span>
    </Button></DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="glass-surface glass-menu w-64 p-2">
      <DropdownMenuRadioGroup value={mode} onValueChange={value => { if (value === 'auto' || value === 'light' || value === 'dark') selectMode(value); }}>
        <DropdownMenuRadioItem value="auto">{t('Auto · sunrise & sunset', '自动 · 跟随日出日落', 'Auto · amanecer y atardecer')}</DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="light">{t('Light mode', '浅色模式', 'Modo claro')}</DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="dark">{t('Dark mode', '深色模式', 'Modo oscuro')}</DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
      {mode === 'auto' && <p className="px-2 pb-1 pt-2 text-xs leading-relaxed text-muted-foreground">{solarStatus === 'solar'
        ? t('Following local sunrise and sunset.', '正在跟随所在地的日出日落。', 'Sigue el amanecer y el atardecer locales.')
        : solarStatus === 'locating'
          ? t('Finding your location…', '正在获取位置…', 'Buscando tu ubicación…')
          : t('Allow location for sunrise and sunset. Without it, we follow your system appearance.', '允许定位后可跟随日出日落；未获取位置时跟随系统外观。', 'Permite la ubicación para seguir el sol. Sin ella, se usa la apariencia del sistema.')}</p>}
      {mode === 'auto' && solarStatus === 'system' && <Button variant="ghost" size="sm" className="mt-1 w-full text-xs" onClick={() => selectMode('auto')}>{t('Use my location', '使用我的位置', 'Usar mi ubicación')}</Button>}
    </DropdownMenuContent>
    </DropdownMenu>
  );

  const AuthButtons = ({ mobile = false }: { mobile?: boolean }) => user ? (
    <div className={mobile ? 'space-y-2' : 'flex items-center space-x-2'}>
      <Button variant="ghost" size="sm" asChild className={mobile ? 'w-full justify-start' : ''} onClick={closeMobileMenu}><Link to="/profile"><User className="mr-2 h-4 w-4" />{t('Profile', '个人资料')}</Link></Button>
      <Button variant="ghost" size="sm" onClick={handleSignOut} className={mobile ? 'w-full justify-start' : ''}><LogOut className="mr-2 h-4 w-4" />{t('Sign Out', '退出登录')}</Button>
    </div>
  ) : (
    <Button asChild className={mobile ? 'w-full' : ''} onClick={closeMobileMenu}><Link to="/auth">{t('Sign In / Sign Up', '登录 / 注册')}</Link></Button>
  );

  return (
    <nav aria-label={t('Main navigation', '主导航')} className="glass-nav-wrap sticky top-0 z-40 px-3 pt-3 sm:px-5">
      <div className="glass-surface glass-nav mx-auto max-w-screen-2xl px-2 sm:px-6">
        <div className="flex h-16 items-center justify-between gap-1 sm:gap-4">
          <div className="flex shrink-0 items-center">
            <Link to="/" className="flex items-center space-x-2">
              {/* Original colours in light mode; a brightened copy so the navy reads on the dark header. */}
              <span className="brand-mark shrink-0">
                <img src="/o2i-mark.png" alt="" width={54} height={36} className="h-9 w-auto dark:hidden" />
                <img src="/o2i-mark-dark.png" alt="" width={54} height={36} className="hidden h-9 w-auto dark:block" />
              </span>
              <span className="whitespace-nowrap text-xl font-bold text-primary">O2I Institute</span>
            </Link>
          </div>

          {/* iPad and up: one row; the links scroll sideways when they don't fit (right edge fades as a hint). */}
          <div className="hidden min-w-0 flex-1 items-center gap-4 min-[740px]:flex">
            <div role="region" aria-label={t('Scrollable navigation', '可滚动导航')} tabIndex={0} className="min-w-0 flex-1 overflow-x-auto rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-[1399px]:[mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)]">
              {/* words only on the desktop row; the phone menu keeps the icons */}
              <div className="mx-auto flex w-max items-center gap-1 px-1 py-2 [&_.nav-icon]:hidden [&_button]:px-3 max-[1399px]:pr-8"><NavLinks /></div>
            </div>
            <div className="flex shrink-0 items-center gap-1"><LanguageToggle /><ThemeToggle /><AuthButtons /></div>
          </div>

          <div className="flex items-center gap-1 min-[740px]:hidden">
            <LanguageToggle />
            <ThemeToggle />
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild><Button variant="ghost" size="icon"><Menu className="h-6 w-6" /><span className="sr-only">{t('Open menu', '打开菜单')}</span></Button></SheetTrigger>
              <SheetContent side="right" className="glass-surface glass-mobile-menu !inset-y-3 !right-3 !h-auto w-[min(350px,calc(100vw-24px))] overflow-y-auto">
                <SheetTitle className="sr-only">{t('Site navigation', '网站导航')}</SheetTitle>
                <SheetDescription className="sr-only">{t('Browse O2I Institute pages and account options.', '浏览 O2I Institute 的页面和账号选项。')}</SheetDescription>
                <div className="mt-6 flex flex-col space-y-4">
                  <div className="flex items-center space-x-2 border-b pb-4"><span className="text-lg font-bold text-primary">O2I Institute</span></div>
                  <nav className="flex flex-col space-y-2"><NavLinks mobile /></nav>
                  <div className="border-t pt-4"><AuthButtons mobile /></div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </nav>
  );
}
