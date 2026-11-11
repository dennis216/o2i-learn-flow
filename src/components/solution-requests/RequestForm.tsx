import { useEffect, useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  errorText, LIMITS, PROBLEM_TYPES, removeImages, srCreate, srUpdate, uploadImages, validateQuestion,
  type ProblemType, type QuestionDraft, type SrSummary,
} from '@/lib/solutionRequests';
import ImagePicker from './ImagePicker';
import { PostBody } from './shared';
import { useBilingual, useSignedImages } from './hooks';

const EMPTY: QuestionDraft = { title: '', description: '', problemType: '', isPublic: true, isAnonymous: true };

/** Ask a new question, or edit one (pass `editing`). */
export default function RequestForm({ open, onOpenChange, editing, quotaLeft, onSaved }: {
  open: boolean; onOpenChange: (open: boolean) => void; editing?: SrSummary | null;
  quotaLeft?: number | null; onSaved: (id: string) => void;
}) {
  const { tt } = useBilingual();
  const { toast } = useToast();
  const [draft, setDraft] = useState<QuestionDraft>(EMPTY);
  const [existing, setExisting] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const urls = useSignedImages(editing?.image_paths ?? []);

  useEffect(() => {
    if (!open) return;
    setDraft(editing ? {
      title: editing.title, description: editing.description, problemType: editing.problem_type ?? 'other',
      isPublic: editing.is_public, isAnonymous: editing.is_anonymous,
    } : EMPTY);
    setExisting(editing?.image_paths ?? []);
    setFiles([]);
    setPreview(false);
  }, [open, editing]);

  const set = <K extends keyof QuestionDraft>(key: K, value: QuestionDraft[K]) => setDraft(d => ({ ...d, [key]: value }));
  const blocked = !editing && quotaLeft === 0;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const problems = validateQuestion(draft, existing.length + files.length);
    if (problems.length) { toast({ title: tt(problems[0]), variant: 'destructive' }); return; }
    setSaving(true);
    let uploaded: string[] = [];
    try {
      uploaded = await uploadImages(supabase, files);
      const id = editing
        ? (await srUpdate(supabase, editing.id, draft, [...existing, ...uploaded]), editing.id)
        : await srCreate(supabase, draft, uploaded);
      toast({ title: tt(editing ? ['Question updated', '已保存修改'] : ['Question posted', '问题已提交']) });
      onOpenChange(false);
      onSaved(id);
    } catch (error) {
      await removeImages(supabase, uploaded);
      toast({ title: tt(errorText(error)), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={value => !saving && onOpenChange(value)}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{tt(editing ? ['Edit question', '修改问题'] : ['Ask a question', '我要提问'])}</DialogTitle>
          <DialogDescription>
            {tt(['Photograph the problem and say where you are stuck. Use $...$ for math.', '拍下题目，说说卡在哪里。公式可以用 $...$ 写。'])}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="contents">
          <DialogBody>
            {blocked && <p role="alert" className="rounded-md bg-muted p-3 text-sm">{tt(['You have asked 5 questions in the last 24 hours. Try again later.', '24 小时内最多提 5 个问题，请稍后再来。'])}</p>}
            <div className="space-y-2">
              <Label htmlFor="sr-title">{tt(['Title', '标题'])}</Label>
              <Input id="sr-title" value={draft.title} maxLength={LIMITS.title} required onChange={e => set('title', e.target.value)}
                placeholder={tt(['e.g. Limit of sin x / x at 0', '例如：x 趋于 0 时 sin x / x 的极限'])} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sr-type">{tt(['Problem type', '题目类型'])}</Label>
              <Select value={draft.problemType} onValueChange={value => set('problemType', value as ProblemType)}>
                <SelectTrigger id="sr-type"><SelectValue placeholder={tt(['Choose a type', '选择题目类型'])} /></SelectTrigger>
                <SelectContent>{PROBLEM_TYPES.map(type => <SelectItem key={type.value} value={type.value}>{tt(type.label)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="sr-description">{tt(['Where are you stuck?', '哪里不会？'])}</Label>
                <Button type="button" variant="ghost" size="sm" onClick={() => setPreview(p => !p)}>{tt(preview ? ['Edit', '编辑'] : ['Preview', '预览'])}</Button>
              </div>
              {preview
                ? <div className="min-h-24 rounded-md border p-3">{draft.description.trim() ? <PostBody text={draft.description} /> : <p className="text-sm text-muted-foreground">{tt(['Nothing to preview yet.', '还没有内容。'])}</p>}</div>
                : <Textarea id="sr-description" rows={5} maxLength={LIMITS.body} value={draft.description} onChange={e => set('description', e.target.value)}
                    placeholder={tt(['What have you tried? Which step is unclear?', '你试过什么方法？哪一步不明白？'])} />}
            </div>
            <div className="space-y-2">
              <Label htmlFor="sr-images">{tt(['Images (up to 3, 5 MB each)', '图片（最多 3 张，每张不超过 5MB）'])}</Label>
              <ImagePicker id="sr-images" existing={existing} files={files} max={LIMITS.questionImages} urls={urls}
                onChange={(e, f) => { setExisting(e); setFiles(f); }} />
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{tt(['Who can see it', '谁能看到'])}</legend>
              <RadioGroup value={draft.isPublic ? 'public' : 'private'} onValueChange={value => set('isPublic', value === 'public')}>
                <div className="flex items-start gap-2">
                  <RadioGroupItem id="sr-public" value="public" className="mt-0.5" />
                  <Label htmlFor="sr-public" className="font-normal">{tt(['Everyone: other students can read and reply too', '公开：其他同学也能看到和回复'])}</Label>
                </div>
                <div className="flex items-start gap-2">
                  <RadioGroupItem id="sr-private" value="private" className="mt-0.5" />
                  <Label htmlFor="sr-private" className="font-normal">{tt(['Admins only: only O2I teachers see it and answer', '仅管理员：只有 O2I 老师能看到并解答'])}</Label>
                </div>
              </RadioGroup>
            </fieldset>
            <div className="flex items-center gap-2">
              <Checkbox id="sr-anonymous" checked={draft.isAnonymous} onCheckedChange={value => set('isAnonymous', value === true)} />
              <Label htmlFor="sr-anonymous" className="font-normal">{tt(['Post anonymously (other students will not see your name)', '匿名提问（其他同学看不到你的名字）'])}</Label>
            </div>
            {!editing && typeof quotaLeft === 'number' && !blocked && (
              <p className="text-sm text-muted-foreground">{tt([`You can ask ${quotaLeft} more question${quotaLeft === 1 ? '' : 's'} in the next 24 hours.`, `24 小时内还能提 ${quotaLeft} 个问题。`])}</p>
            )}
          </DialogBody>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>{tt(['Cancel', '取消'])}</Button>
            <Button type="submit" disabled={saving || blocked}>
              {saving && <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />}
              {tt(editing ? ['Save changes', '保存修改'] : ['Post question', '提交问题'])}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
