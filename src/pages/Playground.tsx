import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Maximize2, FlaskConical, ExternalLink } from 'lucide-react';
import MarkdownWithMath from '@/components/MarkdownWithMath';

interface PlaygroundLink {
  id: string;
  title: string;
  geogebra_url: string;
  description: string | null;
  target_subject: string;
  order_index: number;
}

// Subject categories matching the course system
const SUBJECT_CATEGORIES = {
  'High School': [
    'AP Calc', 'AP Stats', 'AP Precalc', 'SAT',
    'M1', 'M2', 'Geo 1 (Intro)', 'Geo 2 (Int)',
    'Alg 1 (Intro)', 'Alg 2 (Int)',
    'Counting & Prob 1', 'Counting & Prob 2'
  ],
  'Contest': [
    'AMC 10', 'AMC 12', 'Euclid', 'Fermat', 'Cayley', 'Pascal', 'Gauss'
  ]
};

export default function Playground() {
  const [links, setLinks] = useState<PlaygroundLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLink, setSelectedLink] = useState<PlaygroundLink | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('all');

  useEffect(() => {
    fetchLinks();
  }, []);

  const fetchLinks = async () => {
    try {
      const { data, error } = await supabase
        .from('playground_links')
        .select('*')
        .order('order_index', { ascending: true });

      if (error) throw error;
      setLinks(data || []);
    } catch (error) {
      console.error('Error fetching playground links:', error);
    } finally {
      setLoading(false);
    }
  };

  const openModal = (link: PlaygroundLink) => {
    setSelectedLink(link);
    setModalOpen(true);
  };

  // Get unique subjects from links
  const availableSubjects = [...new Set(links.map(l => l.target_subject))];

  // Filter links by category
  const filteredLinks = activeCategory === 'all' 
    ? links 
    : links.filter(l => l.target_subject === activeCategory);

  // Group links by subject for organized display
  const groupedLinks = filteredLinks.reduce((acc, link) => {
    if (!acc[link.target_subject]) {
      acc[link.target_subject] = [];
    }
    acc[link.target_subject].push(link);
    return acc;
  }, {} as Record<string, PlaygroundLink[]>);

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
          Interactive math models to visualize and explore mathematical concepts
        </p>
      </div>

      {links.length === 0 ? (
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
          {/* Filter Tabs */}
          <Tabs value={activeCategory} onValueChange={setActiveCategory} className="mb-6">
            <TabsList className="flex flex-wrap h-auto gap-1 bg-transparent p-0">
              <TabsTrigger 
                value="all"
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                All ({links.length})
              </TabsTrigger>
              {availableSubjects.map(subject => (
                <TabsTrigger 
                  key={subject} 
                  value={subject}
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  {subject} ({links.filter(l => l.target_subject === subject).length})
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {/* Links Grid */}
          {activeCategory === 'all' ? (
            // Show grouped by subject
            Object.entries(groupedLinks).map(([subject, subjectLinks]) => (
              <div key={subject} className="mb-8">
                <h2 className="text-2xl font-semibold mb-4 text-primary">{subject}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {subjectLinks.map(link => (
                    <PlaygroundCard key={link.id} link={link} onOpen={openModal} />
                  ))}
                </div>
              </div>
            ))
          ) : (
            // Show flat grid for single subject
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredLinks.map(link => (
                <PlaygroundCard key={link.id} link={link} onOpen={openModal} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Fullscreen Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-6xl w-[95vw] h-[90vh] flex flex-col p-0">
          <DialogHeader className="p-4 border-b flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-primary" />
              {selectedLink?.title}
            </DialogTitle>
            {selectedLink?.description && (
              <div className="text-sm text-muted-foreground pt-2">
                <MarkdownWithMath content={selectedLink.description} />
              </div>
            )}
          </DialogHeader>
          <div className="flex-1 p-4">
            {selectedLink && (
              <iframe
                src={selectedLink.geogebra_url}
                className="w-full h-full border-0 rounded-lg"
                title={selectedLink.title}
                allowFullScreen
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Card component for individual playground links
function PlaygroundCard({ 
  link, 
  onOpen 
}: { 
  link: PlaygroundLink; 
  onOpen: (link: PlaygroundLink) => void;
}) {
  return (
    <Card className="group hover:shadow-lg transition-all duration-200 hover:border-primary/50">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <CardTitle className="text-lg">{link.title}</CardTitle>
          <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">
            {link.target_subject}
          </span>
        </div>
        {link.description && (
          <CardDescription className="line-clamp-2">
            <MarkdownWithMath content={link.description} />
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        <div className="aspect-video bg-muted rounded-lg mb-4 overflow-hidden">
          <iframe
            src={link.geogebra_url}
            className="w-full h-full border-0 pointer-events-none"
            title={link.title}
          />
        </div>
        <div className="flex gap-2">
          <Button 
            className="flex-1 gap-2" 
            onClick={() => onOpen(link)}
          >
            <Maximize2 className="h-4 w-4" />
            Open Fullscreen
          </Button>
          <Button 
            variant="outline" 
            size="icon"
            onClick={() => window.open(link.geogebra_url, '_blank')}
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
