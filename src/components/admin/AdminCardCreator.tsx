import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Image as ImageIcon,
  Upload,
  Check,
  X,
  Languages,
  Sliders,
  Eye,
  QrCode,
  Sparkles,
  Camera,
  Globe,
  RotateCcw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Country {
  id: string;
  iso2: string;
  name_pl: string;
}

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
    language_code: string;
    view_no: number;
    title: string | null;
    thank_you_text: string | null;
    image_front_url: string | null;
    photo_author: string | null;
    back_qr_label: string | null;
    price_grosze?: number;
    crop_settings?: CropSettings | unknown;
    active: boolean;
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
  const [langTemplates, setLangTemplates] = useState<LanguageTemplate[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"front" | "back">("front");
  const { toast } = useToast();

  // Form State
  const [countryId, setCountryId] = useState(initialDesign?.country_id || "");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [languageCode, setLanguageCode] = useState(initialDesign?.language_code || "pl");
  const [viewNo, setViewNo] = useState(initialDesign?.view_no || 1);
  const [title, setTitle] = useState(initialDesign?.title || "");
  const [thankYouText, setThankYouText] = useState(
    initialDesign?.thank_you_text || "DZIĘKUJĘ ŻE JESTEŚ Z NAMI!"
  );
  const [backQrLabel, setBackQrLabel] = useState(
    initialDesign?.back_qr_label || "Podziękuj autorowi za pocztówkę"
  );
  const [photoAuthor, setPhotoAuthor] = useState(initialDesign?.photo_author || "");
  const [imageUrl, setImageUrl] = useState(initialDesign?.image_front_url || "");
  const [priceGrosze, setPriceGrosze] = useState<number>(initialDesign?.price_grosze || 1500);
  const [active, setActive] = useState(initialDesign?.active ?? true);

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

  // Fetch Countries & Templates
  const loadData = useCallback(async () => {
    const [{ data: cData }, { data: tData }] = await Promise.all([
      supabase.from("countries").select("id, iso2, name_pl").order("name_pl"),
      supabase.from("card_language_templates").select("*").order("country_id"),
    ]);

    if (cData) setCountries(cData as Country[]);
    if (tData) setLangTemplates(tData as unknown as LanguageTemplate[]);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // When Country or Language Template changes
  const availableTemplates = langTemplates.filter((t) => t.country_id === countryId);

  const handleCountrySelect = (cId: string) => {
    setCountryId(cId);
    setSelectedTemplateId("");
    // Find first template for this country
    const firstTpl = langTemplates.find((t) => t.country_id === cId);
    if (firstTpl) {
      setSelectedTemplateId(firstTpl.id);
      setLanguageCode(firstTpl.language_code);
      setThankYouText(firstTpl.front_thank_you_text);
      setBackQrLabel(firstTpl.back_qr_label);
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

  // Image File Upload Handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({ title: "Wybierz plik graficzny (JPG, PNG, WEBP)", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `postcard_front_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${fileExt}`;
      const filePath = `card-designs/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("postcards")
        .upload(filePath, file, { upsert: true });

      if (uploadError) {
        // Fallback to base64 preview if bucket upload is not configured
        const reader = new FileReader();
        reader.onload = (event) => {
          setImageUrl(event.target?.result as string);
          toast({ title: "Wczytano podgląd lokalny obrazu" });
        };
        reader.readAsDataURL(file);
      } else {
        const { data: publicUrlData } = supabase.storage
          .from("postcards")
          .getPublicUrl(filePath);

        setImageUrl(publicUrlData.publicUrl);
        toast({ title: "Przesłano zdjęcie" });
      }
    } catch (err) {
      toast({ title: "Błąd przesyłania", description: (err as Error).message, variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  // Save Card Design
  const handleSave = async () => {
    if (!countryId) {
      toast({ title: "Wybierz kraj", variant: "destructive" });
      return;
    }
    if (!title.trim()) {
      toast({ title: "Podaj tytuł pocztówki", variant: "destructive" });
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
      language_code: languageCode || "pl",
      view_no: viewNo,
      title: title.trim(),
      thank_you_text: thankYouText.trim() || null,
      back_qr_label: backQrLabel.trim() || null,
      photo_author: photoAuthor.trim() || null,
      image_front_url: imageUrl.trim() || null,
      price_grosze: priceGrosze,
      currency: "PLN",
      crop_settings: cropSettingsObj,
      active: active,
    };

    try {
      if (initialDesign?.id) {
        const { error } = await supabase
          .from("card_designs")
          .update(payload)
          .eq("id", initialDesign.id);

        if (error) throw error;
        toast({ title: "Wzór zaktualizowany w kreatorze" });
      } else {
        const { error } = await supabase.from("card_designs").insert(payload);
        if (error) throw error;
        toast({ title: "Nowy wzór utworzony pomyślnie" });
      }
      onSaveSuccess();
    } catch (err) {
      toast({ title: "Błąd zapisu", description: (err as Error).message, variant: "destructive" });
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
              <Globe className="w-4 h-4 text-primary" /> Kraj & Szablon Językowy
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Kraj <span className="text-destructive">*</span>
                </label>
                <Select value={countryId} onValueChange={handleCountrySelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="Wybierz kraj" />
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
                  Nr widoku <span className="text-destructive">*</span>
                </label>
                <Input
                  type="number"
                  min={1}
                  value={viewNo}
                  onChange={(e) => setViewNo(parseInt(e.target.value) || 1)}
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

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Tytuł widoku / pocztówki <span className="text-destructive">*</span>
                </label>
                <Input
                  placeholder="np. Wieża Eiffla, Paryż"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Cena (PLN)
                </label>
                <Input
                  type="number"
                  step="0.50"
                  min="0"
                  value={priceGrosze / 100}
                  onChange={(e) => setPriceGrosze(Math.round(parseFloat(e.target.value || "0") * 100))}
                />
              </div>
            </div>
          </div>

          {/* Section 2: Photo & Author */}
          <div className="space-y-3 bg-muted/30 p-4 rounded-xl border">
            <h3 className="font-semibold text-sm flex items-center gap-2 text-foreground">
              <Camera className="w-4 h-4 text-primary" /> Zdjęcie & Autor
            </h3>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Autor zdjęcia (wyświetlany po prawej na dole)
              </label>
              <Input
                placeholder="np. Jan Kowalski / Unsplash"
                value={photoAuthor}
                onChange={(e) => setPhotoAuthor(e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Obrazek na przód (Plik lub URL)
              </label>
              <div className="flex gap-2 mb-2">
                <Input
                  placeholder="https://..."
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  className="flex-1"
                />
                <label className="cursor-pointer">
                  <span className="inline-flex items-center gap-1.5 px-3 py-2 bg-secondary text-secondary-foreground text-xs font-medium rounded-md hover:bg-secondary/80 border transition-colors h-10">
                    <Upload className="w-3.5 h-3.5" />
                    {isUploading ? "..." : "Plik"}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                    disabled={isUploading}
                  />
                </label>
              </div>
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
              <Languages className="w-4 h-4 text-primary" /> Treści Językowe
            </h3>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Napis na dole (Przód pod pocztówką)
              </label>
              <Textarea
                rows={2}
                value={thankYouText}
                onChange={(e) => setThankYouText(e.target.value)}
                placeholder="DZIĘKUJĘ ŻE JESTEŚ Z NAMI!"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Napis na tył przy kodzie QR
              </label>
              <Textarea
                rows={2}
                value={backQrLabel}
                onChange={(e) => setBackQrLabel(e.target.value)}
                placeholder="Podziękuj autorowi za pocztówkę..."
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Switch checked={active} onCheckedChange={setActive} />
              <label className="text-xs font-medium text-foreground">
                Kartka aktywna w sklepie
              </label>
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
              <div
                className="relative bg-white text-slate-900 rounded-lg shadow-xl border border-slate-200 overflow-hidden select-none flex flex-col transition-all duration-300"
                style={{
                  width: "100%",
                  maxWidth: "520px",
                  aspectRatio: "1.48 / 1",
                }}
              >
                {/* Top Photo Section */}
                <div className="relative flex-1 bg-slate-100 overflow-hidden">
                  {imageUrl ? (
                    <div
                      className="w-full h-full overflow-hidden"
                      style={{
                        position: "relative",
                      }}
                    >
                      <img
                        src={imageUrl}
                        alt={title || "Przód pocztówki"}
                        className="w-full h-full transition-transform duration-150 ease-out"
                        style={{
                          objectFit: cropMode === "auto" ? "cover" : "cover",
                          objectPosition:
                            cropMode === "crop"
                              ? `${posX}% ${posY}%`
                              : "center center",
                          transform:
                            cropMode === "crop" ? `scale(${zoom / 100})` : "none",
                        }}
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 gap-2 p-6">
                      <ImageIcon className="w-12 h-12 stroke-[1.5]" />
                      <span className="text-xs">Brak wybranego zdjęcia</span>
                    </div>
                  )}

                  {/* Crop Lines Overlay Indicator */}
                  {cropMode === "crop" && (
                    <div className="absolute inset-0 pointer-events-none border border-primary/40 border-dashed opacity-50" />
                  )}
                </div>

                {/* Bottom White Footer Margin */}
                <div className="relative h-14 bg-white border-t border-slate-100 px-4 flex items-center justify-between">
                  {/* Left Hiker Outline */}
                  <div className="flex items-center gap-1 text-slate-600">
                    <svg className="w-7 h-7 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="1.5">
                      <circle cx="12" cy="5" r="2" />
                      <path d="M10 22l2-7 3 3" />
                      <path d="M14 22l-2-7" />
                      <path d="M8 12l4-3 4 2" />
                      <path d="M6 16l3-4" />
                    </svg>
                  </div>

                  {/* Middle Thank You Text */}
                  <div className="text-center px-2 flex-1">
                    <p className="font-extrabold text-[11px] sm:text-[13px] tracking-wider uppercase text-slate-800 leading-tight">
                      {thankYouText || "DZIĘKUJĘ ŻE JESTEŚ Z NAMI!"}
                    </p>
                  </div>

                  {/* Right Photo Author & Colored Hiker */}
                  <div className="flex items-center gap-2">
                    {photoAuthor && (
                      <span className="text-[9px] sm:text-[10px] text-slate-500 font-medium whitespace-nowrap">
                        Fot. {photoAuthor}
                      </span>
                    )}

                    {/* Colored Hiker with Backpack */}
                    <div className="w-7 h-7 relative flex items-center justify-center">
                      <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="5" r="2" fill="#85532b" />
                        <rect x="7" y="9" width="3" height="5" rx="1" fill="#166534" />
                        <path d="M10 22l2-7 3 3" stroke="#1e293b" strokeWidth="1.8" strokeLinecap="round" />
                        <path d="M14 22l-2-7" stroke="#1e293b" strokeWidth="1.8" strokeLinecap="round" />
                        <path d="M9 11l3-2 3 2" stroke="#1e293b" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* BACK OF POSTCARD CANVAS */
              <div
                className="relative bg-white text-slate-900 rounded-lg shadow-xl border border-slate-200 overflow-hidden select-none p-5 flex flex-col justify-between"
                style={{
                  width: "100%",
                  maxWidth: "520px",
                  aspectRatio: "1.48 / 1",
                }}
              >
                {/* Header line with Country & Flag */}
                <div className="flex items-center justify-between border-b pb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-extrabold tracking-widest text-slate-900 uppercase">
                      PODRÓŻÓWKA
                    </span>
                    <span className="text-xs text-slate-400">|</span>
                    <span className="text-xs font-semibold text-slate-600">
                      {selectedCountry?.name_pl || "Kraj"} ({selectedCountry?.iso2 || "PL"})
                    </span>
                  </div>
                  <span className="text-xs font-mono text-slate-400">
                    V{viewNo.toString().padStart(2, "0")}
                  </span>
                </div>

                {/* Main Back Content: Left QR area, Right Address Area */}
                <div className="grid grid-cols-12 gap-4 flex-1 pt-3">
                  {/* Left Column: QR Code + Text */}
                  <div className="col-span-6 border-r pr-3 flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                        Kod Doładowania / Podziękowania
                      </span>
                      <div className="p-2 border border-dashed rounded-lg bg-slate-50 flex items-center gap-3">
                        <div className="w-12 h-12 bg-slate-200 rounded flex items-center justify-center shrink-0">
                          <QrCode className="w-8 h-8 text-slate-600" />
                        </div>
                        <p className="text-[11px] font-medium text-slate-700 leading-tight">
                          {backQrLabel || "Podziękuj autorowi za pocztówkę"}
                        </p>
                      </div>
                    </div>

                    <div className="text-[10px] text-slate-400 leading-snug">
                      Zarejestruj pocztówkę na www.podrozowka.pl wpisując kod spod zdrapki.
                    </div>
                  </div>

                  {/* Right Column: Stamp + Address lines */}
                  <div className="col-span-6 pl-2 flex flex-col justify-between">
                    {/* Stamp Placeholder */}
                    <div className="self-end w-12 h-14 border-2 border-dashed border-slate-300 rounded flex items-center justify-center text-[9px] text-slate-400 text-center uppercase font-bold">
                      Znaczek
                    </div>

                    {/* Address Lines */}
                    <div className="space-y-3 pt-4">
                      <div className="border-b border-slate-300 w-full" />
                      <div className="border-b border-slate-300 w-full" />
                      <div className="border-b border-slate-300 w-full" />
                      <div className="border-b border-slate-300 w-3/4" />
                    </div>
                  </div>
                </div>
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
