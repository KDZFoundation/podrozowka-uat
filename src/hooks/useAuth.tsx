import { useState, useEffect, useCallback, useMemo, createContext, useContext, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AppRole = 'traveler' | 'admin';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  role: AppRole | null;
  isAdmin: boolean;
  isDbAdmin: boolean;
  isTraveler: boolean;
  signInWithDevAccount: (email: string, targetRole?: AppRole) => Promise<User | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ADMIN_EMAILS = [
  'fundacja@d-arka.org',
];

const DEV_AUTH_STORAGE_KEY = "podrozowka_dev_auth_user";

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [role, setRole] = useState<AppRole | null>(null);
  const [isDbAdmin, setIsDbAdmin] = useState(false);
  const [roleLoading, setRoleLoading] = useState(true);

  const fetchRole = useCallback(async (userId: string, email?: string) => {
    setRoleLoading(true);

    const isEmailAdmin = email ? ADMIN_EMAILS.includes(email.trim().toLowerCase()) : false;

    const { data } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);

    const roles = data ? data.map(r => r.role) : [];
    const hasDbAdmin = isEmailAdmin || (roles.includes('admin') && isEmailAdmin);
    setIsDbAdmin(hasDbAdmin);

    if (hasDbAdmin) {
      setRole('admin');
    } else {
      setRole('traveler'); // all other accounts are portal users
    }
    setRoleLoading(false);
  }, []);

  const adoptOAuthCallbackSession = useCallback(async (): Promise<Session | null> => {
    if (typeof window === "undefined" || !window.location.hash) return null;

    const params = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    if (!accessToken || !refreshToken) return null;

    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) throw error;

    // Never leave bearer tokens in browser history, copy/paste, or screenshots.
    window.history.replaceState(
      null,
      document.title,
      `${window.location.pathname}${window.location.search}`,
    );
    return data.session;
  }, []);

  const signInWithDevAccount = useCallback(async (email: string, targetRole?: AppRole): Promise<User | null> => {
    setIsLoading(true);
    const cleanEmail = email.trim().toLowerCase();
    const isEmailAdmin = ADMIN_EMAILS.includes(cleanEmail);
    const effectiveRole: AppRole = isEmailAdmin ? 'admin' : 'traveler';
    const devPassword = "DevAdminPassword123!";

    try {
      // 1. Try signing in with Supabase first
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: devPassword,
      });

      if (!signInError && signInData.user) {
        setUser(signInData.user);
        setSession(signInData.session);
        setRole(effectiveRole);
        setIsDbAdmin(isEmailAdmin);
        setIsLoading(false);
        setRoleLoading(false);
        return signInData.user;
      }

      // 2. Try signup if user didn't exist with devPassword
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: cleanEmail,
        password: devPassword,
        options: {
          data: {
            display_name: cleanEmail.split('@')[0],
          },
        },
      });

      if (!signUpError && signUpData.user) {
        setUser(signUpData.user);
        setSession(signUpData.session);
        setRole(effectiveRole);
        setIsDbAdmin(isEmailAdmin);
        setIsLoading(false);
        setRoleLoading(false);
        return signUpData.user;
      }
    } catch (e) {
      console.warn("Dev Supabase auth fallback:", e);
    }

    // 3. Fallback dev user session for seamless AI Studio iframe testing
    const fallbackUser: User = {
      id: `dev-user-${cleanEmail.replace(/[^a-z0-9]/g, '-')}`,
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: { display_name: cleanEmail.split('@')[0] },
      aud: 'authenticated',
      confirmation_sent_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      email: cleanEmail,
      phone: '',
      role: 'authenticated',
      updated_at: new Date().toISOString(),
    };

    localStorage.setItem(DEV_AUTH_STORAGE_KEY, JSON.stringify({ user: fallbackUser, role: effectiveRole }));
    setUser(fallbackUser);
    setRole(effectiveRole);
    setIsDbAdmin(isEmailAdmin);
    setIsLoading(false);
    setRoleLoading(false);
    return fallbackUser;
  }, []);

  useEffect(() => {
    let isMounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          // Defer role fetch to avoid deadlock with auth state
          setTimeout(() => fetchRole(session.user.id, session.user.email), 0);
        } else {
          // Check if local dev session exists
          const savedDev = localStorage.getItem(DEV_AUTH_STORAGE_KEY);
          if (savedDev) {
            try {
              const parsed = JSON.parse(savedDev);
              if (parsed?.user) {
                const isEmailAdmin = parsed.user.email ? ADMIN_EMAILS.includes(parsed.user.email.toLowerCase()) : false;
                const effectiveRole: AppRole = isEmailAdmin ? 'admin' : 'traveler';
                setUser(parsed.user);
                setRole(effectiveRole);
                setIsDbAdmin(isEmailAdmin);
                setRoleLoading(false);
                setIsLoading(false);
                return;
              }
            } catch {
              localStorage.removeItem(DEV_AUTH_STORAGE_KEY);
            }
          }
          setRole(null);
          setRoleLoading(false);
        }
        setIsLoading(false);
      }
    );

    const initializeSession = async () => {
      let session: Session | null = null;
      try {
        const current = await supabase.auth.getSession();
        session = current.data.session;
        if (!session) session = await adoptOAuthCallbackSession();
      } catch (error) {
        console.error("OAuth callback session error:", error);
      }

      if (!isMounted) return;
      if (session?.user) {
        setSession(session);
        setUser(session.user);
        await fetchRole(session.user.id, session.user.email);
      } else {
        const savedDev = localStorage.getItem(DEV_AUTH_STORAGE_KEY);
        if (savedDev) {
          try {
            const parsed = JSON.parse(savedDev);
            if (parsed?.user) {
              const isEmailAdmin = parsed.user.email ? ADMIN_EMAILS.includes(parsed.user.email.toLowerCase()) : false;
              const effectiveRole: AppRole = isEmailAdmin ? 'admin' : 'traveler';
              setUser(parsed.user);
              setRole(effectiveRole);
              setIsDbAdmin(isEmailAdmin);
              setRoleLoading(false);
              setIsLoading(false);
              return;
            }
          } catch {
            localStorage.removeItem(DEV_AUTH_STORAGE_KEY);
          }
        }
        setRoleLoading(false);
      }
      setIsLoading(false);
    };

    void initializeSession();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [adoptOAuthCallbackSession, fetchRole]);

  const signOut = useCallback(async () => {
    localStorage.removeItem(DEV_AUTH_STORAGE_KEY);
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setRole(null);
    setIsDbAdmin(false);
  }, []);

  const value = useMemo(() => ({
    user,
    session,
    isLoading: isLoading || roleLoading,
    role,
    isAdmin: role === 'admin',
    isDbAdmin,
    isTraveler: role === 'traveler',
    signInWithDevAccount,
    signOut,
  }), [user, session, isLoading, roleLoading, role, isDbAdmin, signInWithDevAccount, signOut]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
