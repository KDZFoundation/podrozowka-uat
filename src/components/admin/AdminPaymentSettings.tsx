import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Banknote, CheckCircle2, CreditCard, Loader2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { useQueryClient } from "@tanstack/react-query";
import { backendApiUrl } from "@/lib/backendApi";

type PaymentGateway = "hotpay" | "p24";
type SecretStatus = { name: string; set: boolean; length: number; preview: string };
type GatewayStatus = { secrets: SecretStatus[]; all_secrets_set: boolean };
type StatusResponse = {
  payment_gateway: PaymentGateway;
  p24_mode: "sandbox" | "production";
  updated_at: string | null;
  hotpay: GatewayStatus;
  p24: GatewayStatus;
};

const SecretList = ({ title, status }: { title: string; status: GatewayStatus }) => (
  <div className="bg-card rounded-xl p-6 shadow-soft border border-border">
    <div className="mb-4 flex items-center justify-between gap-4">
      <h3 className="font-display text-lg font-semibold text-foreground">{title}</h3>
      <span className={`text-xs font-semibold px-2 py-1 rounded flex items-center gap-1 ${status.all_secrets_set ? "bg-accent/10 text-accent" : "bg-destructive/10 text-destructive"}`}>
        {status.all_secrets_set ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
        {status.all_secrets_set ? "Komplet" : "Brakuje wartości"}
      </span>
    </div>
    <div className="space-y-2">
      {status.secrets.map((secret) => (
        <div key={secret.name} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-background border border-border">
          <div className="flex items-center gap-3 min-w-0">
            {secret.set ? <CheckCircle2 className="w-4 h-4 text-accent shrink-0" /> : <XCircle className="w-4 h-4 text-destructive shrink-0" />}
            <span className="font-mono text-sm text-foreground truncate">{secret.name}</span>
          </div>
          <span className="text-xs text-muted-foreground font-mono shrink-0">
            {secret.set ? <>{secret.preview || "•••"} <span className="opacity-70">({secret.length} zn.)</span></> : <span className="text-destructive">nie ustawiono</span>}
          </span>
        </div>
      ))}
    </div>
  </div>
);

const AdminPaymentSettings = () => {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [togglingCod, setTogglingCod] = useState(false);
  const [hotpayForm, setHotpayForm] = useState({ secret: "", notificationPassword: "" });
  const [p24Form, setP24Form] = useState({ merchantId: "", posId: "", apiKey: "", crcKey: "", reportKey: "" });
  const { flags } = useFeatureFlags();
  const queryClient = useQueryClient();

  const load = useCallback(async () => {
    setLoading(true);
    let loadedData: StatusResponse | null = null;

    try {
      const { data: result, error } = await supabase.functions.invoke<StatusResponse>("admin-payment-status", { method: "GET" });
      if (!error && result) {
        loadedData = result;
      }
    } catch (_) {
      // ignore
    }

    if (!loadedData) {
      try {
        const res = await fetch(backendApiUrl("/api/payments/status"));
        const apiStatus = await res.json().catch(() => null);
        if (apiStatus) {
          loadedData = {
            payment_gateway: "hotpay",
            p24_mode: "sandbox",
            updated_at: new Date().toISOString(),
            hotpay: {
              all_secrets_set: apiStatus.hotpay?.configured ?? false,
              secrets: [
                {
                  name: "HOTPAY_SECRET",
                  set: apiStatus.hotpay?.secret_set ?? false,
                  length: apiStatus.hotpay?.secret_set ? 32 : 0,
                  preview: apiStatus.hotpay?.secret_preview || "•••",
                },
                {
                  name: "HOTPAY_NOTIFICATION_PASSWORD",
                  set: apiStatus.hotpay?.notification_password_set ?? false,
                  length: apiStatus.hotpay?.notification_password_set ? 16 : 0,
                  preview: "•••",
                },
              ],
            },
            p24: {
              all_secrets_set: false,
              secrets: [
                { name: "P24_MERCHANT_ID", set: false, length: 0, preview: "" },
                { name: "P24_API_KEY", set: false, length: 0, preview: "" },
                { name: "P24_CRC_KEY", set: false, length: 0, preview: "" },
              ],
            },
          };
        }
      } catch (err) {
        console.warn("Failed to fetch payment status:", err);
      }
    }

    if (loadedData) {
      setData(loadedData);
    } else {
      setData({
        payment_gateway: "hotpay",
        p24_mode: "sandbox",
        updated_at: null,
        hotpay: {
          all_secrets_set: false,
          secrets: [
            { name: "HOTPAY_SECRET", set: false, length: 0, preview: "" },
            { name: "HOTPAY_NOTIFICATION_PASSWORD", set: false, length: 0, preview: "" },
          ],
        },
        p24: {
          all_secrets_set: false,
          secrets: [
            { name: "P24_MERCHANT_ID", set: false, length: 0, preview: "" },
            { name: "P24_API_KEY", set: false, length: 0, preview: "" },
            { name: "P24_CRC_KEY", set: false, length: 0, preview: "" },
          ],
        },
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (body: Record<string, unknown>, successMessage: string) => {
    setSaving(true);
    const { data: result, error } = await supabase.functions.invoke<StatusResponse>("admin-payment-status", { method: "POST", body });
    setSaving(false);
    if (error || !result) {
      toast.error("Nie udało się zapisać konfiguracji płatności");
      return false;
    }
    setData(result);
    toast.success(successMessage);
    return true;
  };

  const selectGateway = (gateway: PaymentGateway) => save({ payment_gateway: gateway }, gateway === "hotpay" ? "HotPay ustawiony jako główna bramka" : "Przelewy24 ustawione jako bramka rezerwowa");
  const saveHotPay = async () => {
    const secret = hotpayForm.secret.trim();
    const notificationPassword = hotpayForm.notificationPassword.trim();
    if (secret.length < 4 || notificationPassword.length < 4) {
      toast.error("Podaj sekret usługi i hasło notyfikacji HotPay");
      return;
    }
    if (await save({ hotpay_credentials: { secret, notification_password: notificationPassword } }, "Dane HotPay zapisane w Supabase")) {
      setHotpayForm({ secret: "", notificationPassword: "" });
    }
  };
  const saveP24 = async () => {
    const merchantId = p24Form.merchantId.trim();
    if (!/^\d{1,20}$/.test(merchantId) || !p24Form.apiKey.trim() || !p24Form.crcKey.trim()) {
      toast.error("Podaj ID, klucz do zamówień i klucz CRC Przelewy24");
      return;
    }
    if (p24Form.posId && !/^\d{1,20}$/.test(p24Form.posId)) {
      toast.error("POS ID może zawierać wyłącznie cyfry");
      return;
    }
    if (await save({ p24_credentials: { merchant_id: merchantId, pos_id: p24Form.posId.trim(), api_key: p24Form.apiKey.trim(), crc_key: p24Form.crcKey.trim(), report_key: p24Form.reportKey.trim() } }, "Dane Przelewy24 zapisane w Supabase")) {
      setP24Form({ merchantId: "", posId: "", apiKey: "", crcKey: "", reportKey: "" });
    }
  };
  const toggleCod = async (enabled: boolean) => {
    setTogglingCod(true);
    const { error } = await supabase.from("feature_flags").upsert({ key: "cod_payment_enabled", is_enabled: enabled, name: "Płatność za pobraniem (COD)", description: "Udostępnia opcję płatności przy odbiorze" });
    setTogglingCod(false);
    if (error) toast.error("Nie udało się zmienić statusu COD");
    else {
      toast.success(enabled ? "Płatność za pobraniem włączona" : "Płatność za pobraniem wyłączona");
      queryClient.invalidateQueries({ queryKey: ["feature-flags"] });
    }
  };

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (!data) return null;
  const p24Production = data.p24_mode === "production";

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="font-display text-2xl font-bold text-foreground flex items-center gap-2"><CreditCard className="w-6 h-6 text-primary" /> Ustawienia płatności</h2>
        <p className="text-sm text-muted-foreground mt-1">HotPay jest główną bramką. Przelewy24 pozostaje dostępne jako bramka rezerwowa.</p>
      </div>

      <div className="bg-card rounded-xl p-6 shadow-soft border border-border">
        <h3 className="font-display text-lg font-semibold text-foreground">Aktywna bramka online</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {(["hotpay", "p24"] as PaymentGateway[]).map((gateway) => {
            const selected = data.payment_gateway === gateway;
            const label = gateway === "hotpay" ? "HotPay (główna)" : "Przelewy24 (rezerwowa)";
            return <button key={gateway} type="button" disabled={saving} onClick={() => selectGateway(gateway)} className={`rounded-xl border p-4 text-left transition-colors ${selected ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}>
              <p className="font-semibold text-foreground">{label}</p>
              <p className="mt-1 text-xs text-muted-foreground">{gateway === "hotpay" ? "Płatność BLIK, przelewy i karty przez HotPay." : "Alternatywna integracja Przelewy24."}</p>
              {selected && <span className="mt-3 inline-block text-xs font-semibold text-primary">AKTYWNA</span>}
            </button>;
          })}
        </div>
      </div>

      <div className="bg-card rounded-xl p-6 shadow-soft border border-border">
        <h3 className="font-display text-lg font-semibold text-foreground">Dane HotPay</h3>
        <p className="text-sm text-muted-foreground mt-1">W panelu HotPay wybierz sekret usługi oraz hasło notyfikacji. Dane są bezpiecznie przetwarzane na serwerze i nie są ujawniane w przeglądarce.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="hotpay-secret">Sekret usługi *</Label><Input id="hotpay-secret" type="password" value={hotpayForm.secret} onChange={(event) => setHotpayForm((form) => ({ ...form, secret: event.target.value }))} autoComplete="new-password" /></div>
          <div className="space-y-2"><Label htmlFor="hotpay-notification-password">Hasło notyfikacji *</Label><Input id="hotpay-notification-password" type="password" value={hotpayForm.notificationPassword} onChange={(event) => setHotpayForm((form) => ({ ...form, notificationPassword: event.target.value }))} autoComplete="new-password" /></div>
        </div>
        <div className="mt-4 p-3.5 bg-muted/60 rounded-lg border border-border text-xs text-foreground space-y-1">
          <p className="font-semibold text-primary">Adres URL powiadomień IPN (Webhook):</p>
          <code className="block bg-background px-2.5 py-1.5 rounded font-mono text-muted-foreground break-all select-all">
            {backendApiUrl("/api/payments/hotpay-webhook")}
          </code>
          <p className="text-muted-foreground pt-1">Wklej ten adres w panelu HotPay w ustawieniach usługi w polu <strong>„Adres powiadomień URL / Webhook”</strong>.</p>
        </div>
        <div className="mt-5 flex justify-end"><button type="button" className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50" onClick={saveHotPay} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Zapisz dane HotPay</button></div>
      </div>
      <SecretList title="Status sekretów HotPay" status={data.hotpay} />

      <div className="bg-card rounded-xl p-6 shadow-soft border border-border">
        <h3 className="font-display text-lg font-semibold text-foreground">Dane Przelewy24</h3>
        <p className="text-sm text-muted-foreground mt-1">Bramka alternatywna. Wpisz dane tylko wtedy, gdy chcesz móc przełączyć checkout na Przelewy24.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="p24-id">ID (Merchant ID) *</Label><Input id="p24-id" inputMode="numeric" value={p24Form.merchantId} onChange={(event) => setP24Form((form) => ({ ...form, merchantId: event.target.value }))} /></div>
          <div className="space-y-2"><Label htmlFor="p24-pos">POS ID (opcjonalnie)</Label><Input id="p24-pos" inputMode="numeric" value={p24Form.posId} onChange={(event) => setP24Form((form) => ({ ...form, posId: event.target.value }))} /></div>
          <div className="space-y-2"><Label htmlFor="p24-api">Klucz do zamówień *</Label><Input id="p24-api" type="password" value={p24Form.apiKey} onChange={(event) => setP24Form((form) => ({ ...form, apiKey: event.target.value }))} autoComplete="new-password" /></div>
          <div className="space-y-2"><Label htmlFor="p24-crc">Klucz CRC *</Label><Input id="p24-crc" type="password" value={p24Form.crcKey} onChange={(event) => setP24Form((form) => ({ ...form, crcKey: event.target.value }))} autoComplete="new-password" /></div>
          <div className="space-y-2 sm:col-span-2"><Label htmlFor="p24-report">Klucz do raportów (opcjonalnie)</Label><Input id="p24-report" type="password" value={p24Form.reportKey} onChange={(event) => setP24Form((form) => ({ ...form, reportKey: event.target.value }))} autoComplete="new-password" /></div>
        </div>
        <div className="mt-5 flex justify-end"><button type="button" className="inline-flex items-center justify-center rounded-md border border-primary px-4 py-2 text-sm font-medium text-primary disabled:opacity-50" onClick={saveP24} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Zapisz dane Przelewy24</button></div>
      </div>

      <div className="bg-card rounded-xl p-6 shadow-soft border border-border">
        <div className="flex items-start justify-between gap-4"><div className="flex items-start gap-3"><div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><Banknote className="w-5 h-5 text-primary" /></div><div><h3 className="font-display text-lg font-semibold text-foreground">Płatność za pobraniem (COD)</h3><p className="text-sm text-muted-foreground mt-1">Udostępnia płatność przy odbiorze.</p></div></div><Switch checked={flags.cod_payment_enabled} onCheckedChange={toggleCod} disabled={togglingCod} aria-label="Przełącznik płatności COD" /></div>
      </div>

      <div className="bg-card rounded-xl p-6 shadow-soft border border-border">
        <div className="flex items-start justify-between gap-4"><div><h3 className="font-display text-lg font-semibold text-foreground">Środowisko Przelewy24</h3><p className="text-sm text-muted-foreground mt-1">{p24Production ? "Produkcja - realne transakcje." : "Sandbox - środowisko testowe."}</p></div><Switch checked={p24Production} onCheckedChange={(checked) => save({ p24_mode: checked ? "production" : "sandbox" }, checked ? "Przelewy24: produkcja" : "Przelewy24: sandbox")} disabled={saving} aria-label="Przełącznik środowiska Przelewy24" /></div>
        {p24Production && <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-destructive/5 border border-destructive/20 text-sm text-destructive"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />Przelewy24 będzie obciążać realnymi kwotami po ustawieniu tej bramki jako aktywnej.</div>}
      </div>
      <SecretList title="Status sekretów Przelewy24" status={data.p24} />
    </div>
  );
};

export default AdminPaymentSettings;
