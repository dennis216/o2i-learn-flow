import { useEffect, useState } from 'react';
import { supabase, SUPABASE_URL } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

type LinkedRecords = { table: string; column?: string; count: number; reason?: string };
type DeletionPreview = { email: string; can_delete: boolean; blockers: LinkedRecords[]; personal_data: LinkedRecords[] };
const labels: Record<string, string> = {
  profiles: 'Account profile', user_roles: 'Account permissions', user_login_events: 'Sign-in history', courses: 'Courses',
  questions: 'Authored questions', question_versions: 'Question versions', question_version_reviews: 'Question reviews',
  question_publication_events: 'Publication history', 'storage.objects': 'Uploaded files', question_practice_sessions: 'Practice sessions',
  question_practice_attempts: 'Practice attempts', enrollments: 'Enrollments', user_progress: 'Learning progress',
  solution_requests: 'Solution requests', forum_posts: 'Forum posts', post_replies: 'Forum replies',
};
async function requestDeletion(userId: string, action: 'preview' | 'delete', email?: string) {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) throw new Error('Your session has expired. Sign in again.');
  const response = await fetch(`${SUPABASE_URL}/functions/v1/admin-delete-user`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
    body: JSON.stringify({ userId, action, email }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Unable to process account deletion.');
  return result;
}
export function UserDeletionDialog({ userId, email, onDeleted }: { userId: string; email: string; onDeleted: () => void }) {
  const [open, setOpen] = useState(false), [preview, setPreview] = useState<DeletionPreview | null>(null);
  const [loading, setLoading] = useState(false), [deleting, setDeleting] = useState(false);
  const [confirmation, setConfirmation] = useState(''), [error, setError] = useState('');
  const { toast } = useToast();
  useEffect(() => {
    if (!open) return;
    let active = true;
    setPreview(null); setConfirmation(''); setError(''); setLoading(true);
    void requestDeletion(userId, 'preview').then(result => {
      if (active) setPreview(result);
    }).catch(error => { if (active) setError(error instanceof Error ? error.message : 'Could not load deletion impact.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, userId]);
  const remove = async () => {
    setDeleting(true); setError('');
    try {
      const result = await requestDeletion(userId, 'delete', confirmation);
      if (result.success !== true) throw new Error('Deletion could not be confirmed. Refresh the user list.');
      toast({ title: 'Account deleted', description: email }); setOpen(false); onDeleted();
    } catch (error) { setError(error instanceof Error ? error.message : 'Deletion failed.'); }
    finally { setDeleting(false); }
  };
  const records = (rows: LinkedRecords[]) => <ul className="list-disc pl-5 text-sm space-y-1">{rows.map((row, i) => <li key={i}>{labels[row.table] ?? 'Other linked records'}: {row.count}</li>)}</ul>;
  return <>
    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setOpen(true)} aria-label={`Delete ${email}`}>Delete</Button>
    <Dialog open={open} onOpenChange={value => { if (!deleting) setOpen(value); }}>
      <DialogContent scrollable className="max-h-[90vh]">
        <DialogHeader><DialogTitle>Delete account permanently?</DialogTitle></DialogHeader>
      <DialogBody><DialogDescription>{email}. This cannot be undone. Public content and review history must be preserved.</DialogDescription>
        {loading && <p role="status">Checking associated data…</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {preview && <div className="space-y-4">
          {preview.blockers.length > 0 ? <div><p className="font-semibold text-destructive">Deletion blocked</p><p className="text-sm mb-2">Review or transfer these records and files first. Authorship and review evidence cannot be rewritten here.</p>{records(preview.blockers)}</div> : <p className="text-sm">No associated public content or files block deletion.</p>}
          <div><p className="font-semibold mb-2">Personal data to remove</p>{records(preview.personal_data)}<p className="text-sm mt-2">The login account and active sign-in sessions will also be removed. Practice session items are removed with their sessions. A deletion audit record is retained.</p></div>
          {preview.can_delete && <div className="space-y-2"><Label htmlFor={`delete-email-${userId}`}>Type {preview.email} to confirm</Label><Input id={`delete-email-${userId}`} value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="off" disabled={deleting} /></div>}
        </div>}
        <DialogFooter><Button variant="outline" disabled={deleting} onClick={() => setOpen(false)}>Cancel</Button><Button variant="destructive" disabled={loading || deleting || preview?.can_delete !== true || confirmation.trim().toLowerCase() !== preview.email.toLowerCase()} onClick={() => void remove()}>{deleting ? 'Deleting…' : 'Delete permanently'}</Button></DialogFooter>
      </DialogBody>
    </DialogContent>
    </Dialog>
  </>;
}
