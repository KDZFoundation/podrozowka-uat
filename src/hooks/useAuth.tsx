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

  useEffect(() => {
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

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchRole(session.user.id);
      } else {
        setRoleLoading(false);
      }
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [fetchRole]);

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
