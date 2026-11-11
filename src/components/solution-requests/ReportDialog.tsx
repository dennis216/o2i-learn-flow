import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { errorText, LIMITS, srReport } from '@/lib/solutionRequests';
import { useBilingual } from './hooks';

export default function ReportDialog({ target, onClose }: {
  target: { requestId: string; replyId: string | null; label: string } | null; onClose: () => void;
}) {
  const { tt } = useBilingual();
  const { toast } = useToast();
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const send = async () => {
    if (!target || !reason.trim()) return;
    setSaving(true);
    try {
      const out = await srReport(supabase, target.requestId, target.replyId, reason.trim());
      toast({ title: tt(out.status === 'reported' ? ['Thanks, an admin will take a look.', '已举报，管理员会处理。'] : ['You already reported this.', '你已经举报过了。']) });
      setReason('');
      onClose();
    } catch (error) {
      toast({ title: tt(errorText(error)), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={target !== null} onOpenChange={open => !open && !saving && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{tt(['Report', '举报'])} {target?.label}</DialogTitle>
          <DialogDescription>{tt(['Tell an admin what is wrong, e.g. unkind, off topic or spam.', '告诉管理员哪里有问题，比如不友善、跑题或广告。'])}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Label htmlFor="sr-report-reason" className="sr-only">{tt(['Reason', '原因'])}</Label>
          <Textarea id="sr-report-reason" rows={3} maxLength={LIMITS.reportReason} value={reason} onChange={e => setReason(e.target.value)} />
        </DialogBody>
        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={saving} onClick={onClose}>{tt(['Cancel', '取消'])}</Button>
          <Button disabled={saving || !reason.trim()} onClick={() => void send()}>{tt(['Send report', '提交举报'])}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
