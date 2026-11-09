import { PracticeAnalysisPanel } from '@/components/practice/PracticeAnalysisPanel';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { loadPracticeStatistics, type PracticeStatistics } from '@/lib/studentPractice';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
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
  const { t } = useLanguage();
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
      <CardTitle>{t('Learning Statistics', '学习统计')}</CardTitle>
      <CardDescription>{t('Saved Practice and Arena answers for your account. Each Arena run counts as one learning session after its first question is issued. Sessions include partially completed practice; accuracy counts submitted answers only.', '你账号里保存的练习和竞技场作答。竞技场每局在出第一题后算一次学习。学习次数包括没做完的练习；正确率只统计已提交的作答。')}</CardDescription>
    </CardHeader>
    <CardContent>
      {busy ? <p role="status">{t('Loading your practice statistics…', '学习统计加载中…')}</p> : error ? (
        <div role="alert" className="space-y-3"><p>{t('Could not load your practice statistics.', '无法加载学习统计。')} {error}</p><Button onClick={() => setRetry(n => n + 1)}>{t('Retry', '重试')}</Button></div>
      ) : statistics && <>
        <dl aria-label={t('Practice statistics', '练习统计')} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            [t('Learning Sessions', '学习次数'), statistics.sessionCount],
            [t('Submitted Answers', '已提交作答'), statistics.attemptCount],
            [t('Accuracy', '正确率'), statistics.attemptCount ? `${(statistics.correctCount / statistics.attemptCount * 100).toFixed(1)}%` : '—'],
          ].map(([label, value]) => <div key={label} className="text-center p-4 border rounded-lg">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="text-2xl font-bold text-primary">{value}</dd>
          </div>)}
        </dl>
        <table className="mt-5 w-full text-left text-sm">
          <caption className="mb-2 text-left font-medium">{t('Answers by source', '按来源统计')}</caption>
          <thead><tr><th scope="col">{t('Source', '来源')}</th><th scope="col">{t('Sessions', '次数')}</th><th scope="col">{t('Answers', '作答')}</th><th scope="col">{t('Accuracy', '正确率')}</th></tr></thead>
          <tbody>{statistics.sources.map(row => <tr key={row.source}><th scope="row">{row.source === 'arena' ? t('Arena', '竞技场') : t('Practice', '练习')}</th><td>{row.sessionCount}</td><td>{row.attemptCount}</td><td>{row.attemptCount ? `${(row.correctCount / row.attemptCount * 100).toFixed(1)}%` : '—'}</td></tr>)}</tbody>
        </table>
        <p className="mt-3 text-sm text-muted-foreground">{t('Arena answers appear in Review. They do not change normal practice difficulty, Topic status or speed analysis.', '竞技场作答会出现在复习里，但不影响普通练习的难度、Topic 状态和速度分析。')}</p>
        {statistics.attemptCount === 0 && <div className="mt-4 space-y-3"><p>{t('No submitted answers yet. Your accuracy will appear after you submit an answer.', '还没有提交过作答。提交后会显示正确率。')}</p><Button asChild><Link to="/practice">{t('Start practice', '开始练习')}</Link></Button></div>}
      </>}
    </CardContent>
  </Card>;
}

export default function Profile() {
  const { user, isSuperAdmin, loading } = useAuth();
  const isProtectedAccount = isSuperAdmin;
  const { t } = useLanguage();

  if (loading) return <p role="status" className="p-8">{t('Checking your account…', '正在检查账号…')}</p>;

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{t('Access Denied', '无法访问')}</CardTitle>
            <CardDescription>
              {t('You need to be logged in to view your profile.', '登录后才能查看个人资料。')}
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
            <h1 className="text-3xl font-bold text-foreground">{t('Profile', '个人资料')}</h1>
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
              ? t('Protected account - some actions are restricted for security', '受保护账号：出于安全考虑，部分操作受限')
              : t('View your account information and saved practice progress', '查看你的账号信息和练习进度')}
          </p>
        </div>

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                {t('Account Information', '账号信息')}
                {isProtectedAccount && (
                  <Badge variant="outline" className="ml-2 text-amber-600 border-amber-600">
                    <Lock className="h-3 w-3 mr-1" />
                    {t('Read-Only', '只读')}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                {isProtectedAccount 
                  ? t('Your account information is protected and cannot be modified', '你的账号信息受保护，不能修改')
                  : t('Your account information is read-only', '账号信息为只读')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">{t('Email', '邮箱')}</Label>
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
                  <Label htmlFor="created">{t('Member Since', '注册时间')}</Label>
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
                <Label htmlFor="user-id">{t('User ID', '用户 ID')}</Label>
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
          <PracticeAnalysisPanel key={"analysis:" + user.id} />
        </div>
      </div>
    </div>
  );
}
