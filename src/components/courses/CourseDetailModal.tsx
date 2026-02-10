import { useState, useEffect } from 'react';
import { DollarSign, User, PlayCircle, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { VideoPlayerWithTutor } from './VideoPlayerWithTutor';
import type { Course, CourseVideo } from './types';

interface CourseDetailModalProps {
  course: Course;
  onClose: () => void;
  supabaseUrl: string;
  autoSelectVideoId?: string | null;
  resumeTime?: number | null;
}

const getLevelColor = (level: string) => {
  switch (level) {
    case 'beginner':
      return 'bg-green-100 text-green-800';
    case 'intermediate':
      return 'bg-yellow-100 text-yellow-800';
    case 'advanced':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

export function CourseDetailModal({ course, onClose, supabaseUrl, autoSelectVideoId, resumeTime }: CourseDetailModalProps) {
  const [selectedVideo, setSelectedVideo] = useState<CourseVideo | null>(null);

  // Auto-select video if provided
  useEffect(() => {
    if (autoSelectVideoId && course.course_videos) {
      const videoToSelect = course.course_videos.find(v => v.id === autoSelectVideoId);
      if (videoToSelect) {
        setSelectedVideo(videoToSelect);
      }
    }
  }, [autoSelectVideoId, course.course_videos]);

  // Group videos by unit, then by subtitle (part)
  const groupedVideos = (() => {
    if (!course.course_videos?.length) return {};
    const sorted = [...course.course_videos].sort((a, b) => a.order_index - b.order_index);
    
    // Group by unit first, then by part (subtitle)
    const unitGroups: Record<string, Record<string, CourseVideo[]>> = {};
    
    sorted.forEach(video => {
      const unit = video.unit || video.subtitle || 'Other Videos';
      const part = video.unit ? (video.subtitle || 'Lessons') : null;
      
      if (!unitGroups[unit]) unitGroups[unit] = {};
      
      if (part) {
        if (!unitGroups[unit][part]) unitGroups[unit][part] = [];
        unitGroups[unit][part].push(video);
      } else {
        // No parts, just add to a default group
        if (!unitGroups[unit]['_default']) unitGroups[unit]['_default'] = [];
        unitGroups[unit]['_default'].push(video);
      }
    });
    
    return unitGroups;
  })();

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Card className="max-w-6xl w-full max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-3xl mb-2">{course.title}</CardTitle>
              <CardDescription>{course.description}</CardDescription>
            </div>
            <Button variant="ghost" onClick={onClose}>
              ✕
            </Button>
          </div>
          <div className="flex gap-2 mt-4">
            <Badge className={getLevelColor(course.level)} variant="secondary">
              {course.level}
            </Badge>
            <Badge variant="outline">{course.subject}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="videos" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="videos">Videos</TabsTrigger>
              <TabsTrigger value="details">Details</TabsTrigger>
            </TabsList>
            
            <TabsContent value="videos" className="space-y-4 mt-4">
              {selectedVideo ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-lg">{selectedVideo.title}</h3>
                      {selectedVideo.description && (
                        <p className="text-muted-foreground text-sm">{selectedVideo.description}</p>
                      )}
                    </div>
                    <Button variant="outline" onClick={() => setSelectedVideo(null)}>
                      Back to List
                    </Button>
                  </div>
                  <VideoPlayerWithTutor video={selectedVideo} supabaseUrl={supabaseUrl} courseSubject={course.subject} initialTime={resumeTime || undefined} />
                </div>
              ) : course.course_videos && course.course_videos.length > 0 ? (
                Object.entries(groupedVideos).map(([unit, parts]) => {
                  const totalVideos = Object.values(parts).flat().length;
                  const hasParts = !('_default' in parts && Object.keys(parts).length === 1);
                  
                  return (
                    <Collapsible key={unit} defaultOpen className="border rounded-lg overflow-hidden">
                      <CollapsibleTrigger className="flex items-center justify-between w-full p-4 hover:bg-muted/50 transition-colors bg-[hsl(174,82%,29%)]/10">
                        <div className="flex items-center gap-3">
                          <Badge variant="secondary" className="font-semibold">
                            {totalVideos} lesson{totalVideos > 1 ? 's' : ''}
                          </Badge>
                          <h3 className="font-semibold text-lg text-[hsl(174,82%,29%)]">{unit}</h3>
                        </div>
                        <ChevronDown className="h-5 w-5 transition-transform duration-200 [&[data-state=open]>svg]:rotate-180" />
                      </CollapsibleTrigger>
                      <CollapsibleContent className="px-4 pb-4 space-y-3">
                        {hasParts ? (
                          // Render nested parts
                          Object.entries(parts).map(([partName, videos]) => (
                            <Collapsible key={partName} defaultOpen className="border rounded-md bg-muted/30">
                              <CollapsibleTrigger className="flex items-center justify-between w-full p-3 hover:bg-muted/50 transition-colors">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-xs">
                                    {videos.length} lesson{videos.length > 1 ? 's' : ''}
                                  </Badge>
                                  <h4 className="font-medium text-sm">{partName}</h4>
                                </div>
                                <ChevronDown className="h-4 w-4 transition-transform duration-200 [&[data-state=open]>svg]:rotate-180" />
                              </CollapsibleTrigger>
                              <CollapsibleContent className="px-3 pb-3 space-y-2">
                                {videos.map((video) => (
                    <Card
                                    key={video.id}
                                    className={`cursor-pointer transition-all duration-200 ${
                                      selectedVideo?.id === video.id
                                        ? 'border-l-4 border-l-accent border-accent/50 bg-accent/5 shadow-[0_0_12px_hsl(43,96%,56%,0.15)]'
                                        : 'border-muted hover:border-primary/50'
                                    }`}
                                    onClick={() => setSelectedVideo(video)}
                                  >
                                    <CardHeader className="py-3">
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                          <PlayCircle className="h-5 w-5 text-primary" />
                                          <div>
                                            <CardTitle className="text-base">{video.title}</CardTitle>
                                            {video.description && (
                                              <CardDescription className="text-sm mt-1">
                                                {video.description}
                                              </CardDescription>
                                            )}
                                          </div>
                                        </div>
                                        {video.duration && (
                                          <Badge variant="outline">
                                            {Math.floor(video.duration / 60)}:{(video.duration % 60).toString().padStart(2, '0')}
                                          </Badge>
                                        )}
                                      </div>
                                    </CardHeader>
                                  </Card>
                                ))}
                              </CollapsibleContent>
                            </Collapsible>
                          ))
                        ) : (
                          // Render flat list (no parts)
                          parts['_default']?.map((video) => (
                            <Card
                              key={video.id}
                              className="border-muted cursor-pointer hover:border-primary/50 transition-colors"
                              onClick={() => setSelectedVideo(video)}
                            >
                              <CardHeader className="py-3">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <PlayCircle className="h-5 w-5 text-primary" />
                                    <div>
                                      <CardTitle className="text-base">{video.title}</CardTitle>
                                      {video.description && (
                                        <CardDescription className="text-sm mt-1">
                                          {video.description}
                                        </CardDescription>
                                      )}
                                    </div>
                                  </div>
                                  {video.duration && (
                                    <Badge variant="outline">
                                      {Math.floor(video.duration / 60)}:{(video.duration % 60).toString().padStart(2, '0')}
                                    </Badge>
                                  )}
                                </div>
                              </CardHeader>
                            </Card>
                          ))
                        )}
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })
              ) : (
                <div className="text-center py-12">
                  <PlayCircle className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No videos available for this course yet.</p>
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="details" className="space-y-4 mt-4">
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold mb-2">Instructor</h3>
                  <div className="flex items-center">
                    <User className="h-4 w-4 mr-2" />
                    {course.public_profiles?.full_name || 'Unknown Instructor'}
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Price</h3>
                  <div className="flex items-center">
                    <DollarSign className="h-4 w-4 mr-2" />
                    {course.price === 0 ? 'Free' : `$${course.price}`}
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
