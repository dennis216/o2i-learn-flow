import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Maximize2, FlaskConical, ExternalLink } from 'lucide-react';

interface PlaygroundEntry {
  id: string;
  title: string;
  playground_url: string;
  course_title: string;
  course_subject: string;
}

/**
 * Convert a raw GeoGebra URL to its iframe embed format.
 */
function toGeoGebraEmbed(url: string): string {
  const match = url.match(/geogebra\.org\/m\/([A-Za-z0-9]+)/);
  if (match) {
    return `https://www.geogebra.org/material/iframe/id/${match[1]}`;
  }
  return url;
}

export default function Playground() {
  const [entries, setEntries] = useState<PlaygroundEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState<PlaygroundEntry | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string>('all');

  useEffect(() => {
    fetchEntries();
  }, []);

  const fetchEntries = async () => {
    try {
      // Fetch all course_videos that have a playground_url, joined with course info
      const { data, error } = await supabase
        .from('course_videos')
        .select('id, title, playground_url, courses(title, subject)')
        .not('playground_url', 'is', null)
        .order('order_index', { ascending: true });

      if (error) throw error;

      // Deduplicate by playground_url to avoid showing the same GeoGebra link multiple times
      const seen = new Set<string>();
      const deduplicated: PlaygroundEntry[] = [];

      (data || []).forEach((row: any) => {
        const url = row.playground_url as string;
        if (!url || seen.has(url)) return;
        seen.add(url);
        deduplicated.push({
          id: row.id,
          title: row.title,
          playground_url: url,
          course_title: row.courses?.title || 'Unknown Course',
          course_subject: row.courses?.subject || 'General',
        });
      });

      setEntries(deduplicated);
    } catch (error) {
      console.error('Error fetching playground entries:', error);
    } finally {
      setLoading(false);
    }
  };

  const subjects = [...new Set(entries.map(e => e.course_subject))];

  const filtered = activeFilter === 'all'
    ? entries
    : entries.filter(e => e.course_subject === activeFilter);

  // Group by course subject
  const grouped = filtered.reduce((acc, entry) => {
    if (!acc[entry.course_subject]) acc[entry.course_subject] = [];
    acc[entry.course_subject].push(entry);
    return acc;
  }, {} as Record<string, PlaygroundEntry[]>);

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
          Interactive math models from all courses — visualize and explore concepts
        </p>
      </div>

      {entries.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <FlaskConical className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">No Interactive Models Yet</h3>
            <p className="text-muted-foreground">
              Check back soon for interactive GeoGebra visualizations!
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Tabs value={activeFilter} onValueChange={setActiveFilter} className="mb-6">
            <TabsList className="flex flex-wrap h-auto gap-1 bg-transparent p-0">
              <TabsTrigger
                value="all"
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                All ({entries.length})
              </TabsTrigger>
              {subjects.map(subject => (
                <TabsTrigger
                  key={subject}
                  value={subject}
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  {subject} ({entries.filter(e => e.course_subject === subject).length})
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {activeFilter === 'all' ? (
            Object.entries(grouped).map(([subject, items]) => (
              <div key={subject} className="mb-8">
                <h2 className="text-2xl font-semibold mb-4 text-primary">{subject}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {items.map(entry => (
                    <PlaygroundCard key={entry.id} entry={entry} onOpen={() => { setSelectedEntry(entry); setModalOpen(true); }} />
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filtered.map(entry => (
                <PlaygroundCard key={entry.id} entry={entry} onOpen={() => { setSelectedEntry(entry); setModalOpen(true); }} />
              ))}
            </div>
          )}
        </>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-6xl w-[95vw] h-[90vh] flex flex-col p-0">
          <DialogHeader className="p-4 border-b flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-primary" />
              {selectedEntry?.title}
            </DialogTitle>
            <p className="text-sm text-muted-foreground pt-1">
              From: {selectedEntry?.course_title}
            </p>
          </DialogHeader>
          <div className="flex-1 p-4">
            {selectedEntry && (
              <iframe
                src={toGeoGebraEmbed(selectedEntry.playground_url)}
                className="w-full h-full border-0 rounded-lg"
                title={selectedEntry.title}
                allowFullScreen
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PlaygroundCard({
  entry,
  onOpen,
}: {
  entry: PlaygroundEntry;
  onOpen: () => void;
}) {
  return (
    <Card className="group hover:shadow-lg transition-all duration-200 hover:border-primary/50">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <CardTitle className="text-lg">{entry.title}</CardTitle>
          <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full whitespace-nowrap">
            {entry.course_subject}
          </span>
        </div>
        <CardDescription className="text-xs">
          {entry.course_title}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="aspect-video bg-muted rounded-lg mb-4 overflow-hidden">
          <iframe
            src={toGeoGebraEmbed(entry.playground_url)}
            className="w-full h-full border-0 pointer-events-none"
            title={entry.title}
          />
        </div>
        <div className="flex gap-2">
          <Button className="flex-1 gap-2" onClick={onOpen}>
            <Maximize2 className="h-4 w-4" />
            Launch Lab
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => window.open(toGeoGebraEmbed(entry.playground_url), '_blank')}
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
