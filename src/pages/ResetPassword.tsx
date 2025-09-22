import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

export default function ResetPassword() {
  const [mode, setMode] = useState<'request' | 'reset'>('request');
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const trySessionFromUrl = async () => {
      try {
        // Try exchanging code if present (OAuth/code flow)
        const { data } = await supabase.auth.exchangeCodeForSession(window.location.href);
        if (data?.session) {
          setMode('reset');
          // Clean URL from auth params
          window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
          return;
        }
      } catch {
        // ignore when no code present
      }

      // Fallback: handle hash tokens (e.g., #type=recovery&access_token=...)
      const hash = window.location.hash.startsWith('#') ? window.location.hash.substring(1) : '';
      const params = new URLSearchParams(hash);
      const type = params.get('type');
      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');

      if (type === 'recovery') {
        try {
          if (access_token && refresh_token) {
            const { data: setData } = await supabase.auth.setSession({ access_token, refresh_token });
            if (setData?.session) {
              setMode('reset');
              window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
            }
          } else {
            const { data: sessionData } = await supabase.auth.getSession();
            if (sessionData.session) {
              setMode('reset');
              window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
            }
          }
        } catch {
          // ignore
        }
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
  }, []);

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const redirectTo = `${window.location.origin}/reset-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
      toast({ title: 'Check your email', description: 'We sent a password reset link.' });
    } catch (err: any) {
      toast({ title: 'Reset failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast({ title: 'Weak password', description: 'Use at least 6 characters.', variant: 'destructive' });
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
    } catch (err: any) {
      toast({ title: 'Update failed', description: err.message, variant: 'destructive' });
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
            {mode === 'request' ? (
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
