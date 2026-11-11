import { useEffect, useState, type FormEvent } from 'react';
import { Loader2, Quote, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { errorText, LIMITS, removeImages, uploadImages, validateReply, type SrReply } from '@/lib/solutionRequests';
import ImagePicker from './ImagePicker';
import { PostBody } from './shared';
import { useBilingual, useSignedImages } from './hooks';

export interface ReplyDraft { body: string; image: string | null; anonymous: boolean }

/** New reply or edit of an existing one. `official` hides the anonymous option (official replies are named). */
export default function ReplyComposer({ id, official, quote, onClearQuote, initial, onSubmit, onCancel, submitLabel }: {
  id: string; official: boolean; quote?: SrReply | null; onClearQuote?: () => void;
  initial?: { body: string; image: string | null; anonymous: boolean };
  onSubmit: (draft: ReplyDraft) => Promise<void>; onCancel?: () => void; submitLabel?: [string, string];
}) {
  const { tt } = useBilingual();
  const { toast } = useToast();
  const [body, setBody] = useState(initial?.body ?? '');
  const [existing, setExisting] = useState<string[]>(initial?.image ? [initial.image] : []);
  const [files, setFiles] = useState<File[]>([]);
  const [anonymous, setAnonymous] = useState(initial?.anonymous ?? false);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const urls = useSignedImages(initial?.image ? [initial.image] : []);

  useEffect(() => { if (quote) document.getElementById(`${id}-body`)?.focus(); }, [quote, id]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const problem = validateReply(body, existing.length + files.length > 0);
    if (problem) { toast({ title: tt(problem), variant: 'destructive' }); return; }
    setSaving(true);
    let uploaded: string[] = [];
    try {
      uploaded = await uploadImages(supabase, files);
      await onSubmit({ body: body.trim(), image: uploaded[0] ?? existing[0] ?? null, anonymous: !official && anonymous });
      if (!initial) { setBody(''); setFiles([]); setExisting([]); setPreview(false); }
    } catch (error) {
      await removeImages(supabase, uploaded);
      toast({ title: tt(errorText(error)), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      {quote && (
        <div className="flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-sm">
          <Quote aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="min-w-0 flex-1 truncate">{tt([`Quoting #${quote.floor}`, `引用 #${quote.floor}`])}{quote.body ? `: ${quote.body}` : ''}</p>
          {onClearQuote && <button type="button" onClick={onClearQuote} aria-label={tt(['Remove quote', '取消引用'])}><X aria-hidden="true" className="h-4 w-4" /></button>}
        </div>
      )}
      <div className="flex items-center justify-between">
        <Label htmlFor={`${id}-body`}>{tt(initial ? ['Edit reply', '修改回复'] : ['Your reply', '回复'])}</Label>
        <Button type="button" variant="ghost" size="sm" onClick={() => setPreview(p => !p)}>{tt(preview ? ['Edit', '编辑'] : ['Preview', '预览'])}</Button>
      </div>
      {preview
        ? <div className="min-h-24 rounded-md border p-3">{body.trim() ? <PostBody text={body} /> : <p className="text-sm text-muted-foreground">{tt(['Nothing to preview yet.', '还没有内容。'])}</p>}</div>
        : <Textarea id={`${id}-body`} rows={4} maxLength={LIMITS.body} value={body} onChange={e => setBody(e.target.value)}
            placeholder={tt(['Explain a step, give a hint, or ask a follow-up. Use $...$ for math.', '讲讲思路、给个提示，或者继续追问。公式可以用 $...$ 写。'])} />}
      <ImagePicker id={`${id}-image`} existing={existing} files={files} max={LIMITS.replyImages} urls={urls}
        onChange={(e, f) => { setExisting(e); setFiles(f); }} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        {official
          ? <p className="text-sm text-muted-foreground">{tt(['Posted as an official O2I answer, with your name.', '将以 O2I 官方身份、署名发布。'])}</p>
          : <div className="flex items-center gap-2">
              <Checkbox id={`${id}-anonymous`} checked={anonymous} onCheckedChange={value => setAnonymous(value === true)} />
              <Label htmlFor={`${id}-anonymous`} className="font-normal">{tt(['Reply anonymously', '匿名回复'])}</Label>
            </div>}
        <div className="flex gap-2">
          {onCancel && <Button type="button" variant="outline" disabled={saving} onClick={onCancel}>{tt(['Cancel', '取消'])}</Button>}
          <Button type="submit" disabled={saving}>
            {saving && <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />}
            {tt(submitLabel ?? (initial ? ['Save', '保存'] : ['Post reply', '发布回复']))}
          </Button>
        </div>
      </div>
    </form>
  );
}
