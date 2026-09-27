import { useState, useEffect } from 'react';
import { DollarSign, User, PlayCircle, ChevronDown, BookOpen } from 'lucide-react';
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
  const isBCCourse = course.title === 'AP Calculus BC';

  // Auto-select video if provided
  useEffect(() => {
    if (autoSelectVideoId && course.course_videos) {
      const videoToSelect = course.course_videos.find(v => v.id === autoSelectVideoId);
      if (videoToSelect) {
        setSelectedVideo(videoToSelect);
      }
    }
  }, [autoSelectVideoId, course.course_videos]);

  // Group videos by unit (flat structure - no nested parts)
  const groupedVideos = (() => {
    if (!course.course_videos?.length) return {} as Record<string, CourseVideo[]>;
    const sorted = [...course.course_videos].sort((a, b) => a.order_index - b.order_index);
    
    const unitGroups: Record<string, CourseVideo[]> = {};
    
    sorted.forEach(video => {
      const unit = video.unit || 'Other Videos';
      if (!unitGroups[unit]) unitGroups[unit] = [];
      unitGroups[unit].push(video);
    });
    
    return unitGroups;
  })();

  const curriculumUnits = [...(course.course_curriculum_units || [])]
    .sort((a, b) => a.order_index - b.order_index)
    .map((mapping) => ({
      ...mapping.curriculum_units,
      curriculum_topics: mapping.curriculum_units.curriculum_topics
        .filter((topic) => isBCCourse || !topic.is_bc_only)
        .sort((a, b) => a.order_index - b.order_index),
    }));

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
          <Tabs defaultValue="framework" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="videos">Videos</TabsTrigger>
              <TabsTrigger value="framework">Course Framework</TabsTrigger>
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
              Object.entries(groupedVideos).map(([unit, videos]) => {
                  return (
                    <Collapsible key={unit} defaultOpen className="border rounded-lg overflow-hidden">
                      <CollapsibleTrigger className="flex items-center justify-between w-full p-4 hover:bg-[#4A90E2]/10 transition-colors">
                        <div className="flex items-center gap-3">
                          <Badge variant="secondary" className="font-semibold">
                            {videos.length} lesson{videos.length > 1 ? 's' : ''}
                          </Badge>
                          <h3 className="font-semibold text-lg text-[#4A90E2]">{unit}</h3>
                        </div>
                        <ChevronDown className="h-5 w-5 transition-transform duration-200 [&[data-state=open]>svg]:rotate-180" />
                      </CollapsibleTrigger>
                      <CollapsibleContent className="px-4 pb-4 space-y-2">
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
                  );
                })
              ) : (
                <div className="text-center py-12">
                  <PlayCircle className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No videos available for this course yet.</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="framework" className="space-y-4 mt-4">
              {curriculumUnits.length > 0 ? (
                curriculumUnits.map((unit) => {
                  const weightMin = isBCCourse ? unit.bc_exam_weight_min : unit.ab_exam_weight_min;
                  const weightMax = isBCCourse ? unit.bc_exam_weight_max : unit.ab_exam_weight_max;

                  return (
                    <Collapsible key={unit.id} defaultOpen={unit.unit_number === 1} className="border rounded-lg overflow-hidden">
                      <CollapsibleTrigger className="flex items-center justify-between w-full p-4 hover:bg-[#4A90E2]/10 transition-colors text-left">
                        <div className="flex items-start gap-3">
                          <Badge variant="secondary" className="mt-0.5 whitespace-nowrap">
                            Unit {unit.unit_number}
                          </Badge>
                          <div>
                            <h3 className="font-semibold text-lg text-[#4A90E2]">{unit.title}</h3>
                            <p className="text-sm text-muted-foreground mt-1">
                              {unit.curriculum_topics.length} topics
                              {weightMin !== null && weightMax !== null ? ` · ${weightMin}–${weightMax}% of the ${isBCCourse ? 'BC' : 'AB'} exam` : ''}
                            </p>
                          </div>
                        </div>
                        <ChevronDown className="h-5 w-5 shrink-0 ml-4" />
                      </CollapsibleTrigger>
                      <CollapsibleContent className="px-4 pb-4">
                        <div className="divide-y rounded-md border">
                          {unit.curriculum_topics.map((topic) => (
                            <div key={topic.id} className="flex items-start gap-3 px-4 py-3">
                              <span className="font-mono text-sm font-semibold text-primary min-w-12">{topic.topic_code}</span>
                              <div className="flex-1">
                                <p className="text-sm font-medium">{topic.title}</p>
                                <div className="flex gap-2 mt-1.5">
                                  <Badge variant="outline" className="text-xs">{topic.big_idea}</Badge>
                                  {topic.is_bc_only && <Badge variant="secondary" className="text-xs">BC only</Badge>}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })
              ) : (
                <div className="text-center py-12">
                  <BookOpen className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">Course framework is not available yet.</p>
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
