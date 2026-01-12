import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { Book, LogOut, User, Shield, Target, Bot } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export default function Navbar() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    checkAdminStatus();
  }, [user]);

  const checkAdminStatus = async () => {
    if (!user) {
      setIsAdmin(false);
      return;
    }

    try {
      const { data } = await supabase.rpc("has_role", {
        _user_id: user.id,
        _role: "admin",
      });
      setIsAdmin(data || false);
    } catch (error) {
      setIsAdmin(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/');
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

          <div className="flex items-center space-x-4">
            <Link to="/courses">
              <Button variant="ghost">Courses</Button>
            </Link>
            <Link to="/practice">
              <Button variant="ghost">
                <Target className="h-4 w-4 mr-2" />
                Practice
              </Button>
            </Link>
            <Link to="/ai-tutor">
              <Button variant="ghost">
                <Bot className="h-4 w-4 mr-2" />
                AI Tutor
              </Button>
            </Link>
            <Link to="/roadmaps">
              <Button variant="ghost">Roadmaps</Button>
            </Link>
            <Link to="/solution-requests">
              <Button variant="ghost">Solution Requests</Button>
            </Link>
            <Link to="/forum">
              <Button variant="ghost">Forum</Button>
            </Link>
            {isAdmin && (
              <Link to="/admin">
                <Button variant="ghost">
                  <Shield className="h-4 w-4 mr-2" />
                  Admin
                </Button>
              </Link>
            )}

            {user ? (
              <div className="flex items-center space-x-2">
                <div className="relative group">
                  <Button variant="ghost" size="sm" asChild>
                    <Link to="/profile">
                      <User className="h-4 w-4 mr-2" />
                      Profile
                    </Link>
                  </Button>
                  <div className="absolute right-0 top-full mt-1 hidden group-hover:block bg-background border border-border rounded-md shadow-lg min-w-[120px] z-50">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={handleSignOut}
                      className="w-full justify-start rounded-none hover:bg-accent"
                    >
                      <LogOut className="h-4 w-4 mr-2" />
                      Sign Out
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <Button asChild>
                <Link to="/auth">Sign In / Sign Up</Link>
              </Button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}