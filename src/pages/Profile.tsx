import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { loadPracticeStatistics, type PracticeStatistics } from '@/lib/studentPractice';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { User, Mail, Calendar, Lock, Shield } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

function LearningStatistics({ userId }: { userId: string }) {
  const [statistics, setStatistics] = useState<PracticeStatistics | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setBusy(true); setError(''); setStatistics(null);
    void loadPracticeStatistics(supabase, userId)
      .then(data => { if (active) setStatistics(data); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [userId, retry]);

  return <Card>
    <CardHeader>
      <CardTitle>Learning Statistics</CardTitle>
      <CardDescription>All saved practice history for your account. Practice sets include unstarted and partially completed sets. Each submitted answer counts once per question per set; accuracy is correct answers divided by submitted answers.</CardDescription>
    </CardHeader>
    <CardContent>
      {busy ? <p role="status">Loading your practice statistics…</p> : error ? (
        <div role="alert" className="space-y-3"><p>Could not load your practice statistics. {error}</p><Button onClick={() => setRetry(n => n + 1)}>Retry</Button></div>
      ) : statistics && <>
        <dl aria-label="Practice statistics" className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            ['Practice Sets', statistics.sessionCount],
            ['Submitted Answers', statistics.attemptCount],
            ['Accuracy', statistics.attemptCount ? `${(statistics.correctCount / statistics.attemptCount * 100).toFixed(1)}%` : '—'],
          ].map(([label, value]) => <div key={label} className="text-center p-4 border rounded-lg">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="text-2xl font-bold text-primary">{value}</dd>
          </div>)}
        </dl>
        {statistics.attemptCount === 0 && <div className="mt-4 space-y-3"><p>No submitted answers yet. Your accuracy will appear after you submit an answer.</p><Button asChild><Link to="/practice">Start practice</Link></Button></div>}
      </>}
    </CardContent>
  </Card>;
}

export default function Profile() {
  const { user, isSuperAdmin, loading } = useAuth();
  const isProtectedAccount = isSuperAdmin;

  if (loading) return <p role="status" className="p-8">Checking your account…</p>;

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>
              You need to be logged in to view your profile.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-foreground">Profile</h1>
            {isProtectedAccount && (
              <Badge variant="default" className="bg-purple-600">
                <Shield className="h-3 w-3 mr-1" />
                Super Admin
                <Lock className="h-3 w-3 ml-1" />
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-2">
            {isProtectedAccount 
              ? 'Protected account - some actions are restricted for security' 
              : 'View your account information and saved practice progress'}
          </p>
        </div>

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Account Information
                {isProtectedAccount && (
                  <Badge variant="outline" className="ml-2 text-amber-600 border-amber-600">
                    <Lock className="h-3 w-3 mr-1" />
                    Read-Only
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                {isProtectedAccount 
                  ? 'Your account information is protected and cannot be modified' 
                  : 'Your account information is read-only'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="flex items-center space-x-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      value={user.email || ''}
                      disabled
                      className="bg-muted"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="created">Member Since</Label>
                  <div className="flex items-center space-x-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <Input
                      id="created"
                      value={new Date(user.created_at).toLocaleDateString()}
                      disabled
                      className="bg-muted"
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="user-id">User ID</Label>
                <Input
                  id="user-id"
                  value={user.id}
                  disabled
                  className="bg-muted font-mono text-sm"
                />
              </div>
            </CardContent>
          </Card>

          <LearningStatistics key={user.id} userId={user.id} />
        </div>
      </div>
    </div>
  );
}
