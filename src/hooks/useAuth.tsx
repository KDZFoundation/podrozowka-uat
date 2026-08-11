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
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [role, setRole] = useState<AppRole | null>(null);
  const [isDbAdmin, setIsDbAdmin] = useState(false);
  const [roleLoading, setRoleLoading] = useState(true);

  const fetchRole = useCallback(async (userId: string) => {
    setRoleLoading(true);

    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);

    const roles = data ? data.map(r => r.role) : [];
    const hasDbAdmin = roles.includes('admin');
    setIsDbAdmin(hasDbAdmin);

    if (hasDbAdmin) {
      setRole('admin');
    } else if (roles.includes('traveler')) {
      setRole('traveler');
    } else {
      setRole('traveler'); // default
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

  useEffect(() => {
    let isMounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          // Defer role fetch to avoid deadlock with auth state
          setTimeout(() => fetchRole(session.user.id), 0);
        } else {
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
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchRole(session.user.id);
      } else {
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
    await supabase.auth.signOut();
    setRole(null);
  }, []);

  const value = useMemo(() => ({
    user,
    session,
    isLoading: isLoading || roleLoading,
    role,
    isAdmin: role === 'admin',
    isDbAdmin,
    isTraveler: role === 'traveler',
    signOut,
  }), [user, session, isLoading, roleLoading, role, isDbAdmin, signOut]);

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
