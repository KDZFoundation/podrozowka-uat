import { useCallback, useEffect, useState } from "react";
import { FileText, Mail, Pencil, Plus, Save, Trash2, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { isFirestoreCatalogEnabled } from "@/integrations/firebase/config";
import { firestoreService } from "@/integrations/firebase/services/firestoreService";

type AgreementStatus = "draft" | "sent" | "signed" | "expired" | "terminated";
type Author = {
  id: string; display_name: string; legal_name: string | null; email: string | null;
  website_url: string | null; social_handle: string | null; bio: string | null;
  avatar_url: string | null; agreement_status: AgreementStatus; agreement_signed_at: string | null;
  agreement_expires_at: string | null; agreement_file_url: string | null; notes: string | null; active: boolean;
};
type FormState = Omit<Author, "id">;
const emptyForm: FormState = { display_name: "", legal_name: "", email: "", website_url: "", social_handle: "", bio: "", avatar_url: "", agreement_status: "draft", agreement_signed_at: "", agreement_expires_at: "", agreement_file_url: "", notes: "", active: true };
const statusLabels: Record<AgreementStatus, string> = { draft: "Szkic", sent: "Wysłana", signed: "Podpisana", expired: "Wygasła", terminated: "Zakończona" };

export default function AdminAuthors() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [authors, setAuthors] = useState<Author[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadAuthors = useCallback(async () => {
    setLoading(true);
    if (isFirestoreCatalogEnabled) {
      try {
        const data = await firestoreService.getAuthors();
        setAuthors((data as unknown as Record<string, unknown>[]).map((row) => ({
          id: String(row.id ?? ""),
          display_name: String(row.display_name ?? row.name ?? ""),
          legal_name: (row.legal_name as string | null | undefined) ?? null,
          email: (row.email as string | null | undefined) ?? null,
          website_url: (row.website_url as string | null | undefined) ?? null,
          social_handle: (row.social_handle as string | null | undefined) ?? null,
          bio: (row.bio as string | null | undefined) ?? null,
          avatar_url: (row.avatar_url as string | null | undefined) ?? null,
          agreement_status: (row.agreement_status as AgreementStatus | undefined) ?? "draft",
          agreement_signed_at: (row.agreement_signed_at as string | null | undefined) ?? null,
          agreement_expires_at: (row.agreement_expires_at as string | null | undefined) ?? null,
          agreement_file_url: (row.agreement_file_url as string | null | undefined) ?? null,
          notes: (row.notes as string | null | undefined) ?? null,
          active: Boolean(row.active ?? row.is_active ?? true),
        })));
      } catch (error) {
        toast({ title: "Nie udało się wczytać autorów", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
      } finally {
        setLoading(false);
      }
      return;
    }
    const { data, error } = await supabase.from("authors").select("*").order("display_name");
    if (error) toast({ title: "Nie udało się wczytać autorów", description: error.message, variant: "destructive" });
    else setAuthors((data || []) as Author[]);
    setLoading(false);
  }, [toast]);
  useEffect(() => { if (isAdmin) loadAuthors(); }, [isAdmin, loadAuthors]);
  if (!isAdmin) return null;

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));
  const startNew = () => { setEditingId(null); setForm(emptyForm); };
  const startEdit = (author: Author) => {
    setEditingId(author.id);
    setForm(Object.fromEntries(Object.keys(emptyForm).map((key) => [key, author[key as keyof FormState] ?? ""])) as FormState);
  };
  const save = async () => {
    if (!form.display_name.trim()) { toast({ title: "Podaj nazwę autora", variant: "destructive" }); return; }
    setSaving(true);
    const payload = { ...form, display_name: form.display_name.trim(), legal_name: form.legal_name || null, email: form.email || null, website_url: form.website_url || null, social_handle: form.social_handle || null, bio: form.bio || null, avatar_url: form.avatar_url || null, agreement_signed_at: form.agreement_signed_at || null, agreement_expires_at: form.agreement_expires_at || null, agreement_file_url: form.agreement_file_url || null, notes: form.notes || null };
    if (isFirestoreCatalogEnabled) {
      try {
        await firestoreService.upsertAuthor(editingId ?? crypto.randomUUID(), {
          ...payload,
          name: payload.display_name,
          is_active: payload.active,
        });
        toast({ title: editingId ? "Autor zaktualizowany" : "Autor dodany" });
        startNew();
        await loadAuthors();
      } catch (error) {
        toast({ title: "Błąd zapisu autora", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
      } finally {
        setSaving(false);
      }
      return;
    }
    const result = editingId ? await supabase.from("authors").update(payload).eq("id", editingId) : await supabase.from("authors").insert(payload);
    if (result.error) toast({ title: "Błąd zapisu autora", description: result.error.message, variant: "destructive" });
    else { toast({ title: editingId ? "Autor zaktualizowany" : "Autor dodany" }); startNew(); await loadAuthors(); }
    setSaving(false);
  };
  const remove = async (author: Author) => {
    if (!confirm(`Usunąć autora „${author.display_name}”? Wzory pozostaną bez przypisanego autora.`)) return;
    if (isFirestoreCatalogEnabled) {
      try {
        await firestoreService.deleteAuthor(author.id);
        await loadAuthors();
      } catch (error) {
        toast({ title: "Nie udało się usunąć autora", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
      }
      return;
    }
    const { error } = await supabase.from("authors").delete().eq("id", author.id);
    if (error) toast({ title: "Nie udało się usunąć autora", description: error.message, variant: "destructive" }); else loadAuthors();
  };
  const filtered = authors.filter((a) => `${a.display_name} ${a.email || ""} ${a.social_handle || ""}`.toLowerCase().includes(query.toLowerCase()));
  const field = (label: string, key: keyof FormState, placeholder?: string) => <label className="space-y-1 text-sm"><span className="font-medium">{label}</span><Input value={String(form[key] ?? "")} onChange={(e) => setField(key, e.target.value as never)} placeholder={placeholder} /></label>;

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-medium text-primary">Licencje i autorstwo</p><h2 className="font-display text-2xl font-bold">Autorzy</h2><p className="text-sm text-muted-foreground">Rejestr autorów zdjęć, umów i sposobu oznaczenia na Podróżówkach.</p></div><Button onClick={startNew}><Plus className="mr-2 h-4 w-4" />Dodaj autora</Button></div>
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="rounded-2xl border bg-card p-4 shadow-sm"><div className="mb-4 flex items-center justify-between gap-3"><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Szukaj autora, e-maila lub profilu…" /><span className="text-xs text-muted-foreground">{filtered.length} autorów</span></div>{loading ? <p className="py-8 text-center text-muted-foreground">Wczytywanie…</p> : filtered.length === 0 ? <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">Brak autorów. Dodaj pierwszego autora, aby przypisywać go do wzorów.</div> : <div className="space-y-3">{filtered.map((author) => <article key={author.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border p-4"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-muted">{author.avatar_url ? <img src={author.avatar_url} alt="" className="h-full w-full object-cover" /> : <UserRound className="h-5 w-5 text-muted-foreground" />}</div><div><h3 className="font-semibold">{author.display_name}</h3><p className="text-sm text-muted-foreground">{author.email || "Brak e-maila"}{author.social_handle ? ` · ${author.social_handle}` : ""}</p><span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs ${author.agreement_status === "signed" ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground"}`}>{statusLabels[author.agreement_status]}</span></div></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => startEdit(author)}><Pencil className="mr-1 h-4 w-4" />Edytuj</Button><Button variant="ghost" size="sm" className="text-destructive" onClick={() => remove(author)}><Trash2 className="h-4 w-4" /></Button></div></article>)}</div>}</section>
      <section className="rounded-2xl border bg-card p-5 shadow-sm"><div className="mb-4 flex items-center justify-between"><h3 className="font-display text-lg font-semibold">{editingId ? "Edytuj autora" : "Nowy autor"}</h3>{editingId && <Button variant="ghost" size="sm" onClick={startNew}><X className="mr-1 h-4 w-4" />Anuluj</Button>}</div><div className="space-y-3">{field("Nazwa wyświetlana *", "display_name", "np. Anna Kowalska")}{field("Imię i nazwisko / nazwa prawna", "legal_name")}{field("E-mail", "email", "autor@example.com")}{field("Profil / Instagram", "social_handle", "@nazwa")}{field("Strona internetowa", "website_url", "https://…")}{field("URL zdjęcia profilowego", "avatar_url", "https://…")}<label className="space-y-1 text-sm"><span className="font-medium">Status umowy</span><Select value={form.agreement_status} onValueChange={(v) => setField("agreement_status", v as AgreementStatus)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(statusLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></label><div className="grid grid-cols-2 gap-3">{field("Podpisana dnia", "agreement_signed_at", "RRRR-MM-DD")}{field("Wygasa dnia", "agreement_expires_at", "RRRR-MM-DD")}</div>{field("Link do umowy", "agreement_file_url", "https://…")}<label className="space-y-1 text-sm"><span className="font-medium">Biogram</span><Textarea value={form.bio || ""} onChange={(e) => setField("bio", e.target.value)} rows={3} /></label><label className="space-y-1 text-sm"><span className="font-medium">Notatki wewnętrzne</span><Textarea value={form.notes || ""} onChange={(e) => setField("notes", e.target.value)} rows={3} /></label><Button className="w-full" onClick={save} disabled={saving}><Save className="mr-2 h-4 w-4" />{saving ? "Zapisywanie…" : "Zapisz autora"}</Button></div></section>
    </div>
    <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-sm text-blue-950"><div className="flex gap-2"><FileText className="mt-0.5 h-4 w-4 shrink-0" /><p>Autorzy są osobną kartoteką. Usunięcie autora nie usuwa wzorów — przypisanie zostaje wyczyszczone dzięki <code>ON DELETE SET NULL</code>. Dane umowy przechowuj w bezpiecznym miejscu i nie publikuj PESEL ani pełnego adresu.</p></div></div>
  </div>;
}
