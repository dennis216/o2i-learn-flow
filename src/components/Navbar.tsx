import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { AI_TUTOR_ENABLED } from '@/lib/aiTutor';
import { Book, Bot, ChevronDown, FlaskConical, Gamepad2, Languages, LogOut, Menu, MessageCircleQuestion, Shield, Target, User, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
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

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/');
      setMobileMenuOpen(false);
      toast({ title: t('Signed out successfully', '已退出登录'), description: t('You have been logged out of your account.', '你已退出当前账号。') });
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
        <Button variant="ghost" className="group"><Target className="mr-2 h-4 w-4" />{t('Practice', '练习')}<ChevronDown aria-hidden="true" className="ml-1 h-4 w-4 transition-transform group-data-[state=open]:rotate-180" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[11rem]">
        {PRACTICE_LINKS.map(({ to, icon: Icon, label }) => (
          <DropdownMenuItem key={to} asChild className="cursor-pointer"><Link to={to}><Icon className="mr-2 h-4 w-4" />{t(label[0], label[1])}</Link></DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const NavLinks = ({ mobile = false }: { mobile?: boolean }) => (
    <>
      <Link to="/courses" onClick={closeMobileMenu}><Button variant="ghost" className={mobile ? 'w-full justify-start' : ''}><Book className="mr-2 h-4 w-4" />{t('Courses', '课程')}</Button></Link>
      <PracticeMenu mobile={mobile} />
      {AI_TUTOR_ENABLED && <Link to="/ai-tutor" onClick={closeMobileMenu}><Button variant="ghost" className={mobile ? 'w-full justify-start' : ''}><Bot className="mr-2 h-4 w-4" />{t('AI Tutor', 'AI 助教')}</Button></Link>}
      <Link to="/playground" onClick={closeMobileMenu}><Button variant="ghost" className={mobile ? 'w-full justify-start' : ''}><FlaskConical className="mr-2 h-4 w-4" />{t('Playground', '互动工具')}</Button></Link>
      <Link to="/solution-requests" onClick={closeMobileMenu}><Button variant="ghost" className={mobile ? 'w-full justify-start' : ''}><MessageCircleQuestion className="mr-2 h-4 w-4" />{t('Solution Requests', '答疑')}</Button></Link>
      <Link to="/team" onClick={closeMobileMenu}><Button variant="ghost" className={mobile ? 'w-full justify-start' : ''}><Users className="mr-2 h-4 w-4" />{t('Team', '团队')}</Button></Link>
      {isAdmin && <Link to="/admin" onClick={closeMobileMenu}><Button variant="ghost" className={mobile ? 'w-full justify-start' : ''}><Shield className="mr-2 h-4 w-4" />Admin</Button></Link>}
      {user && accessError && <Button variant="ghost" disabled={accessLoading} onClick={retryAdminAccess} title={accessError}>{t('Retry permissions', '重新加载权限')}</Button>}
    </>
  );

  const LanguageToggle = () => (
    <Button variant="ghost" size="sm" onClick={() => setLanguage(language === 'en' ? 'zh' : 'en')} aria-label={language === 'en' ? 'Switch to Chinese' : '切换到英文'}>
      <Languages className="mr-2 h-4 w-4" />{language === 'en' ? '中文' : 'EN'}
    </Button>
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
    <nav className="border-b border-border bg-background shadow-sm">
      <div className="mx-auto max-w-screen-2xl px-4 sm:px-6">
        <div className="flex h-16 items-center justify-between gap-4">
          <div className="flex shrink-0 items-center">
            <Link to="/" className="flex items-center space-x-2">
              <img src="/o2i-logo.jpg" alt="O2I Institute" className="h-8 w-8 rounded-full object-cover" />
              <span className="whitespace-nowrap text-xl font-bold text-primary">O2I Institute</span>
            </Link>
          </div>

          {/* iPad and up: one row; the links scroll sideways when they don't fit (right edge fades as a hint). */}
          <div className="hidden min-w-0 flex-1 items-center gap-4 min-[740px]:flex">
            <div role="region" aria-label={t('Scrollable navigation', '可滚动导航')} tabIndex={0} className="min-w-0 flex-1 overflow-x-auto rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-[1399px]:[mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)]">
              <div className="mx-auto flex w-max items-center gap-1 px-1 py-2 [&_button]:px-3 [&_svg]:mr-0 max-[1399px]:pr-8"><NavLinks /></div>
            </div>
            <div className="flex shrink-0 items-center gap-1"><LanguageToggle /><AuthButtons /></div>
          </div>

          <div className="flex items-center gap-1 min-[740px]:hidden">
            <LanguageToggle />
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild><Button variant="ghost" size="icon"><Menu className="h-6 w-6" /><span className="sr-only">{t('Open menu', '打开菜单')}</span></Button></SheetTrigger>
              <SheetContent side="right" className="w-[300px] sm:w-[350px]">
                <SheetTitle className="sr-only">{t('Site navigation', '网站导航')}</SheetTitle>
                <SheetDescription className="sr-only">{t('Browse O2I Institute pages and account options.', '浏览 O2I Institute 的页面和账号选项。')}</SheetDescription>
                <div className="mt-6 flex flex-col space-y-4">
                  <div className="flex items-center space-x-2 border-b pb-4"><img src="/o2i-logo.jpg" alt="O2I Institute" className="h-8 w-8 rounded-full object-cover" /><span className="text-lg font-bold text-primary">O2I Institute</span></div>
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
