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
      return 'bg-green-500/10 text-green-600 border-green-500/20';
    case 'intermediate':
      return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
    case 'advanced':
      return 'bg-red-500/10 text-red-600 border-red-500/20';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
};

export function CourseCard({ course, thumbnail, onSelect }: CourseCardProps) {
  const imageUrl = thumbnail || course.image_url;
  const videoCount = course.course_videos?.length || 0;

  return (
    <Card className="overflow-hidden hover:shadow-xl transition-all duration-300 hover:-translate-y-1 group">
      {/* Gradient Background Image */}
      <div className="h-48 relative overflow-hidden">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={course.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/80 via-primary to-accent/80 flex items-center justify-center">
            <BookOpen className="h-16 w-16 text-primary-foreground/80" />
          </div>
        )}
        {/* Gradient overlay for text readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
        
        {/* Badges positioned on image */}
        <div className="absolute top-3 left-3 flex gap-2">
          <Badge className={`${getLevelColor(course.level)} border backdrop-blur-sm`} variant="outline">
            {course.level}
          </Badge>
        </div>
        <div className="absolute top-3 right-3">
          <Badge variant="secondary" className="bg-white/90 text-foreground backdrop-blur-sm">
            {course.subject}
          </Badge>
        </div>
        
        {/* Video count on bottom of image */}
        {videoCount > 0 && (
          <div className="absolute bottom-3 left-3 flex items-center gap-1.5 text-white text-sm">
            <PlayCircle className="h-4 w-4" />
            <span className="font-medium">{videoCount} video{videoCount > 1 ? 's' : ''}</span>
          </div>
        )}
      </div>
      
      <CardHeader className="pb-2">
        <CardTitle className="line-clamp-2 text-lg">{course.title}</CardTitle>
        <CardDescription className="line-clamp-2">{course.description}</CardDescription>
      </CardHeader>
      
      <CardContent className="pt-0">
        <div className="flex items-center justify-between text-sm text-muted-foreground mb-4">
          <div className="flex items-center gap-1">
            <User className="h-4 w-4" />
            <span className="truncate max-w-[120px]">
              {course.public_profiles?.full_name || 'Instructor'}
            </span>
          </div>
          <div className="flex items-center gap-1 font-medium">
            <DollarSign className="h-4 w-4" />
            <span>{course.price === 0 ? 'Free' : `${course.price}`}</span>
          </div>
        </div>
        <Button className="w-full bg-primary hover:bg-primary/90" onClick={() => onSelect(course)}>
          <BookOpen className="h-4 w-4 mr-2" />
          View Course
        </Button>
      </CardContent>
    </Card>
  );
}
