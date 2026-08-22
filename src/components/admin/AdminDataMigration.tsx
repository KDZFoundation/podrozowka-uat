import { ArrowRightLeft, Database, FileJson, Flame, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * Migration is deliberately not executable from the browser. A browser-side
 * Supabase -> Firestore copy can be interrupted mid-way and expose too much
 * operational access. The documented local ETL is the only migration path.
 */
export const AdminDataMigration = () => (
  <Card className="border-amber-500/40 shadow-lg bg-gradient-to-br from-amber-500/5 via-background to-transparent">
    <CardHeader>
      <div className="flex items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2.5 text-lg font-bold text-foreground">
          <ArrowRightLeft className="w-5 h-5 text-amber-500" />
          Migracja danych do Firestore
        </CardTitle>
        <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-700">
          Tylko lokalnie
        </Badge>
      </div>
      <CardDescription>
        Migracji nie uruchamiamy z panelu administracyjnego. Najpierw tworzymy i sprawdzamy lokalny eksport, a dopiero potem importujemy go do Firestore.
      </CardDescription>
    </CardHeader>

    <CardContent className="space-y-4 text-sm">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border bg-card/60 p-3">
          <FileJson className="mb-2 h-4 w-4 text-amber-600" />
          <p className="font-semibold">1. Eksport</p>
          <p className="mt-1 text-xs text-muted-foreground">Pobieramy dane źródłowe z Supabase do pliku JSON.</p>
        </div>
        <div className="rounded-lg border bg-card/60 p-3">
          <Database className="mb-2 h-4 w-4 text-amber-600" />
          <p className="font-semibold">2. Walidacja</p>
          <p className="mt-1 text-xs text-muted-foreground">Lokalny migrator sprawdza pola, obrazy i liczbę dokumentów.</p>
        </div>
        <div className="rounded-lg border bg-card/60 p-3">
          <Flame className="mb-2 h-4 w-4 text-amber-600" />
          <p className="font-semibold">3. Import</p>
          <p className="mt-1 text-xs text-muted-foreground">Najpierw emulator, następnie ręcznie zatwierdzony import UAT.</p>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        <span>
          Pierwszy przygotowany zakres to <code>card_designs</code> wraz z galerią <code>card_design_images</code>. Dokumentacja i migrator znajdują się lokalnie w repozytorium.
        </span>
      </div>
    </CardContent>
  </Card>
);
