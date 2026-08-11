import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle2, XCircle, AlertTriangle, CreditCard, Banknote } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { useQueryClient } from "@tanstack/react-query";

type SecretStatus = {
  name: string;
  set: boolean;
  length: number;
  preview: string;
};

type StatusResponse = {
  p24_mode: "sandbox" | "production";
  p24_mode_updated_at: string | null;
  secrets: SecretStatus[];
  all_secrets_set: boolean;
};

const AdminPaymentSettings = () => {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [togglingCod, setTogglingCod] = useState(false);
  const [savingCredentials, setSavingCredentials] = useState(false);
  const [credentialForm, setCredentialForm] = useState({
    merchantId: "",
    posId: "",
    apiKey: "",
    crcKey: "",
    reportKey: "",
  });
  const { flags } = useFeatureFlags();
  const queryClient = useQueryClient();

  const load = useCallback(async () => {
    setLoading(true);
    const { data: res, error } = await supabase.functions.invoke<StatusResponse>(
      "admin-payment-status",
      { method: "GET" },
    );
    if (error) {
      toast.error("Nie udało się pobrać statusu płatności");
    } else if (res) {
      setData(res);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleMode = async (nextIsProduction: boolean) => {
    if (!data) return;
    const nextMode = nextIsProduction ? "production" : "sandbox";
    setSaving(true);
    const { data: res, error } = await supabase.functions.invoke<StatusResponse>(
      "admin-payment-status",
      { method: "POST", body: { p24_mode: nextMode } },
    );
    setSaving(false);
    if (error || !res) {
      toast.error("Nie udało się zmienić trybu");
      return;
    }
    setData(res);
    toast.success(
      nextMode === "production"
        ? "Przełączono na PRODUKCJĘ"
        : "Przełączono na SANDBOX",
    );
  };

  const saveCredentials = async () => {
    const merchantId = credentialForm.merchantId.trim();
    const posId = credentialForm.posId.trim();
    const apiKey = credentialForm.apiKey.trim();
    const crcKey = credentialForm.crcKey.trim();
    const reportKey = credentialForm.reportKey.trim();

    if (!merchantId || !/^\d{1,20}$/.test(merchantId)) {
      toast.error("Podaj poprawny numer ID Przelewy24");
      return;
    }
    if (posId && !/^\d{1,20}$/.test(posId)) {
      toast.error("POS ID może zawierać wyłącznie cyfry");
      return;
    }
    if (!apiKey || !crcKey) {
      toast.error("Podaj klucz do zamówień oraz klucz CRC");
      return;
    }

    setSavingCredentials(true);
    const { data: res, error } = await supabase.functions.invoke<StatusResponse>(
      "admin-payment-status",
      {
        method: "POST",
        body: {
          credentials: {
            merchant_id: merchantId,
            ...(posId ? { pos_id: posId } : {}),
            api_key: apiKey,
            crc_key: crcKey,
            ...(reportKey ? { report_key: reportKey } : {}),
          },
        },
      },
    );
    setSavingCredentials(false);

    if (error || !res) {
      toast.error("Nie udało się zapisać danych Przelewy24");
      return;
    }
    setCredentialForm({ merchantId: "", posId: "", apiKey: "", crcKey: "", reportKey: "" });
    setData(res);
    toast.success("Dane Przelewy24 zapisane w Supabase");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!data) return null;

  const isProduction = data.p24_mode === "production";

  const toggleCodFlag = async (enabled: boolean) => {
    setTogglingCod(true);
    const { error } = await supabase
      .from("feature_flags")
      .upsert({ key: "cod_payment_enabled", is_enabled: enabled, name: "Płatność Za Pobraniem (COD)", description: "Udostępnia opcję opłacenia zamówienia przy odbiorze" });

    setTogglingCod(false);
    if (error) {
      toast.error("Nie udało się zmienić statusu płatności COD");
    } else {
      toast.success(enabled ? "Płatność za pobraniem (COD) została WŁĄCZONA" : "Płatność za pobraniem (COD) została WYŁĄCZONA");
      queryClient.invalidateQueries({ queryKey: ["feature-flags"] });
      queryClient.invalidateQueries({ queryKey: ["admin-feature-flags"] });
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
          <CreditCard className="w-6 h-6 text-primary" />
          Ustawienia płatności
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Zarządzanie trybem bramki Przelewy24 oraz weryfikacja skonfigurowanych sekretów.
        </p>
      </div>

      {/* Mode toggle */}
      <div className="bg-card rounded-xl p-6 shadow-soft border border-border">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-display text-lg font-semibold text-foreground">
              Środowisko Przelewy24
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {isProduction
                ? "Aktywne: PRODUKCJA — realne transakcje."
                : "Aktywne: SANDBOX — środowisko testowe."}
            </p>
            {data.p24_mode_updated_at && (
              <p className="text-xs text-muted-foreground mt-2">
                Ostatnia zmiana: {new Date(data.p24_mode_updated_at).toLocaleString("pl-PL")}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span
              className={`text-xs font-semibold px-2 py-1 rounded ${
                isProduction
                  ? "bg-primary/10 text-primary"
                  : "bg-[hsl(var(--gold))]/10 text-[hsl(var(--gold))]"
              }`}
            >
              {isProduction ? "PRODUKCJA" : "SANDBOX"}
            </span>
            <Switch
              checked={isProduction}
              onCheckedChange={toggleMode}
              disabled={saving}
              aria-label="Przełącznik środowiska P24"
            />
          </div>
        </div>

        {isProduction && (
          <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-destructive/5 border border-destructive/20 text-sm text-destructive">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Tryb produkcyjny — użytkownicy będą obciążani realnymi kwotami. Upewnij się, że sekrety P24 pochodzą z konta produkcyjnego.
            </span>
          </div>
        )}
      </div>

      {/* COD Payment Toggle */}
      <div className="bg-card rounded-xl p-6 shadow-soft border border-border">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
              <Banknote className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-display text-lg font-semibold text-foreground">
                Płatność Za Pobraniem (COD)
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Udostępnia lub ukrywa możliwość wyboru płatności przy odbiorze w koszyku zamówienia.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span
              className={`text-xs font-semibold px-2.5 py-1 rounded ${
                flags.cod_payment_enabled
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {flags.cod_payment_enabled ? "WŁĄCZONE" : "WYŁĄCZONE"}
            </span>
            <Switch
              checked={flags.cod_payment_enabled}
              onCheckedChange={toggleCodFlag}
              disabled={togglingCod}
              aria-label="Przełącznik płatności COD"
            />
          </div>
        </div>
      </div>

      {/* Secrets status */}
      <div className="bg-card rounded-xl p-6 shadow-soft border border-border">
        <div className="mb-4">
          <h3 className="font-display text-lg font-semibold text-foreground">Dane Przelewy24</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Wpisz dane z panelu Przelewy24. Zostaną zapisane przez chronioną funkcję backendową w Supabase;
            po zapisaniu nie są ponownie wyświetlane w przeglądarce.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="p24-merchant-id">ID (Merchant ID) *</Label>
            <Input id="p24-merchant-id" inputMode="numeric" value={credentialForm.merchantId}
              onChange={(e) => setCredentialForm((f) => ({ ...f, merchantId: e.target.value }))}
              placeholder="np. 123456" autoComplete="off" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="p24-pos-id">POS ID (opcjonalnie)</Label>
            <Input id="p24-pos-id" inputMode="numeric" value={credentialForm.posId}
              onChange={(e) => setCredentialForm((f) => ({ ...f, posId: e.target.value }))}
              placeholder="Jeśli puste, użyjemy ID" autoComplete="off" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="p24-api-key">Klucz do zamówień (API) *</Label>
            <Input id="p24-api-key" type="password" value={credentialForm.apiKey}
              onChange={(e) => setCredentialForm((f) => ({ ...f, apiKey: e.target.value }))}
              placeholder="Wklej klucz API" autoComplete="new-password" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="p24-crc-key">Klucz do CRC *</Label>
            <Input id="p24-crc-key" type="password" value={credentialForm.crcKey}
              onChange={(e) => setCredentialForm((f) => ({ ...f, crcKey: e.target.value }))}
              placeholder="Wklej klucz CRC" autoComplete="new-password" />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="p24-report-key">Klucz do raportów (opcjonalnie)</Label>
            <Input id="p24-report-key" type="password" value={credentialForm.reportKey}
              onChange={(e) => setCredentialForm((f) => ({ ...f, reportKey: e.target.value }))}
              placeholder="Wklej, jeśli korzystasz z raportów P24" autoComplete="new-password" />
          </div>
        </div>
        <div className="mt-5 flex justify-end">
          <button type="button" className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            onClick={saveCredentials} disabled={savingCredentials}>
            {savingCredentials && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Zapisz dane Przelewy24
          </button>
        </div>
      </div>

      <div className="bg-card rounded-xl p-6 shadow-soft border border-border">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg font-semibold text-foreground">
            Sekrety P24
          </h3>
          {data.all_secrets_set ? (
            <span className="text-xs font-semibold px-2 py-1 rounded bg-accent/10 text-accent flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              Komplet
            </span>
          ) : (
            <span className="text-xs font-semibold px-2 py-1 rounded bg-destructive/10 text-destructive flex items-center gap-1">
              <XCircle className="w-3 h-3" />
              Brakuje wartości
            </span>
          )}
        </div>

        <div className="space-y-2">
          {data.secrets.map((s) => (
            <div
              key={s.name}
              className="flex items-center justify-between gap-3 p-3 rounded-lg bg-background border border-border"
            >
              <div className="flex items-center gap-3 min-w-0">
                {s.set ? (
                  <CheckCircle2 className="w-4 h-4 text-accent shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-destructive shrink-0" />
                )}
                <span className="font-mono text-sm text-foreground truncate">{s.name}</span>
              </div>
              <div className="text-xs text-muted-foreground font-mono shrink-0">
                {s.set ? (
                  <>
                    <span className="tracking-wider">{s.preview || "•••"}</span>
                    <span className="ml-2 text-muted-foreground/70">({s.length} zn.)</span>
                  </>
                ) : (
                  <span className="text-destructive">nie ustawiono</span>
                )}
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground mt-4">
          Wartości sekretów nie są widoczne — pokazujemy jedynie ostatnie znaki i długość. Aktualizacja sekretów odbywa się bezpiecznie po stronie backendu.
        </p>
      </div>
    </div>
  );
};

export default AdminPaymentSettings;
