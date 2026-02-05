import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
 import { Book, Image, MessageSquare } from 'lucide-react';
import ScholarCounter from '@/components/home/ScholarCounter';

const Index = () => {
  const { user } = useAuth();

  const features = [
    {
      icon: <Book className="h-8 w-8 text-primary" />,
      title: "Expert Courses",
      description: "Comprehensive math courses from beginner to advanced levels taught by experienced instructors.",
      link: "/courses"
    },
    {
      icon: <Image className="h-8 w-8 text-accent" />,
      title: "Solution Requests",
      description: "Upload math problems and get step-by-step solutions from our expert tutors.",
      link: "/solution-requests"
    },
    {
      icon: <MessageSquare className="h-8 w-8 text-primary" />,
      title: "Community Forum",
      description: "Connect with fellow students, share study tips, and collaborate on challenging problems.",
      link: "/forum"
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-primary/5 to-accent/5 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-5xl font-bold text-foreground mb-6">
            Welcome to <span className="text-primary">O2I Institute</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto mb-8">
            Master mathematics with our comprehensive tutoring platform. Get expert help, connect with peers, 
            and unlock your potential with personalized learning experiences.
          </p>
          
          {/* Trust Bar - Scholar Counter & Expert Tutors */}
          <div className="mb-10">
            <ScholarCounter />
          </div>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            {user ? (
              <>
                <Button size="lg" asChild>
                  <Link to="/courses">
                    <Book className="h-5 w-5 mr-2" />
                    Browse Courses
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link to="/solution-requests">
                    <Image className="h-5 w-5 mr-2" />
                    Get Help Now
                  </Link>
                </Button>
              </>
            ) : (
              <>
                <Button size="lg" asChild>
                  <Link to="/auth">Get Started</Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link to="/courses">Explore Courses</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-foreground mb-4">Everything You Need to Excel in Math</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Our comprehensive platform provides all the tools and support you need for mathematical success.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <Card key={index} className="hover:shadow-lg transition-shadow duration-300">
                <CardHeader className="text-center">
                  <div className="mx-auto mb-4 p-3 bg-accent/10 rounded-full w-fit">
                    {feature.icon}
                  </div>
                  <CardTitle className="text-xl mb-2">{feature.title}</CardTitle>
                  <CardDescription className="text-base">
                    {feature.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-center">
                  <Button variant="outline" asChild>
                    <Link to={feature.link}>Learn More</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-primary/10 to-accent/10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-foreground mb-4">
            Ready to Transform Your Math Skills?
          </h2>
          <p className="text-lg text-muted-foreground mb-8">
            Join thousands of students who have improved their mathematical understanding with O2I Institute.
          </p>
          
          {!user && (
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button size="lg" asChild>
                <Link to="/auth">Sign Up Today</Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/auth">Sign In</Link>
              </Button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default Index;
