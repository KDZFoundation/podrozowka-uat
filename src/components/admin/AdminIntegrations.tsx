import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  CreditCard,
  Truck,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  ExternalLink,
  ShieldCheck,
  PackageCheck,
  Building2,
  Mail,
  Info,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useFeatureFlags, FeatureFlagKey } from "@/hooks/useFeatureFlags";
import { useQueryClient } from "@tanstack/react-query";
import AdminPaymentSettings from "@/components/admin/AdminPaymentSettings";
import AdminInpostSettings from "@/components/admin/AdminInpostSettings";

interface IntegrationSecretStatus {
  name: string;
  set: boolean;
  label: string;
  category: "p24" | "inpost" | "orlen" | "pocztex";
}

const AdminIntegrations = () => {
  const [activeSubTab, setActiveSubTab] = useState<"all" | "payments" | "inpost" | "orlen" | "pocztex">("all");
  const [togglingFlag, setTogglingFlag] = useState<string | null>(null);
  const [secretStatuses, setSecretStatuses] = useState<IntegrationSecretStatus[]>([]);
  const [loadingSecrets, setLoadingSecrets] = useState(true);

  const { flags } = useFeatureFlags();
  const queryClient = useQueryClient();

  const loadSecretsStatus = useCallback(async () => {
    setLoadingSecrets(true);
    // Fetch payment settings from edge function if available
    const { data: p24Data } = await supabase.functions.invoke("admin-payment-status", { method: "GET" }).catch(() => ({ data: null }));

    const inpostGeoToken = Boolean(import.meta.env.VITE_INPOST_GEOWIDGET_TOKEN);

    // List of monitored keys
    const statuses: IntegrationSecretStatus[] = [
      {
        name: "P24_MERCHANT_ID",
        label: "Przelewy24 Merchant ID",
        category: "p24",
        set: p24Data?.secrets?.find((s: { name: string; set: boolean }) => s.name === "P24_MERCHANT_ID")?.set ?? false,
      },
      {
        name: "P24_POS_ID",
        label: "Przelewy24 POS ID",
        category: "p24",
        set: p24Data?.secrets?.find((s: { name: string; set: boolean }) => s.name === "P24_POS_ID")?.set ?? false,
      },
      {
        name: "P24_API_KEY",
        label: "Przelewy24 Klucz API",
        category: "p24",
        set: p24Data?.secrets?.find((s: { name: string; set: boolean }) => s.name === "P24_API_KEY")?.set ?? false,
      },
      {
        name: "P24_CRC_KEY",
        label: "Przelewy24 Klucz CRC",
        category: "p24",
        set: p24Data?.secrets?.find((s: { name: string; set: boolean }) => s.name === "P24_CRC_KEY")?.set ?? false,
      },
      {
        name: "P24_REPORT_KEY",
        label: "Przelewy24 Klucz raportów",
        category: "p24",
        set: p24Data?.secrets?.find((s: { name: string; set: boolean }) => s.name === "P24_REPORT_KEY")?.set ?? false,
      },
      {
        name: "VITE_INPOST_GEOWIDGET_TOKEN",
        label: "InPost Geowidget Token (Frontend)",
        category: "inpost",
        set: inpostGeoToken,
      },
      {
        name: "INPOST_SHIPX_ORGANIZATION_ID",
        label: "InPost ShipX ID Organizacji",
        category: "inpost",
        set: false, // Will be set via Supabase secrets
      },
      {
        name: "INPOST_SHIPX_TOKEN",
        label: "InPost ShipX API Token",
        category: "inpost",
        set: false,
      },
      {
        name: "ORLEN_PACZKA_PARTNER_ID",
        label: "ORLEN Paczka Partner ID",
        category: "orlen",
        set: false,
      },
      {
        name: "ORLEN_PACZKA_API_KEY",
        label: "ORLEN Paczka Klucz API",
        category: "orlen",
        set: false,
      },
      {
        name: "POCZTEX_ENADAWCA_LOGIN",
        label: "Pocztex e-Nadawca Login",
        category: "pocztex",
        set: false,
      },
      {
        name: "POCZTEX_ENADAWCA_PASSWORD",
        label: "Pocztex e-Nadawca Hasło",
        category: "pocztex",
        set: false,
      },
    ];

    setSecretStatuses(statuses);
    setLoadingSecrets(false);
  }, []);

  useEffect(() => {
    loadSecretsStatus();
  }, [loadSecretsStatus]);

  const toggleFeature = async (key: FeatureFlagKey, enabled: boolean, name: string) => {
    setTogglingFlag(key);
    const { error } = await supabase
      .from("feature_flags")
      .upsert({
        key,
        is_enabled: enabled,
        name,
        description: `Włącza lub wyłącza integrację ${name} w koszyku`,
      });

    setTogglingFlag(null);

    if (error) {
      toast.error(`Nie udało się zmienić statusu integracji ${name}`);
    } else {
      toast.success(enabled ? `Integracja ${name} została WŁĄCZONA` : `Integracja ${name} została WYŁĄCZONA`);
      queryClient.invalidateQueries({ queryKey: ["feature-flags"] });
    }
  };

  const getCategorySecrets = (cat: "p24" | "inpost" | "orlen" | "pocztex") => {
    return secretStatuses.filter((s) => s.category === cat);
  };

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <PackageCheck className="w-6 h-6" />
          </div>
          <div>
            <h2 className="font-display text-2xl font-bold text-foreground">
              Integracje Płatności i Dostaw
            </h2>
            <p className="text-sm text-muted-foreground">
              Zarządzanie dostawcami usług płatności (Przelewy24, COD) oraz dostawcami kurierskimi (InPost, ORLEN Paczka, Pocztex).
            </p>
          </div>
        </div>
      </div>

      {/* Subtabs Filter */}
      <div className="flex gap-2 border-b border-border pb-3 overflow-x-auto">
        <button
          onClick={() => setActiveSubTab("all")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeSubTab === "all"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          Wszystkie integracje
        </button>
        <button
          onClick={() => setActiveSubTab("payments")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
            activeSubTab === "payments"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <CreditCard className="w-4 h-4" /> Płatności
        </button>
        <button
          onClick={() => setActiveSubTab("inpost")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
            activeSubTab === "inpost"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <Truck className="w-4 h-4" /> InPost
        </button>
        <button
          onClick={() => setActiveSubTab("orlen")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
            activeSubTab === "orlen"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <Building2 className="w-4 h-4" /> ORLEN Paczka
        </button>
        <button
          onClick={() => setActiveSubTab("pocztex")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
            activeSubTab === "pocztex"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <Mail className="w-4 h-4" /> Pocztex
        </button>
      </div>

      {/* Grid of integrations */}
      <div className="space-y-6">

        {/* 1. PRZELEWY24 & PŁATNOŚCI */}
        {(activeSubTab === "all" || activeSubTab === "payments") && (
          <div className="bg-card rounded-2xl p-6 border border-border shadow-soft space-y-6">
            <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-display text-lg font-semibold text-foreground flex items-center gap-2">
                    Bramka Płatności Przelewy24 & COD
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Obsługa płatności online (BLIK, przelewy, karty) oraz płatności przy odbiorze.
                  </p>
                </div>
              </div>
            </div>

            <AdminPaymentSettings />
          </div>
        )}

        {/* 2. INPOST */}
        {(activeSubTab === "all" || activeSubTab === "inpost") && (
          <div className="bg-card rounded-2xl p-6 border border-border shadow-soft space-y-6">
            <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-400 font-bold">
                  InP
                </div>
                <div>
                  <h3 className="font-display text-lg font-semibold text-foreground flex items-center gap-2">
                    InPost (Paczkomaty & Kurier ShipX)
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Wybór punktu odbioru za pomocą Geowidget oraz generowanie przesyłek i etykiet w API ShipX.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <span
                  className={`text-xs font-semibold px-2.5 py-1 rounded ${
                    flags.inpost_shipping_enabled
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {flags.inpost_shipping_enabled ? "AKTYWNA W KOSZYKU" : "WYŁĄCZONA"}
                </span>
                <Switch
                  checked={flags.inpost_shipping_enabled}
                  onCheckedChange={(v) => toggleFeature("inpost_shipping_enabled", v, "InPost")}
                  disabled={togglingFlag === "inpost_shipping_enabled"}
                  aria-label="Przełącznik InPost"
                />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-muted/40 border border-border space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">Środowisko API:</span>
                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold">
                    SANDBOX
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Domyślny punkt końcowy API: <code className="font-mono bg-background px-1 py-0.5 rounded text-[11px]">https://sandbox-api-shipx-pl.easypack24.net/v1</code>
                </p>
              </div>

              <div className="p-4 rounded-xl bg-muted/40 border border-border space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">Status Geowidgeta:</span>
                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold">
                    {import.meta.env.VITE_INPOST_GEOWIDGET_TOKEN ? "Token załadowany" : "Używa domyślnego SDK"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Geowidget pobiera punkty Paczkomat w oknie dialogowym wyboru punktu.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 text-xs text-amber-900 dark:text-amber-200 space-y-2">
              <div className="flex items-center gap-2 font-semibold">
                <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                Informacja dotycząca konta InPost Sandbox:
              </div>
              <p className="leading-relaxed">
                Należy używać dedykowanego konta na portalu{" "}
                <a
                  href="https://sandbox-manager.paczkomaty.pl/"
                  target="_blank"
                  rel="noreferrer"
                  className="underline font-semibold hover:text-amber-700 inline-flex items-center gap-1"
                >
                  sandbox-manager.paczkomaty.pl <ExternalLink className="w-3 h-3" />
                </a>{" "}
                oraz dodać sekrety <code className="font-mono">INPOST_SHIPX_ORGANIZATION_ID</code> i <code className="font-mono">INPOST_SHIPX_TOKEN</code> do sekretów Supabase.
              </p>
            </div>

            <AdminInpostSettings />
          </div>
        )}

        {/* 3. ORLEN PACZKA */}
        {(activeSubTab === "all" || activeSubTab === "orlen") && (
          <div className="bg-card rounded-2xl p-6 border border-border shadow-soft space-y-6">
            <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center text-red-600 dark:text-red-400 font-bold">
                  OP
                </div>
                <div>
                  <h3 className="font-display text-lg font-semibold text-foreground flex items-center gap-2">
                    ORLEN Paczka (Partner NADAJ)
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Dostawa do ponad 11 000 automatów ORLEN Paczka, stacji paliw ORLEN i punktów partnerskich.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <span
                  className={`text-xs font-semibold px-2.5 py-1 rounded ${
                    flags.orlen_paczka_enabled
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {flags.orlen_paczka_enabled ? "AKTYWNA W KOSZYKU" : "WYŁĄCZONA"}
                </span>
                <Switch
                  checked={flags.orlen_paczka_enabled}
                  onCheckedChange={(v) => toggleFeature("orlen_paczka_enabled", v, "ORLEN Paczka")}
                  disabled={togglingFlag === "orlen_paczka_enabled"}
                  aria-label="Przełącznik ORLEN Paczka"
                />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-muted/40 border border-border space-y-2">
                <span className="text-xs font-medium text-muted-foreground block">Partner ID / Login NADAJ:</span>
                <div className="font-mono text-xs text-foreground bg-background p-2 rounded border border-border flex items-center justify-between">
                  <span>ORLEN_PACZKA_PARTNER_ID</span>
                  <span className="text-muted-foreground text-[11px]">(do skonfigurowania)</span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-muted/40 border border-border space-y-2">
                <span className="text-xs font-medium text-muted-foreground block">Klucz API ORLEN:</span>
                <div className="font-mono text-xs text-foreground bg-background p-2 rounded border border-border flex items-center justify-between">
                  <span>ORLEN_PACZKA_API_KEY</span>
                  <span className="text-muted-foreground text-[11px]">(do skonfigurowania)</span>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/20 text-xs text-blue-900 dark:text-blue-200 space-y-1">
              <p className="font-semibold flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" /> Wirtualna integracja gotowa
              </p>
              <p className="text-muted-foreground leading-relaxed">
                Moduł wyboru punktów odbioru ORLEN Paczka oraz wysyłania przesyłek poprzez API NADAJ jest przygotowany pod podłączenie kluczy produkcyjnych lub testowych API ORLEN.
              </p>
            </div>
          </div>
        )}

        {/* 4. POCZTEX / POCZTA POLSKA */}
        {(activeSubTab === "all" || activeSubTab === "pocztex") && (
          <div className="bg-card rounded-2xl p-6 border border-border shadow-soft space-y-6">
            <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-600/10 flex items-center justify-center text-red-700 dark:text-red-300 font-bold">
                  PP
                </div>
                <div>
                  <h3 className="font-display text-lg font-semibold text-foreground flex items-center gap-2">
                    Pocztex / Poczta Polska (e-Nadawca)
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Przesyłki kurierskie Pocztex oraz punkty odbioru (placówki Poczty Polskiej, sklepy Żabka, ABC, Biedronka).
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <span
                  className={`text-xs font-semibold px-2.5 py-1 rounded ${
                    flags.pocztex_shipping_enabled
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {flags.pocztex_shipping_enabled ? "AKTYWNA W KOSZYKU" : "WYŁĄCZONA"}
                </span>
                <Switch
                  checked={flags.pocztex_shipping_enabled}
                  onCheckedChange={(v) => toggleFeature("pocztex_shipping_enabled", v, "Pocztex")}
                  disabled={togglingFlag === "pocztex_shipping_enabled"}
                  aria-label="Przełącznik Pocztex"
                />
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-muted/40 border border-border space-y-2">
                <span className="text-xs font-medium text-muted-foreground block">Login e-Nadawca:</span>
                <div className="font-mono text-xs text-foreground bg-background p-2 rounded border border-border flex items-center justify-between">
                  <span>POCZTEX_ENADAWCA_LOGIN</span>
                  <span className="text-muted-foreground text-[11px]">(do skonfigurowania)</span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-muted/40 border border-border space-y-2">
                <span className="text-xs font-medium text-muted-foreground block">Hasło e-Nadawca:</span>
                <div className="font-mono text-xs text-foreground bg-background p-2 rounded border border-border flex items-center justify-between">
                  <span>POCZTEX_ENADAWCA_PASSWORD</span>
                  <span className="text-muted-foreground text-[11px]">(do skonfigurowania)</span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-muted/40 border border-border space-y-2">
                <span className="text-xs font-medium text-muted-foreground block">Partner GUID:</span>
                <div className="font-mono text-xs text-foreground bg-background p-2 rounded border border-border flex items-center justify-between">
                  <span>POCZTEX_PARTNER_GUID</span>
                  <span className="text-muted-foreground text-[11px]">(do skonfigurowania)</span>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-xs text-emerald-900 dark:text-emerald-200 space-y-1">
              <p className="font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> Dostępność w koszyku
              </p>
              <p className="text-muted-foreground leading-relaxed">
                Po włączeniu przełącznika, klienci w koszyku będą mogli wybrać dostawę Pocztex.
              </p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default AdminIntegrations;
