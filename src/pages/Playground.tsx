import React, { useState, useEffect, Suspense } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Maximize2, FlaskConical, ExternalLink } from 'lucide-react';

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
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold flex items-center gap-3">
          <FlaskConical className="h-10 w-10 text-primary" />
          GeoGebra Playground
        </h1>
        <p className="text-muted-foreground mt-2 text-lg">
          Interactive math models — visualize and explore concepts
        </p>
      </div>

      {entries.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <FlaskConical className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">No Interactive Models Yet</h3>
            <p className="text-muted-foreground">Check back soon!</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Tabs value={activeFilter} onValueChange={setActiveFilter} className="mb-6">
            <TabsList className="flex flex-wrap h-auto gap-1 bg-transparent p-0">
              <TabsTrigger value="all" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                All ({entries.length})
              </TabsTrigger>
              {groups.map(g => (
                <TabsTrigger key={g} value={g} className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  {g} ({entries.filter(e => e.group_label === g).length})
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {Object.entries(grouped).map(([group, subTopics]) => (
            <div key={group} className="mb-10">
              <h2 className="text-2xl font-bold mb-6 px-4 py-2 rounded-lg bg-[hsl(217,50%,45%)] text-white inline-block">
                {group}
              </h2>
              {Object.entries(subTopics).map(([subTopic, items]) => (
                <div key={subTopic} className="mb-6">
                  {subTopic !== 'Other' && (
                    <h3 className="text-lg font-semibold text-muted-foreground mb-3 ml-1">{subTopic}</h3>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {items.map(entry => (
                      <PlaygroundCard key={entry.id} entry={entry} onOpen={() => { setSelectedEntry(entry); setModalOpen(true); }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-6xl w-[95vw] h-[90vh] flex flex-col p-0">
          <DialogHeader className="p-4 border-b flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-primary" />
              {selectedEntry?.title}
            </DialogTitle>
            <p className="text-sm text-muted-foreground pt-1">{selectedEntry?.sub_topic}</p>
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

function PlaygroundCard({ entry, onOpen }: { entry: PlaygroundEntry; onOpen: () => void }) {
  return (
    <Card className="group hover:shadow-lg transition-all duration-200 hover:border-primary/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">{entry.title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="aspect-video bg-muted rounded-lg mb-4 overflow-hidden">
          {/* Lightweight preview: GeoGebraViewer is dynamically imported with ssr:false and will only
              load the heavy GeoGebra script when the preview actually enters the viewport.
              We keep pointer events none here to avoid accidental interactions in the card preview. */}
          <Suspense fallback={<div className="w-full h-full aspect-video bg-muted rounded-lg animate-pulse" />}>
            <GeoGebraViewer
              embedUrl={toGeoGebraEmbed(entry.playground_url)}
              title={entry.title}
              className="w-full h-full pointer-events-none"
            />
          </Suspense>
        </div>
        <div className="flex gap-2">
          <Button className="flex-1 gap-2" onClick={onOpen}>
            <Maximize2 className="h-4 w-4" />
            Launch Lab
          </Button>
          <Button variant="outline" size="icon" onClick={() => window.open(toGeoGebraEmbed(entry.playground_url), '_blank')}>
            <ExternalLink className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
