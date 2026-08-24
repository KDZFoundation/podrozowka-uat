import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import { Lock, ArrowLeft, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { auth } from "@/integrations/firebase/config";
import { z } from "zod";

const passwordSchema = z.string().min(8, "Hasło musi mieć minimum 8 znaków");

const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sessionChecked, setSessionChecked] = useState(false);
  const [hasValidSession, setHasValidSession] = useState(false);
  const [oobCode, setOobCode] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("oobCode");
    if (!code) {
      setSessionChecked(true);
      return;
    }
    void verifyPasswordResetCode(auth, code)
      .then(() => { setOobCode(code); setHasValidSession(true); })
      .catch(() => setHasValidSession(false))
      .finally(() => setSessionChecked(true));
  }, []);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    const passwordResult = passwordSchema.safeParse(password);
    if (!passwordResult.success) newErrors.password = passwordResult.error.issues[0].message;
    if (password !== passwordConfirm) newErrors.passwordConfirm = "Hasła nie są takie same";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!oobCode || !validate()) return;
    setIsLoading(true);
    try {
      await confirmPasswordReset(auth, oobCode, password);
      setIsSuccess(true);
      toast({ title: "Hasło zmienione!", description: "Możesz się teraz zalogować za pomocą nowego hasła." });
      setTimeout(() => navigate("/logowanie"), 2500);
    } catch {
      toast({ title: "Błąd zmiany hasła", description: "Link wygasł lub nie można było zmienić hasła.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Helmet><title>Ustaw nowe hasło — Podróżówka</title><meta name="description" content="Ustaw nowe hasło do konta Podróżówka." /></Helmet>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <Link to="/logowanie" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6"><ArrowLeft className="w-4 h-4" /> Powrót do logowania</Link>
        <div className="bg-card rounded-2xl shadow-card p-8">
          <div className="text-center mb-8"><h1 className="font-display text-2xl font-bold text-foreground mb-2">Ustaw nowe hasło</h1><p className="text-muted-foreground text-sm">Wprowadź swoje nowe bezpieczne hasło do konta.</p></div>
          {!sessionChecked ? <div className="flex items-center justify-center py-8"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
            : !hasValidSession && !isSuccess ? <div className="text-center py-6 space-y-4"><AlertCircle className="w-12 h-12 text-amber-500 mx-auto" /><p className="text-sm text-muted-foreground">Link do resetowania hasła wygasł lub jest nieprawidłowy. Wygeneruj nowy link.</p><Button asChild className="w-full"><Link to="/odzyskiwanie-hasla">Przejdź do odzyskiwania hasła</Link></Button></div>
              : isSuccess ? <div className="text-center py-6 space-y-4"><CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" /><p className="text-sm text-foreground font-medium">Hasło zostało pomyślnie zmienione!</p><p className="text-xs text-muted-foreground">Za chwilę nastąpi przekierowanie do strony logowania...</p><Button asChild className="w-full"><Link to="/logowanie">Zaloguj się nowym hasłem</Link></Button></div>
                : <form onSubmit={handleSubmit} className="space-y-4">
                  <div><label className="block text-sm font-medium text-foreground mb-1.5">Nowe hasło</label><div className="relative"><Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" /><Input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-10" disabled={isLoading} /></div>{errors.password && <p className="text-sm text-destructive mt-1">{errors.password}</p>}</div>
                  <div><label className="block text-sm font-medium text-foreground mb-1.5">Powtórz nowe hasło</label><div className="relative"><Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" /><Input type="password" placeholder="••••••••" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} className="pl-10" disabled={isLoading} /></div>{errors.passwordConfirm && <p className="text-sm text-destructive mt-1">{errors.passwordConfirm}</p>}</div>
                  <Button type="submit" className="w-full" disabled={isLoading}>{isLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Zapisywanie nowego hasła...</> : "Zapisz nowe hasło"}</Button>
                </form>}
        </div>
      </motion.div>
    </div>
  );
};

export default ResetPassword;
