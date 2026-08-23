import { useState, useEffect, useCallback, useMemo, createContext, useContext, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut as firebaseSignOut, type User as FirebaseUser } from "firebase/auth";
import { supabase } from "@/integrations/supabase/client";
import { auth, isUsingFirebaseEmulators } from "@/integrations/firebase/config";

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

const toAppUser = (firebaseUser: FirebaseUser): User => ({
  id: firebaseUser.uid,
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: { display_name: firebaseUser.displayName || firebaseUser.email?.split("@")[0] || "podrozowka" },
  aud: "authenticated",
  confirmation_sent_at: firebaseUser.emailVerified ? new Date().toISOString() : undefined,
  created_at: firebaseUser.metadata.creationTime || new Date().toISOString(),
  email: firebaseUser.email || "",
  phone: "",
  role: "authenticated",
  updated_at: firebaseUser.metadata.lastSignInTime || new Date().toISOString(),
});

const getInitialSavedAuth = (): { user: User | null; role: AppRole | null; isAdmin: boolean } => {
  if (typeof window === "undefined") {
    return { user: null, role: null, isAdmin: false };
  }
  try {
    const saved = localStorage.getItem(DEV_AUTH_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed?.user) {
        const isEmailAdmin = parsed.user.email ? ADMIN_EMAILS.includes(parsed.user.email.toLowerCase()) : false;
        const role: AppRole = isEmailAdmin ? 'admin' : 'traveler';
        return {
          user: parsed.user as User,
          role,
          isAdmin: isEmailAdmin,
        };
      }
    }
  } catch {
    // fallback
  }
  return { user: null, role: null, isAdmin: false };
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const initialAuth = useMemo(() => getInitialSavedAuth(), []);
  const [user, setUser] = useState<User | null>(initialAuth.user);
  const [session, setSession] = useState<Session | null>(null);
  // In local Firebase mode ignore an old Supabase browser session until the
  // Auth Emulator resolves the local administrator identity.
  const [isLoading, setIsLoading] = useState<boolean>(isUsingFirebaseEmulators || !initialAuth.user);
  const [role, setRole] = useState<AppRole | null>(initialAuth.role);
  const [isDbAdmin, setIsDbAdmin] = useState<boolean>(initialAuth.isAdmin);
  const [roleLoading, setRoleLoading] = useState<boolean>(false);

  const fetchRole = useCallback(async (userId: string, email?: string) => {
    const userEmail = email?.trim().toLowerCase() || "";
    const isEmailAdmin = userEmail === 'fundacja@d-arka.org';

    if (!isEmailAdmin) {
      // Strictly non-admin for all accounts other than fundacja@d-arka.org
      setIsDbAdmin(false);
      setRole('traveler');
      setRoleLoading(false);
      return;
    }

    setRoleLoading(true);
    const { data } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);

    const roles = data ? data.map(r => r.role) : [];
    const hasDbAdmin = isEmailAdmin || roles.includes('admin');
    setIsDbAdmin(hasDbAdmin);
    setRole('admin');
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

    const currentFirebaseUser = auth.currentUser;
    if (currentFirebaseUser?.email?.trim().toLowerCase() === cleanEmail) {
      const firebaseAppUser = toAppUser(currentFirebaseUser);
      setUser(firebaseAppUser);
      setSession(null);
      setRole(effectiveRole);
      setIsDbAdmin(isEmailAdmin);
      localStorage.setItem(DEV_AUTH_STORAGE_KEY, JSON.stringify({ user: firebaseAppUser, role: effectiveRole }));
      setIsLoading(false);
      setRoleLoading(false);
      return firebaseAppUser;
    }

    if (isUsingFirebaseEmulators) {
      try {
        const credential = await signInWithEmailAndPassword(auth, cleanEmail, devPassword);
        const localUser = toAppUser(credential.user);
        setUser(localUser);
        setSession(null);
        setRole(effectiveRole);
        setIsDbAdmin(isEmailAdmin);
        localStorage.setItem(DEV_AUTH_STORAGE_KEY, JSON.stringify({ user: localUser, role: effectiveRole }));
        return localUser;
      } finally {
        setIsLoading(false);
        setRoleLoading(false);
      }
    }

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
        localStorage.setItem(DEV_AUTH_STORAGE_KEY, JSON.stringify({ user: signInData.user, role: effectiveRole }));
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
        localStorage.setItem(DEV_AUTH_STORAGE_KEY, JSON.stringify({ user: signUpData.user, role: effectiveRole }));
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
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (!isMounted) return;
      if (!firebaseUser) {
        if (!isUsingFirebaseEmulators) return;
        setUser(null);
        setSession(null);
        setRole(null);
        setIsDbAdmin(false);
        setIsLoading(false);
        return;
      }
      const localUser = toAppUser(firebaseUser);
      const isEmailAdmin = ADMIN_EMAILS.includes((firebaseUser.email || "").toLowerCase());
      setUser(localUser);
      setSession(null);
      setRole(isEmailAdmin ? "admin" : "traveler");
      setIsDbAdmin(isEmailAdmin);
      localStorage.setItem(DEV_AUTH_STORAGE_KEY, JSON.stringify({ user: localUser, role: isEmailAdmin ? "admin" : "traveler" }));
      setIsLoading(false);
      setRoleLoading(false);
    });

    if (isUsingFirebaseEmulators) {
      void signInWithEmailAndPassword(auth, "fundacja@d-arka.org", "DevAdminPassword123!").catch(() => {
        setIsLoading(false);
      });
    }
    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (isUsingFirebaseEmulators) return;
    let isMounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, currentSession) => {
        if (auth.currentUser) return;
        if (event === 'SIGNED_OUT') {
          // Explicit user sign out
          localStorage.removeItem(DEV_AUTH_STORAGE_KEY);
          setSession(null);
          setUser(null);
          setRole(null);
          setIsDbAdmin(false);
          setIsLoading(false);
          setRoleLoading(false);
          return;
        }

        if (currentSession?.user) {
          setSession(currentSession);
          setUser(currentSession.user);
          const isEmailAdmin = currentSession.user.email ? ADMIN_EMAILS.includes(currentSession.user.email.toLowerCase()) : false;
          const effectiveRole: AppRole = isEmailAdmin ? 'admin' : 'traveler';
          localStorage.setItem(DEV_AUTH_STORAGE_KEY, JSON.stringify({ user: currentSession.user, role: effectiveRole }));
          setIsLoading(false);
          setTimeout(() => fetchRole(currentSession.user.id, currentSession.user.email), 0);
        } else {
          // Check if local persistent storage already has a user
          const saved = getInitialSavedAuth();
          if (saved.user) {
            setUser(saved.user);
            setRole(saved.role);
            setIsDbAdmin(saved.isAdmin);
          } else {
            setUser(null);
            setSession(null);
            setRole(null);
            setIsDbAdmin(false);
          }
          setIsLoading(false);
          setRoleLoading(false);
        }
      }
    );

    const initializeSession = async () => {
      await auth.authStateReady();
      if (auth.currentUser) {
        const firebaseUser = auth.currentUser;
        const firebaseAppUser = toAppUser(firebaseUser);
        const isEmailAdmin = ADMIN_EMAILS.includes((firebaseUser.email || "").toLowerCase());
        setUser(firebaseAppUser);
        setSession(null);
        setRole(isEmailAdmin ? "admin" : "traveler");
        setIsDbAdmin(isEmailAdmin);
        localStorage.setItem(DEV_AUTH_STORAGE_KEY, JSON.stringify({ user: firebaseAppUser, role: isEmailAdmin ? "admin" : "traveler" }));
        setIsLoading(false);
        setRoleLoading(false);
        return;
      }
      let resolvedSession: Session | null = null;
      try {
        const current = await supabase.auth.getSession();
        resolvedSession = current.data.session;
        if (!resolvedSession) resolvedSession = await adoptOAuthCallbackSession();
      } catch (error) {
        console.error("OAuth callback session error:", error);
      }

      if (!isMounted) return;
      if (resolvedSession?.user) {
        setSession(resolvedSession);
        setUser(resolvedSession.user);
        const isEmailAdmin = resolvedSession.user.email ? ADMIN_EMAILS.includes(resolvedSession.user.email.toLowerCase()) : false;
        const effectiveRole: AppRole = isEmailAdmin ? 'admin' : 'traveler';
        localStorage.setItem(DEV_AUTH_STORAGE_KEY, JSON.stringify({ user: resolvedSession.user, role: effectiveRole }));
        await fetchRole(resolvedSession.user.id, resolvedSession.user.email);
      } else {
        const saved = getInitialSavedAuth();
        if (saved.user) {
          setUser(saved.user);
          setRole(saved.role);
          setIsDbAdmin(saved.isAdmin);
        }
      }
      setIsLoading(false);
      setRoleLoading(false);
    };

    void initializeSession();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [adoptOAuthCallbackSession, fetchRole]);

  const signOut = useCallback(async () => {
    localStorage.removeItem(DEV_AUTH_STORAGE_KEY);
    if (auth.currentUser) {
      await firebaseSignOut(auth);
    }
    if (isUsingFirebaseEmulators) {
      setUser(null);
      setSession(null);
      setRole(null);
      setIsDbAdmin(false);
      return;
    }
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn("Supabase signOut error:", e);
    }
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
