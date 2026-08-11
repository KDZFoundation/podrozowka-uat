import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import { Mail, Lock, User, ArrowLeft, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { z } from "zod";

const emailSchema = z.string().email("Podaj prawidłowy adres email");
const passwordSchema = z.string().min(8, "Hasło musi mieć minimum 8 znaków");
const firstNameSchema = z.string().min(1, "Podaj imię").max(50);
const lastNameSchema = z.string().min(1, "Podaj nazwisko").max(50);

interface AuthProps {
  mode?: "login" | "signup" | "forgot";
}

const resolveDefaultRedirect = async (userId: string): Promise<string> => {
  const { data: { session } } = await supabase.auth.getSession();
  const userEmail = session?.user?.email;
  if (userEmail && (
    userEmail.toLowerCase() === 'dariusz.pgry@gmail.com' || 
    userEmail.toLowerCase() === 'fundacja@konopiedlaziemi.org'
  )) {
    return "/dashboard";
  }

  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  
  const roles = data ? data.map(r => r.role) : [];
  return roles.includes("admin") ? "/dashboard" : "/";
};

const Auth = ({ mode = "login" }: AuthProps) => {
  const isLogin = mode === "login";
  const isForgot = mode === "forgot";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isOAuthLoading, setIsOAuthLoading] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

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

  // If already logged in when landing on the page, respect redirect / role.
  useEffect(() => {
    if (user && !isForgot) {
      doRedirect(user.id);
    }
  }, [user, isForgot, doRedirect]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    const emailResult = emailSchema.safeParse(email);
    if (!emailResult.success) newErrors.email = emailResult.error.issues[0].message;

    if (!isForgot) {
      const passwordResult = passwordSchema.safeParse(password);
      if (!passwordResult.success) newErrors.password = passwordResult.error.issues[0].message;
    }

    if (!isLogin && !isForgot) {
      const fnResult = firstNameSchema.safeParse(firstName);
      if (!fnResult.success) newErrors.firstName = fnResult.error.issues[0].message;
      const lnResult = lastNameSchema.safeParse(lastName);
      if (!lnResult.success) newErrors.lastName = lnResult.error.issues[0].message;
      if (password !== passwordConfirm) {
        newErrors.passwordConfirm = "Hasła nie są takie same";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsLoading(true);

    try {
      if (isForgot) {
        const resetRedirectTo = `${window.location.origin}/reset-password`;
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: resetRedirectTo,
        });

        if (error) {
          console.error("Reset password error:", error.message);
          toast({
            title: "Błąd wysyłania e-maila",
            description: error.message || "Wystąpił błąd. Spróbuj ponownie.",
            variant: "destructive",
          });
        } else {
          setResetSent(true);
          toast({
            title: "Wysłano e-mail!",
            description: "Sprawdź skrzynkę odbiorczą, aby dokończyć resetowanie hasła.",
          });
        }
      } else if (isLogin) {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });

        if (error) {
          const description = error.message.includes("Invalid login credentials")
              ? "Nieprawidłowy e-mail lub hasło. Jeśli konto było tworzone przez Google/Apple, wybierz zaloguj przez Google/Apple lub zarejestruj konto."
              : error.message || "Wystąpił błąd podczas logowania. Spróbuj ponownie.";
          console.error("Login error:", error.message);
          toast({
            title: "Błąd logowania",
            description,
            variant: "destructive",
          });
        } else if (data.user) {
          toast({ title: "Zalogowano!", description: "Witaj z powrotem." });
          await doRedirect(data.user.id);
        }
      } else {
        const displayName = `${firstName} ${lastName}`.trim();
        const emailRedirectTo = `${window.location.origin}${redirect ?? "/"}`;
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo,
            data: {
              display_name: displayName,
              first_name: firstName,
              last_name: lastName,
            },
          },
        });

        if (error) {
          const description = error.message.includes("already registered")
              ? "Ten email jest już zarejestrowany."
              : "Wystąpił błąd podczas rejestracji. Spróbuj ponownie.";
          console.error("Signup error:", error.message);
          toast({
            title: "Błąd rejestracji",
            description,
            variant: "destructive",
          });
        } else {
          toast({ title: "Konto utworzone!", description: "Sprawdź email, aby potwierdzić konto." });
          if (data.session && data.user) {
            await doRedirect(data.user.id);
          }
        }
      }
    } catch {
      toast({ title: "Wystąpił błąd", description: "Spróbuj ponownie.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  // Google/Apple must return to the login route.  This route observes the
  // Supabase session and then applies the intended destination (or the role
  // default).  Returning straight to `/` left an authenticated visitor on the
  // landing page and made the OAuth flow appear not to have completed.
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

  const canonical = `https://podrozowka.lovable.app${isForgot ? "/odzyskiwanie-hasla" : isLogin ? "/logowanie" : "/rejestracja"}`;

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
                    <Input type="email" placeholder="twoj@email.pl" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-10" disabled={isLoading} />
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
                      <Input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-10" disabled={isLoading} />
                    </div>
                    {errors.password && <p className="text-sm text-destructive mt-1">{errors.password}</p>}
                  </div>
                )}

                {!isLogin && !isForgot && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Powtórz hasło</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                      <Input type="password" placeholder="••••••••" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} className="pl-10" disabled={isLoading} />
                    </div>
                    {errors.passwordConfirm && <p className="text-sm text-destructive mt-1">{errors.passwordConfirm}</p>}
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
                      onClick={async () => {
                        setIsOAuthLoading("google");
                        const { error } = await supabase.auth.signInWithOAuth({
                          provider: "google",
                          options: {
                            redirectTo: oauthRedirectUri,
                            queryParams: {
                              prompt: "select_account",
                            },
                          },
                        });
                        if (error) {
                          toast({ title: "Błąd logowania Google", description: String(error.message || error), variant: "destructive" });
                        }
                        setIsOAuthLoading(null);
                      }}
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
                        const { error } = await supabase.auth.signInWithOAuth({
                          provider: "apple",
                          options: {
                            redirectTo: oauthRedirectUri,
                          },
                        });
                        if (error) {
                          toast({ title: "Błąd logowania Apple", description: String(error.message || error), variant: "destructive" });
                        }
                        setIsOAuthLoading(null);
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

