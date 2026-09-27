import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, Check, Clock3, History, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { getSkill, skills, subjects } from '@/data/learningContent';
import { useLearning } from '@/contexts/LearningContext';
import { skillMastery } from '@/lib/adaptivePractice';

export default function Practice() {
  const { attempts } = useLearning();
  const calculusSkills = skills.filter((skill) => skill.subjectId === 'calculus');
  const recentAttempts = attempts.slice(-5).reverse();

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-10 text-center">
          <h1 className="mb-4 flex items-center justify-center gap-3 text-4xl font-bold text-foreground">
            <Target className="h-10 w-10 text-primary" />
            Quick Practice
          </h1>
          <p className="mx-auto max-w-2xl text-xl text-muted-foreground">
            Build confidence with a focused set that grows with your progress.
          </p>
          <Button asChild size="lg" className="mt-7">
            <Link to="/quiz?subject=calculus&source=quick">Start a 5-question set <ArrowRight className="ml-2 h-4 w-4" /></Link>
          </Button>
        </div>

        <div className="mb-10 flex flex-wrap justify-center gap-2">
          {subjects.map((subject) => (
            <Button key={subject.id} disabled={!subject.available} variant={subject.available ? 'default' : 'outline'} size="sm" className="rounded-full">
              {subject.available && <Check className="mr-1 h-3.5 w-3.5" />}{subject.name}
              {!subject.available && <span className="ml-1 text-xs">Coming soon</span>}
            </Button>
          ))}
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
          <section>
            <div className="mb-5 flex items-center gap-3">
              <div className="h-8 w-1 rounded-full bg-primary" />
              <h2 className="text-xl font-semibold text-foreground">Choose a focus</h2>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              {calculusSkills.map((skill) => {
                const mastery = attempts.length ? Math.round(skillMastery(skill.id, attempts) * 100) : 0;
                return (
                  <Link key={skill.id} to={`/quiz?subject=calculus&skill=${skill.id}&source=quick`}>
                    <Card className="h-full cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
                      <CardHeader>
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <span className="rounded-full bg-primary/10 p-2 text-primary"><BookOpen className="h-5 w-5" /></span>
                          <span className="text-sm font-medium text-muted-foreground">{mastery ? `${mastery}%` : 'New'}</span>
                        </div>
                        <CardTitle className="text-lg">{skill.name}</CardTitle>
                        <CardDescription className="line-clamp-2 leading-6">{skill.summary}</CardDescription>
                      </CardHeader>
                      <CardContent><Progress value={mastery} className="h-2" /></CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>

          <aside>
            <div className="mb-5 flex items-center gap-3">
              <div className="h-8 w-1 rounded-full bg-accent" />
              <h2 className="text-xl font-semibold text-foreground">Recent work</h2>
            </div>
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><History className="h-5 w-5 text-primary" />Your latest answers</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {recentAttempts.length ? recentAttempts.map((attempt) => (
                  <div key={attempt.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium">{getSkill(attempt.skillIds[0])?.shortName}</p>
                      <span className={attempt.correct ? 'text-xs font-semibold text-green-600' : 'text-xs font-semibold text-destructive'}>{attempt.correct ? 'Correct' : 'Review'}</span>
                    </div>
                    <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="h-3.5 w-3.5" />{Math.floor(attempt.elapsedSeconds / 60)}m {attempt.elapsedSeconds % 60}s · {attempt.selectionTrajectory.length} selections</p>
                  </div>
                )) : <p className="py-6 text-center text-sm leading-6 text-muted-foreground">Your recent answers will appear here after your first practice set.</p>}
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </div>
  );
}
