import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { Book, LogOut, User, Shield, Target, Bot, Menu, Users, FlaskConical } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';

export default function Navbar() {
  const { user, signOut, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/');
      setMobileMenuOpen(false);
      toast({
        title: "Signed out successfully",
        description: "You have been logged out of your account.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to sign out. Please try again.",
        variant: "destructive",
      });
    }
  };

  const closeMobileMenu = () => setMobileMenuOpen(false);

  const NavLinks = ({ mobile = false }: { mobile?: boolean }) => (
    <>
      <Link to="/courses" onClick={closeMobileMenu}>
        <Button variant="ghost" className={mobile ? "w-full justify-start" : ""}>
          Courses
        </Button>
      </Link>
      <Link to="/practice" onClick={closeMobileMenu}>
        <Button variant="ghost" className={mobile ? "w-full justify-start" : ""}>
          <Target className="h-4 w-4 mr-2" />
          Practice
        </Button>
      </Link>
      <Link to="/ai-tutor" onClick={closeMobileMenu}>
        <Button variant="ghost" className={mobile ? "w-full justify-start" : ""}>
          <Bot className="h-4 w-4 mr-2" />
          AI Tutor
        </Button>
      </Link>
      <Link to="/playground" onClick={closeMobileMenu}>
        <Button variant="ghost" className={mobile ? "w-full justify-start" : ""}>
          <FlaskConical className="h-4 w-4 mr-2" />
          Playground
        </Button>
      </Link>
      <Link to="/roadmaps" onClick={closeMobileMenu}>
        <Button variant="ghost" className={mobile ? "w-full justify-start" : ""}>
          Roadmaps
        </Button>
      </Link>
      <Link to="/solution-requests" onClick={closeMobileMenu}>
        <Button variant="ghost" className={mobile ? "w-full justify-start" : ""}>
          Solution Requests
        </Button>
      </Link>
      <Link to="/forum" onClick={closeMobileMenu}>
        <Button variant="ghost" className={mobile ? "w-full justify-start" : ""}>
          Forum
        </Button>
      </Link>
      <Link to="/team" onClick={closeMobileMenu}>
        <Button variant="ghost" className={mobile ? "w-full justify-start" : ""}>
          <Users className="h-4 w-4 mr-2" />
          Team
        </Button>
      </Link>
      {isAdmin && (
        <Link to="/admin" onClick={closeMobileMenu}>
          <Button variant="ghost" className={mobile ? "w-full justify-start" : ""}>
            <Shield className="h-4 w-4 mr-2" />
            Admin
          </Button>
        </Link>
      )}
    </>
  );

  const AuthButtons = ({ mobile = false }: { mobile?: boolean }) => (
    <>
      {user ? (
        <div className={mobile ? "space-y-2" : "flex items-center space-x-2"}>
          <Button variant="ghost" size="sm" asChild className={mobile ? "w-full justify-start" : ""} onClick={closeMobileMenu}>
            <Link to="/profile">
              <User className="h-4 w-4 mr-2" />
              Profile
            </Link>
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleSignOut}
            className={mobile ? "w-full justify-start" : ""}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </div>
      ) : (
        <Button asChild className={mobile ? "w-full" : ""} onClick={closeMobileMenu}>
          <Link to="/auth">Sign In / Sign Up</Link>
        </Button>
      )}
    </>
  );

  return (
    <nav className="bg-background border-b border-border shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link to="/" className="flex items-center space-x-2">
              <Book className="h-8 w-8 text-primary" />
              <span className="text-xl font-bold text-primary">O2I Institute</span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center space-x-4">
            <NavLinks />
            <AuthButtons />
          </div>

          {/* Mobile Hamburger Menu */}
          <div className="flex lg:hidden items-center">
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="h-6 w-6" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[300px] sm:w-[350px]">
                <div className="flex flex-col space-y-4 mt-6">
                  <div className="flex items-center space-x-2 pb-4 border-b">
                    <Book className="h-6 w-6 text-primary" />
                    <span className="text-lg font-bold text-primary">O2I Institute</span>
                  </div>
                  <nav className="flex flex-col space-y-2">
                    <NavLinks mobile />
                  </nav>
                  <div className="pt-4 border-t">
                    <AuthButtons mobile />
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </nav>
  );
}
