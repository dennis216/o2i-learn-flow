import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, FlaskConical, Maximize2, ExternalLink } from 'lucide-react';
import MarkdownWithMath from '@/components/MarkdownWithMath';
import { CourseVideo } from '../types';

/**
 * Convert a raw GeoGebra URL to its iframe embed format.
 * e.g. https://www.geogebra.org/m/vtrufde8 → https://www.geogebra.org/material/iframe/id/vtrufde8
 */
function toGeoGebraEmbed(url: string): string {
  const match = url.match(/geogebra\.org\/m\/([A-Za-z0-9]+)/);
  if (match) {
    return `https://www.geogebra.org/material/iframe/id/${match[1]}`;
  }
  // Already in embed format or unknown format – return as-is
  return url;
}

interface PlaygroundLink {
  id: string;
  title: string;
  geogebra_url: string;
  description: string | null;
  target_subject: string;
  order_index: number;
}

interface InteractiveLabProps {
  video: CourseVideo;
  courseSubject?: string;
}

export function InteractiveLab({ video, courseSubject }: InteractiveLabProps) {
  const [links, setLinks] = useState<PlaygroundLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  // Check if video has a direct playground URL
  const videoPlaygroundUrl = video.playground_url;

  useEffect(() => {
    // If video has its own playground URL, no need to fetch from playground_links
    if (videoPlaygroundUrl) {
      setLoading(false);
      return;
    }
    
    if (courseSubject) {
      fetchLinks(courseSubject);
    } else {
      setLoading(false);
    }
  }, [courseSubject, videoPlaygroundUrl]);

  const fetchLinks = async (subject: string) => {
    try {
      const { data, error } = await supabase
        .from('playground_links')
        .select('*')
        .eq('target_subject', subject)
        .order('order_index', { ascending: true });

      if (error) throw error;
      setLinks(data || []);
    } catch (error) {
      console.error('Error fetching playground links:', error);
    } finally {
      setLoading(false);
    }
  };

  const openModal = (link?: PlaygroundLink) => {
    setModalOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  // Priority: Video-specific playground URL
  if (videoPlaygroundUrl) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FlaskConical className="h-4 w-4" />
          <span>Interactive model for this lesson</span>
        </div>

        <Card className="group hover:border-primary/50 transition-colors">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-primary flex-shrink-0" />
              GeoGebra Interactive
            </CardTitle>
            <CardDescription className="text-xs">
              Explore the concepts from this lesson visually
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="aspect-video bg-muted rounded-md overflow-hidden mb-3">
              <iframe
                src={toGeoGebraEmbed(videoPlaygroundUrl)}
                className="w-full h-[600px] border-0 pointer-events-none"
                title="GeoGebra Interactive"
              />
            </div>
            <div className="flex gap-2">
              <Button 
                size="sm" 
                className="flex-1 gap-1"
                onClick={() => setModalOpen(true)}
              >
                <Maximize2 className="h-3 w-3" />
                Interact
              </Button>
              <Button 
                size="sm"
                variant="outline"
                onClick={() => window.open(toGeoGebraEmbed(videoPlaygroundUrl), '_blank')}
              >
                <ExternalLink className="h-3 w-3" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Fullscreen Modal for video-specific playground */}
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogContent className="max-w-5xl w-[95vw] h-[85vh] flex flex-col p-0">
            <DialogHeader className="p-4 border-b flex-shrink-0">
              <DialogTitle className="flex items-center gap-2">
                <FlaskConical className="h-5 w-5 text-primary" />
                GeoGebra Interactive
              </DialogTitle>
              <div className="text-sm text-muted-foreground pt-1">
                Interactive visualization for: {video.title}
              </div>
            </DialogHeader>
            <div className="flex-1 p-4">
              <iframe
                src={toGeoGebraEmbed(videoPlaygroundUrl)}
                className="w-full h-full border-0 rounded-lg"
                title="GeoGebra Interactive"
                allowFullScreen
              />
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Fallback: Subject-level playground links
  if (links.length === 0) {
    return (
      <div className="text-center py-8">
        <FlaskConical className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
        <h4 className="font-medium text-muted-foreground mb-1">No Interactive Models</h4>
        <p className="text-sm text-muted-foreground">
          {courseSubject 
            ? `No GeoGebra models available for ${courseSubject} yet.`
            : 'Course subject not available.'
          }
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <FlaskConical className="h-4 w-4" />
        <span>{links.length} interactive model{links.length !== 1 ? 's' : ''} for {courseSubject}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {links.map(link => (
          <Card 
            key={link.id} 
            className="group hover:border-primary/50 transition-colors cursor-pointer"
            onClick={() => openModal(link)}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-primary flex-shrink-0" />
                {link.title}
              </CardTitle>
              {link.description && (
                <CardDescription className="text-xs line-clamp-2">
                  <MarkdownWithMath content={link.description} />
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="pt-0">
              <div className="aspect-video bg-muted rounded-md overflow-hidden mb-3">
                <iframe
                  src={toGeoGebraEmbed(link.geogebra_url)}
                  className="w-full h-full border-0 pointer-events-none"
                  title={link.title}
                />
              </div>
              <div className="flex gap-2">
                <Button 
                  size="sm" 
                  className="flex-1 gap-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    openModal(link);
                  }}
                >
                  <Maximize2 className="h-3 w-3" />
                  Interact
                </Button>
                <Button 
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(link.geogebra_url, '_blank');
                  }}
                >
                  <ExternalLink className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
