import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Copy, Check, Loader2, XCircle, Globe } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { backendApiUrl } from "@/lib/backendApi";

type MaskedValue = { set: boolean; preview: string };
type InpostSettings = {
  environment: "sandbox" | "production";
  updated_at: string | null;
  organization: MaskedValue;
  api_token: MaskedValue;
  geowidget_token: MaskedValue;
};

const CredentialStatus = ({ label, value }: { label: string; value: MaskedValue }) => (
  <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background p-3">
    <span className="text-sm text-foreground">{label}</span>
    <span className={`flex items-center gap-1 text-xs font-semibold ${value.set ? "text-accent" : "text-destructive"}`}>
      {value.set ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
      {value.set ? value.preview : "nie ustawiono"}
    </span>
  </div>
);

const AdminInpostSettings = () => {
  const [data, setData] = useState<InpostSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  const webhookUrl = backendApiUrl("/api/inpost/webhook");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(backendApiUrl("/api/inpost/settings"));
      if (res.ok) {
        const apiData = (await res.json()) as InpostSettings;
        setData(apiData);
      } else {
        toast.error("Nie udało się pobrać statusu konfiguracji InPost");
      }
    } catch {
      toast.error("Nie udało się połączyć z konfiguracją InPost");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedWebhook(true);
    toast.success("Skopiowano adres Webhook do schowka");
    setTimeout(() => setCopiedWebhook(false), 2000);
  };

  if (loading)
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );

  return (
    <section className="rounded-xl border border-border bg-muted/20 p-5 space-y-6">
      <div>
        <h4 className="font-display text-lg font-semibold text-foreground">Integracja InPost ShipX & Geowidget</h4>
        <p className="mt-1 text-sm text-muted-foreground">
          Konfiguracja przesyłek Paczkomatowych i kurierskich InPost oraz mapy odbioru w koszyku.
        </p>
      </div>

      {/* Webhook notification URL Box */}
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
        <div className="flex items-center gap-2 mb-1.5 text-sm font-semibold text-primary">
          <Globe className="h-4 w-4" />
          <span>Adres Webhook dla powiadomień InPost ShipX</span>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Wklej ten adres w panelu InPost ShipX (w sekcji Powiadomienia / Webhooki organizacji), aby system automatycznie
          odbierał zmiany statusu przesyłek.
        </p>
        <div className="flex items-center gap-2">
          <Input readOnly value={webhookUrl} className="font-mono text-xs bg-background" />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => copyToClipboard(webhookUrl)}
            className="shrink-0 gap-1.5"
          >
            {copiedWebhook ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            {copiedWebhook ? "Skopiowano" : "Kopiuj"}
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-background p-4 text-sm text-muted-foreground">
        Dane dostępu nie są zapisywane z przeglądarki. Ustaw je jako sekrety projektu Vercel: <code>INPOST_SHIPX_ORGANIZATION_ID</code>, <code>INPOST_SHIPX_TOKEN</code>, <code>INPOST_GEOWIDGET_TOKEN</code> oraz <code>INPOST_SHIPX_ENV</code>. Panel pokazuje wyłącznie ich bezpieczny status.
      </div>

      <div className="grid gap-2 md:grid-cols-3">
        <CredentialStatus label="ID organizacji" value={data?.organization ?? { set: false, preview: "" }} />
        <CredentialStatus label="Token ShipX" value={data?.api_token ?? { set: false, preview: "" }} />
        <CredentialStatus label="Token Geowidget" value={data?.geowidget_token ?? { set: false, preview: "" }} />
      </div>

    </section>
  );
};

export default AdminInpostSettings;
