import { useState, useEffect, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { Plus, Pencil, Trash2, Check, X, ShoppingBag, Upload, ArrowUp, ArrowDown, Search, ArrowUpDown, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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

interface Country {
  id: string;
  iso2: string;
  name_pl: string;
}

interface Category {
  id: string;
  name: string;
  icon_url: string | null;
  sort_order: number;
}

interface ExtraImage {
  id: string;
  card_design_id: string;
  url: string;
  sort_order: number;
}

interface CardDesignRowWithCountry {
  id: string;
  country_id: string;
  category_id: string | null;
  language_code: string;
  view_no: number;
  title: string | null;
  description: string | null;
  thank_you_text: string | null;
  image_front_url: string | null;
  price_grosze: number;
  currency: string;
  active: boolean;
  created_at: string;
  updated_at: string;
  countries: {
    name_pl: string;
  } | null;
  categories: {
    name: string;
  } | null;
}

interface CardDesignUnit {
  card_design_id: string;
}

interface ProductRow {
  id: string;
  country_id: string;
  category_id: string | null;
  language_code: string;
  view_no: number;
  title: string | null;
  description: string | null;
  thank_you_text: string | null;
  image_front_url: string | null;
  price_grosze: number;
  currency: string;
  active: boolean;
  created_at: string;
  updated_at: string;
  country_name?: string;
}

type SortKey = "title" | "price" | "created_at";
type SortDir = "asc" | "desc";

const emptyForm = {
  country_id: "",
  category_id: "",
  language_code: "pl",
  view_no: 1,
  title: "",
  description: "",
  thank_you_text: "",
  image_front_url: "",
  price_pln: "",
  active: true,
};

type FormState = typeof emptyForm;
type FormErrors = Partial<Record<keyof FormState | "source_design_id", string>>;

const buildProductTitle = (design: CardDesignRowWithCountry) => {
  const country = design.countries?.name_pl || "Nieznany kraj";
  const categoryInitial = design.categories?.name?.trim().charAt(0).toLocaleUpperCase("pl-PL") || "O";
  const view = String(design.view_no).padStart(2, "0");
  const language = design.language_code.toUpperCase();
  return `Podróżówka ${country}, ${categoryInitial} V${view} ${language}`;
};

const formatPln = (grosze: number) =>
  (grosze / 100).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " zł";

const AdminProducts = () => {
  const { isAdmin } = useAuth();
  const { toast } = useToast();

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [designs, setDesigns] = useState<CardDesignRowWithCountry[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stockMap, setStockMap] = useState<Record<string, number>>({});
  const [extraImages, setExtraImages] = useState<ExtraImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sourceDesignId, setSourceDesignId] = useState("");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [deleteTarget, setDeleteTarget] = useState<ProductRow | null>(null);

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    const [{ data: designs }, { data: countriesData }, { data: categoriesData }, { data: units }] = await Promise.all([
      supabase
        .from("card_designs")
        .select("*, countries!inner(name_pl), categories(name)")
        .order("created_at", { ascending: false }),
      supabase.from("countries").select("id, iso2, name_pl").order("name_pl"),
      supabase.from("categories").select("id, name, icon_url, sort_order").order("sort_order").order("name"),
      supabase
        .from("inventory_units")
        .select("card_design_id")
        .eq("fulfillment_status", "in_stock")
        .is("order_id", null),
    ]);

    if (designs) {
      const typedDesigns = designs as unknown as CardDesignRowWithCountry[];
      setDesigns(typedDesigns);
      setProducts(
        typedDesigns.filter((d) => d.active).map((d: CardDesignRowWithCountry) => ({
          ...d,
          country_name: d.countries?.name_pl || undefined,
        })),
      );
    }
    if (countriesData) setCountries(countriesData as Country[]);
    if (categoriesData) setCategories(categoriesData as Category[]);

    const map: Record<string, number> = {};
    const typedUnits = (units || []) as unknown as CardDesignUnit[];
    typedUnits.forEach((u: CardDesignUnit) => {
      map[u.card_design_id] = (map[u.card_design_id] || 0) + 1;
    });
    setStockMap(map);

    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const openAdd = () => {
    setEditingId(null);
    setSourceDesignId("");
    setForm({ ...emptyForm, price_pln: "4.99" });
    setErrors({});
    setExtraImages([]);
    setShowDialog(true);
  };

  const openEdit = async (p: ProductRow) => {
    setEditingId(p.id);
    setForm({
      country_id: p.country_id,
      category_id: p.category_id || "",
      language_code: p.language_code,
      view_no: p.view_no,
      title: p.title || "",
      description: p.description || "",
      thank_you_text: p.thank_you_text || "",
      image_front_url: p.image_front_url || "",
      price_pln: (p.price_grosze / 100).toFixed(2),
      active: p.active,
    });
    setErrors({});
    setShowDialog(true);

    const { data } = await supabase
      .from("card_design_images")
      .select("*")
      .eq("card_design_id", p.id)
      .order("sort_order", { ascending: true });
    setExtraImages((data as ExtraImage[]) || []);
  };

  const handleDuplicate = (p: ProductRow) => {
    setEditingId(null);
    setForm({
      country_id: "",
      category_id: p.category_id || "",
      language_code: p.language_code,
      view_no: 1,
      title: p.title || "",
      description: p.description || "",
      thank_you_text: p.thank_you_text || "",
      image_front_url: "",
      price_pln: p.price_grosze > 0 ? (p.price_grosze / 100).toFixed(2) : "",
      active: false,
    });
    setErrors({});
    setExtraImages([]);
    setShowDialog(true);
    toast({ title: "Duplikuję produkt", description: "Wybierz kraj i zapisz jako nowy rekord." });
  };

  const closeDialog = () => {
    setShowDialog(false);
    setEditingId(null);
    setSourceDesignId("");
    setForm(emptyForm);
    setErrors({});
    setExtraImages([]);
  };

  const validate = (): FormErrors => {
    const e: FormErrors = {};
    if (!editingId) {
      if (!sourceDesignId) e.source_design_id = "Wybierz wzór z kreatora";
      const priceStr = form.price_pln.replace(",", ".").trim();
      if (!priceStr) e.price_pln = "Cena jest wymagana";
      else {
        const parsed = Number(priceStr);
        if (!Number.isFinite(parsed) || parsed <= 0) e.price_pln = "Cena musi być większa od 0";
        else if (!/^\d+(\.\d{1,2})?$/.test(priceStr)) e.price_pln = "Maks. 2 miejsca po przecinku";
      }
      return e;
    }
    if (!form.title.trim()) e.title = "Nazwa jest wymagana";
    else if (form.title.length > 200) e.title = "Nazwa może mieć maks. 200 znaków";
    if (form.description && form.description.length > 2000) e.description = "Opis może mieć maks. 2000 znaków";
    if (!form.country_id) e.country_id = "Wybierz kraj";
    if (!form.language_code.trim()) e.language_code = "Podaj kod języka";
    if (!Number.isInteger(form.view_no) || form.view_no < 1) e.view_no = "Numer widoku musi być liczbą ≥ 1";

    const priceStr = form.price_pln.replace(",", ".").trim();
    if (!priceStr) e.price_pln = "Cena jest wymagana";
    else {
      const parsed = Number(priceStr);
      if (!Number.isFinite(parsed)) e.price_pln = "Podaj poprawną liczbę";
      else if (parsed <= 0) e.price_pln = "Cena musi być większa od 0";
      else if (!/^\d+(\.\d{1,2})?$/.test(priceStr)) e.price_pln = "Maks. 2 miejsca po przecinku";
    }
    return e;
  };

  const handleSave = async () => {
    const eMap = validate();
    setErrors(eMap);
    if (Object.keys(eMap).length > 0) return;

    setSaving(true);
    const priceGrosze = Math.round(Number(form.price_pln.replace(",", ".")) * 100);
    const payload = {
      country_id: form.country_id,
      category_id: form.category_id || null,
      language_code: form.language_code.trim(),
      view_no: form.view_no,
      title: form.title.trim(),
      description: form.description.trim() || null,
      thank_you_text: form.thank_you_text.trim() || null,
      image_front_url: form.image_front_url.trim() || null,
      price_grosze: priceGrosze,
      currency: "PLN",
      active: form.active,
    };

    if (editingId) {
      const { error } = await supabase.from("card_designs").update(payload).eq("id", editingId);
      setSaving(false);
      if (error) {
        toast({ title: "Błąd zapisu", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Produkt zaktualizowany" });
    } else {
      const sourceDesign = designs.find((design) => design.id === sourceDesignId);
      if (!sourceDesign) {
        setSaving(false);
        toast({ title: "Wzór nie został odnaleziony", variant: "destructive" });
        return;
      }
      const { error } = await supabase
        .from("card_designs")
        .update({
          title: buildProductTitle(sourceDesign),
          price_grosze: priceGrosze,
          currency: "PLN",
          active: true,
        })
        .eq("id", sourceDesignId);
      setSaving(false);
      if (error) {
        toast({ title: "Błąd dodawania", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Produkt opublikowany w sklepie" });
    }

    closeDialog();
    fetchAll();
  };

  const uploadMainImage = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Wybierz plik graficzny", description: `Otrzymany typ: ${file.type || "nieznany"}`, variant: "destructive" });
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast({ title: "Maks. 8 MB", description: `Plik ma ${Math.round(file.size / 1024)} KB`, variant: "destructive" });
      return;
    }
    setUploading(true);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `products/${editingId || "new"}/main-${Date.now()}.${ext}`;
    await logUploadAttempt({ bucket: "postcard-photos", path, file, extra: { productId: editingId, categoryId: form.category_id } });
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
    setForm((f) => ({ ...f, image_front_url: data.publicUrl }));
    console.info("[upload] main image ok", { path, url: data.publicUrl });
    setUploading(false);
  };

  const uploadExtraImage = async (file: File) => {
    if (!editingId) {
      toast({ title: "Zapisz produkt zanim dodasz galerię", variant: "destructive" });
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast({ title: "Wybierz plik graficzny", description: `Otrzymany typ: ${file.type || "nieznany"}`, variant: "destructive" });
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast({ title: "Maks. 8 MB", description: `Plik ma ${Math.round(file.size / 1024)} KB`, variant: "destructive" });
      return;
    }
    setUploading(true);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `products/${editingId}/extra-${Date.now()}.${ext}`;
    await logUploadAttempt({ bucket: "postcard-photos", path, file, extra: { productId: editingId, categoryId: form.category_id } });
    const { error: upErr } = await supabase.storage.from("postcard-photos").upload(path, file, {
      cacheControl: "3600",
    });
    if (upErr) {
      setUploading(false);
      const info = diagnoseUploadError(upErr, { bucket: "postcard-photos", path, file });
      toast({ title: `[${info.category.toUpperCase()}] ${info.title}`, description: info.description, variant: "destructive" });
      return;
    }
    const { data } = supabase.storage.from("postcard-photos").getPublicUrl(path);
    const nextOrder = extraImages.length > 0 ? Math.max(...extraImages.map((i) => i.sort_order)) + 1 : 0;
    const { data: inserted, error: insErr } = await supabase
      .from("card_design_images")
      .insert({ card_design_id: editingId, url: data.publicUrl, sort_order: nextOrder })
      .select()
      .single();
    setUploading(false);
    if (insErr) {
      console.error("[upload] extra image db insert failed", { path, insErr });
      toast({ title: "[DB] Błąd zapisu zdjęcia w bazie", description: `${insErr.message} — plik został wgrany, ale nie zapisano rekordu w card_design_images.`, variant: "destructive" });
      return;
    }
    console.info("[upload] extra image ok", { path, url: data.publicUrl });
    setExtraImages((prev) => [...prev, inserted as ExtraImage]);
  };

  const removeExtraImage = async (id: string) => {
    const { error } = await supabase.from("card_design_images").delete().eq("id", id);
    if (error) {
      toast({ title: "Nie udało się usunąć", description: error.message, variant: "destructive" });
      return;
    }
    setExtraImages((prev) => prev.filter((i) => i.id !== id));
  };

  const moveExtraImage = async (id: string, dir: -1 | 1) => {
    const idx = extraImages.findIndex((i) => i.id === id);
    const swapIdx = idx + dir;
    if (idx < 0 || swapIdx < 0 || swapIdx >= extraImages.length) return;
    const a = extraImages[idx];
    const b = extraImages[swapIdx];
    const next = [...extraImages];
    next[idx] = { ...b, sort_order: a.sort_order };
    next[swapIdx] = { ...a, sort_order: b.sort_order };
    setExtraImages(next);
    await Promise.all([
      supabase.from("card_design_images").update({ sort_order: b.sort_order }).eq("id", a.id),
      supabase.from("card_design_images").update({ sort_order: a.sort_order }).eq("id", b.id),
    ]);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase
      .from("card_designs")
      .update({ active: false })
      .eq("id", deleteTarget.id);
    if (error) {
      toast({ title: "Nie udało się wycofać produktu", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Produkt wycofany ze sklepu. Wzór pozostał w kreatorze." });
      fetchAll();
    }
    setDeleteTarget(null);
  };

  const toggleActive = async (p: ProductRow) => {
    const { error } = await supabase.from("card_designs").update({ active: !p.active }).eq("id", p.id);
    if (error) {
      toast({ title: "Błąd", description: error.message, variant: "destructive" });
      return;
    }
    fetchAll();
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? products.filter((p) => (p.title || "").toLowerCase().includes(q))
      : products;
    const sorted = [...filtered].sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";
      if (sortKey === "title") {
        av = (a.title || "").toLowerCase();
        bv = (b.title || "").toLowerCase();
      } else if (sortKey === "price") {
        av = a.price_grosze;
        bv = b.price_grosze;
      } else {
        av = a.created_at;
        bv = b.created_at;
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [products, search, sortKey, sortDir]);

  if (!isAdmin) return null;
  if (isLoading) return <div className="animate-pulse text-muted-foreground text-center py-8">Ładowanie...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="font-display text-xl font-bold text-foreground flex items-center gap-2">
          <ShoppingBag className="w-5 h-5 text-primary" /> Produkty ({products.length})
        </h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Szukaj po nazwie..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9 w-56"
            />
          </div>
          <Button size="sm" onClick={openAdd}>
            <Plus className="w-4 h-4 mr-1" /> Dodaj produkt
          </Button>
        </div>
      </div>

      <div className="bg-card rounded-xl shadow-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-3 font-medium text-muted-foreground w-16">Zdj.</th>
                <th className="text-left p-3 font-medium text-muted-foreground">
                  <button className="flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort("title")}>
                    Nazwa <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="text-left p-3 font-medium text-muted-foreground">Kraj</th>
                <th className="text-right p-3 font-medium text-muted-foreground">
                  <button className="flex items-center gap-1 ml-auto hover:text-foreground" onClick={() => toggleSort("price")}>
                    Cena <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="text-right p-3 font-medium text-muted-foreground">Stan mag.</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                <th className="text-right p-3 font-medium text-muted-foreground">Akcje</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => (
                <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="p-3">
                    {p.image_front_url ? (
                      <img src={p.image_front_url} alt={p.title || ""} className="w-12 h-8 object-cover rounded" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-12 h-8 rounded bg-muted" />
                    )}
                  </td>
                  <td className="p-3 font-medium">{p.title || "—"}</td>
                  <td className="p-3 text-muted-foreground">{p.country_name}</td>
                  <td className="p-3 text-right font-mono">{formatPln(p.price_grosze)}</td>
                  <td className="p-3 text-right font-mono">{stockMap[p.id] || 0}</td>
                  <td className="p-3">
                    <button
                      onClick={() => toggleActive(p)}
                      className={`px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer ${
                        p.active ? "bg-accent/15 text-accent" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {p.active ? "Aktywny" : "Nieaktywny"}
                    </button>
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(p)} className="p-1.5 rounded hover:bg-muted" aria-label="Edytuj">
                        <Pencil className="w-4 h-4 text-muted-foreground" />
                      </button>
                      <button onClick={() => handleDuplicate(p)} className="p-1.5 rounded hover:bg-muted" aria-label="Duplikuj">
                        <Copy className="w-4 h-4 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(p)}
                        className="p-1.5 rounded hover:bg-destructive/10"
                        aria-label="Usuń"
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    {search ? "Brak produktów pasujących do wyszukiwania" : "Brak produktów"}
                  </td>
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
            className="bg-card rounded-xl shadow-lg border border-border w-full max-w-3xl my-8"
          >
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-display text-lg font-bold">
                {editingId ? "Edytuj produkt" : "Dodaj produkt ze wzoru"}
              </h3>
              <button onClick={closeDialog} className="p-1 rounded hover:bg-muted">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {!editingId && (
                <div>
                  <label className="text-xs text-muted-foreground">Wzór z kreatora *</label>
                  <select
                    value={sourceDesignId}
                    onChange={(e) => setSourceDesignId(e.target.value)}
                    className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm"
                  >
                    <option value="">Wybierz zapisany wzór...</option>
                    {designs.map((design) => (
                      <option key={design.id} value={design.id}>
                        {design.countries?.name_pl || "—"} — V{design.view_no} {design.title ? `(${design.title})` : ""}
                      </option>
                    ))}
                  </select>
                  {errors.source_design_id && <p className="text-xs text-destructive mt-1">{errors.source_design_id}</p>}
                  <div className="mt-4 max-w-xs">
                    <label className="text-xs text-muted-foreground">Cena (PLN) *</label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.price_pln}
                      onChange={(e) => setForm({ ...form, price_pln: e.target.value })}
                      placeholder="np. 19.99"
                    />
                    {errors.price_pln && <p className="text-xs text-destructive mt-1">{errors.price_pln}</p>}
                  </div>
                </div>
              )}
              {editingId && <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Nazwa *</label>
                  <Input
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="Brama Brandenburska"
                    maxLength={200}
                  />
                  {errors.title && <p className="text-xs text-destructive mt-1">{errors.title}</p>}
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Cena (PLN) *</label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.price_pln}
                    onChange={(e) => setForm({ ...form, price_pln: e.target.value })}
                    placeholder="9.99"
                  />
                  {errors.price_pln && <p className="text-xs text-destructive mt-1">{errors.price_pln}</p>}
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Opis</label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  placeholder="Krótki opis produktu widoczny w sklepie..."
                  maxLength={2000}
                />
                {errors.description && <p className="text-xs text-destructive mt-1">{errors.description}</p>}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Kraj *</label>
                  <select
                    value={form.country_id}
                    onChange={(e) => setForm({ ...form, country_id: e.target.value })}
                    className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm"
                  >
                    <option value="">Wybierz kraj</option>
                    {countries.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name_pl}
                      </option>
                    ))}
                  </select>
                  {errors.country_id && <p className="text-xs text-destructive mt-1">{errors.country_id}</p>}
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Język</label>
                  <Input
                    value={form.language_code}
                    onChange={(e) => setForm({ ...form, language_code: e.target.value })}
                    placeholder="pl"
                    maxLength={5}
                  />
                  {errors.language_code && <p className="text-xs text-destructive mt-1">{errors.language_code}</p>}
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Nr widoku</label>
                  <Input
                    type="number"
                    min={1}
                    value={form.view_no}
                    onChange={(e) => setForm({ ...form, view_no: parseInt(e.target.value) || 1 })}
                  />
                  {errors.view_no && <p className="text-xs text-destructive mt-1">{errors.view_no}</p>}
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Kategoria</label>
                <select
                  value={form.category_id}
                  onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                  className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm"
                >
                  <option value="">— Brak kategorii —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Tekst podziękowania (opcjonalny)</label>
                <Textarea
                  value={form.thank_you_text}
                  onChange={(e) => setForm({ ...form, thank_you_text: e.target.value })}
                  rows={2}
                  placeholder="Dziękujemy za..."
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Zdjęcie główne</label>
                <div className="flex items-center gap-3">
                  {form.image_front_url ? (
                    <img src={form.image_front_url} alt="" className="w-24 h-16 object-cover rounded border border-border" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-24 h-16 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">
                      brak
                    </div>
                  )}
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) uploadMainImage(f);
                        e.target.value = "";
                      }}
                    />
                    <span className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-md border border-input bg-background hover:bg-muted">
                      <Upload className="w-4 h-4" /> {uploading ? "Wysyłanie..." : "Wgraj zdjęcie"}
                    </span>
                  </label>
                  {form.image_front_url && (
                    <Button variant="ghost" size="sm" onClick={() => setForm({ ...form, image_front_url: "" })}>
                      Usuń
                    </Button>
                  )}
                </div>
                <Input
                  value={form.image_front_url}
                  onChange={(e) => setForm({ ...form, image_front_url: e.target.value })}
                  placeholder="lub wklej URL"
                />
              </div>

              {editingId && (
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Dodatkowe zdjęcia</label>
                  <div className="flex flex-wrap gap-2">
                    {extraImages.map((img, idx) => (
                      <div key={img.id} className="relative group">
                        <img src={img.url} alt="" className="w-20 h-20 object-cover rounded border border-border" referrerPolicy="no-referrer" />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded flex items-center justify-center gap-1">
                          <button
                            onClick={() => moveExtraImage(img.id, -1)}
                            disabled={idx === 0}
                            className="p-1 rounded bg-white/20 hover:bg-white/40 disabled:opacity-30"
                            aria-label="W górę"
                          >
                            <ArrowUp className="w-3 h-3 text-white" />
                          </button>
                          <button
                            onClick={() => moveExtraImage(img.id, 1)}
                            disabled={idx === extraImages.length - 1}
                            className="p-1 rounded bg-white/20 hover:bg-white/40 disabled:opacity-30"
                            aria-label="W dół"
                          >
                            <ArrowDown className="w-3 h-3 text-white" />
                          </button>
                          <button
                            onClick={() => removeExtraImage(img.id)}
                            className="p-1 rounded bg-destructive/80 hover:bg-destructive"
                            aria-label="Usuń"
                          >
                            <Trash2 className="w-3 h-3 text-white" />
                          </button>
                        </div>
                      </div>
                    ))}
                    <label className="cursor-pointer w-20 h-20 rounded border-2 border-dashed border-border flex items-center justify-center hover:bg-muted">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) uploadExtraImage(f);
                          e.target.value = "";
                        }}
                      />
                      <Plus className="w-5 h-5 text-muted-foreground" />
                    </label>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <Switch
                  checked={form.active}
                  onCheckedChange={(v) => setForm({ ...form, active: v })}
                  id="active-switch"
                />
                <label htmlFor="active-switch" className="text-sm cursor-pointer">
                  {form.active ? "Aktywny — widoczny w sklepie" : "Nieaktywny — ukryty"}
                </label>
              </div>
              </>}
            </div>

            <div className="flex justify-end gap-2 p-4 border-t border-border">
              <Button variant="outline" onClick={closeDialog}>
                <X className="w-4 h-4 mr-1" /> Anuluj
              </Button>
              <Button onClick={handleSave} disabled={saving || uploading}>
                <Check className="w-4 h-4 mr-1" /> {editingId ? "Zapisz" : "Dodaj produkt"}
              </Button>
            </div>
          </motion.div>
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Wycofać produkt ze sklepu?</AlertDialogTitle>
            <AlertDialogDescription>
              Produkt przestanie być widoczny w sklepie. Wzór pozostanie dostępny w Kreatorze wzorów.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Wycofaj ze sklepu
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminProducts;
