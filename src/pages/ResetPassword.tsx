import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'An unexpected error occurred. Please try again.';

export default function ResetPassword() {
  const [mode, setMode] = useState<'request' | 'reset'>('request');
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const navigate = useNavigate();
  const { toast } = useToast();

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
          const description = error instanceof Error ? error.message : 'Request a new password reset link.';
          toast({ title: 'Reset link is invalid or expired', description, variant: 'destructive' });
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
      toast({ title: 'Check your email', description: 'We sent a password reset link.' });
    } catch (error: unknown) {
      toast({ title: 'Reset failed', description: getErrorMessage(error), variant: 'destructive' });
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
        title: 'Weak password',
        description: 'Use 8+ characters with uppercase, lowercase, number, and special character.',
        variant: 'destructive',
      });
      return;
    }
    if (password !== confirm) {
      toast({ title: "Passwords don't match", variant: 'destructive' });
      return;
    }
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast({ title: 'Password updated', description: 'You can now sign in.' });
      navigate('/auth');
    } catch (error: unknown) {
      toast({ title: 'Update failed', description: getErrorMessage(error), variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Password reset</CardTitle>
            <CardDescription>
              {mode === 'request' ? 'Request a password reset link' : 'Set a new password'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isCheckingSession ? (
              <p className="text-sm text-muted-foreground">Verifying reset link...</p>
            ) : mode === 'request' ? (
              <form onSubmit={handleRequest} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? 'Sending...' : 'Send reset link'}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleReset} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password">New password</Label>
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                  <p className="text-xs text-muted-foreground">
                    Must be 8+ characters with uppercase, lowercase, number, and special character
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm">Confirm password</Label>
                  <Input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? 'Updating...' : 'Update password'}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
