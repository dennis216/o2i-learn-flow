import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { Bot, FlaskConical, LogOut, Menu, Shield, Target, User, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '@/components/ui/sheet';

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
      toast({ title: 'Signed out successfully', description: 'You have been logged out of your account.' });
    } catch {
      toast({ title: 'Error', description: 'Failed to sign out. Please try again.', variant: 'destructive' });
    }
  };

  const closeMobileMenu = () => setMobileMenuOpen(false);

  const NavLinks = ({ mobile = false }: { mobile?: boolean }) => (
    <>
      <Link to="/courses" onClick={closeMobileMenu}><Button variant="ghost" className={mobile ? 'w-full justify-start' : ''}>Courses</Button></Link>
      <Link to="/practice" onClick={closeMobileMenu}><Button variant="ghost" className={mobile ? 'w-full justify-start' : ''}><Target className="mr-2 h-4 w-4" />Practice</Button></Link>
      <Link to="/ai-tutor" onClick={closeMobileMenu}><Button variant="ghost" className={mobile ? 'w-full justify-start' : ''}><Bot className="mr-2 h-4 w-4" />AI Tutor</Button></Link>
      <Link to="/playground" onClick={closeMobileMenu}><Button variant="ghost" className={mobile ? 'w-full justify-start' : ''}><FlaskConical className="mr-2 h-4 w-4" />Playground</Button></Link>
      <Link to="/solution-requests" onClick={closeMobileMenu}><Button variant="ghost" className={mobile ? 'w-full justify-start' : ''}>Solution Requests</Button></Link>
      <Link to="/team" onClick={closeMobileMenu}><Button variant="ghost" className={mobile ? 'w-full justify-start' : ''}><Users className="mr-2 h-4 w-4" />Team</Button></Link>
      {isAdmin && <Link to="/admin" onClick={closeMobileMenu}><Button variant="ghost" className={mobile ? 'w-full justify-start' : ''}><Shield className="mr-2 h-4 w-4" />Admin</Button></Link>}
    </>
  );

  const AuthButtons = ({ mobile = false }: { mobile?: boolean }) => user ? (
    <div className={mobile ? 'space-y-2' : 'flex items-center space-x-2'}>
      <Button variant="ghost" size="sm" asChild className={mobile ? 'w-full justify-start' : ''} onClick={closeMobileMenu}><Link to="/profile"><User className="mr-2 h-4 w-4" />Profile</Link></Button>
      <Button variant="ghost" size="sm" onClick={handleSignOut} className={mobile ? 'w-full justify-start' : ''}><LogOut className="mr-2 h-4 w-4" />Sign Out</Button>
    </div>
  ) : (
    <Button asChild className={mobile ? 'w-full' : ''} onClick={closeMobileMenu}><Link to="/auth">Sign In / Sign Up</Link></Button>
  );

  return (
    <nav className="border-b border-border bg-background shadow-sm">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 justify-between">
          <div className="flex items-center">
            <Link to="/" className="flex items-center space-x-2">
              <img src="/o2i-logo.jpg" alt="O2I Institute" className="h-8 w-8 rounded-full object-cover" />
              <span className="whitespace-nowrap text-xl font-bold text-primary">O2I Institute</span>
            </Link>
          </div>

          <div className="hidden items-center space-x-4 xl:flex"><NavLinks /><AuthButtons /></div>

          <div className="flex items-center xl:hidden">
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild><Button variant="ghost" size="icon"><Menu className="h-6 w-6" /><span className="sr-only">Open menu</span></Button></SheetTrigger>
              <SheetContent side="right" className="w-[300px] sm:w-[350px]">
                <SheetTitle className="sr-only">Site navigation</SheetTitle>
                <SheetDescription className="sr-only">Browse O2I Institute pages and account options.</SheetDescription>
                <div className="mt-6 flex flex-col space-y-4">
                  <div className="flex items-center space-x-2 border-b pb-4"><img src="/o2i-logo.jpg" alt="O2I Institute" className="h-8 w-8 rounded-full object-cover" /><span className="text-lg font-bold text-primary">O2I Institute</span></div>
                  <nav className="flex flex-col space-y-2"><NavLinks mobile /></nav>
                  <div className="border-t pt-4"><AuthButtons mobile /></div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </nav>
  );
}
