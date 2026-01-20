import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { isDesignatedSuperAdmin, SUPER_ADMIN_EMAIL } from '@/lib/constants';

interface Profile {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  role: string;
  avatar_url?: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signInWithGoogle: () => Promise<{ error: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          // Fetch profile and check admin role
          setTimeout(() => {
            fetchProfile(session.user.id);
            checkAdminRole(session.user.id);
            checkSuperAdminRole(session.user.id);
          }, 0);
        } else {
          setProfile(null);
          setIsAdmin(false);
          setIsSuperAdmin(false);
        }
        setLoading(false);
      }
    );

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        fetchProfile(session.user.id);
        checkAdminRole(session.user.id);
        checkSuperAdminRole(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error) throw error;
      setProfile(data);
    } catch (error) {
      console.error('Error fetching profile:', error);
    }
  };

  const checkAdminRole = async (userId: string) => {
    try {
      const { data, error } = await supabase.rpc('has_role', {
        _user_id: userId,
        _role: 'admin',
      });

      if (error) {
        console.error('Error checking admin role:', error);
        setIsAdmin(false);
        return;
      }

      setIsAdmin(data === true);
    } catch (error) {
      console.error('Error checking admin role:', error);
      setIsAdmin(false);
    }
  };

  const checkSuperAdminRole = async (userId: string) => {
    try {
      // First, get the user's email to perform the hard-coded check
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      
      // CODE-LEVEL LOGIC SHIELD: Only the designated email can be super admin
      // Even if database says another user is super_admin, we ignore it unless email matches
      if (currentUser?.email && isDesignatedSuperAdmin(currentUser.email)) {
        setIsSuperAdmin(true);
        return;
      }
      
      // For any other user, super admin is always false regardless of database state
      setIsSuperAdmin(false);
    } catch (error) {
      console.error('Error checking super admin role:', error);
      setIsSuperAdmin(false);
    }
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    // Use production domain for auth emails, fallback to current origin for local dev
    const isProduction = window.location.hostname !== 'localhost';
    const redirectUrl = isProduction 
      ? 'https://www.o2iinstitute.org/' 
      : `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName
        }
      }
    });
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    return { error };
  };

  const signInWithGoogle = async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/`
      }
    });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setIsAdmin(false);
    setIsSuperAdmin(false);
  };

  const value = {
    user,
    session,
    profile,
    isAdmin,
    isSuperAdmin,
    loading,
    signUp,
    signIn,
    signInWithGoogle,
    signOut
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};