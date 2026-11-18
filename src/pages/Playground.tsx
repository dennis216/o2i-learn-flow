import React, { useState, useEffect, Suspense } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, FlaskConical, ExternalLink } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import FilterChips from '@/components/FilterChips';
import { useLanguage } from '@/contexts/LanguageContext';

// Lazily load the GeoGebra viewer component using React.lazy.
const GeoGebraViewer = React.lazy(() => import('@/components/GeoGebraViewer'));

interface PlaygroundEntry {
  id: string;
  title: string;
  playground_url: string;
  group_label: string;   // e.g. "AP Calculus BC - Unit 9"
  sub_topic: string;     // e.g. "9.1-9.3: Parametric Equations & Motion"
}

function toGeoGebraEmbed(url: string): string {
  const match = url.match(/geogebra\.org\/m\/([A-Za-z0-9]+)/);
  if (match) return `https://www.geogebra.org/material/iframe/id/${match[1]}`;
  return url;
}

export default function Playground() {
  const [entries, setEntries] = useState<PlaygroundEntry[]>([]);
  const { language, t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState<PlaygroundEntry | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string>('all');

  useEffect(() => { fetchEntries(); }, []);

  const fetchEntries = async () => {
    try {
      // Fetch from playground_links table
      const { data: links, error: linksErr } = await supabase
        .from('playground_links')
        .select('*')
        .order('order_index', { ascending: true });

      if (linksErr) throw linksErr;

      // Fetch from course_videos that have playground_url
      const { data: videos, error: videosErr } = await supabase
        .from('course_videos')
        .select('id, title, playground_url, courses(title, subject)')
        .not('playground_url', 'is', null)
        .order('order_index', { ascending: true });

      if (videosErr) throw videosErr;

      const allEntries: PlaygroundEntry[] = [];
      const seenUrls = new Set<string>();

      // Add playground_links first
      (links || []).forEach((row: any) => {
        if (seenUrls.has(row.geogebra_url)) return;
        seenUrls.add(row.geogebra_url);
        allEntries.push({
          id: row.id,
          title: row.title,
          playground_url: row.geogebra_url,
          group_label: row.target_subject || 'General',
          sub_topic: row.description || '',
        });
      });

      // Add course_videos entries
      (videos || []).forEach((row: any) => {
        if (!row.playground_url || seenUrls.has(row.playground_url)) return;
        seenUrls.add(row.playground_url);
        allEntries.push({
          id: row.id,
          title: row.title,
          playground_url: row.playground_url,
          group_label: row.courses?.subject || 'General',
          sub_topic: row.courses?.title || '',
        });
      });

      setEntries(allEntries);
    } catch (error) {
      console.error('Error fetching playground entries:', error);
    } finally {
      setLoading(false);
    }
  };

  const groups = [...new Set(entries.map(e => e.group_label))];
  const filtered = activeFilter === 'all' ? entries : entries.filter(e => e.group_label === activeFilter);

  // Group by group_label, then by sub_topic
  const grouped: Record<string, Record<string, PlaygroundEntry[]>> = {};
  filtered.forEach(entry => {
    if (!grouped[entry.group_label]) grouped[entry.group_label] = {};
    const st = entry.sub_topic || 'Other';
    if (!grouped[entry.group_label][st]) grouped[entry.group_label][st] = [];
    grouped[entry.group_label][st].push(entry);
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className={`mx-auto min-h-[70vh] max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8 ${language === 'zh' ? 'break-keep [overflow-wrap:anywhere]' : ''}`}>
      <PageHeader icon={FlaskConical} tone="purple" title={t('Playground', '互动工具')} description={t('GeoGebra models you can drag and adjust.', '可以拖动、调整的 GeoGebra 数学模型。')} />

      {entries.length === 0 ? (
        <p className="py-10 text-lg text-muted-foreground">{t('No models yet. Check back soon.', '还没有互动模型，敬请期待。')}</p>
      ) : (
        <>
          {groups.length > 1 && <FilterChips className="mb-8" label={t('Filter by unit', '按单元筛选')} value={activeFilter} onChange={setActiveFilter}
            options={[{ value: 'all', label: t('All', '全部') }, ...groups.map(g => ({ value: g, label: g }))]} />}

          {Object.entries(grouped).map(([group, subTopics]) => (
            <section key={group} className="mb-12">
              <h2 className="mb-5 text-2xl font-bold tracking-tight text-foreground">{group}</h2>
              {Object.entries(subTopics).map(([subTopic, items]) => (
                <div key={subTopic} className="mb-8">
                  {subTopic !== 'Other' && <h3 className="mb-3 font-semibold text-muted-foreground">{subTopic}</h3>}
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {items.map(entry => (
                      <PlaygroundCard key={entry.id} entry={entry} onOpen={() => { setSelectedEntry(entry); setModalOpen(true); }} />
                    ))}
                  </div>
                </div>
              ))}
            </section>
          ))}
        </>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-6xl w-[95vw] h-[90vh] flex flex-col p-0">
          <DialogHeader className="p-4 border-b flex-shrink-0">
            <DialogTitle>{selectedEntry?.title}</DialogTitle>
            {selectedEntry && <a href={toGeoGebraEmbed(selectedEntry.playground_url)} target="_blank" rel="noopener noreferrer" className="inline-flex w-fit items-center gap-1 pt-1 text-sm font-medium text-primary underline decoration-primary/30 underline-offset-4 hover:decoration-primary">{t('Open in new tab', '在新标签页打开')}<ExternalLink aria-hidden="true" className="h-3.5 w-3.5" /></a>}
          </DialogHeader>
          <div className="flex-1 p-4">
            {selectedEntry && (
              <Suspense fallback={<div className="w-full h-full aspect-video bg-muted rounded-lg animate-pulse" />}>
                <GeoGebraViewer
                  embedUrl={toGeoGebraEmbed(selectedEntry.playground_url)}
                  title={selectedEntry.title}
                  className="w-full h-full"
                />
              </Suspense>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// The whole card opens the model; the preview underneath is not interactive.
function PlaygroundCard({ entry, onOpen }: { entry: PlaygroundEntry; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="group rounded-2xl p-2 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <div className="aspect-video overflow-hidden rounded-xl bg-muted ring-1 ring-border transition-shadow group-hover:ring-primary/50">
        {/* GeoGebraViewer only loads the heavy GeoGebra script once the preview scrolls into view. */}
        <Suspense fallback={<div className="aspect-video h-full w-full animate-pulse bg-muted" />}>
          <GeoGebraViewer embedUrl={toGeoGebraEmbed(entry.playground_url)} title={entry.title} className="pointer-events-none h-full w-full" />
        </Suspense>
      </div>
      <p className="px-1 pb-1 pt-3 font-semibold text-foreground group-hover:text-primary">{entry.title}</p>
    </button>
  );
}
