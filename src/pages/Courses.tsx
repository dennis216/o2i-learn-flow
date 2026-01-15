import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BookOpen } from 'lucide-react';
import { CourseCard } from '@/components/courses/CourseCard';
import { CourseDetailModal } from '@/components/courses/CourseDetailModal';
import { CourseFilters, Category, Subject } from '@/components/courses/CourseFilters';
import { Course, TranscriptEntry } from '@/components/courses/types';
import apCalculusThumbnail from '@/assets/ap-calculus-thumbnail.jpg';

// Map course IDs to their thumbnail images
const courseThumbnails: Record<string, string> = {
  'fccc7540-0c29-43be-8682-ae90ff2534cb': apCalculusThumbnail,
};

const SUPABASE_URL = 'https://lxoaeaewcrshjkigzyqe.supabase.co';

export default function Courses() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [autoSelectVideoId, setAutoSelectVideoId] = useState<string | null>(null);
  
  // Filter state
  const [category, setCategory] = useState<Category>('High School');
  const [subject, setSubject] = useState<Subject>(null);

  useEffect(() => {
    const fetchCourses = async () => {
      try {
        // Build query with category filter
        let query = supabase
          .from('courses')
          .select(`
            *,
            public_profiles!instructor_id (full_name),
            course_videos (*)
          `)
          .eq('category', category)
          .order('created_at', { ascending: false });

        // Add subject filter if selected
        if (subject) {
          query = query.eq('subject', subject);
        }

        const { data, error } = await query;

        if (error) {
          console.error('Error fetching courses:', error);
        } else {
          // Transform the data to properly type transcripts
          const transformedData = data?.map((course) => ({
            ...course,
            course_videos: course.course_videos?.map((video: any) => ({
              ...video,
              transcript: video.transcript as TranscriptEntry[] | null,
            })),
          })) as Course[];
          setCourses(transformedData || []);

          // Handle ?video=videoId parameter - auto-select the course containing this video
          const videoId = searchParams.get('video');
          if (videoId && transformedData) {
            const courseWithVideo = transformedData.find(course => 
              course.course_videos?.some(v => v.id === videoId)
            );
            if (courseWithVideo) {
              setSelectedCourse(courseWithVideo);
              setAutoSelectVideoId(videoId);
              // Clear the URL parameter
              setSearchParams({});
            }
          }
        }
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCourses();
  }, [category, subject, searchParams, setSearchParams]);

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
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-4">Math Courses</h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Explore our comprehensive collection of mathematics courses designed to help you master every concept
          </p>
        </div>

        {/* Dual-layer filters */}
        <div className="mb-10">
          <CourseFilters
            category={category}
            subject={subject}
            onCategoryChange={setCategory}
            onSubjectChange={setSubject}
          />
        </div>

        {courses.length === 0 ? (
          <div className="text-center py-12">
            <BookOpen className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-foreground mb-2">
              No courses available for {subject || category}
            </h3>
            <p className="text-muted-foreground">
              {subject 
                ? `Try selecting a different subject or check back later for new ${subject} courses!`
                : `Check back soon for exciting new ${category.toLowerCase()} math courses!`
              }
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {courses.map((course) => (
              <CourseCard
                key={course.id}
                course={course}
                thumbnail={courseThumbnails[course.id]}
                onSelect={setSelectedCourse}
              />
            ))}
          </div>
        )}

        {selectedCourse && (
          <CourseDetailModal
            course={selectedCourse}
            onClose={() => {
              setSelectedCourse(null);
              setAutoSelectVideoId(null);
            }}
            supabaseUrl={SUPABASE_URL}
            autoSelectVideoId={autoSelectVideoId}
          />
        )}
      </div>
    </div>
  );
}
