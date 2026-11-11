import { Link } from 'react-router-dom';
import { Flag, ImageIcon, MessageSquare } from 'lucide-react';
import { authorLabel, mathSafeExcerpt, problemTypeLabel, type SrSummary } from '@/lib/solutionRequests';
import { PostBody, StatusBadges, StatusTile } from './shared';
import { useBilingual } from './hooks';

/** A question in a list: the whole card is the link (or button, in the admin inbox). */
export default function RequestCard({ item, to, onOpen, selected, showWaiting }: {
  item: SrSummary; to?: string; onOpen?: () => void; selected?: boolean; showWaiting?: boolean;
}) {
  const { tt, when } = useBilingual();
  const hours = Math.floor((Date.now() - new Date(item.created_at).getTime()) / 3_600_000);
  const waited = hours < 24 ? tt([`waiting ${hours} h`, `已等 ${hours} 小时`]) : tt([`waiting ${Math.floor(hours / 24)} d`, `已等 ${Math.floor(hours / 24)} 天`]);
  const title = <span className="line-clamp-2 break-keep text-base font-semibold leading-[1.35] text-foreground [overflow-wrap:anywhere] sm:text-lg">{item.title}</span>;
  const target = 'after:absolute after:inset-0 after:rounded-2xl focus:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring';

  return (
    <article className={`group relative flex gap-4 rounded-2xl p-4 transition-colors hover:bg-muted/60 ${selected ? 'bg-muted' : ''}`}>
      <StatusTile status={item.status} className="mt-0.5 h-10 w-10 sm:h-11 sm:w-11" />
      <div className="min-w-0 flex-1">
        <StatusBadges status={item.status} closed={item.is_closed} isPublic={item.is_public} hidden={item.is_hidden} />
        <h3 className="mt-1.5">
          {to ? <Link to={to} className={target}>{title}</Link>
            : <button type="button" onClick={onOpen} aria-current={selected || undefined} className={`text-left ${target}`}>{title}</button>}
        </h3>
        {item.description && <PostBody text={mathSafeExcerpt(item.description)} className="mt-1 line-clamp-2 text-muted-foreground [&_p]:my-0" />}
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>{tt(authorLabel(item.author))}{item.author.is_mine && tt([' (you)', '（我）'])}</span>
          <span>{tt(problemTypeLabel(item.problem_type))}</span>
          <span className="inline-flex items-center gap-1"><MessageSquare aria-hidden="true" className="h-3.5 w-3.5" />{tt([`${item.reply_count} replies`, `${item.reply_count} 条回复`])}</span>
          {item.image_paths.length > 0 && <span className="inline-flex items-center gap-1"><ImageIcon aria-hidden="true" className="h-3.5 w-3.5" />{item.image_paths.length}</span>}
          {!!item.open_reports && <span className="inline-flex items-center gap-1 text-destructive"><Flag aria-hidden="true" className="h-3.5 w-3.5" />{item.open_reports}</span>}
          <span>{showWaiting ? waited : when(item.last_activity_at)}</span>
        </p>
      </div>
    </article>
  );
}
