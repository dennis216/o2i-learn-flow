import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';

export default function ResetPassword() {
  const [mode, setMode] = useState<'request' | 'reset'>('request');
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useLanguage();
  const getErrorMessage = (error: unknown) =>
    error instanceof Error ? error.message : t('An unexpected error occurred. Please try again.', '发生意外错误，请重试。');

  useEffect(() => {
    const trySessionFromUrl = async () => {
      const url = new URL(window.location.href);
      const code = url.searchParams.get('code');
      const authError = url.searchParams.get('error_description');
      const hash = url.hash.startsWith('#') ? url.hash.substring(1) : '';
      const hashParams = new URLSearchParams(hash);
      const type = hashParams.get('type');
      const access_token = hashParams.get('access_token');
      const refresh_token = hashParams.get('refresh_token');
      const hasRecoveryCredentials = Boolean(code || type === 'recovery' || authError);

      try {
        if (authError) {
          throw new Error(authError);
        }

        // Supabase PKCE recovery links provide a one-time code, not a full URL.
        if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          if (data.session) {
            setMode('reset');
            window.history.replaceState({}, document.title, url.pathname);
            return;
          }
        }

        // Support legacy recovery links that return tokens in the URL hash.
        if (type === 'recovery') {
          if (access_token && refresh_token) {
            const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
            if (error) throw error;
            if (data.session) {
              setMode('reset');
              window.history.replaceState({}, document.title, url.pathname);
              return;
            }
          }
        }

        // A recovery session may already have been restored by the auth client.
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData.session) {
          setMode('reset');
        }
      } catch (error) {
        if (hasRecoveryCredentials) {
          const description = error instanceof Error ? error.message : t('Request a new password reset link.', '请重新申请重置密码链接。');
          toast({ title: t('Reset link is invalid or expired', '重置链接无效或已过期'), description, variant: 'destructive' });
        }
      } finally {
        setIsCheckingSession(false);
      }
    };

    trySessionFromUrl();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) {
        setMode('reset');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [toast]);

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const redirectTo = `${window.location.origin}/reset-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
      toast({ title: t('Check your email', '请查收邮件'), description: t('We sent a password reset link.', '我们已发送重置密码链接。') });
    } catch (error: unknown) {
      toast({ title: t('Reset failed', '重置失败'), description: getErrorMessage(error), variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    const passwordRequirements = [
      password.length >= 8,
      /[A-Z]/.test(password),
      /[a-z]/.test(password),
      /[0-9]/.test(password),
      /[^A-Za-z0-9]/.test(password),
    ];
    if (passwordRequirements.some((requirement) => !requirement)) {
      toast({
        title: t('Weak password', '密码强度不够'),
        description: t('Use 8+ characters with uppercase, lowercase, number, and special character.', '请使用至少 8 位，包含大写字母、小写字母、数字和特殊字符的密码。'),
        variant: 'destructive',
      });
      return;
    }
    if (password !== confirm) {
      toast({ title: t("Passwords don't match", '两次输入的密码不一致'), variant: 'destructive' });
      return;
    }
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast({ title: t('Password updated', '密码已更新'), description: t('You can now sign in.', '现在可以登录了。') });
      navigate('/auth');
    } catch (error: unknown) {
      toast({ title: t('Update failed', '更新失败'), description: getErrorMessage(error), variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>{t('Password reset', '重置密码')}</CardTitle>
            <CardDescription>
              {mode === 'request' ? t('Request a password reset link', '申请重置密码链接') : t('Set a new password', '设置新密码')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isCheckingSession ? (
              <p className="text-sm text-muted-foreground">{t('Verifying reset link...', '正在验证重置链接…')}</p>
            ) : mode === 'request' ? (
              <form onSubmit={handleRequest} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">{t('Email', '邮箱')}</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? t('Sending...', '发送中…') : t('Send reset link', '发送重置链接')}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleReset} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password">{t('New password', '新密码')}</Label>
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                  <p className="text-xs text-muted-foreground">
                    {t('Must be 8+ characters with uppercase, lowercase, number, and special character', '至少 8 位，需包含大写字母、小写字母、数字和特殊字符')}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm">{t('Confirm password', '确认密码')}</Label>
                  <Input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? t('Updating...', '更新中…') : t('Update password', '更新密码')}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
