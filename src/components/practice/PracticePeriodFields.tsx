import { Input } from '@/components/ui/input';
import type { PracticePeriod } from '@/lib/practiceAnalysis';
export function PracticePeriodFields({ period, from, to, onChange }: { period: PracticePeriod; from: string; to: string; onChange: (value: { period: PracticePeriod; from: string; to: string }) => void }) {
  return <div className="flex flex-wrap items-end gap-3">
    <label className="space-y-1 text-sm"><span className="block">Time period</span><select aria-label="Time period" className="h-10 rounded border bg-background px-3" value={period} onChange={e => onChange({ period: e.target.value as PracticePeriod, from, to })}>
      <option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="all">All time</option><option value="custom">Custom dates</option>
    </select></label>
    {period === 'custom' && <><label className="space-y-1 text-sm"><span>From (local date)</span><Input type="date" aria-label="From date" value={from} onChange={e => onChange({ period, from: e.target.value, to })} /></label><label className="space-y-1 text-sm"><span>Through (local date)</span><Input type="date" aria-label="Through date" value={to} onChange={e => onChange({ period, from, to: e.target.value })} /></label></>}
  </div>;
}
