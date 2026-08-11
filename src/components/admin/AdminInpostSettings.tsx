import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, Save, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type MaskedValue = { set: boolean; preview: string };
type InpostSettings = { environment: "sandbox" | "production"; updated_at: string | null; organization: MaskedValue; api_token: MaskedValue; geowidget_token: MaskedValue };

const errorMessage = (error: unknown, fallback: string) => {
  const message = typeof error === "object" && error && "message" in error ? String(error.message || "") : "";
  return message && message !== "Edge Function returned a non-2xx status code" ? `${fallback}: ${message}` : fallback;
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
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ organizationId: "", apiToken: "", geowidgetToken: "" });

  const load = useCallback(async () => {
    setLoading(true);
    const { data: result, error } = await supabase.functions.invoke<InpostSettings>("admin-inpost-settings", { method: "GET" });
    if (error || !result) toast.error(errorMessage(error, "Nie udało się pobrać konfiguracji InPost"));
    else setData(result);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    const organizationId = form.organizationId.trim();
    const apiToken = form.apiToken.trim();
    const geowidgetToken = form.geowidgetToken.trim();
    const missingInitialValue = !data?.organization.set || !data?.api_token.set || !data?.geowidget_token.set;
    if (missingInitialValue && (!organizationId || !apiToken || !geowidgetToken)) {
      toast.error("Przy pierwszej konfiguracji wpisz ID organizacji, token ShipX i token Geowidget");
      return;
    }
    if ([organizationId, apiToken, geowidgetToken].some((value) => value.length > 0 && value.length < 3)) {
      toast.error("Każda podana wartość musi mieć co najmniej 3 znaki");
      return;
    }
    setSaving(true);
    const { data: result, error } = await supabase.functions.invoke<InpostSettings>("admin-inpost-settings", {
      method: "POST",
      body: { environment: "sandbox", organization_id: organizationId, api_token: apiToken, geowidget_token: geowidgetToken },
    });
    setSaving(false);
    if (error || !result) { toast.error(errorMessage(error, "Nie udało się zapisać konfiguracji InPost")); return; }
    setData(result);
    setForm({ organizationId: "", apiToken: "", geowidgetToken: "" });
    toast.success("Dane InPost zapisane w Supabase");
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  return (
    <section className="rounded-xl border border-border bg-muted/20 p-5">
      <div className="mb-4"><h4 className="font-display text-lg font-semibold text-foreground">Dane InPost ShipX — Sandbox</h4><p className="mt-1 text-sm text-muted-foreground">Wklej dane z konta InPost Sandbox. Po zapisie tokeny są przechowywane po stronie Supabase i w panelu pozostają zamaskowane.</p></div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="inpost-organization-id">ID organizacji *</Label><Input id="inpost-organization-id" value={form.organizationId} onChange={(event) => setForm((current) => ({ ...current, organizationId: event.target.value }))} placeholder="np. 123456" autoComplete="off" /></div>
        <div className="space-y-2"><Label htmlFor="inpost-shipx-token">Token API ShipX *</Label><Input id="inpost-shipx-token" type="password" value={form.apiToken} onChange={(event) => setForm((current) => ({ ...current, apiToken: event.target.value }))} autoComplete="new-password" /></div>
        <div className="space-y-2 md:col-span-2"><Label htmlFor="inpost-geowidget-token">Token Geowidget *</Label><Input id="inpost-geowidget-token" type="password" value={form.geowidgetToken} onChange={(event) => setForm((current) => ({ ...current, geowidgetToken: event.target.value }))} autoComplete="new-password" /><p className="text-xs text-muted-foreground">Ten token jest przekazywany do widżetu InPost w checkoutcie — jest przeznaczony do użycia w przeglądarce.</p></div>
      </div>
      <div className="mt-5 grid gap-2 md:grid-cols-3"><CredentialStatus label="ID organizacji" value={data?.organization ?? { set: false, preview: "" }} /><CredentialStatus label="Token ShipX" value={data?.api_token ?? { set: false, preview: "" }} /><CredentialStatus label="Token Geowidget" value={data?.geowidget_token ?? { set: false, preview: "" }} /></div>
      <div className="mt-5 flex justify-end"><button type="button" onClick={save} disabled={saving} className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Zapisz konfigurację InPost</button></div>
    </section>
  );
};

export default AdminInpostSettings;
