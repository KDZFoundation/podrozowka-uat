import { useState } from "react";
import { ArrowRightLeft, CheckCircle2, AlertTriangle, Loader2, Database, Flame, RefreshCw, Sparkles } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  migrateFromSupabaseToFirestore,
  type MigrationOverallResult,
} from "@/integrations/firebase/services/supabaseToFirestoreMigrator";
import { seedFirestoreIfEmpty } from "@/integrations/firebase/services/seedService";
import { isFirebaseConfigured } from "@/integrations/firebase/config";

export const AdminDataMigration = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [currentAction, setCurrentAction] = useState<string>("");
  const [lastResult, setLastResult] = useState<MigrationOverallResult | null>(null);

  const handleSeedStarterData = async () => {
    setIsSeeding(true);
    try {
      const res = await seedFirestoreIfEmpty();
      if (res.seeded) {
        toast.success(res.message);
      } else {
        toast.info(res.message);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Błąd inicjalizacji: ${msg}`);
    } finally {
      setIsSeeding(false);
    }
  };

  const handleStartMigration = async () => {
    if (!isFirebaseConfigured) {
      toast.error("Firebase nie jest skonfigurowany.");
      return;
    }

    setIsRunning(true);
    setProgressPercent(0);
    setCurrentAction("Rozpoczynanie synchronizacji...");

    try {
      const result = await migrateFromSupabaseToFirestore((table, index, total, msg) => {
        const percent = Math.round((index / total) * 100);
        setProgressPercent(percent);
        setCurrentAction(`[${index}/${total}] ${msg}`);
      });

      setLastResult(result);
      if (result.success) {
        toast.success(`Zmigrowano pomyślnie ${result.totalMigrated} rekordów do Firestore!`);
      } else {
        toast.warning("Migracja zakończona, ale nie znaleziono rekordów lub wystąpiły błędy.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Błąd migracji: ${msg}`);
    } finally {
      setIsRunning(false);
      setCurrentAction("");
    }
  };

  return (
    <Card className="border-amber-500/40 shadow-lg bg-gradient-to-br from-amber-500/5 via-background to-transparent">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2.5 text-lg font-bold text-foreground">
            <ArrowRightLeft className="w-5 h-5 text-amber-500" />
            Migracja Danych: Supabase &rarr; Firebase Firestore
          </CardTitle>
          <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30">
            Google Cloud Firestore
          </Badge>
        </div>
        <CardDescription>
          Narzędzie automatycznie pobiera wszystkie istniejące dane (wzory kartek, kraje, kategorie, autorzy, zamówienia, profile) z bazy Supabase i bezpiecznie zapisuje je do bazy Google Cloud Firestore.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-lg border bg-card/60 space-y-1">
            <div className="font-semibold text-muted-foreground flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-emerald-500" /> Źródło (Supabase)
            </div>
            <div className="text-foreground font-mono truncate">Tabela: categories, countries, card_designs, orders...</div>
          </div>
          <div className="p-3 rounded-lg border bg-card/60 space-y-1">
            <div className="font-semibold text-muted-foreground flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-amber-500" /> Cel (Google Cloud Firestore)
            </div>
            <div className="text-foreground font-mono truncate">Kolekcje Firestore (ai-studio-podrozowkauat)</div>
          </div>
        </div>

        {isRunning && (
          <div className="space-y-2 p-3.5 rounded-lg border bg-amber-500/10 border-amber-500/30 animate-pulse">
            <div className="flex justify-between text-xs font-semibold text-amber-800 dark:text-amber-300">
              <span className="truncate max-w-[80%]">{currentAction}</span>
              <span>{progressPercent}%</span>
            </div>
            <Progress value={progressPercent} className="h-2 bg-amber-200 dark:bg-amber-950" />
          </div>
        )}

        {lastResult && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-foreground flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                Podsumowanie ostatniej migracji:
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                Zmigrowano łącznie: <strong className="text-foreground">{lastResult.totalMigrated}</strong> rekordów
              </span>
            </div>

            <div className="max-h-48 overflow-y-auto rounded-lg border text-xs divide-y bg-card">
              {lastResult.tables.map((t) => (
                <div key={t.table} className="p-2 flex items-center justify-between hover:bg-muted/40">
                  <span className="font-mono">{t.table}</span>
                  <div className="flex items-center gap-2">
                    {t.status === "success" && (
                      <Badge variant="secondary" className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                        {t.count} rekordów
                      </Badge>
                    )}
                    {t.status === "skipped" && (
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        pominięto (pusta)
                      </Badge>
                    )}
                    {t.status === "error" && (
                      <Badge variant="destructive" className="text-xs">
                        {t.error || "błąd"}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 border-t pt-4">
        <span className="text-xs text-muted-foreground">
          Dane są zapisywane w Firestore z opcją <code>merge: true</code> (bezpieczne nadpisywanie).
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleSeedStarterData}
            disabled={isSeeding || isRunning || !isFirebaseConfigured}
            className="border-primary/30 hover:bg-primary/5 text-primary text-xs font-medium"
          >
            {isSeeding ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Inicjalizacja...
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                Zainicjuj dane startowe Firestore
              </>
            )}
          </Button>
          <Button
            onClick={handleStartMigration}
            disabled={isRunning || isSeeding || !isFirebaseConfigured}
            className="bg-amber-600 hover:bg-amber-700 text-white font-medium"
          >
            {isRunning ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Migracja w toku...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Uruchom pełną migrację z Supabase do Firestore
              </>
            )}
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
};
