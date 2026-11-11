import { useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { Award, CheckCircle2, Clock, EyeOff, Lock, MessageSquare, ShieldCheck, UserRound } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { analyzeQuestionBankMath } from '@/lib/questionBankMath';
import { STATUS_LABELS, type SrAuthor, type SrStatus } from '@/lib/solutionRequests';
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
// Same colour tiles as the homepage features; yellow tiles take dark text.
const BLUE = 'from-[hsl(var(--education-blue))] to-[hsl(212_90%_52%)] text-white shadow-[hsl(var(--education-blue)/0.3)]';
const statusStyle: Record<SrStatus, { pill: string; tile: string }> = {
  awaiting: { pill: 'bg-accent/25 text-foreground', tile: 'from-[hsl(var(--education-orange))] to-[hsl(32_95%_55%)] text-amber-950 shadow-[hsl(var(--education-orange)/0.35)]' },
  replied: { pill: 'bg-primary/10 text-primary', tile: BLUE },
  answered: { pill: 'bg-primary text-primary-foreground', tile: BLUE },
  solved: { pill: 'bg-[hsl(var(--education-teal)/0.12)] text-[hsl(var(--education-teal))]', tile: 'from-[hsl(var(--education-teal))] to-[hsl(168_70%_40%)] text-white shadow-[hsl(var(--education-teal)/0.3)]' },
};

export function Pill({ icon: Icon, className, children }: { icon?: typeof Clock; className: string; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>
      {Icon && <Icon aria-hidden="true" className="h-3.5 w-3.5" />}{children}
    </span>
  );
}

export function StatusBadges({ status, closed, isPublic, hidden }: { status: SrStatus; closed?: boolean; isPublic?: boolean; hidden?: boolean }) {
  const { tt } = useBilingual();
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Pill icon={statusIcon[status] ?? Clock} className={(statusStyle[status] ?? statusStyle.awaiting).pill}>{tt(STATUS_LABELS[status] ?? STATUS_LABELS.awaiting)}</Pill>
      {closed && <Pill icon={Lock} className="bg-muted text-muted-foreground">{tt(['Closed', '已关闭'])}</Pill>}
      {isPublic === false && <Pill icon={ShieldCheck} className="bg-muted text-muted-foreground">{tt(['Admins only', '仅管理员可见'])}</Pill>}
      {hidden && <Pill icon={EyeOff} className="bg-destructive/10 text-destructive">{tt(['Hidden by admin', '已被管理员隐藏'])}</Pill>}
    </div>
  );
}

/** Coloured icon square for a question's status, as in the homepage feature tiles. */
export function StatusTile({ status, className = 'h-11 w-11' }: { status: SrStatus; className?: string }) {
  const Icon = statusIcon[status] ?? Clock;
  return (
    <div aria-hidden="true" className={`grid shrink-0 place-items-center rounded-xl bg-gradient-to-br shadow-md ${(statusStyle[status] ?? statusStyle.awaiting).tile} ${className}`}>
      <Icon strokeWidth={2.25} className="h-5 w-5" />
    </div>
  );
}

/** Round avatar: official answers get the brand colour, anonymous posts a neutral mark. */
export function AuthorAvatar({ author }: { author: SrAuthor }) {
  const initial = !author.anonymous && author.name ? Array.from(author.name.trim())[0]?.toUpperCase() : null;
  return (
    <div aria-hidden="true" className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-semibold ${author.official
      ? 'bg-primary text-primary-foreground' : author.anonymous ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'}`}>
      {author.official ? <Award className="h-4 w-4" /> : initial ?? <UserRound className="h-4 w-4" />}
    </div>
  );
}

/** Thumbnails that open full size. */
export function ImageGallery({ paths, urls, size = 'md' }: { paths: string[]; urls: Record<string, string>; size?: 'sm' | 'md' }) {
  const { tt } = useBilingual();
  const [open, setOpen] = useState<string | null>(null);
  if (!paths.length) return null;
  const box = size === 'sm' ? 'h-24 w-24' : 'h-44 w-full sm:w-60';
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {paths.map((path, i) => (
          <button key={path} type="button" onClick={() => setOpen(path)} className={`${box} overflow-hidden rounded-xl bg-muted ring-1 ring-border transition hover:ring-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
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
