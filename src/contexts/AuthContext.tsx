import React, { createContext, useContext, useEffect, useState } from 'react';
import { AuthError, User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

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
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: AuthError | null }>;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signInWithGoogle: () => Promise<{ error: AuthError | null }>;
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
    let active = true;
    let revision = 0;
    let currentUserId: string | undefined;

    const applySession = (nextSession: Session | null) => {
      if (!active) return;
      const requestRevision = ++revision;
      const isCurrent = () => active && revision === requestRevision;
      const nextUserId = nextSession?.user.id;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      if (nextUserId !== currentUserId || !nextUserId) {
        setProfile(null);
        setIsAdmin(false);
        setIsSuperAdmin(false);
      }
      currentUserId = nextUserId;
      setLoading(false);
      if (!nextUserId) return;

      // Supabase requests must run outside the auth callback's lock.
      setTimeout(() => {
        if (!isCurrent()) return;
        void supabase.from('profiles').select('*').eq('user_id', nextUserId).single()
          .then(({ data, error }) => {
            if (!isCurrent()) return;
            if (error) { setProfile(null); console.error('Error fetching profile:', error); }
            else setProfile(data);
          }, error => {
            if (isCurrent()) { setProfile(null); console.error('Error fetching profile:', error); }
          });
        void Promise.all([
          supabase.rpc('has_role', { _user_id: nextUserId, _role: 'admin' }),
          supabase.rpc('is_super_admin', { _user_id: nextUserId }),
        ]).then(([adminResult, superAdminResult]) => {
          if (!isCurrent()) return;
          if (adminResult.error || superAdminResult.error) {
            setIsAdmin(false); setIsSuperAdmin(false);
            console.error('Error checking account roles:', adminResult.error ?? superAdminResult.error);
            return;
          }
          const superAdmin = superAdminResult.data === true;
          setIsSuperAdmin(superAdmin);
          setIsAdmin(adminResult.data === true || superAdmin);
        }).catch(error => {
          if (!isCurrent()) return;
          setIsAdmin(false); setIsSuperAdmin(false);
          console.error('Error checking account roles:', error);
        });
      }, 0);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      applySession(nextSession);
      if (event === 'SIGNED_IN' && nextSession?.user) {
        // Activity logging must never block a successful login.
        setTimeout(() => {
          if (active && currentUserId === nextSession.user.id) {
            void supabase.from('user_login_events').insert({ user_id: nextSession.user.id })
              .then(({ error }) => { if (error) console.error('Error recording sign-in:', error); }, error => console.error('Error recording sign-in:', error));
          }
        }, 0);
      }
    });
    const initialRevision = revision;
    void supabase.auth.getSession().then(({ data: { session: initialSession }, error }) => {
      // A newer auth event wins over an older initial-session response.
      if (!active || revision !== initialRevision) return;
      if (error) console.error('Error loading account session:', error);
      applySession(error ? null : initialSession);
    }).catch(error => {
      if (!active || revision !== initialRevision) return;
      console.error('Error loading account session:', error);
      applySession(null);
    });

    return () => { active = false; ++revision; subscription.unsubscribe(); };
  }, []);

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
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
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
