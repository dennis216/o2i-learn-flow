import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { AI_TUTOR_ENABLED } from '@/lib/aiTutor';
import { Bot, FlaskConical, Gamepad2, LogOut, Menu, Shield, Target, User, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '@/components/ui/sheet';

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

  const NavLinks = ({ mobile = false }: { mobile?: boolean }) => (
    <>
      <Link to="/courses" onClick={closeMobileMenu}><Button variant="ghost" className={mobile ? 'w-full justify-start' : ''}>{t('Courses', '课程')}</Button></Link>
      <Link to="/practice" onClick={closeMobileMenu}><Button variant="ghost" className={mobile ? 'w-full justify-start' : ''}><Target className="mr-2 h-4 w-4" />{t('Practice', '练习')}</Button></Link>
      {AI_TUTOR_ENABLED && <Link to="/ai-tutor" onClick={closeMobileMenu}><Button variant="ghost" className={mobile ? 'w-full justify-start' : ''}><Bot className="mr-2 h-4 w-4" />{t('AI Tutor', 'AI 助教')}</Button></Link>}
      <Link to="/arena" onClick={closeMobileMenu}><Button variant="ghost" className={mobile ? 'w-full justify-start' : ''}><Gamepad2 className="mr-2 h-4 w-4" />{t('Arena', '竞技场')}</Button></Link>
      <Link to="/playground" onClick={closeMobileMenu}><Button variant="ghost" className={mobile ? 'w-full justify-start' : ''}><FlaskConical className="mr-2 h-4 w-4" />{t('Playground', '互动工具')}</Button></Link>
      <Link to="/solution-requests" onClick={closeMobileMenu}><Button variant="ghost" className={mobile ? 'w-full justify-start' : ''}>{t('Solution Requests', '答疑')}</Button></Link>
      <Link to="/team" onClick={closeMobileMenu}><Button variant="ghost" className={mobile ? 'w-full justify-start' : ''}><Users className="mr-2 h-4 w-4" />{t('Team', '团队')}</Button></Link>
      <Button variant="ghost" asChild className={mobile ? 'w-full justify-start' : ''}><Link to="/about" onClick={closeMobileMenu}>{t('About Us', '关于我们')}</Link></Button>
      {isAdmin && <Link to="/admin" onClick={closeMobileMenu}><Button variant="ghost" className={mobile ? 'w-full justify-start' : ''}><Shield className="mr-2 h-4 w-4" />Admin</Button></Link>}
      {user && accessError && <Button variant="ghost" disabled={accessLoading} onClick={retryAdminAccess} title={accessError}>{t('Retry permissions', '重新加载权限')}</Button>}
    </>
  );

  const LanguageToggle = () => (
    <Button variant="ghost" size="sm" onClick={() => setLanguage(language === 'en' ? 'zh' : 'en')} aria-label={language === 'en' ? 'Switch to Chinese' : '切换到英文'}>
      {language === 'en' ? '中文' : 'EN'}
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

          <div className="hidden min-w-0 flex-1 items-center gap-4 min-[1400px]:flex">
            <div role="region" aria-label={t('Scrollable navigation', '可滚动导航')} tabIndex={0} className="min-w-0 flex-1 overflow-x-auto rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <div className="mx-auto flex w-max items-center gap-1 px-1 py-2 [&_button]:px-3 [&_svg]:mr-0"><NavLinks /></div>
            </div>
            <div className="flex shrink-0 items-center gap-1"><LanguageToggle /><AuthButtons /></div>
          </div>

          <div className="flex items-center gap-1 min-[1400px]:hidden">
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
