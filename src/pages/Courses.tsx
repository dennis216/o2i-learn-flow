import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BookOpen, Clock, DollarSign, User, PlayCircle, Maximize } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface CourseVideo {
  id: string;
  title: string;
  description: string;
  subtitle?: string;
  video_url: string;
  duration: number;
  order_index: number;
}

interface Course {
  id: string;
  title: string;
  description: string;
  level: string;
  subject: string;
  price: number;
  image_url: string;
  public_profiles: {
    full_name: string;
  };
  course_videos?: CourseVideo[];
}

export default function Courses() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const videoRefs = useRef<{ [key: string]: HTMLVideoElement | null }>({});

  const handleFullscreen = (videoId: string) => {
    const video = videoRefs.current[videoId];
    if (video) {
      if (video.requestFullscreen) {
        video.requestFullscreen();
      }
    }
  };

  useEffect(() => {
    const fetchCourses = async () => {
      try {
        const { data, error } = await supabase
          .from('courses')
          .select(`
            *,
            public_profiles!instructor_id (full_name),
            course_videos (*)
          `)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error fetching courses:', error);
        } else {
          setCourses(data || []);
        }
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCourses();
  }, []);

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

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center mb-12">
            <Skeleton className="h-10 w-64 mx-auto mb-4" />
            <Skeleton className="h-6 w-96 mx-auto" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <Card key={i} className="overflow-hidden">
                <Skeleton className="h-48 w-full" />
                <CardHeader>
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-full mb-2" />
                  <Skeleton className="h-4 w-2/3" />
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
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-foreground mb-4">Math Courses</h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Explore our comprehensive collection of mathematics courses designed to help you master every concept
          </p>
        </div>

        {courses.length === 0 ? (
          <div className="text-center py-12">
            <BookOpen className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-foreground mb-2">No courses available yet</h3>
            <p className="text-muted-foreground">
              Check back soon for exciting new math courses!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {courses.map((course) => (
              <Card key={course.id} className="overflow-hidden hover:shadow-lg transition-shadow duration-300">
                {course.image_url && (
                  <div className="h-48 bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center">
                    <BookOpen className="h-16 w-16 text-primary" />
                  </div>
                )}
                <CardHeader>
                  <div className="flex justify-between items-start mb-2">
                    <Badge className={getLevelColor(course.level)} variant="secondary">
                      {course.level}
                    </Badge>
                    <Badge variant="outline">{course.subject}</Badge>
                  </div>
                  <CardTitle className="line-clamp-2">{course.title}</CardTitle>
                  <CardDescription className="line-clamp-2">
                    {course.description}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between text-sm text-muted-foreground mb-4">
                    <div className="flex items-center">
                      <User className="h-4 w-4 mr-1" />
                      {course.public_profiles?.full_name || 'Unknown Instructor'}
                    </div>
                    <div className="flex items-center">
                      <DollarSign className="h-4 w-4 mr-1" />
                      {course.price === 0 ? 'Free' : `$${course.price}`}
                    </div>
                  </div>
                  <Button className="w-full" onClick={() => setSelectedCourse(course)}>
                    <BookOpen className="h-4 w-4 mr-2" />
                    View Course
                  </Button>
                  {course.course_videos && course.course_videos.length > 0 && (
                    <div className="mt-2 text-sm text-muted-foreground flex items-center">
                      <PlayCircle className="h-4 w-4 mr-1" />
                      {course.course_videos.length} video{course.course_videos.length > 1 ? 's' : ''}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Course Detail Modal */}
        {selectedCourse && (
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <Card className="max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-3xl mb-2">{selectedCourse.title}</CardTitle>
                    <CardDescription>{selectedCourse.description}</CardDescription>
                  </div>
                  <Button variant="ghost" onClick={() => setSelectedCourse(null)}>✕</Button>
                </div>
                <div className="flex gap-2 mt-4">
                  <Badge className={getLevelColor(selectedCourse.level)} variant="secondary">
                    {selectedCourse.level}
                  </Badge>
                  <Badge variant="outline">{selectedCourse.subject}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="videos" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="videos">Videos</TabsTrigger>
                    <TabsTrigger value="details">Details</TabsTrigger>
                  </TabsList>
                  <TabsContent value="videos" className="space-y-4 mt-4">
                    {selectedCourse.course_videos && selectedCourse.course_videos.length > 0 ? (
                      selectedCourse.course_videos
                        .sort((a, b) => a.order_index - b.order_index)
                        .map((video) => (
                          <Card key={video.id}>
                            <CardHeader>
                              <CardTitle className="text-lg">{video.title}</CardTitle>
                              {video.subtitle && (
                                <p className="text-sm font-medium text-muted-foreground mt-1">{video.subtitle}</p>
                              )}
                              {video.description && (
                                <CardDescription className="mt-2">{video.description}</CardDescription>
                              )}
                            </CardHeader>
                            <CardContent>
                              <div className="relative group">
                                <video 
                                  ref={(el) => videoRefs.current[video.id] = el}
                                  controls 
                                  className="w-full rounded-lg"
                                  src={`https://lxoaeaewcrshjkigzyqe.supabase.co/storage/v1/object/public/${video.video_url}`}
                                >
                                  Your browser does not support the video tag.
                                </video>
                                <Button
                                  variant="secondary"
                                  size="icon"
                                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={() => handleFullscreen(video.id)}
                                >
                                  <Maximize className="h-4 w-4" />
                                </Button>
                              </div>
                              {video.duration && (
                                <div className="flex items-center mt-2 text-sm text-muted-foreground">
                                  <Clock className="h-4 w-4 mr-1" />
                                  {Math.floor(video.duration / 60)}:{(video.duration % 60).toString().padStart(2, '0')}
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        ))
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
                          {selectedCourse.public_profiles?.full_name || 'Unknown Instructor'}
                        </div>
                      </div>
                      <div>
                        <h3 className="font-semibold mb-2">Price</h3>
                        <div className="flex items-center">
                          <DollarSign className="h-4 w-4 mr-2" />
                          {selectedCourse.price === 0 ? 'Free' : `$${selectedCourse.price}`}
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}