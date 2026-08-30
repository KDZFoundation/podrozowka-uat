import { useState, useEffect, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { Plus, Pencil, Archive, Check, X, ShoppingBag, ArrowUp, ArrowDown, Search, ArrowUpDown, Copy, Trash2 } from "lucide-react";
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
import { firestoreService } from "@/integrations/firebase/services/firestoreService";
import { POD_PRINT_FORMATS } from "@/lib/podPrintFormats";

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
  product_code: string;
  print_format_id: string;
  firmino_article_id: number | null;
  firmino_synced_at: string | null;
  firmino_sync_error: string | null;
  countries: {
    name_pl: string;
  } | null;
  categories: {
    name: string;
  } | null;
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
  product_code: string;
  print_format_id: string;
  firmino_article_id: number | null;
  firmino_synced_at: string | null;
  firmino_sync_error: string | null;
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
  print_format_id: POD_PRINT_FORMATS[0].print_format_id,
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
  const [extraImageUrl, setExtraImageUrl] = useState("");

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [deleteTarget, setDeleteTarget] = useState<ProductRow | null>(null);
  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const [firestoreDesigns, firestoreCountries, firestoreCategories, inStockCounts] = await Promise.all([
        firestoreService.getCardDesigns({ includeInactive: true }),
        firestoreService.getCountries(),
        firestoreService.getCategories(),
        firestoreService.getInStockUnitCounts(),
      ]);
      const countriesById = new Map(firestoreCountries.map((country) => [country.id, country]));
      const categoriesById = new Map(firestoreCategories.map((category) => [category.id, category]));
      const localRows = firestoreDesigns.map((design) => ({
        id: design.id,
        country_id: design.country_id || "",
        category_id: design.category_id || null,
        language_code: design.language_code,
        view_no: design.view_no,
        title: design.title,
        description: design.description || null,
        thank_you_text: design.thank_you_text || null,
        image_front_url: design.image_front_url || null,
        price_grosze: design.price_grosze,
        currency: design.currency,
        active: design.active,
        created_at: design.created_at || "",
        updated_at: design.updated_at || "",
        product_code: typeof design.product_code === "string" ? design.product_code : "",
        print_format_id: typeof design.print_format_id === "string" ? design.print_format_id : "",
        firmino_article_id: typeof design.firmino_article_id === "number" ? design.firmino_article_id : null,
        firmino_synced_at: typeof design.firmino_synced_at === "string" ? design.firmino_synced_at : null,
        firmino_sync_error: typeof design.firmino_sync_error === "string" ? design.firmino_sync_error : null,
        countries: countriesById.get(design.country_id || "")
          ? { name_pl: countriesById.get(design.country_id || "")!.name_pl || countriesById.get(design.country_id || "")!.name }
          : null,
        categories: categoriesById.get(design.category_id || "")
          ? { name: categoriesById.get(design.category_id || "")!.name_pl || categoriesById.get(design.category_id || "")!.name || "" }
          : null,
      })) as CardDesignRowWithCountry[];
      setDesigns(localRows);
      setProducts(localRows.map((design) => ({ ...design, country_name: design.countries?.name_pl || undefined })));
      setCountries(firestoreCountries.map((country) => ({ id: country.id, iso2: country.iso2 || "", name_pl: country.name_pl || country.name })));
      setCategories(firestoreCategories.map((category) => ({ id: category.id, name: category.name_pl || category.name || category.slug, icon_url: category.icon_url || category.icon || null, sort_order: category.sort_order || 0 })));
      setStockMap(inStockCounts);
    } catch (error) {
      toast({ title: "Błąd wczytywania produktów", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const openAdd = () => {
    setEditingId(null);
    setSourceDesignId("");
    setForm({ ...emptyForm, price_pln: "4.99" });
    setErrors({});
    setExtraImages([]);
    setExtraImageUrl("");
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
      print_format_id: p.print_format_id || POD_PRINT_FORMATS[0].print_format_id,
    });
    setErrors({});
    setShowDialog(true);

    const design = await firestoreService.getCardDesignById(p.id);
    setExtraImages((design?.images || []).map((image) => ({
      id: image.id,
      card_design_id: p.id,
      url: image.url,
      sort_order: image.sort_order,
    })));
    setExtraImageUrl("");
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
      print_format_id: p.print_format_id || POD_PRINT_FORMATS[0].print_format_id,
    });
    setErrors({});
    setExtraImages([]);
    setExtraImageUrl("");
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
    setExtraImageUrl("");
  };

  const validate = (): FormErrors => {
    const e: FormErrors = {};
    if (!POD_PRINT_FORMATS.some((format) => format.print_format_id === form.print_format_id)) {
      e.print_format_id = "Wybierz obsługiwany format druku";
    }
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
    if (!Number.isInteger(form.view_no) || form.view_no < 1 || form.view_no > 9999) {
      e.view_no = "Numer widoku musi być liczbą od 1 do 9999";
    }

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
      print_format_id: form.print_format_id,
    };

    if (editingId) {
      try {
        await firestoreService.upsertCardDesign(editingId, {
          ...payload,
          currency: "PLN",
          price_grosze: priceGrosze,
          active: form.active,
        });
        toast({ title: "Produkt zaktualizowany" });
        closeDialog();
        fetchAll();
      } catch (error) {
        toast({ title: "Błąd zapisu", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
      } finally {
        setSaving(false);
      }
      return;
    }

    const sourceDesign = designs.find((design) => design.id === sourceDesignId);
    if (!sourceDesign) {
      setSaving(false);
      toast({ title: "Wzór nie został odnaleziony", variant: "destructive" });
      return;
    }
    const title = buildProductTitle(sourceDesign);
    try {
        await firestoreService.upsertCardDesign(sourceDesignId, {
          title,
          price_grosze: priceGrosze,
          currency: "PLN",
          active: true,
          is_active: true,
          print_format_id: form.print_format_id,
        });
      toast({ title: "Produkt opublikowany w sklepie" });
      closeDialog();
      fetchAll();
    } catch (error) {
      toast({ title: "Błąd dodawania", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const addExtraImage = async () => {
    if (!editingId) return;
    const url = extraImageUrl.trim();
    if (!/^https:\/\//i.test(url)) {
      toast({ title: "Podaj publiczny adres HTTPS zdjęcia", variant: "destructive" });
      return;
    }
    const image: ExtraImage = {
      id: crypto.randomUUID(),
      card_design_id: editingId,
      url,
      sort_order: extraImages.length,
    };
    const next = [...extraImages, image];
    try {
      await firestoreService.setCardDesignImages(editingId, next);
      setExtraImages(next);
      setExtraImageUrl("");
    } catch (error) {
      toast({ title: "Nie udało się zapisać zdjęcia", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    }
  };

  const removeExtraImage = async (id: string) => {
    if (!editingId) return;
    const next = extraImages.filter((image) => image.id !== id).map((image, index) => ({ ...image, sort_order: index }));
    try {
      await firestoreService.setCardDesignImages(editingId, next);
      setExtraImages(next);
    } catch (error) {
      toast({ title: "Nie udało się usunąć", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    }
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
    if (!editingId) return;
    try {
      await firestoreService.setCardDesignImages(editingId, next);
      setExtraImages(next);
    } catch (error) {
      toast({ title: "Nie udało się zmienić kolejności zdjęć", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await firestoreService.setCardDesignActive(deleteTarget.id, false);
      toast({ title: "Produkt wycofany ze sklepu. Wzór pozostał w kreatorze." });
      fetchAll();
    } catch (error) {
      toast({ title: "Nie udało się wycofać produktu", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    }
    setDeleteTarget(null);
  };

  const toggleActive = async (p: ProductRow) => {
    try {
      await firestoreService.setCardDesignActive(p.id, !p.active);
      fetchAll();
    } catch (error) {
      toast({ title: "Błąd", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    }
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
                <th className="text-left p-3 font-medium text-muted-foreground">Kod produktu</th>
                <th className="text-right p-3 font-medium text-muted-foreground">
                  <button className="flex items-center gap-1 ml-auto hover:text-foreground" onClick={() => toggleSort("price")}>
                    Cena <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="text-right p-3 font-medium text-muted-foreground">Stan mag.</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Firmino</th>
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
                  <td className="p-3 font-mono text-xs whitespace-nowrap">{p.product_code || "—"}</td>
                  <td className="p-3 text-right font-mono">{formatPln(p.price_grosze)}</td>
                  <td className="p-3 text-right font-mono">{stockMap[p.id] || 0}</td>
                  <td className="p-3">
                    <span className={`text-xs ${p.firmino_article_id ? "text-accent" : "text-muted-foreground"}`}>
                      {p.firmino_article_id ? `ID ${p.firmino_article_id}` : "Nie zsynchronizowano"}
                    </span>
                  </td>
                  <td className="p-3">
                    <button
                      onClick={() => toggleActive(p)}
                      className={`px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer ${
                        p.active ? "bg-accent/15 text-accent" : "bg-muted text-muted-foreground"
                      }`}
                    >
                        {p.active ? "Aktywny" : "Archiwalny"}
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
                        className="p-1.5 rounded hover:bg-muted"
                        aria-label="Archiwizuj produkt"
                        title="Archiwizuj produkt"
                      >
                        <Archive className="w-4 h-4 text-muted-foreground" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-muted-foreground">
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
              <div>
                <label className="text-xs text-muted-foreground">Format druku POD *</label>
                <select
                  value={form.print_format_id}
                  onChange={(event) => setForm({ ...form, print_format_id: event.target.value })}
                  className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm"
                >
                  {POD_PRINT_FORMATS.map((format) => (
                    <option key={format.print_format_id} value={format.print_format_id}>
                      {format.print_format_id} — {format.netWidthMm} × {format.netHeightMm} mm
                    </option>
                  ))}
                </select>
                {errors.print_format_id && <p className="text-xs text-destructive mt-1">{errors.print_format_id}</p>}
                <p className="mt-1 text-xs text-muted-foreground">Format jest zapisywany w produkcie i kopiowany do nowych sztuk inwentarzowych.</p>
              </div>
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
                  {form.image_front_url && (
                    <Button variant="ghost" size="sm" onClick={() => setForm({ ...form, image_front_url: "" })}>
                      Usuń
                    </Button>
                  )}
                </div>
                <Input
                  value={form.image_front_url}
                  onChange={(e) => setForm({ ...form, image_front_url: e.target.value })}
                  placeholder="Wklej publiczny adres HTTPS zdjęcia"
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
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={extraImageUrl}
                      onChange={(event) => setExtraImageUrl(event.target.value)}
                      placeholder="Wklej publiczny adres HTTPS dodatkowego zdjęcia"
                    />
                    <Button type="button" variant="outline" onClick={addExtraImage}>Dodaj adres</Button>
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
              <Button onClick={handleSave} disabled={saving}>
                <Check className="w-4 h-4 mr-1" /> {editingId ? "Zapisz" : "Dodaj produkt"}
              </Button>
            </div>
          </motion.div>
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archiwizować produkt?</AlertDialogTitle>
            <AlertDialogDescription>
              Produkt przestanie być widoczny w sklepie, ale pozostanie w historii zamówień i Kreatorze wzorów. Nie usuwamy sprzedanych produktów fizycznie.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Archiwizuj produkt
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminProducts;
