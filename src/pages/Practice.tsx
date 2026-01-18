import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Target, BookOpen } from 'lucide-react';
import { TranscriptEntry } from '@/components/courses/types';
import { CourseFilters, Category, Subject } from '@/components/courses/CourseFilters';

interface PracticeLessonVideo {
  id: string;
  title: string;
  subtitle: string | null;
  video_url: string;
  transcript: TranscriptEntry[] | null;
  course_id: string;
  order_index: number;
  course: {
    id: string;
    title: string;
    subject: string;
    category: string;
  };
}

// Extract YouTube video ID from various YouTube URL formats
const extractYouTubeId = (url: string): string | null => {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/, // Direct ID
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
};

// Group videos by their subtitle (unit)
const groupVideosByUnit = (videos: PracticeLessonVideo[]) => {
  const groups: Record<string, PracticeLessonVideo[]> = {};
  
  videos.forEach(video => {
    const unit = video.subtitle || 'Other Lessons';
    if (!groups[unit]) {
      groups[unit] = [];
    }
    groups[unit].push(video);
  });
  
  // Sort videos within each group by order_index
  Object.keys(groups).forEach(unit => {
    groups[unit].sort((a, b) => a.order_index - b.order_index);
  });
  
  return groups;
};

export default function Practice() {
  const [videos, setVideos] = useState<PracticeLessonVideo[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filter state - mirrors Courses page
  const [category, setCategory] = useState<Category>('High School');
  const [subject, setSubject] = useState<Subject>('AP Calc');

  useEffect(() => {
    const fetchVideos = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('course_videos')
          .select(`
            id,
            title,
            subtitle,
            video_url,
            transcript,
            course_id,
            order_index,
            courses!course_id (id, title, subject, category)
          `)
          .order('order_index', { ascending: true });

        if (error) {
          console.error('Error fetching videos:', error);
          setVideos([]);
        } else {
          // Filter by category and subject
          const filteredData = (data || []).filter((video: any) => {
            const courseCategory = video.courses?.category || '';
            const courseSubject = video.courses?.subject || '';
            const videoTitle = video.title?.toLowerCase() || '';
            
            // Match category and subject
            const matchesCategory = courseCategory === category;
            const matchesSubject = !subject || courseSubject === subject;
            
            // Exclude Lecture or Introduction videos
            const isExcluded = videoTitle.includes('lecture') || 
                              videoTitle.includes('introduction') ||
                              videoTitle.startsWith('intro');
            
            return matchesCategory && matchesSubject && !isExcluded;
          });

          const transformedData = filteredData.map((video: any) => ({
            ...video,
            transcript: video.transcript as TranscriptEntry[] | null,
            course: video.courses,
          }));
          setVideos(transformedData);
        }
      } catch (error) {
        console.error('Error:', error);
        setVideos([]);
      } finally {
        setLoading(false);
      }
    };

    fetchVideos();
  }, [category, subject]);

  const groupedVideos = groupVideosByUnit(videos);
  const units = Object.keys(groupedVideos);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center mb-12">
            <Skeleton className="h-10 w-64 mx-auto mb-4" />
            <Skeleton className="h-6 w-96 mx-auto" />
          </div>
          <div className="mb-8">
            <Skeleton className="h-12 w-64 mx-auto mb-4" />
            <div className="flex justify-center gap-2 flex-wrap">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-8 w-24 rounded-full" />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <Card key={i} className="overflow-hidden">
                <Skeleton className="h-48 w-full" />
                <CardHeader>
                  <Skeleton className="h-6 w-3/4" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-4 flex items-center justify-center gap-3">
            <Target className="h-10 w-10 text-primary" />
            Practice Problems
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Click on a lesson to practice problems based on the video content
          </p>
        </div>

        {/* Dual-layer filters - mirrors Courses page */}
        <div className="mb-10">
          <CourseFilters
            category={category}
            subject={subject}
            onCategoryChange={setCategory}
            onSubjectChange={setSubject}
          />
        </div>

        {videos.length === 0 ? (
          <div className="text-center py-12">
            <BookOpen className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-foreground mb-2">
              No practice problems available for {subject || category}
            </h3>
            <p className="text-muted-foreground">
              {subject 
                ? `Try selecting a different subject or check back later for new ${subject} practice sets!`
                : `Check back soon for exciting new ${category.toLowerCase()} practice problems!`
              }
            </p>
          </div>
        ) : (
          <div className="space-y-10">
            {units.map((unit) => (
              <div key={unit}>
                {/* Unit header - matches Course structure */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-8 w-1 bg-primary rounded-full" />
                  <h2 className="text-xl font-semibold text-foreground">{unit}</h2>
                  <Badge variant="secondary" className="ml-2">
                    {groupedVideos[unit].length} {groupedVideos[unit].length === 1 ? 'lesson' : 'lessons'}
                  </Badge>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {groupedVideos[unit].map((video) => {
                    const youtubeId = extractYouTubeId(video.video_url);
                    const thumbnailUrl = youtubeId 
                      ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`
                      : '/placeholder.svg';

                    return (
                      <Link key={video.id} to={`/practice/${video.id}`}>
                        <Card className="overflow-hidden group cursor-pointer hover:shadow-lg transition-all duration-300 hover:-translate-y-1 h-full">
                          <div className="relative aspect-video overflow-hidden">
                            <img
                              src={thumbnailUrl}
                              alt={video.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = '/placeholder.svg';
                              }}
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                            <Badge className="absolute bottom-3 left-3 bg-primary">
                              {video.course?.title || 'Course'}
                            </Badge>
                          </div>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-lg line-clamp-2">{video.title}</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <p className="text-sm text-muted-foreground">
                              Click to practice problems from this lesson
                            </p>
                          </CardContent>
                        </Card>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
