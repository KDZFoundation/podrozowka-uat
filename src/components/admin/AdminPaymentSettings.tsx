import { useCallback, useEffect, useState } from "react";
import { Banknote, CheckCircle2, CreditCard, Loader2, XCircle } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { useQueryClient } from "@tanstack/react-query";
import { backendApiUrl } from "@/lib/backendApi";
import { runtimeConfigService } from "@/integrations/firebase/services/runtimeConfigService";

type SecretStatus = { name: string; set: boolean; length: number; preview: string };
type GatewayStatus = { secrets: SecretStatus[]; all_secrets_set: boolean };
type StatusResponse = {
  hotpay: GatewayStatus;
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
  const [togglingCod, setTogglingCod] = useState(false);
  const { flags } = useFeatureFlags();
  const queryClient = useQueryClient();

  const load = useCallback(async () => {
    setLoading(true);
    let loadedData: StatusResponse | null = null;

    try {
      const res = await fetch(backendApiUrl("/api/payments/status"));
      if (res.ok) loadedData = await res.json() as StatusResponse;
    } catch (err) {
      console.warn("Failed to fetch payment status:", err);
    }

    if (loadedData) {
      setData(loadedData);
    } else {
      setData({
        hotpay: {
          all_secrets_set: false,
          secrets: [
            { name: "HOTPAY_SECRET", set: false, length: 0, preview: "" },
            { name: "HOTPAY_NOTIFICATION_PASSWORD", set: false, length: 0, preview: "" },
          ],
        },
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleCod = async (enabled: boolean) => {
    setTogglingCod(true);
    try {
      await runtimeConfigService.setFeatureFlag({ key: "cod_payment_enabled", is_enabled: enabled, name: "Płatność za pobraniem (COD)", description: "Udostępnia opcję płatności przy odbiorze" });
      toast.success(enabled ? "Płatność za pobraniem włączona" : "Płatność za pobraniem wyłączona");
      queryClient.invalidateQueries({ queryKey: ["feature-flags"] });
    } catch {
      toast.error("Nie udało się zmienić statusu COD");
    } finally {
      setTogglingCod(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (!data) return null;
  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="font-display text-2xl font-bold text-foreground flex items-center gap-2"><CreditCard className="w-6 h-6 text-primary" /> Ustawienia płatności</h2>
        <p className="text-sm text-muted-foreground mt-1">Jedyną bramką płatności online jest HotPay.</p>
      </div>

      <div className="bg-card rounded-xl p-6 shadow-soft border border-border">
        <h3 className="font-display text-lg font-semibold text-foreground">Dane HotPay</h3>
        <p className="text-sm text-muted-foreground mt-1">Sekret usługi i hasło notyfikacji są przechowywane w sekretach środowiska Vercel. Panel pokazuje wyłącznie ich stan.</p>
        <div className="mt-4 p-3.5 bg-muted/60 rounded-lg border border-border text-xs text-foreground space-y-1">
          <p className="font-semibold text-primary">Adres URL powiadomień IPN (Webhook):</p>
          <code className="block bg-background px-2.5 py-1.5 rounded font-mono text-muted-foreground break-all select-all">
            {backendApiUrl("/api/payments/hotpay-webhook")}
          </code>
          <p className="text-muted-foreground pt-1">Wklej ten adres w panelu HotPay w ustawieniach usługi w polu <strong>„Adres powiadomień URL / Webhook”</strong>.</p>
        </div>
      </div>
      <SecretList title="Status sekretów HotPay" status={data.hotpay} />

      <div className="bg-card rounded-xl p-6 shadow-soft border border-border">
        <div className="flex items-start justify-between gap-4"><div className="flex items-start gap-3"><div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><Banknote className="w-5 h-5 text-primary" /></div><div><h3 className="font-display text-lg font-semibold text-foreground">Płatność za pobraniem (COD)</h3><p className="text-sm text-muted-foreground mt-1">Udostępnia płatność przy odbiorze.</p></div></div><Switch checked={flags.cod_payment_enabled} onCheckedChange={toggleCod} disabled={togglingCod} aria-label="Przełącznik płatności COD" /></div>
      </div>

    </div>
  );
};

export default AdminPaymentSettings;
