import { BookOpen, DollarSign, PlayCircle, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Course } from './types';

interface CourseCardProps {
  course: Course;
  thumbnail?: string;
  onSelect: (course: Course) => void;
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

export function CourseCard({ course, thumbnail, onSelect }: CourseCardProps) {
  const imageUrl = thumbnail || course.image_url;

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow duration-300">
      <div className="h-48 bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center overflow-hidden">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={course.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <BookOpen className="h-16 w-16 text-primary" />
        )}
      </div>
      <CardHeader>
        <div className="flex justify-between items-start mb-2">
          <Badge className={getLevelColor(course.level)} variant="secondary">
            {course.level}
          </Badge>
          <Badge variant="outline">{course.subject}</Badge>
        </div>
        <CardTitle className="line-clamp-2">{course.title}</CardTitle>
        <CardDescription className="line-clamp-2">{course.description}</CardDescription>
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
        <Button className="w-full" onClick={() => onSelect(course)}>
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
  );
}
