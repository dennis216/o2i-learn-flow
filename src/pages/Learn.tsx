import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Clock3, Lock, Play, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { courses, lessons, subjects } from '@/data/learningContent';
import { useLearning } from '@/contexts/LearningContext';

export default function Learn() {
  const { completedLessonIds } = useLearning();

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-10 text-center">
          <h1 className="mb-4 text-4xl font-bold text-foreground">Explore Learning Paths</h1>
          <p className="mx-auto max-w-2xl text-xl text-muted-foreground">Move from clear instruction to thoughtful review and purposeful practice.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {subjects.map((subject) => <Badge key={subject.id} variant={subject.available ? 'default' : 'secondary'}>{subject.name}{!subject.available && ' · Coming soon'}</Badge>)}
          </div>
        </div>

        <div className="mb-12 grid gap-6 lg:grid-cols-3">
          {courses.map((course) => (
            <Card key={course.id} className={!course.available ? 'opacity-70' : 'transition-shadow hover:shadow-lg'}>
              <CardHeader>
                <div className="mb-3 flex items-center justify-between gap-3"><Badge variant="outline">{course.subjectId === 'calculus' ? 'AP Calculus AB/BC' : course.subjectId}</Badge>{course.available ? <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Available</Badge> : <Badge variant="secondary">Coming soon</Badge>}</div>
                <CardTitle>{course.title}</CardTitle>
                <CardDescription className="leading-6">{course.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-between border-t pt-5">
                <span className="text-sm text-muted-foreground">{course.available ? `${lessons.filter((lesson) => lesson.courseId === course.id).length} lessons` : 'Content in development'}</span>
                {course.available ? <Button asChild variant="ghost" size="sm"><Link to="/learn/limits-foundations">Start <ArrowRight /></Link></Button> : <span className="flex items-center gap-1 text-sm text-muted-foreground"><Upload className="h-4 w-4" />Planned</span>}
              </CardContent>
            </Card>
          ))}
        </div>

        <section>
          <div className="mb-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3"><div className="h-8 w-1 rounded-full bg-primary" /><h2 className="text-xl font-semibold">AP Calculus pilot lessons</h2></div>
            <p className="hidden text-sm text-muted-foreground sm:block">Preview content — ready for your final videos and question bank</p>
          </div>
          <Card>
            <CardContent className="divide-y p-0">
              {lessons.map((lesson) => {
                const done = completedLessonIds.includes(lesson.id);
                const ready = lesson.status === 'ready';
                return (
                  <div key={lesson.id} className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
                    <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${done ? 'bg-green-100 text-green-700' : ready ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>{done ? <CheckCircle2 className="h-5 w-5" /> : ready ? <Play className="h-5 w-5 fill-current" /> : <Lock className="h-5 w-5" />}</span>
                    <div className="min-w-0 flex-1"><p className="text-xs font-medium text-muted-foreground">{lesson.unit} · Lesson {lesson.order}</p><h3 className="mt-1 font-semibold">{lesson.title}</h3><p className="mt-1 text-sm text-muted-foreground">{lesson.description}</p></div>
                    <div className="flex items-center gap-4"><span className="flex items-center gap-1 text-sm text-muted-foreground"><Clock3 className="h-4 w-4" />{Math.round(lesson.durationSeconds / 60)} min</span>{ready ? <Button asChild><Link to={`/learn/${lesson.id}`}>{done ? 'Review lesson' : 'Open lesson'}</Link></Button> : <Button disabled variant="outline">Coming soon</Button>}</div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
