import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Plus, Pencil, Trash2, Check, X, Tags, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { diagnoseUploadError, logUploadAttempt } from "@/lib/uploadDiagnostics";
import { slugify } from "@/lib/slugify";
import { getCategoryIcon } from "@/lib/categoryIcons";
import { firestoreService } from "@/integrations/firebase/services/firestoreService";
import { isFirestoreCatalogEnabled } from "@/integrations/firebase/config";

interface Category {
  id: string;
  name: string;
  slug: string;
  icon_url: string | null;
  sort_order: number;
  created_at: string;
}

interface AdminCategoryDesignJoin {
  category_id: string | null;
}

const emptyForm = { name: "", slug: "", icon_url: "", sort_order: 0 };

const AdminCategories = () => {
  const { isAdmin } = useAuth();
  const { toast } = useToast();

  const [categories, setCategories] = useState<Category[]>([]);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);

  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [blockedDelete, setBlockedDelete] = useState<{ cat: Category; count: number } | null>(null);

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    if (isFirestoreCatalogEnabled) {
      const [categoryData, designData] = await Promise.all([
        firestoreService.getCategories(),
        firestoreService.getCardDesigns({ includeInactive: true }),
      ]);
      setCategories(categoryData.map((category) => ({
        id: category.id,
        name: category.name_pl || category.name || category.slug,
        slug: category.slug,
        icon_url: category.icon_url || category.icon || null,
        sort_order: category.sort_order || 0,
        created_at: category.created_at || "",
      })));
      const counts: Record<string, number> = {};
      designData.forEach((design) => {
        if (design.category_id) counts[design.category_id] = (counts[design.category_id] || 0) + 1;
      });
      setUsage(counts);
      setIsLoading(false);
      return;
    }
    const [{ data: cats }, { data: designs }] = await Promise.all([
      supabase.from("categories").select("*").order("sort_order").order("name"),
      supabase.from("card_designs").select("category_id"),
    ]);
    const rawCategories = (cats as Category[]) || [];
    const normalized = rawCategories.map((c) => {
      if (c.slug === "architektura" && c.icon_url && c.icon_url.includes("architektura-1784144956289.png")) {
        supabase.from("categories").update({ icon_url: null }).eq("id", c.id).then();
        return { ...c, icon_url: null };
      }
      return c;
    });
    setCategories(normalized);
    const u: Record<string, number> = {};
    const typedDesigns = (designs || []) as unknown as AdminCategoryDesignJoin[];
    typedDesigns.forEach((d: AdminCategoryDesignJoin) => {
      if (d.category_id) u[d.category_id] = (u[d.category_id] || 0) + 1;
    });
    setUsage(u);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const openAdd = () => {
    setEditingId(null);
    setForm({ ...emptyForm, sort_order: (categories.at(-1)?.sort_order ?? 0) + 10 });
    setSlugTouched(false);
    setShowDialog(true);
  };

  const openEdit = (c: Category) => {
    setEditingId(c.id);
    setForm({ name: c.name, slug: c.slug, icon_url: c.icon_url || "", sort_order: c.sort_order });
    setSlugTouched(true);
    setShowDialog(true);
  };

  const closeDialog = () => {
    setShowDialog(false);
    setEditingId(null);
    setForm(emptyForm);
    setSlugTouched(false);
  };

  const handleNameChange = (val: string) => {
    setForm((f) => ({
      ...f,
      name: val,
      slug: slugTouched ? f.slug : slugify(val),
    }));
  };

  const uploadIcon = async (file: File) => {
    if (isFirestoreCatalogEnabled) {
      toast({ title: "Wgrywanie ikon jest wyłączone w trybie Spark", description: "Użyj domyślnej ikony kategorii lub opublikowanego adresu HTTPS." });
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast({ title: "Wybierz plik graficzny", description: `Otrzymany typ: ${file.type || "nieznany"}`, variant: "destructive" });
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      toast({ title: "Maks. 4 MB", description: `Plik ma ${Math.round(file.size / 1024)} KB`, variant: "destructive" });
      return;
    }
    setUploading(true);
    const ext = file.name.split(".").pop() || "png";
    const s = form.slug || slugify(form.name) || "cat";
    const path = `categories/${s}-${Date.now()}.${ext}`;
    await logUploadAttempt({ bucket: "postcard-photos", path, file, extra: { categoryId: editingId, slug: s } });
    const { error } = await supabase.storage.from("postcard-photos").upload(path, file, {
      cacheControl: "3600",
    });
    if (error) {
      setUploading(false);
      const info = diagnoseUploadError(error, { bucket: "postcard-photos", path, file });
      toast({ title: `[${info.category.toUpperCase()}] ${info.title}`, description: info.description, variant: "destructive" });
      return;
    }
    const { data } = supabase.storage.from("postcard-photos").getPublicUrl(path);
    setForm((f) => ({ ...f, icon_url: data.publicUrl }));
    console.info("[upload] category icon ok", { path, url: data.publicUrl });
    setUploading(false);
  };

  const handleSave = async () => {
    const name = form.name.trim();
    const slug = (form.slug || slugify(name)).trim();
    if (!name) {
      toast({ title: "Nazwa jest wymagana", variant: "destructive" });
      return;
    }
    if (!/^[a-z0-9-]+$/.test(slug)) {
      toast({ title: "Slug: tylko małe litery, cyfry i myślnik", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      name,
      slug,
      icon_url: form.icon_url.trim() || null,
      sort_order: Number(form.sort_order) || 0,
    };
    if (isFirestoreCatalogEnabled) {
      try {
        await firestoreService.upsertCategory(editingId || crypto.randomUUID(), payload);
        toast({ title: editingId ? "Kategoria zaktualizowana" : "Kategoria dodana" });
        closeDialog();
        fetchAll();
      } catch (error) {
        toast({ title: "Błąd zapisu", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
      } finally {
        setSaving(false);
      }
      return;
    }
    const { error } = editingId
      ? await supabase.from("categories").update(payload).eq("id", editingId)
      : await supabase.from("categories").insert(payload);
    setSaving(false);
    if (error) {
      toast({ title: "Błąd zapisu", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: editingId ? "Kategoria zaktualizowana" : "Kategoria dodana" });
    closeDialog();
    fetchAll();
  };

  const tryDelete = (c: Category) => {
    const count = usage[c.id] || 0;
    if (count > 0) {
      setBlockedDelete({ cat: c, count });
      return;
    }
    setDeleteTarget(c);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    if (isFirestoreCatalogEnabled) {
      try {
        await firestoreService.deleteCategory(deleteTarget.id);
        toast({ title: "Kategoria usunięta" });
        fetchAll();
      } catch (error) {
        toast({ title: "Nie udało się usunąć", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
      }
      setDeleteTarget(null);
      return;
    }
    const { error } = await supabase.from("categories").delete().eq("id", deleteTarget.id);
    if (error) {
      toast({ title: "Nie udało się usunąć", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Kategoria usunięta" });
      fetchAll();
    }
    setDeleteTarget(null);
  };

  if (!isAdmin) return null;
  if (isLoading) return <div className="animate-pulse text-muted-foreground text-center py-8">Ładowanie...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="font-display text-xl font-bold text-foreground flex items-center gap-2">
          <Tags className="w-5 h-5 text-primary" /> Kategorie ({categories.length})
        </h2>
        <Button size="sm" onClick={openAdd}>
          <Plus className="w-4 h-4 mr-1" /> Dodaj kategorię
        </Button>
      </div>

      <div className="bg-card rounded-xl shadow-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-3 font-medium text-muted-foreground w-16">Ikona</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Nazwa</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Slug</th>
                <th className="text-right p-3 font-medium text-muted-foreground">Sort</th>
                <th className="text-right p-3 font-medium text-muted-foreground">Użycie</th>
                <th className="text-right p-3 font-medium text-muted-foreground">Akcje</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="p-3">
                    {c.icon_url ? (
                      <img src={c.icon_url} alt="" className="w-8 h-8 object-cover rounded" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded bg-primary/10 text-primary" title={`Domyślna ikona: ${c.name}`}>
                        {(() => {
                          const CategoryIcon = getCategoryIcon(c.slug);
                          return <CategoryIcon className="h-4 w-4" aria-hidden="true" />;
                        })()}
                      </div>
                    )}
                  </td>
                  <td className="p-3 font-medium">{c.name}</td>
                  <td className="p-3 text-muted-foreground font-mono text-xs">{c.slug}</td>
                  <td className="p-3 text-right font-mono">{c.sort_order}</td>
                  <td className="p-3 text-right font-mono">{usage[c.id] || 0}</td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(c)} className="p-1.5 rounded hover:bg-muted" aria-label="Edytuj">
                        <Pencil className="w-4 h-4 text-muted-foreground" />
                      </button>
                      <button onClick={() => tryDelete(c)} className="p-1.5 rounded hover:bg-destructive/10" aria-label="Usuń">
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {categories.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground">Brak kategorii</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showDialog && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-start md:items-center justify-center p-4 overflow-y-auto">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card rounded-xl shadow-lg border border-border w-full max-w-lg my-8"
          >
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-display text-lg font-bold">{editingId ? "Edytuj kategorię" : "Nowa kategoria"}</h3>
              <button onClick={closeDialog} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="text-xs text-muted-foreground">Nazwa *</label>
                <Input value={form.name} onChange={(e) => handleNameChange(e.target.value)} placeholder="Góry" maxLength={100} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Slug *</label>
                <Input
                  value={form.slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setForm({ ...form, slug: e.target.value });
                  }}
                  placeholder="gory"
                  maxLength={100}
                />
                <p className="text-xs text-muted-foreground mt-1">Tylko małe litery, cyfry i myślnik.</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Kolejność</label>
                <Input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Ikona</label>
                <div className="flex items-center gap-3">
                  {form.icon_url ? (
                    <img src={form.icon_url} alt="" className="w-16 h-16 object-cover rounded border border-border" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-16 h-16 rounded bg-muted flex items-center justify-center text-primary">
                      {(() => {
                        const CategoryIcon = getCategoryIcon(form.slug);
                        return <CategoryIcon className="h-7 w-7" aria-hidden="true" />;
                      })()}
                    </div>
                  )}
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) uploadIcon(f);
                        e.target.value = "";
                      }}
                    />
                    <span className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-md border border-input bg-background hover:bg-muted">
                      <Upload className="w-4 h-4" /> {uploading ? "Wysyłanie..." : "Wgraj ikonę"}
                    </span>
                  </label>
                  {form.icon_url && (
                    <Button variant="ghost" size="sm" onClick={() => setForm({ ...form, icon_url: "" })}>Usuń</Button>
                  )}
                </div>
                <Input value={form.icon_url} onChange={(e) => setForm({ ...form, icon_url: e.target.value })} placeholder="lub wklej URL" />
              </div>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t border-border">
              <Button variant="outline" onClick={closeDialog}><X className="w-4 h-4 mr-1" /> Anuluj</Button>
              <Button onClick={handleSave} disabled={saving || uploading}>
                <Check className="w-4 h-4 mr-1" /> {editingId ? "Zapisz" : "Dodaj"}
              </Button>
            </div>
          </motion.div>
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Usunąć kategorię?</AlertDialogTitle>
            <AlertDialogDescription>
              Czy na pewno chcesz usunąć kategorię „{deleteTarget?.name}"?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Usuń
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!blockedDelete} onOpenChange={(o) => !o && setBlockedDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Nie można usunąć kategorii</AlertDialogTitle>
            <AlertDialogDescription>
              Kategoria „{blockedDelete?.cat.name}" jest przypisana do {blockedDelete?.count} kartek. Najpierw odepnij ją od tych produktów lub przypisz im inną kategorię.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setBlockedDelete(null)}>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminCategories;
