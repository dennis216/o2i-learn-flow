import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, BookOpen, Bot, CheckCircle2, Clock3, Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getLesson, getSkill, skills } from '@/data/learningContent';
import { useLearning } from '@/contexts/LearningContext';
import { skillMastery } from '@/lib/adaptivePractice';

export default function Review() {
  const { signals, attempts } = useLearning();
  const signalSkillIds = [...new Set(signals.map((signal) => signal.skillId))];
  const weakSkillIds = skills.filter((skill) => attempts.some((attempt) => attempt.skillIds.includes(skill.id) && (!attempt.correct || attempt.overTarget))).map((skill) => skill.id);
  const reviewSkillIds = [...new Set([...signalSkillIds, ...weakSkillIds])];
  const selectedSkills = (reviewSkillIds.length ? reviewSkillIds : ['limit-meaning', 'limit-algebra']).map(getSkill).filter(Boolean);

  const summary = [
    { label: 'Saved moments', value: signals.filter((signal) => signal.kind === 'long_pause').length, icon: Pause },
    { label: 'Questions asked', value: signals.filter((signal) => signal.kind === 'ask_ai').length, icon: Bot },
    { label: 'Ready to revisit', value: attempts.filter((attempt) => !attempt.correct || attempt.overTarget).length, icon: Clock3 },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-10 text-center">
          <h1 className="mb-4 flex items-center justify-center gap-3 text-4xl font-bold"><BookOpen className="h-10 w-10 text-primary" />Your Review</h1>
          <p className="mx-auto max-w-2xl text-xl text-muted-foreground">A personal collection of ideas worth another look, ready whenever you are.</p>
          <Button asChild size="lg" className="mt-7"><Link to="/quiz?subject=calculus&source=review">Practice these topics <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
        </div>

        <div className="mb-10 grid gap-6 sm:grid-cols-3">
          {summary.map(({ label, value, icon: Icon }) => (
            <Card key={label}><CardContent className="flex items-center gap-4 p-6"><span className="grid h-11 w-11 place-items-center rounded-full bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span><div><p className="text-3xl font-bold">{value}</p><p className="text-sm text-muted-foreground">{label}</p></div></CardContent></Card>
          ))}
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
          <section className="space-y-6">
            <div className="flex items-center gap-3"><div className="h-8 w-1 rounded-full bg-primary" /><h2 className="text-xl font-semibold">Review cards</h2></div>
            {selectedSkills.map((skill) => skill && (
              <Card key={skill.id}>
                <CardHeader className="border-b"><div className="flex items-start justify-between gap-4"><div><CardTitle>{skill.name}</CardTitle><p className="mt-2 text-sm text-muted-foreground">Suggested for your next review</p></div><span className="text-sm font-medium text-primary">{attempts.length ? Math.round(skillMastery(skill.id, attempts) * 100) : 0}%</span></div></CardHeader>
                <CardContent className="grid gap-6 p-6 md:grid-cols-[1fr_260px]">
                  <div><p className="leading-7 text-muted-foreground">{skill.summary}</p><h3 className="mt-5 font-semibold">Keep in mind</h3><ul className="mt-3 space-y-2">{skill.keyPoints.map((point) => <li key={point} className="flex gap-3 text-sm"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />{point}</li>)}</ul></div>
                  <div className="rounded-lg bg-accent/10 p-5"><AlertTriangle className="h-5 w-5 text-accent-foreground" /><h3 className="mt-3 font-semibold">Watch for this</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{skill.commonMistake}</p></div>
                </CardContent>
              </Card>
            ))}
          </section>

          <aside className="space-y-6">
            <div className="flex items-center gap-3"><div className="h-8 w-1 rounded-full bg-accent" /><h2 className="text-xl font-semibold">From your lessons</h2></div>
            <Card><CardContent className="space-y-3 p-6">{signals.slice(-6).reverse().map((signal) => <div key={signal.id} className="rounded-lg border p-3"><div className="flex items-center justify-between gap-3"><p className="text-sm font-medium">{getSkill(signal.skillId)?.shortName}</p><span className="text-xs text-muted-foreground">{Math.floor(signal.timestampSeconds / 60)}:{(signal.timestampSeconds % 60).toString().padStart(2, '0')}</span></div><p className="mt-1 text-xs text-muted-foreground">{signal.kind === 'ask_ai' ? 'You asked for help here' : signal.confirmed ? 'You saved this moment' : 'You paused here'} · {getLesson(signal.lessonId)?.title}</p></div>)}{!signals.length && <p className="py-5 text-center text-sm leading-6 text-muted-foreground">Your saved moments will appear here as you move through a lesson.</p>}</CardContent></Card>
            <Card><CardHeader><CardTitle className="text-lg">Ready for the next step?</CardTitle></CardHeader><CardContent><p className="text-sm leading-6 text-muted-foreground">A short practice set can help turn these ideas into lasting confidence.</p><Button asChild variant="outline" className="mt-5 w-full"><Link to="/practice">Open Quick Practice <ArrowRight /></Link></Button></CardContent></Card>
          </aside>
        </div>
      </div>
    </div>
  );
}
