import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Check,
  X,
  Languages,
  Sliders,
  Eye,
  QrCode,
  Sparkles,
  Camera,
  Globe,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { PostcardFront } from "@/components/postcard/PostcardFront";
import { PostcardBack } from "@/components/postcard/PostcardBack";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { firestoreService } from "@/integrations/firebase/services/firestoreService";
import type { FirestoreCardDesign } from "@/integrations/firebase/types";

interface Country {
  id: string;
  iso2: string;
  name_pl: string;
  flag_url: string | null;
}

interface Category {
  id: string;
  name: string;
  slug: string;
}

interface Author { id: string; display_name: string; agreement_status: string; active: boolean }

interface LanguageTemplate {
  id: string;
  country_id: string;
  language_code: string;
  language_name: string;
  front_thank_you_text: string;
  back_qr_label: string;
}

interface CropSettings {
  fit: "auto" | "crop";
  zoom: number; // 100 - 200
  x: number;    // 0 - 100
  y: number;    // 0 - 100
}

interface CardCreatorProps {
  initialDesign?: {
    id?: string;
    country_id: string;
    category_id?: string | null;
    author_id?: string | null;
    language_code: string;
    view_no: number;
    title?: string | null;
    thank_you_text: string | null;
    image_front_url: string | null;
    photo_author: string | null;
    back_qr_label: string | null;
    price_grosze?: number;
    active?: boolean;
    crop_settings?: CropSettings | unknown;
  };
  onSaveSuccess: () => void;
  onCancel: () => void;
}

export const AdminCardCreator = ({
  initialDesign,
  onSaveSuccess,
  onCancel,
}: CardCreatorProps) => {
  const [countries, setCountries] = useState<Country[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [authors, setAuthors] = useState<Author[]>([]);
  const [langTemplates, setLangTemplates] = useState<LanguageTemplate[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"front" | "back">("front");
  const { toast } = useToast();

  // Form State
  const [countryId, setCountryId] = useState(initialDesign?.country_id || "");
  const [categoryId, setCategoryId] = useState<string>(initialDesign?.category_id || "");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [languageCode, setLanguageCode] = useState(initialDesign?.language_code || "pl");
  const [viewNo, setViewNo] = useState(initialDesign?.view_no || 1);
  const [thankYouText, setThankYouText] = useState(
    initialDesign?.thank_you_text || "miejsce do wpisania treści podziękowania (w danym języku)"
  );
  const [backQrLabel, setBackQrLabel] = useState(
    initialDesign?.back_qr_label || "miejsce na wpisanie treści zeskanowania kodu (w danym języku)"
  );
  const [photoAuthor, setPhotoAuthor] = useState(initialDesign?.photo_author || "");
  const [authorId, setAuthorId] = useState(initialDesign?.author_id || "none");
  const [imageUrl, setImageUrl] = useState(initialDesign?.image_front_url || "");

  // Crop Settings State
  const parsedCrop: CropSettings = initialDesign?.crop_settings
    ? typeof initialDesign.crop_settings === "string"
      ? JSON.parse(initialDesign.crop_settings)
      : initialDesign.crop_settings
    : { fit: "auto", zoom: 100, x: 50, y: 50 };

  const [cropMode, setCropMode] = useState<"auto" | "crop">(parsedCrop.fit || "auto");
  const [zoom, setZoom] = useState<number>(parsedCrop.zoom || 100);
  const [posX, setPosX] = useState<number>(parsedCrop.x ?? 50);
  const [posY, setPosY] = useState<number>(parsedCrop.y ?? 50);

  // Fetch Countries, Categories & Templates
  const loadData = useCallback(async () => {
    try {
      const [fireCountries, fireTemplates, fireCategories, fireAuthors] = await Promise.all([
        firestoreService.getCountries(),
        // Templates are filtered after country selection, but load all once for the local creator.
        firestoreService.getLanguageTemplatesForCountry(countryId),
        firestoreService.getCategories(),
        firestoreService.getAuthors(),
      ]);
      setCountries(fireCountries.map((country) => ({
        id: country.id,
        iso2: country.iso2 || "",
        name_pl: country.name_pl || country.name,
        flag_url: country.flag_url || null,
      })));
      setLangTemplates(fireTemplates.map((template) => ({
        id: template.id,
        country_id: template.country_id,
        language_code: template.language_code,
        language_name: template.language_name,
        front_thank_you_text: template.front_thank_you_text,
        back_qr_label: template.back_qr_label,
      })));
      setCategories(fireCategories.map((category) => ({ id: category.id, name: category.name_pl || category.name || category.slug, slug: category.slug })));
      setAuthors(fireAuthors.map((author) => ({ id: author.id, display_name: author.name, agreement_status: "zaakceptowana", active: author.is_active })));
    } catch (error) {
      toast({ title: "Nie udało się wczytać danych kreatora", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    }
  }, [countryId, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // When Country or Language Template changes
  const availableTemplates = langTemplates.filter((t) => t.country_id === countryId);

  const handleCountrySelect = async (cId: string) => {
    setCountryId(cId);
    setSelectedTemplateId("");
    try {
      const templates = await firestoreService.getLanguageTemplatesForCountry(cId);
      setLangTemplates(templates.map((template) => ({
        id: template.id,
        country_id: template.country_id,
        language_code: template.language_code,
        language_name: template.language_name,
        front_thank_you_text: template.front_thank_you_text,
        back_qr_label: template.back_qr_label,
      })));
      const firstTpl = templates[0];
      if (firstTpl) {
        setSelectedTemplateId(firstTpl.id);
        setLanguageCode(firstTpl.language_code);
        setThankYouText(firstTpl.front_thank_you_text);
        setBackQrLabel(firstTpl.back_qr_label);
      }
    } catch (error) {
      toast({ title: "Nie udało się wczytać wariantów językowych", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    }

    if (cId && categoryId && !initialDesign?.id) {
      const designs = await firestoreService.getCardDesigns({ includeInactive: true });
      const matching = designs.filter((design) => design.country_id === cId && design.category_id === categoryId);
      setViewNo(Math.max(0, ...matching.map((design) => design.view_no || 0)) + 1);
    }
  };

  const handleCategorySelect = async (catId: string) => {
    setCategoryId(catId);
    if (countryId && catId && !initialDesign?.id) {
      const designs = await firestoreService.getCardDesigns({ includeInactive: true });
      const matching = designs.filter((design) => design.country_id === countryId && design.category_id === catId);
      setViewNo(Math.max(0, ...matching.map((design) => design.view_no || 0)) + 1);
    }
  };

  const handleTemplateSelect = (tplId: string) => {
    setSelectedTemplateId(tplId);
    const tpl = langTemplates.find((t) => t.id === tplId);
    if (tpl) {
      setLanguageCode(tpl.language_code);
      setThankYouText(tpl.front_thank_you_text);
      setBackQrLabel(tpl.back_qr_label);
    }
  };

  // Save Card Design
  const handleSave = async () => {
    if (!countryId) {
      toast({ title: "Wybierz kraj", variant: "destructive" });
      return;
    }
    if (!categoryId) {
      toast({ title: "Wybierz kategorię", variant: "destructive" });
      return;
    }
    if (!Number.isInteger(viewNo) || viewNo < 1 || viewNo > 9999) {
      toast({ title: "Numer widoku musi mieścić się w zakresie 1–9999", variant: "destructive" });
      return;
    }

    setIsSaving(true);

    const cropSettingsObj: CropSettings = {
      fit: cropMode,
      zoom: cropMode === "crop" ? zoom : 100,
      x: cropMode === "crop" ? posX : 50,
      y: cropMode === "crop" ? posY : 50,
    };

    const payload = {
      country_id: countryId,
      category_id: categoryId || null,
      author_id: authorId === "none" ? null : authorId,
      language_code: languageCode || "pl",
      view_no: viewNo,
      title: null,
      thank_you_text: thankYouText.trim() || null,
      back_qr_label: backQrLabel.trim() || null,
      photo_author: photoAuthor.trim() || null,
      image_front_url: imageUrl.trim() || null,
      // A design is only a template. Price and shop publication are set later in Products.
      price_grosze: initialDesign?.price_grosze || 0,
          currency: "PLN" as const,
      crop_settings: cropSettingsObj,
      active: initialDesign?.active ?? false,
    };
    try {
      const id = initialDesign?.id || crypto.randomUUID();
      await firestoreService.upsertCardDesign(id, {
        ...payload,
        id,
        slug: id,
        is_active: initialDesign?.active ?? false,
      } as Partial<FirestoreCardDesign> & Record<string, unknown>);
      toast({ title: initialDesign?.id ? "Wzór zaktualizowany w Firestore" : "Nowy wzór utworzony w Firestore" });
      onSaveSuccess();
    } catch (err) {
      toast({ title: "Błąd zapisu", description: (err as Error).message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!initialDesign?.id) return;
    if (!confirm(`Czy na pewno chcesz usunąć ten wzór kartki (Widok #${initialDesign.view_no})?`)) return;
    setIsSaving(true);
    try {
      await firestoreService.deleteCardDesign(initialDesign.id);
      toast({ title: "Wzór usunięty z Firestore" });
      onSaveSuccess();
    } catch (err) {
      toast({ title: "Błąd usuwania", description: (err as Error).message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const selectedCountry = countries.find((c) => c.id === countryId);

  return (
    <div className="bg-card border rounded-2xl p-6 shadow-sm space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" /> Kreator Wzorów Podróżówek
          </h2>
          <p className="text-sm text-muted-foreground">
            Zaprojektuj przód i tył kartki pocztowej z podglądem na żywo.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {initialDesign?.id && (
            <Button
              variant="outline"
              onClick={handleDelete}
              disabled={isSaving}
              className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
            >
              <Trash2 className="w-4 h-4 mr-1" /> Usuń Wzór
            </Button>
          )}
          <Button variant="outline" onClick={onCancel} disabled={isSaving}>
            <X className="w-4 h-4 mr-1" /> Anuluj
          </Button>
          <Button onClick={handleSave} disabled={isSaving} className="gap-2">
            <Check className="w-4 h-4" /> {initialDesign?.id ? "Zapisz Zmiany" : "Utwórz Wzór"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Form Controls (5 Cols) */}
        <div className="lg:col-span-5 space-y-5">
          {/* Section 1: Basic Info */}
          <div className="space-y-3 bg-muted/30 p-4 rounded-xl border">
            <h3 className="font-semibold text-sm flex items-center gap-2 text-foreground">
              <Globe className="w-4 h-4 text-primary" /> Kraj, Kategoria & Numer Widoku
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  1. Kraj <span className="text-destructive">*</span>
                </label>
                <Select value={countryId} onValueChange={handleCountrySelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="Wybierz kraj..." />
                  </SelectTrigger>
                  <SelectContent>
                    {countries.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name_pl} ({c.iso2})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  2. Kategoria <span className="text-destructive">*</span>
                </label>
                <Select value={categoryId} onValueChange={handleCategorySelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="Kategoria..." />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  3. Nr widoku <span className="text-destructive">*</span>
                </label>
                <Input
                  type="number"
                  min={1}
                  value={viewNo}
                  onChange={(e) => setViewNo(parseInt(e.target.value) || 1)}
                  placeholder="np. 1"
                />
              </div>
            </div>

            {/* Language Template Selector */}
            {countryId && (
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Szablon językowy (z bazy)
                </label>
                <Select value={selectedTemplateId} onValueChange={handleTemplateSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="Wybierz wariant językowy..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTemplates.length === 0 ? (
                      <SelectItem value="none" disabled>
                        Brak szablonów dla tego kraju (użyj Domyślny)
                      </SelectItem>
                    ) : (
                      availableTemplates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.language_name} ({t.language_code.toUpperCase()})
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Section 2: Photo & Author */}
          <div className="space-y-3 bg-muted/30 p-4 rounded-xl border">
            <h3 className="font-semibold text-sm flex items-center gap-2 text-foreground">
              <Camera className="w-4 h-4 text-primary" /> 1. Okno na zdjęcie & 2. Autor zdjęcia
            </h3>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                2. Nazwa autora zdjęcia (pionowy napis po prawej stronie zdjęcia)
              </label>
              <Input
                placeholder="np. JanKowalski lub @JanKowalski — na kartce: fot. by @JanKowalski"
                value={photoAuthor}
                onChange={(e) => setPhotoAuthor(e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                1. Obrazek na przód pocztówki (publiczny adres HTTPS)
              </label>
              <div className="mb-2">
                <Input
                  placeholder="https://example.com/zdjecie.jpg"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">Pliki graficzne publikujemy jako statyczne zasoby Hosting lub podajemy z zaufanego publicznego źródła. Nie zapisujemy obrazów w bazie.</p>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Autor z kartoteki (umowa i dane kontaktowe)</label>
              <Select value={authorId} onValueChange={(value) => {
                setAuthorId(value);
                const selected = authors.find((author) => author.id === value);
                if (selected && !photoAuthor.trim()) setPhotoAuthor(selected.display_name);
              }}>
                <SelectTrigger><SelectValue placeholder="Wybierz autora…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Bez przypisania</SelectItem>
                  {authors.map((author) => <SelectItem key={author.id} value={author.id}>{author.display_name} ({author.agreement_status})</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="mt-1 text-[11px] text-muted-foreground">Powiązanie nie zastępuje napisu na kartce — napis pozostaje edytowalny osobno.</p>
            </div>

            {/* Mode Switcher: Auto vs Cropping */}
            <div className="pt-2 border-t space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-primary" /> Kadrowanie zdjęcia:
                </span>
                <div className="flex items-center gap-2 text-xs">
                  <span className={cropMode === "auto" ? "font-bold text-primary" : "text-muted-foreground"}>
                    Automatyczne
                  </span>
                  <Switch
                    checked={cropMode === "crop"}
                    onCheckedChange={(checked) => setCropMode(checked ? "crop" : "auto")}
                  />
                  <span className={cropMode === "crop" ? "font-bold text-primary" : "text-muted-foreground"}>
                    Ręczne
                  </span>
                </div>
              </div>

              {cropMode === "crop" && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="space-y-3 pt-2 bg-background p-3 rounded-lg border text-xs"
                >
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-muted-foreground">Powiększenie (Zoom):</span>
                      <span className="font-mono">{zoom}%</span>
                    </div>
                    <Slider
                      value={[zoom]}
                      min={100}
                      max={200}
                      step={5}
                      onValueChange={([val]) => setZoom(val)}
                    />
                  </div>

                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-muted-foreground">Pozycja X (Poziom):</span>
                      <span className="font-mono">{posX}%</span>
                    </div>
                    <Slider
                      value={[posX]}
                      min={0}
                      max={100}
                      step={1}
                      onValueChange={([val]) => setPosX(val)}
                    />
                  </div>

                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-muted-foreground">Pozycja Y (Pion):</span>
                      <span className="font-mono">{posY}%</span>
                    </div>
                    <Slider
                      value={[posY]}
                      min={0}
                      max={100}
                      step={1}
                      onValueChange={([val]) => setPosY(val)}
                    />
                  </div>

                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full text-xs h-7 text-muted-foreground"
                    onClick={() => {
                      setZoom(100);
                      setPosX(50);
                      setPosY(50);
                    }}
                  >
                    <RotateCcw className="w-3 h-3 mr-1" /> Resetuj kadrowanie
                  </Button>
                </motion.div>
              )}
            </div>
          </div>

          {/* Section 3: Text Content */}
          <div className="space-y-3 bg-muted/30 p-4 rounded-xl border">
            <h3 className="font-semibold text-sm flex items-center gap-2 text-foreground">
              <Languages className="w-4 h-4 text-primary" /> 3. Miejsca do wpisania treści
            </h3>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                miejsce do wpisania treści podziękowania (w danym języku)
              </label>
              <Textarea
                rows={2}
                value={thankYouText}
                onChange={(e) => setThankYouText(e.target.value)}
                placeholder="miejsce do wpisania treści podziękowania (w danym języku)"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                napis na tył przy kodzie QR to miejsce na wpisanie treści zeskanowania kodu (w danym języku)
              </label>
              <Textarea
                rows={2}
                value={backQrLabel}
                onChange={(e) => setBackQrLabel(e.target.value)}
                placeholder="miejsce na wpisanie treści zeskanowania kodu (w danym języku)"
              />
            </div>

          </div>
        </div>

        {/* Right Column: Interactive Live Preview (7 Cols) */}
        <div className="lg:col-span-7 flex flex-col items-center justify-start space-y-4">
          <div className="w-full flex items-center justify-between bg-muted/40 p-2 rounded-xl border">
            <span className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5 px-2">
              <Eye className="w-4 h-4 text-primary" /> Podgląd Pocztówki Na Żywo
            </span>
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as "front" | "back")}
            >
              <TabsList className="h-8 text-xs">
                <TabsTrigger value="front" className="px-3">
                  Przód Pocztówki
                </TabsTrigger>
                <TabsTrigger value="back" className="px-3">
                  Tył Pocztówki
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Canvas Container */}
          <div className="w-full flex justify-center py-2">
            {activeTab === "front" ? (
              /* FRONT OF POSTCARD CANVAS */
              <div className="w-full max-w-[520px]">
                <PostcardFront
                  imageUrl={imageUrl}
                  photoAuthor={photoAuthor}
                  contentText={thankYouText}
                  cropSettings={{
                    fit: cropMode,
                    zoom: zoom,
                    x: posX,
                    y: posY,
                  }}
                  showCropMarks={true}
                />
              </div>
            ) : (
              /* BACK OF POSTCARD CANVAS */
              <div className="w-full max-w-[520px]">
                <PostcardBack
                  backQrLabel={backQrLabel}
                  countryIso2={selectedCountry?.iso2}
                  countryFlagUrl={selectedCountry?.flag_url}
                  showCropMarks={true}
                />
              </div>
            )}
          </div>

          <div className="text-xs text-muted-foreground text-center max-w-sm">
            💡 Wygląd kartki po wydruku. Tył automatycznie pobiera wariant językowy ze słownika.
          </div>
        </div>
      </div>
    </div>
  );
};
