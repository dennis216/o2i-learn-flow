import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { CheckCircle2, Clock, Lock, MessageSquare, ShieldCheck, EyeOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { analyzeQuestionBankMath } from '@/lib/questionBankMath';
import { STATUS_LABELS, type SrStatus } from '@/lib/solutionRequests';
import { useBilingual } from './hooks';

/** Student text: Markdown and $math$, no raw HTML and no remote images. */
export function PostBody({ text, className = '' }: { text: string; className?: string }) {
  return (
    <div className={`prose prose-sm max-w-none break-words dark:prose-invert math-content [overflow-wrap:anywhere] ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeKatex]} disallowedElements={['img']} unwrapDisallowed
        components={{ a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer nofollow">{children}</a> }}>
        {analyzeQuestionBankMath(text).renderContent}
      </ReactMarkdown>
    </div>
  );
}

const statusIcon: Record<SrStatus, typeof Clock> = { awaiting: Clock, replied: MessageSquare, answered: ShieldCheck, solved: CheckCircle2 };
const statusVariant: Record<SrStatus, 'outline' | 'secondary' | 'default'> = { awaiting: 'outline', replied: 'secondary', answered: 'default', solved: 'default' };

export function StatusBadges({ status, closed, isPublic, hidden }: { status: SrStatus; closed?: boolean; isPublic?: boolean; hidden?: boolean }) {
  const { tt } = useBilingual();
  const Icon = statusIcon[status] ?? Clock;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge variant={statusVariant[status] ?? 'outline'} className="gap-1"><Icon aria-hidden="true" className="h-3.5 w-3.5" />{tt(STATUS_LABELS[status] ?? STATUS_LABELS.awaiting)}</Badge>
      {closed && <Badge variant="outline" className="gap-1"><Lock aria-hidden="true" className="h-3.5 w-3.5" />{tt(['Closed', '已关闭'])}</Badge>}
      {isPublic === false && <Badge variant="outline" className="gap-1"><ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />{tt(['Admins only', '仅管理员可见'])}</Badge>}
      {hidden && <Badge variant="destructive" className="gap-1"><EyeOff aria-hidden="true" className="h-3.5 w-3.5" />{tt(['Hidden by admin', '已被管理员隐藏'])}</Badge>}
    </div>
  );
}

/** Thumbnails that open full size. */
export function ImageGallery({ paths, urls, size = 'md' }: { paths: string[]; urls: Record<string, string>; size?: 'sm' | 'md' }) {
  const { tt } = useBilingual();
  const [open, setOpen] = useState<string | null>(null);
  if (!paths.length) return null;
  const box = size === 'sm' ? 'h-24 w-24' : 'h-40 w-full sm:w-56';
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {paths.map((path, i) => (
          <button key={path} type="button" onClick={() => setOpen(path)} className={`${box} overflow-hidden rounded-lg bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
            aria-label={tt([`Open image ${i + 1}`, `查看第 ${i + 1} 张图`])}>
            {urls[path] ? <img src={urls[path]} alt="" className="h-full w-full object-cover" loading="lazy" /> : null}
          </button>
        ))}
      </div>
      <Dialog open={open !== null} onOpenChange={value => !value && setOpen(null)}>
        <DialogContent className="max-w-4xl">
          <DialogTitle className="sr-only">{tt(['Image', '图片'])}</DialogTitle>
          {open && urls[open] && <img src={urls[open]} alt="" className="max-h-[80vh] w-full rounded-md object-contain" />}
        </DialogContent>
      </Dialog>
    </>
  );
}
