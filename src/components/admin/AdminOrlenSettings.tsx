import { useCallback, useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { CheckCircle2, Loader2, Save, XCircle } from "lucide-react";
import { db } from "@/integrations/firebase/config";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type MaskedValue = { set: boolean; preview: string };
type Settings = {
  environment: "sandbox" | "production";
  partner_id: MaskedValue;
  partner_key: MaskedValue;
  widget_token: MaskedValue;
  sender: Record<"name" | "street" | "postal_code" | "city" | "phone" | "email", MaskedValue>;
};

const masked = (value: unknown): MaskedValue => {
  const text = typeof value === "string" ? value : "";
  return { set: Boolean(text), preview: text ? `••••${text.slice(-4)}` : "" };
};

const toSettings = (raw: Record<string, unknown>): Settings => ({
  environment: raw.environment === "production" ? "production" : "sandbox",
  partner_id: masked(raw.partner_id),
  partner_key: masked(raw.partner_key),
  widget_token: masked(raw.widget_token),
  sender: {
    name: masked(raw.sender_name), street: masked(raw.sender_street), postal_code: masked(raw.sender_postal_code),
    city: masked(raw.sender_city), phone: masked(raw.sender_phone), email: masked(raw.sender_email),
  },
});

const emptyForm = { partnerId: "", partnerKey: "", widgetToken: "", senderName: "", senderStreet: "", senderPostalCode: "", senderCity: "", senderPhone: "", senderEmail: "" };
const status = (label: string, value: MaskedValue) => <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background p-3 text-sm"><span>{label}</span><span className={`flex items-center gap-1 text-xs font-semibold ${value.set ? "text-accent" : "text-destructive"}`}>{value.set ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}{value.set ? value.preview : "nie ustawiono"}</span></div>;

export default function AdminOrlenSettings() {
  const [data, setData] = useState<Settings | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const set = (field: keyof typeof emptyForm, value: string) => setForm((current) => ({ ...current, [field]: value }));
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snapshot = await getDoc(doc(db, "config", "orlen_paczka"));
      setData(toSettings(snapshot.exists() ? snapshot.data() : {}));
    } catch (error) {
      console.warn("Firestore ORLEN config unavailable:", error);
      toast.error("Nie udało się pobrać konfiguracji ORLEN Paczka");
    }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  const save = async () => {
    const initial = !data?.partner_id.set || !data?.partner_key.set || !data?.widget_token.set;
    if (initial && (!form.partnerId.trim() || !form.partnerKey.trim() || !form.widgetToken.trim())) {
      toast.error("Przy pierwszej konfiguracji wpisz PartnerID, PartnerKey i token Widgetu"); return;
    }
    setSaving(true);
    try {
      const values: Record<string, string> = {
        environment: "sandbox", partner_id: form.partnerId.trim(), partner_key: form.partnerKey.trim(), widget_token: form.widgetToken.trim(),
        sender_name: form.senderName.trim(), sender_street: form.senderStreet.trim(), sender_postal_code: form.senderPostalCode.trim(), sender_city: form.senderCity.trim(), sender_phone: form.senderPhone.trim(), sender_email: form.senderEmail.trim(),
      };
      const existing = data ? {
        partner_id: data.partner_id.set, partner_key: data.partner_key.set, widget_token: data.widget_token.set,
      } : { partner_id: false, partner_key: false, widget_token: false };
      const payload = Object.fromEntries(Object.entries(values).filter(([key, value]) => value || !["partner_id", "partner_key", "widget_token"].includes(key) || !existing[key as keyof typeof existing]));
      await setDoc(doc(db, "config", "orlen_paczka"), { ...payload, updated_at: new Date().toISOString() }, { merge: true });
      setData(toSettings({ ...values, ...payload })); setForm(emptyForm); toast.success("Dane ORLEN Paczka zapisane w Firestore");
    } catch (error) {
      console.warn("Firestore ORLEN config save failed:", error);
      toast.error("Nie udało się zapisać konfiguracji ORLEN Paczka");
    }
    setSaving(false);
  };
  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  return <section className="rounded-xl border border-border bg-muted/20 p-5 space-y-5">
    <div><h4 className="font-display text-lg font-semibold text-foreground">Dane ORLEN Paczka — Sandbox</h4><p className="mt-1 text-sm text-muted-foreground">PartnerID i PartnerKey służą do API NADAJ. Token Widgetu jest przeznaczony do mapy punktów odbioru w checkoutcie i musi być wydany dla domeny aplikacji.</p></div>
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2"><Label htmlFor="orlen-partner-id">PartnerID *</Label><Input id="orlen-partner-id" value={form.partnerId} onChange={(e) => set("partnerId", e.target.value)} placeholder="Login z ORLEN Paczka" autoComplete="off" /></div>
      <div className="space-y-2"><Label htmlFor="orlen-partner-key">PartnerKey *</Label><Input id="orlen-partner-key" type="password" value={form.partnerKey} onChange={(e) => set("partnerKey", e.target.value)} autoComplete="new-password" /></div>
      <div className="space-y-2 md:col-span-2"><Label htmlFor="orlen-widget-token">Token Widgetu mapy *</Label><Input id="orlen-widget-token" type="password" value={form.widgetToken} onChange={(e) => set("widgetToken", e.target.value)} autoComplete="new-password" /><p className="text-xs text-muted-foreground">Dla localhost ORLEN wydaje osobny, czasowy token. Dla UAT i produkcji token musi obejmować ich domeny.</p></div>
    </div>
    <div className="border-t border-border pt-5"><h5 className="font-medium text-foreground">Nadawca przesyłek</h5><p className="mt-1 text-xs text-muted-foreground">Dane będą potrzebne przy generowaniu etykiet ORLEN Paczka.</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="orlen-sender-name">Imię i nazwisko / nazwa</Label><Input id="orlen-sender-name" value={form.senderName} onChange={(e) => set("senderName", e.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="orlen-sender-street">Ulica i numer</Label><Input id="orlen-sender-street" value={form.senderStreet} onChange={(e) => set("senderStreet", e.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="orlen-sender-postal">Kod pocztowy</Label><Input id="orlen-sender-postal" value={form.senderPostalCode} onChange={(e) => set("senderPostalCode", e.target.value)} placeholder="00-000" /></div>
        <div className="space-y-2"><Label htmlFor="orlen-sender-city">Miejscowość</Label><Input id="orlen-sender-city" value={form.senderCity} onChange={(e) => set("senderCity", e.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="orlen-sender-phone">Telefon</Label><Input id="orlen-sender-phone" value={form.senderPhone} onChange={(e) => set("senderPhone", e.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="orlen-sender-email">E-mail</Label><Input id="orlen-sender-email" type="email" value={form.senderEmail} onChange={(e) => set("senderEmail", e.target.value)} /></div>
      </div>
    </div>
    <div className="grid gap-2 md:grid-cols-3">{status("PartnerID", data?.partner_id ?? { set: false, preview: "" })}{status("PartnerKey", data?.partner_key ?? { set: false, preview: "" })}{status("Token Widgetu", data?.widget_token ?? { set: false, preview: "" })}</div>
    <div className="flex justify-end"><button type="button" onClick={save} disabled={saving} className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Zapisz konfigurację ORLEN</button></div>
  </section>;
}
