import { Link } from 'react-router-dom';
import { Book, Image, Target } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import ScholarCounter from '@/components/home/ScholarCounter';

const features = [
  {
    icon: <Book className="h-8 w-8 text-primary" />,
    title: 'Expert Courses',
    description: 'Comprehensive math courses from beginner to advanced levels taught by experienced instructors.',
    link: '/courses',
  },
  {
    icon: <Image className="h-8 w-8 text-accent" />,
    title: 'Solution Requests',
    description: 'Upload math problems and get step-by-step solutions from our expert tutors.',
    link: '/solution-requests',
  },
  {
    icon: <Target className="h-8 w-8 text-primary" />,
    title: 'Quick Practice',
    description: 'Build confidence with focused practice that responds to your progress.',
    link: '/practice',
  },
];

export default function Index() {
  const { user } = useAuth();

  return (
    <main className="min-h-screen bg-background">
      <section className="relative bg-gradient-to-br from-primary/5 to-accent/5 py-20">
        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <h1 className="mb-6 text-5xl font-bold text-foreground">
            Welcome to <span className="text-primary">O2I Institute</span>
          </h1>
          <p className="mx-auto mb-8 max-w-3xl text-xl text-muted-foreground">
            Master mathematics with our comprehensive tutoring platform. Get expert help, connect with peers,
            and unlock your potential with personalized learning experiences.
          </p>

          <div className="mb-10"><ScholarCounter /></div>

          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            {user ? (
              <>
                <Button size="lg" asChild><Link to="/courses"><Book className="mr-2 h-5 w-5" />Browse Courses</Link></Button>
                <Button size="lg" variant="outline" asChild><Link to="/solution-requests"><Image className="mr-2 h-5 w-5" />Get Help Now</Link></Button>
              </>
            ) : (
              <>
                <Button size="lg" asChild><Link to="/courses">Get Started</Link></Button>
                <Button size="lg" variant="outline" asChild><Link to="/practice">Try Practice</Link></Button>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="bg-background py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-3xl font-bold text-foreground">Everything You Need to Excel in Math</h2>
            <p className="mx-auto max-w-2xl text-lg text-muted-foreground">Our comprehensive platform provides all the tools and support you need for mathematical success.</p>
          </div>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            {features.map((feature) => (
              <Card key={feature.title} className="transition-shadow duration-300 hover:shadow-lg">
                <CardHeader className="text-center">
                  <div className="mx-auto mb-4 w-fit rounded-full bg-accent/10 p-3">{feature.icon}</div>
                  <CardTitle className="mb-2 text-xl">{feature.title}</CardTitle>
                  <CardDescription className="text-base">{feature.description}</CardDescription>
                </CardHeader>
                <CardContent className="text-center"><Button variant="outline" asChild><Link to={feature.link}>Learn More</Link></Button></CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-gradient-to-r from-primary/10 to-accent/10 py-20">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="mb-4 text-3xl font-bold text-foreground">Ready to Transform Your Math Skills?</h2>
          <p className="mb-8 text-lg text-muted-foreground">Join thousands of students who have improved their mathematical understanding with O2I Institute.</p>
          {!user && <div className="flex flex-col items-center justify-center gap-4 sm:flex-row"><Button size="lg" asChild><Link to="/auth">Sign Up Today</Link></Button><Button size="lg" variant="outline" asChild><Link to="/auth">Sign In</Link></Button></div>}
        </div>
      </section>
    </main>
  );
}
