import { Input } from '@/components/ui/input';
import type { PracticePeriod } from '@/lib/practiceAnalysis';
import { useLanguage } from '@/contexts/LanguageContext';
export function PracticePeriodFields({ period, from, to, onChange }: { period: PracticePeriod; from: string; to: string; onChange: (value: { period: PracticePeriod; from: string; to: string }) => void }) {
  const { t } = useLanguage();
  return <div className="flex flex-wrap items-end gap-3">
    <label className="space-y-1 text-sm"><span className="block">{t('Time period', '时间范围')}</span><select aria-label={t('Time period', '时间范围')} className="h-10 rounded border bg-background px-3" value={period} onChange={e => onChange({ period: e.target.value as PracticePeriod, from, to })}>
      <option value="7">{t('Last 7 days', '最近 7 天')}</option><option value="30">{t('Last 30 days', '最近 30 天')}</option><option value="all">{t('All time', '全部时间')}</option><option value="custom">{t('Custom dates', '自定义日期')}</option>
    </select></label>
    {period === 'custom' && <><label className="space-y-1 text-sm"><span>{t('From (local date)', '开始日期（本地）')}</span><Input type="date" aria-label={t('From date', '开始日期')} value={from} onChange={e => onChange({ period, from: e.target.value, to })} /></label><label className="space-y-1 text-sm"><span>{t('Through (local date)', '结束日期（本地）')}</span><Input type="date" aria-label={t('Through date', '结束日期')} value={to} onChange={e => onChange({ period, from, to: e.target.value })} /></label></>}
  </div>;
}
