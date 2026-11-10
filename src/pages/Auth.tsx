import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Book } from 'lucide-react';
import { z } from 'zod';
import { authReturnTo } from '@/lib/authReturnTo';

const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

const signUpSchema = z.object({
  fullName: z.string().trim().min(2, 'Name must be at least 2 characters').max(100, 'Name is too long'),
  email: z.string().trim().email('Invalid email address').max(255, 'Email is too long'),
  password: passwordSchema
});

const VALIDATION_ZH: Record<string, string> = {
  'Password must be at least 8 characters': '密码至少 8 位',
  'Password must contain at least one uppercase letter': '密码需包含至少一个大写字母',
  'Password must contain at least one lowercase letter': '密码需包含至少一个小写字母',
  'Password must contain at least one number': '密码需包含至少一个数字',
  'Password must contain at least one special character': '密码需包含至少一个特殊字符',
  'Name must be at least 2 characters': '姓名至少 2 个字符',
  'Name is too long': '姓名太长',
  'Invalid email address': '邮箱格式不正确',
  'Email is too long': '邮箱太长',
  'Password is required': '请输入密码',
};

const signInSchema = z.object({
  email: z.string().trim().email('Invalid email address'),
  password: z.string().min(1, 'Password is required')
});

export default function Auth() {
  const [isLoading, setIsLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const requestedReturn = params.get('returnTo') ?? '/';
  const returnTo = authReturnTo(requestedReturn);
  const { toast } = useToast();
  const { language, t } = useLanguage();
  const validationText = (message: string) => language === 'zh' ? VALIDATION_ZH[message] ?? message : message;

  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setPasswordError('');

    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    try {
      // Validate input
      const validation = signInSchema.safeParse({ email, password });
      if (!validation.success) {
        const firstError = validation.error.errors[0];
        toast({
          title: t('Validation Error', '输入有误'),
          description: validationText(firstError.message),
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      const { error } = await signIn(email, password);
      if (error) {
        toast({
          title: t('Error signing in', '登录失败'),
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: t('Welcome back!', '欢迎回来！'),
          description: t('You have been signed in successfully.', '登录成功。'),
        });
        navigate(returnTo);
      }
    } catch (error) {
      toast({
        title: t('Error', '出错了'),
        description: t('An unexpected error occurred. Please try again.', '出了点问题，请重试。'),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setPasswordError('');

    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const fullName = formData.get('fullName') as string;

    try {
      // Validate input
      const validation = signUpSchema.safeParse({ fullName, email, password });
      if (!validation.success) {
        const firstError = validation.error.errors[0];
        if (firstError.path.includes('password')) {
          setPasswordError(validationText(firstError.message));
        }
        toast({
          title: t('Validation Error', '输入有误'),
          description: validationText(firstError.message),
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      const { error } = await signUp(email, password, fullName);
      if (error) {
        // Handle specific error cases with helpful messages
        let errorMessage = error.message;
        if (error.message.includes('already registered')) {
          errorMessage = t('This email is already registered. Please sign in instead.', '这个邮箱已经注册过了，请直接登录。');
        } else if (error.message.includes('rate limit')) {
          errorMessage = t('Too many signup attempts. Please wait a few minutes and try again.', '注册太频繁了，请过几分钟再试。');
        }
        
        toast({
          title: t('Error creating account', '注册失败'),
          description: errorMessage,
          variant: "destructive",
        });
      } else {
        toast({
          title: t('🎉 Account Created Successfully!', '🎉 注册成功！'),
          description: t('You can now sign in with your email and password. Welcome to O2I Institute!', '现在可以用邮箱和密码登录了。欢迎来到 O2I Institute！'),
          duration: 6000,
        });
        // Since email confirmation may not be configured, allow immediate sign in
        // Switch to sign-in tab after successful registration
      }
    } catch (error) {
      toast({
        title: t('Error', '出错了'),
        description: t('An unexpected error occurred. Please try again.', '出了点问题，请重试。'),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="flex items-center justify-center space-x-2 mb-4">
            <Book className="h-10 w-10 text-primary" />
            <span className="text-2xl font-bold text-primary">O2I Institute</span>
          </Link>
          <h1 className="text-3xl font-bold text-foreground">{t('Welcome to Math Tutoring', '欢迎来学数学')}</h1>
          <p className="text-muted-foreground mt-2">{t('Sign in to your account or create a new one', '登录，或注册一个新账号')}</p>
        </div>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>{t('Authentication', '账号登录')}</CardTitle>
            <CardDescription>
              {t('Access your learning dashboard and math tutoring resources', '登录后进入学习主页，使用课程和练习')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs key={params.get('tab') ?? 'signin'} defaultValue={params.get('tab') === 'signup' ? 'signup' : 'signin'} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">{t('Sign In', '登录')}</TabsTrigger>
                <TabsTrigger value="signup">{t('Sign Up', '注册')}</TabsTrigger>
              </TabsList>
              
              <TabsContent value="signin">
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signin-email">{t('Email', '邮箱')}</Label>
                    <Input
                      id="signin-email"
                      name="email"
                      type="email"
                      placeholder="your.email@example.com"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signin-password">{t('Password', '密码')}</Label>
                    <Input
                      id="signin-password"
                      name="password"
                      type="password"
                      placeholder={t('Your password', '输入密码')}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? t('Signing in...', '登录中…') : t('Sign In', '登录')}
                  </Button>
                  <div className="flex justify-end">
                    <Link to="/reset-password" className="text-sm text-primary hover:underline">{t('Forgot password?', '忘记密码？')}</Link>
                  </div>
                </form>
              </TabsContent>
              
              <TabsContent value="signup">
                <div className="mb-4 p-3 bg-muted rounded-md">
                  <p className="text-sm text-muted-foreground">
                    {t("📧 After signing up, you'll receive a confirmation email. Please verify your email address to complete registration.", '📧 注册后会收到一封确认邮件，验证邮箱后即可完成注册。')}
                  </p>
                </div>
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">{t('Full Name', '姓名')}</Label>
                    <Input
                      id="signup-name"
                      name="fullName"
                      type="text"
                      placeholder={t('Your full name', '输入姓名')}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">{t('Email', '邮箱')}</Label>
                    <Input
                      id="signup-email"
                      name="email"
                      type="email"
                      placeholder="your.email@example.com"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">{t('Password', '密码')}</Label>
                    <Input
                      id="signup-password"
                      name="password"
                      type="password"
                      placeholder={t('Create a password', '设置密码')}
                      required
                      onChange={() => setPasswordError('')}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t('Must be 8+ characters with uppercase, lowercase, number, and special character', '至少 8 位，需包含大写字母、小写字母、数字和特殊字符')}
                    </p>
                    {passwordError && (
                      <p className="text-xs text-destructive">{passwordError}</p>
                    )}
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? t('Creating account...', '注册中…') : t('Sign Up', '注册')}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}