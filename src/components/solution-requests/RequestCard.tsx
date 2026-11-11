import { Link } from 'react-router-dom';
import { Flag, ImageIcon, MessageSquare } from 'lucide-react';
import { authorLabel, excerpt, problemTypeLabel, type SrSummary } from '@/lib/solutionRequests';
import { StatusBadges } from './shared';
import { useBilingual } from './hooks';

/** A question in a list. Links to its thread, or calls onOpen (admin inbox). */
export default function RequestCard({ item, to, onOpen, selected, showWaiting }: {
  item: SrSummary; to?: string; onOpen?: () => void; selected?: boolean; showWaiting?: boolean;
}) {
  const { tt, when } = useBilingual();
  const hours = Math.floor((Date.now() - new Date(item.created_at).getTime()) / 3_600_000);
  const waited = hours < 24 ? tt([`waiting ${hours} h`, `已等 ${hours} 小时`]) : tt([`waiting ${Math.floor(hours / 24)} d`, `已等 ${Math.floor(hours / 24)} 天`]);
  const content = (
    <>
      <StatusBadges status={item.status} closed={item.is_closed} isPublic={item.is_public} hidden={item.is_hidden} />
      <h3 className="mt-2 line-clamp-2 break-keep font-semibold leading-[1.35] [overflow-wrap:anywhere]">{item.title}</h3>
      {item.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{excerpt(item.description, 200)}</p>}
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{tt(authorLabel(item.author))}{item.author.is_mine && tt([' (you)', '（我）'])}</span>
        <span>{tt(problemTypeLabel(item.problem_type))}</span>
        <span className="inline-flex items-center gap-1"><MessageSquare aria-hidden="true" className="h-3.5 w-3.5" />{item.reply_count}</span>
        {item.image_paths.length > 0 && <span className="inline-flex items-center gap-1"><ImageIcon aria-hidden="true" className="h-3.5 w-3.5" />{item.image_paths.length}</span>}
        {!!item.open_reports && <span className="inline-flex items-center gap-1 text-destructive"><Flag aria-hidden="true" className="h-3.5 w-3.5" />{item.open_reports}</span>}
        <span>{showWaiting ? waited : when(item.last_activity_at)}</span>
      </p>
    </>
  );
  const box = `relative block w-full rounded-2xl p-4 text-left transition-colors hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? 'bg-muted' : ''}`;
  return to ? <Link to={to} className={box}>{content}</Link> : <button type="button" onClick={onOpen} className={box} aria-current={selected || undefined}>{content}</button>;
}
