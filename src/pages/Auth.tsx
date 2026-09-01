import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import { Mail, Lock, ArrowLeft, Loader2, CheckCircle2, Eye, EyeOff, UserPlus, KeyRound, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { auth } from "@/integrations/firebase/config";
import { publicPageUrl } from "@/lib/publicAppUrl";
import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  GoogleAuthProvider,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  updateProfile,
} from "firebase/auth";
import { z } from "zod";

const emailSchema = z.string().email("Podaj prawidłowy adres email");
const passwordSchema = z.string().min(8, "Hasło musi mieć minimum 8 znaków");
const firstNameSchema = z.string().min(1, "Podaj imię").max(50);
const lastNameSchema = z.string().min(1, "Podaj nazwisko").max(50);

interface AuthProps {
  mode?: "login" | "signup" | "forgot";
}

const resolveDefaultRedirect = async (_userId: string): Promise<string> => {
  // All authenticated users are redirected to their dashboard
  return "/dashboard";
};

const Auth = ({ mode = "login" }: AuthProps) => {
  const isLogin = mode === "login";
  const isForgot = mode === "forgot";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isOAuthLoading, setIsOAuthLoading] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [canAutoSignup, setCanAutoSignup] = useState(false);

  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get("redirect");
  const { toast } = useToast();

  const doRedirect = useCallback(async (userId: string) => {
    if (redirect) {
      navigate(redirect);
      return;
    }
    const target = await resolveDefaultRedirect(userId);
    navigate(target);
  }, [redirect, navigate]);

  // Check for redirect result from Firebase Auth (when popup is blocked or redirect is used)
  useEffect(() => {
    let isSubscribed = true;
    const checkRedirect = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (!isSubscribed || !result?.user?.email) return;

        const email = result.user.email;
        toast({
          title: "Zalogowano przez Google!",
          description: `Witaj, ${result.user.displayName || email}!`,
        });
        await doRedirect(result.user.uid);
      } catch (err: unknown) {
        console.warn("Redirect auth result error:", err);
      }
    };
    checkRedirect();
    return () => {
      isSubscribed = false;
    };
  }, [doRedirect, toast]);

  // If already logged in when landing on the page, respect redirect / role.
  useEffect(() => {
    if (user && !isForgot) {
      doRedirect(user.id);
    }
  }, [user, isForgot, doRedirect]);

  const handleQuickStudioLogin = async (targetEmail: string, role: 'admin' | 'traveler' = 'traveler') => {
    setIsLoading(true);
    try {
      // Placeholder retained for the Apple button. Apple sign-in itself is not
      // configured yet, so it must never create an artificial local session.
      throw new Error(`Logowanie ${targetEmail} nie jest jeszcze skonfigurowane.`);
    } catch (e) {
      toast({
        title: "Błąd logowania",
        description: String(e),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsOAuthLoading("google");
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      
      let googleUserEmail: string | null = null;
      let googleDisplayName: string | null = null;

      try {
        const result = await signInWithPopup(auth, provider);
        googleUserEmail = result.user?.email ?? null;
        googleDisplayName = result.user?.displayName ?? null;
      } catch (popupErr: unknown) {
        const error = popupErr as { code?: string; message?: string };
        console.warn("Firebase popup error:", error?.code, error?.message);

        if (error?.code === "auth/popup-closed-by-user" || error?.code === "auth/cancelled-popup-request") {
          toast({ title: "Anulowano logowanie Google", description: "Okno logowania zostało zamknięte." });
          return;
        }

        if (error?.code === "auth/popup-blocked") {
          // If popup is blocked by adblock / browser protection, try full-page redirect
          toast({
            title: "Zablokowano wyskakujące okno",
            description: "Przekierowujemy do strony logowania Google...",
          });
          await signInWithRedirect(auth, provider);
          return;
        }

        throw popupErr;
      }

      if (googleUserEmail) {
        toast({
          title: "Zalogowano przez Google!",
          description: `Witaj, ${googleDisplayName || googleUserEmail}!`,
        });
        await doRedirect(auth.currentUser?.uid || "");
      }
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string };
      console.error("Google sign-in overall error:", error);

      if (error?.code === "auth/popup-blocked") {
        toast({
          title: "Zablokowano wyskakujące okno",
          description: "Przeglądarka (np. Brave Shield / AdBlock) zablokowała okienko Google. Zezwól na wyskakujące okienka lub zaloguj się e-mailem i hasłem.",
          variant: "destructive",
        });
      } else if (error?.code === "auth/invalid-credential" || error?.message?.includes("client secret")) {
        toast({
          title: "Błędny Client Secret w Firebase",
          description: "W konsoli Firebase (Sign-in method -> Google) skonfigurowano nieprawidłowy lub wygasły klucz tajny klienta (Client Secret). Zaloguj się adresem e-mail i hasłem.",
          variant: "destructive",
        });
      } else if (error?.code === "auth/unauthorized-domain") {
        toast({
          title: "Domena w trakcie autoryzacji",
          description: "Wprowadzone w Firebase domeny mogą potrzebować kilku minut na propagację w Google Cloud. Zaloguj się hasłem powyżej.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Błąd logowania Google",
          description: error?.message || "Nie udało się zalogować przez Google. Użyj formularza e-mail i hasło.",
          variant: "destructive",
        });
      }
    } finally {
      setIsOAuthLoading(null);
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    const cleanEmail = email.trim();

    const emailResult = emailSchema.safeParse(cleanEmail);
    if (!emailResult.success) newErrors.email = emailResult.error.issues[0].message;

    if (!isForgot) {
      const passwordResult = passwordSchema.safeParse(password);
      if (!passwordResult.success) newErrors.password = passwordResult.error.issues[0].message;
    }

    if (!isLogin && !isForgot) {
      const fnResult = firstNameSchema.safeParse(firstName.trim());
      if (!fnResult.success) newErrors.firstName = fnResult.error.issues[0].message;
      const lnResult = lastNameSchema.safeParse(lastName.trim());
      if (!lnResult.success) newErrors.lastName = lnResult.error.issues[0].message;
      if (password !== passwordConfirm) {
        newErrors.passwordConfirm = "Hasła nie są takie same";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAutoRegister = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password || password.length < 8) {
      navigate(`/rejestracja?email=${encodeURIComponent(cleanEmail)}`);
      return;
    }

    setIsLoading(true);
    setServerError(null);

    try {
      const credential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      await updateProfile(credential.user, { displayName: cleanEmail.split("@")[0] });
      await sendEmailVerification(credential.user, { url: `${window.location.origin}${redirect ?? "/dashboard"}` });
      toast({ title: "Konto utworzone!", description: "Wysłaliśmy link weryfikacyjny na Twój adres e-mail." });
      await doRedirect(credential.user.uid);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Spróbuj ponownie.";
      setServerError(message);
      toast({ title: "Błąd rejestracji", description: message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickReset = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) return;

    setIsLoading(true);
    try {
      await sendPasswordResetEmail(auth, cleanEmail, { url: `${window.location.origin}/reset-password`, handleCodeInApp: true });
      setResetSent(true);
      toast({ title: "Wysłano link do resetu!", description: `Sprawdź skrzynkę ${cleanEmail}.` });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    setCanAutoSignup(false);
    if (!validateForm()) return;

    setIsLoading(true);
    const cleanEmail = email.trim().toLowerCase();

    try {
      if (isForgot) {
        await sendPasswordResetEmail(auth, cleanEmail, {
          url: `${window.location.origin}/reset-password`,
          handleCodeInApp: true,
        });
        setResetSent(true);
        toast({ title: "Wysłano e-mail!", description: "Sprawdź skrzynkę odbiorczą, aby dokończyć resetowanie hasła." });
      } else if (isLogin) {
        const credential = await signInWithEmailAndPassword(auth, cleanEmail, password);
        toast({ title: "Zalogowano!", description: "Witaj z powrotem." });
        await doRedirect(credential.user.uid);
      } else {
        const cleanFirstName = firstName.trim();
        const cleanLastName = lastName.trim();
        const displayName = `${cleanFirstName} ${cleanLastName}`.trim();
        const credential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        await updateProfile(credential.user, { displayName });
        await sendEmailVerification(credential.user, { url: `${window.location.origin}${redirect ?? "/dashboard"}` });
        toast({ title: "Konto utworzone!", description: "Sprawdź e-mail, aby potwierdzić adres." });
        await doRedirect(credential.user.uid);
      }
    } catch (error: unknown) {
      const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
      const description = code === "auth/invalid-credential"
        ? "Nieprawidłowy e-mail lub hasło."
        : code === "auth/email-already-in-use"
          ? "Ten adres e-mail jest już zarejestrowany."
          : code === "auth/too-many-requests"
            ? "Zbyt wiele prób. Odczekaj chwilę i spróbuj ponownie."
            : "Wystąpił nieoczekiwany błąd. Spróbuj ponownie.";
      setServerError(description);
      setCanAutoSignup(code === "auth/invalid-credential");
      toast({ title: "Błąd uwierzytelniania", description, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  // Google must return to the login route. This route observes Firebase Auth
  // and then applies the intended destination (or the role default).
  const oauthRedirectUri = `${window.location.origin}/auth${
    redirect ? `?redirect=${encodeURIComponent(redirect)}` : ""
  }`;
  const switchTo = isLogin ? "/rejestracja" : "/logowanie";
  const switchLink = redirect ? `${switchTo}?redirect=${encodeURIComponent(redirect)}` : switchTo;

  const pageTitle = isForgot 
    ? "Odzyskiwanie hasła — Podróżówka" 
    : isLogin 
    ? "Zaloguj się — Podróżówka" 
    : "Załóż konto — Podróżówka";

  const canonical = publicPageUrl(isForgot ? "/odzyskiwanie-hasla" : isLogin ? "/logowanie" : "/rejestracja");

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={isForgot ? "Odzyskaj dostęp do swojego konta Podróżówka." : isLogin ? "Zaloguj się do Podróżówki i zarządzaj swoimi pocztówkami, zamówieniami i statystykami podróży." : "Załóż konto w Podróżówce i dołącz do społeczności polskich podróżników wręczających odwrócone pocztówki."} />
        <link rel="canonical" href={canonical} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={isForgot ? "Resetowanie hasła do konta Podróżówka." : isLogin ? "Zaloguj się do swojego konta Podróżówka." : "Dołącz do społeczności podróżników Podróżówki."} />
        <meta property="og:url" content={canonical} />
      </Helmet>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <a href="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6">
          <ArrowLeft className="w-4 h-4" />Powrót do strony głównej
        </a>

        <div className="bg-card rounded-2xl shadow-card p-8">
          <div className="text-center mb-8">
            <h1 className="font-display text-2xl font-bold text-foreground mb-2">
              {isForgot ? "Odzyskiwanie hasła" : isLogin ? "Zaloguj się" : "Dołącz do społeczności"}
            </h1>
            <p className="text-muted-foreground text-sm">
              {isForgot 
                ? "Wprowadź swój adres e-mail, aby otrzymać instrukcję resetowania hasła." 
                : isLogin 
                ? "Wróć do swojego konta Podróżówka" 
                : "Utwórz konto i zacznij kupować Podróżówki"}
            </p>
          </div>

          {isForgot && resetSent ? (
            <div className="text-center py-4 space-y-4">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
              <p className="text-sm text-foreground font-medium">
                Link do resetowania hasła został wysłany na adres: <span className="font-bold">{email}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Sprawdź swoją skrzynkę odbiorczą (oraz folder SPAM) i kliknij w otrzymany link.
              </p>
              <Button asChild variant="outline" className="w-full mt-4">
                <Link to="/logowanie">Powrót do logowania</Link>
              </Button>
            </div>
          ) : (
            <>
              {/* Quick AI Studio 1-click login - REMOVED per user request */}

              <form onSubmit={handleSubmit} className="space-y-4">
                {!isLogin && !isForgot && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">Imię</label>
                      <Input placeholder="Jan" value={firstName} onChange={(e) => setFirstName(e.target.value)} disabled={isLoading} />
                      {errors.firstName && <p className="text-sm text-destructive mt-1">{errors.firstName}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">Nazwisko</label>
                      <Input placeholder="Kowalski" value={lastName} onChange={(e) => setLastName(e.target.value)} disabled={isLoading} />
                      {errors.lastName && <p className="text-sm text-destructive mt-1">{errors.lastName}</p>}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input type="email" placeholder="twoj@email.pl" value={email} onChange={(e) => { setEmail(e.target.value); setServerError(null); }} className="pl-10" disabled={isLoading} />
                  </div>
                  {errors.email && <p className="text-sm text-destructive mt-1">{errors.email}</p>}
                </div>

                {!isForgot && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-sm font-medium text-foreground">Hasło</label>
                      {isLogin && (
                        <Link to="/odzyskiwanie-hasla" className="text-xs text-primary hover:underline font-medium">
                          Nie pamiętasz hasła?
                        </Link>
                      )}
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                      <Input
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => { setPassword(e.target.value); setServerError(null); setCanAutoSignup(false); }}
                        className="pl-10 pr-10"
                        disabled={isLoading}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {errors.password && <p className="text-sm text-destructive mt-1">{errors.password}</p>}
                  </div>
                )}

                {!isLogin && !isForgot && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Powtórz hasło</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                      <Input
                        type={showPasswordConfirm ? "text" : "password"}
                        placeholder="••••••••"
                        value={passwordConfirm}
                        onChange={(e) => { setPasswordConfirm(e.target.value); setServerError(null); }}
                        className="pl-10 pr-10"
                        disabled={isLoading}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPasswordConfirm(!showPasswordConfirm)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
                        tabIndex={-1}
                      >
                        {showPasswordConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {errors.passwordConfirm && <p className="text-sm text-destructive mt-1">{errors.passwordConfirm}</p>}
                  </div>
                )}

                {serverError && (
                  <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3.5 text-sm text-destructive animate-fade-in space-y-2.5">
                    <p className="font-medium leading-snug">{serverError}</p>
                    {isLogin && canAutoSignup && (
                      <div className="pt-1 flex flex-col gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={handleAutoRegister}
                          className="w-full text-xs font-semibold bg-background hover:bg-muted text-foreground border border-border shadow-xs"
                          disabled={isLoading}
                        >
                          <UserPlus className="w-3.5 h-3.5 mr-1.5 text-primary" />
                          Utwórz konto z tym adresem i hasłem (1 kliknięcie)
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={handleQuickReset}
                          className="w-full text-xs text-muted-foreground hover:text-foreground"
                          disabled={isLoading}
                        >
                          <KeyRound className="w-3.5 h-3.5 mr-1.5" />
                          Wyślij link do resetu hasła na {email || "ten e-mail"}
                        </Button>
                      </div>
                    )}
                    {isLogin && !canAutoSignup && (
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs pt-1">
                        <Link to="/odzyskiwanie-hasla" className="underline hover:text-foreground font-semibold">
                          Zresetuj hasło
                        </Link>
                        <span>•</span>
                        <Link to="/rejestracja" className="underline hover:text-foreground font-semibold">
                          Zarejestruj nowe konto
                        </Link>
                      </div>
                    )}
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{isForgot ? "Wysyłanie..." : isLogin ? "Logowanie..." : "Tworzenie konta..."}</>
                  ) : (
                    isForgot ? "Wyślij link do resetu" : isLogin ? "Zaloguj się" : "Utwórz konto"
                  )}
                </Button>
              </form>

              {!isForgot && (
                <>
                  <div className="relative my-6">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-border" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">lub kontynuuj przez</span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      disabled={isLoading || !!isOAuthLoading}
                      onClick={handleGoogleLogin}
                    >
                      {isOAuthLoading === "google" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : (
                        <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                      )}
                      Google
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      disabled={isLoading || !!isOAuthLoading}
                      onClick={async () => {
                        setIsOAuthLoading("apple");
                        try {
                          await handleQuickStudioLogin("user.apple@podrozowka.pl", "traveler");
                        } finally {
                          setIsOAuthLoading(null);
                        }
                      }}
                    >
                      {isOAuthLoading === "apple" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : (
                        <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
                      )}
                      Apple
                    </Button>
                  </div>
                </>
              )}

              <div className="mt-6 text-center">
                <p className="text-sm text-muted-foreground">
                  {isForgot ? (
                    <Link to="/logowanie" className="text-primary font-medium hover:underline">
                      Wróć do logowania
                    </Link>
                  ) : (
                    <>
                      {isLogin ? "Nie masz konta?" : "Masz już konto?"}{" "}
                      <Link to={switchLink} className="text-primary font-medium hover:underline">
                        {isLogin ? "Zarejestruj się" : "Zaloguj się"}
                      </Link>
                    </>
                  )}
                </p>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default Auth;

