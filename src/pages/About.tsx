import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, MessageSquare, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const learningPaths = [
  {
    icon: BookOpen,
    title: 'Build understanding',
    description: 'Explore math courses and revisit lessons alongside what you are learning in school.',
    href: '/courses',
    action: 'Explore courses',
  },
  {
    icon: Target,
    title: 'Put ideas into practice',
    description: 'Work through focused questions, review your answers, and find the concepts that need another look.',
    href: '/practice',
    action: 'Start practicing',
  },
  {
    icon: MessageSquare,
    title: 'Work through questions',
    description: 'Bring a math problem to Solution Requests when you need help understanding the steps.',
    href: '/solution-requests',
    action: 'View solution requests',
  },
];

export default function About() {
  return (
    <main className="min-h-screen bg-background">
      <section className="border-b bg-gradient-to-br from-primary/5 to-accent/5 px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-primary">About Us</p>
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">Math makes more sense together.</h1>
          <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
            O2I Institute brings math lessons, focused practice, and peer support into one place.
            Our goal is to help students understand the reasoning behind an answer and build the confidence to try the next problem.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button size="lg" asChild><Link to="/courses">Explore courses<ArrowRight aria-hidden="true" /></Link></Button>
            <Button size="lg" variant="outline" asChild><Link to="/team">Meet the team</Link></Button>
          </div>
        </div>
      </section>

      <section aria-labelledby="approach-heading" className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <h2 id="approach-heading" className="text-3xl font-bold tracking-tight">Support for the way you learn</h2>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            Use O2I alongside your school learning: revisit a lesson, test your understanding, or ask for help when a step does not click.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {learningPaths.map(({ icon: Icon, title, description, href, action }) => (
            <Card key={href} className="flex flex-col">
              <CardHeader>
                <div className="mb-4 w-fit rounded-xl bg-primary/10 p-3 text-primary"><Icon className="h-6 w-6" aria-hidden="true" /></div>
                <CardTitle className="text-xl">{title}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col items-start">
                <p className="mb-6 flex-1 leading-relaxed text-muted-foreground">{description}</p>
                <Button variant="outline" asChild><Link to={href}>{action}<ArrowRight aria-hidden="true" /></Link></Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="community-heading" className="border-t bg-muted/30 px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h2 id="community-heading" className="text-3xl font-bold tracking-tight">Learning is a shared effort</h2>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            A useful explanation can change how a problem looks. We want O2I to be a place where students can ask questions,
            learn from others, and keep building their mathematical understanding.
          </p>
          <Button className="mt-6" variant="outline" asChild><Link to="/team">Meet the people behind O2I<ArrowRight aria-hidden="true" /></Link></Button>
        </div>
      </section>
    </main>
  );
}
