import { NO_ADMIN_ACCESS, type AdminAccess } from '@/lib/adminAccess';
import { loadAdminAccess } from '@/lib/adminAccessRepository';
import { clearPracticeCaptures, initializePracticeCaptureTab } from '@/lib/practiceCapture';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
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
  adminAccess: AdminAccess;
  accessLoading: boolean;
  accessError: string | null;
  legacyAdminAccess: boolean;
  retryAdminAccess: () => void;
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
  const [adminAccess, setAdminAccess] = useState<AdminAccess>(NO_ADMIN_ACCESS);
  const [accessLoading, setAccessLoading] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [legacyAdminAccess, setLegacyAdminAccess] = useState(false);
  const retryAccess = useRef<() => void>(() => {});
  const isAdmin = Object.values(adminAccess).some(Boolean);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try { window.name = initializePracticeCaptureTab(sessionStorage, window.name, crypto.randomUUID()); } catch { /* Capture will be marked incomplete. */ }
    let active = true;
    let revision = 0;
    let currentUserId: string | undefined;
    let currentSession: Session | null = null;

    const applySession = (nextSession: Session | null) => {
      if (!active) return;
      const requestRevision = ++revision;
      const isCurrent = () => active && revision === requestRevision;
      const nextUserId = nextSession?.user.id;
      currentSession = nextSession;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      if (nextUserId !== currentUserId || !nextUserId) {
        try { clearPracticeCaptures(sessionStorage, currentUserId && nextUserId !== currentUserId ? undefined : nextUserId); } catch { /* Storage may be disabled. */ }
        setProfile(null);
        setAdminAccess(NO_ADMIN_ACCESS);
        setIsSuperAdmin(false);
        setLegacyAdminAccess(false);
      }
      currentUserId = nextUserId;
      setLoading(false);
      setAccessLoading(!!nextUserId);
      setAccessError(null);
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
        void loadAdminAccess(supabase, nextUserId).then(({ access, legacy }) => {
          if (!isCurrent()) return;
          setAdminAccess(access);
          setLegacyAdminAccess(legacy);
          setIsSuperAdmin(access.users);
          setAccessLoading(false);
        }).catch(error => {
          if (!isCurrent()) return;
          setAdminAccess(NO_ADMIN_ACCESS); setIsSuperAdmin(false); setAccessLoading(false);
          setLegacyAdminAccess(false);
          setAccessError('Could not load account permissions. Please retry. If this continues, contact the site administrator.');
          console.error('Error checking account permissions:', error);
        });
      }, 0);
    };
    retryAccess.current = () => applySession(currentSession);

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

    return () => { active = false; ++revision; retryAccess.current = () => {}; subscription.unsubscribe(); };
  }, []);

  const signUp = async (email: string, password: string, fullName: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
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
    adminAccess,
    accessLoading,
    accessError,
    legacyAdminAccess,
    retryAdminAccess: () => retryAccess.current(),
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
