import { useState, useEffect, useCallback, useMemo, createContext, useContext, type ReactNode } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User as FirebaseUser,
} from "firebase/auth";
import { auth, isUsingFirebaseEmulators } from "@/integrations/firebase/config";
import { firestoreService } from "@/integrations/firebase/services/firestoreService";

type AppRole = "traveler" | "admin";

/**
 * The application-level identity exposed to the UI.
 *
 * It intentionally contains only fields consumed by the frontend.  Firebase
 * Auth is the source of this object; keeping a local type avoids making the
 * authentication layer depend on the retired Supabase SDK.
 */
export interface AppUser {
  id: string;
  email: string;
  phone: string;
  role: "authenticated";
  aud: "authenticated";
  created_at: string;
  updated_at: string;
  confirmation_sent_at?: string;
  app_metadata: {
    provider: string;
    providers: string[];
  };
  user_metadata: {
    display_name: string;
  };
}

interface AuthContextType {
  user: AppUser | null;
  session: null;
  isLoading: boolean;
  role: AppRole | null;
  isAdmin: boolean;
  isDbAdmin: boolean;
  isTraveler: boolean;
  signInWithDevAccount: (email: string, targetRole?: AppRole) => Promise<AppUser | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const toAppUser = (firebaseUser: FirebaseUser): AppUser => ({
  id: firebaseUser.uid,
  app_metadata: {
    provider: firebaseUser.providerData[0]?.providerId || "password",
    providers: firebaseUser.providerData.map((provider) => provider.providerId),
  },
  user_metadata: {
    display_name: firebaseUser.displayName || firebaseUser.email?.split("@")[0] || "podrozowka",
  },
  aud: "authenticated",
  confirmation_sent_at: firebaseUser.emailVerified ? new Date().toISOString() : undefined,
  created_at: firebaseUser.metadata.creationTime || new Date().toISOString(),
  email: firebaseUser.email || "",
  phone: firebaseUser.phoneNumber || "",
  role: "authenticated",
  updated_at: firebaseUser.metadata.lastSignInTime || new Date().toISOString(),
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [role, setRole] = useState<AppRole | null>(null);

  const applyFirebaseUser = useCallback(async (firebaseUser: FirebaseUser | null) => {
    if (!firebaseUser) {
      setUser(null);
      setRole(null);
      return;
    }
    setUser(toAppUser(firebaseUser));
    setRole((await firestoreService.hasAdminRole(firebaseUser.uid)) ? "admin" : "traveler");
  }, []);

  const syncFirestoreProfile = useCallback(async (firebaseUser: FirebaseUser) => {
    const [firstName = "", ...lastNameParts] = (firebaseUser.displayName || "").trim().split(/\s+/).filter(Boolean);
    const displayName = firebaseUser.displayName || firebaseUser.email?.split("@")[0] || "Podróżnik";
    await firestoreService.updateUserProfile(firebaseUser.uid, {
      user_id: firebaseUser.uid,
      email: firebaseUser.email || "",
      first_name: firstName || null,
      last_name: lastNameParts.join(" ") || null,
      display_name: displayName,
      full_name: firebaseUser.displayName || displayName,
      created_at: firebaseUser.metadata.creationTime || new Date().toISOString(),
    });
  }, []);

  const signInWithDevAccount = useCallback(async (email: string): Promise<AppUser | null> => {
    const cleanEmail = email.trim().toLowerCase();
    const currentUser = auth.currentUser;
    if (currentUser?.email?.trim().toLowerCase() === cleanEmail) return toAppUser(currentUser);

    // Local emulator convenience only. Production accounts use Firebase's
    // normal e-mail/password or Google flow on the login page.
    if (!isUsingFirebaseEmulators) return null;
    const credential = await signInWithEmailAndPassword(auth, cleanEmail, "DevAdminPassword123!");
    return toAppUser(credential.user);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setIsLoading(true);
      void applyFirebaseUser(firebaseUser).finally(() => setIsLoading(false));
      if (firebaseUser) void syncFirestoreProfile(firebaseUser);
    });

    if (isUsingFirebaseEmulators) {
      void signInWithEmailAndPassword(auth, "fundacja@d-arka.org", "DevAdminPassword123!").catch(() => {
        setIsLoading(false);
      });
    }
    return unsubscribe;
  }, [applyFirebaseUser, syncFirestoreProfile]);

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth);
    await applyFirebaseUser(null);
  }, [applyFirebaseUser]);

  const value = useMemo(() => ({
    user,
    session: null,
    isLoading,
    role,
    isAdmin: role === "admin",
    isDbAdmin: role === "admin",
    isTraveler: role === "traveler",
    signInWithDevAccount,
    signOut,
  }), [user, isLoading, role, signInWithDevAccount, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
};
