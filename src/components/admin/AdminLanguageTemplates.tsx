import { useState, useEffect, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { Plus, Pencil, Trash2, Check, X, Languages, Globe, BookOpen, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { firestoreService } from "@/integrations/firebase/services/firestoreService";
import { WORLD_LANGUAGES } from "@/data/languages";
import { normalizeCountryCode, sortCountriesByName, uniqueCountriesByIso } from "@/lib/countryCatalog";

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
  is_primary?: boolean;
  created_at?: string;
  countries?: {
    name_pl: string;
    iso2: string;
  } | null;
}

export const AdminLanguageTemplates = () => {
  const [templates, setTemplates] = useState<LanguageTemplate[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [filterCountry, setFilterCountry] = useState<string>("all");
  const { toast } = useToast();

  const [form, setForm] = useState({
    country_id: "",
    language_code: "pl",
    language_name: "Polski",
    front_thank_you_text: "DZIĘKUJĘ, ŻE JESTEŚ CZĘŚCIĄ MOJEJ PODRÓŻY",
    back_qr_label: "Zeskanuj ten kod QR i śledź moje podróże",
    is_primary: false,
  });

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    const [templateData, countryData] = await Promise.all([
      firestoreService.getLanguageTemplates(),
      firestoreService.getCountries(),
    ]);
    const countriesById = new Map(countryData.map((country) => [country.id, country]));
    setTemplates(templateData.map((template) => ({
      ...template,
      countries: countriesById.get(template.country_id)
        ? {
            name_pl: countriesById.get(template.country_id)!.name_pl || countriesById.get(template.country_id)!.name,
            iso2: countriesById.get(template.country_id)!.iso2 || "",
          }
        : null,
    })));
    setCountries(countryData.map((country) => ({
      id: country.id,
      iso2: country.iso2 || "",
      name_pl: country.name_pl || country.name,
    })));
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const resetForm = () => {
    setForm({
      country_id: "",
      language_code: "pl",
      language_name: "Polski",
      front_thank_you_text: "DZIĘKUJĘ, ŻE JESTEŚ CZĘŚCIĄ MOJEJ PODRÓŻY",
      back_qr_label: "Zeskanuj ten kod QR i śledź moje podróże",
      is_primary: false,
    });
    setEditingId(null);
    setShowAdd(false);
  };

  const handleLanguageSelect = (langCode: string) => {
    const lang = WORLD_LANGUAGES.find((l) => l.code === langCode);
    if (!lang) return;

    setForm((prev) => ({
      ...prev,
      language_code: lang.code,
      language_name: lang.name_pl,
      front_thank_you_text: lang.default_front_thank_you || prev.front_thank_you_text,
      back_qr_label: lang.default_back_qr_label || prev.back_qr_label,
    }));
  };

  const handleCountryChange = (countryId: string) => {
    const country = countries.find((c) => c.id === countryId);
    if (!country) return;

    // Try finding language matching country iso2 code
    const matchingLang = WORLD_LANGUAGES.find(
      (l) => l.code === country.iso2.toLowerCase()
    ) || (
      country.iso2 === "AU"
        ? WORLD_LANGUAGES.find((l) => l.code === "en-au")
        : country.iso2 === "US" || country.iso2 === "GB"
          ? WORLD_LANGUAGES.find((l) => l.code === "en")
          : null
    );

    const lang = matchingLang || WORLD_LANGUAGES.find((l) => l.code === "pl") || WORLD_LANGUAGES[0];

    setForm((prev) => ({
      ...prev,
      country_id: countryId,
      language_code: lang.code,
      language_name: lang.name_pl,
      front_thank_you_text: lang.default_front_thank_you || prev.front_thank_you_text,
      back_qr_label: lang.default_back_qr_label || prev.back_qr_label,
    }));
  };

  const handleSave = async () => {
    if (!form.country_id || !form.language_code || !form.language_name) {
      toast({ title: "Wypełnij wymagane pola (kraj, język)", variant: "destructive" });
      return;
    }

    const normalizedLanguageCode = form.language_code.trim().toLowerCase();
    const duplicate = templates.find((template) =>
      template.id !== editingId
      && template.country_id === form.country_id
      && template.language_code.trim().toLowerCase() === normalizedLanguageCode,
    );

    if (duplicate) {
      toast({
        title: "Ten wariant językowy już istnieje",
        description: `Dla tego kraju dodano już język: ${duplicate.language_name} (${duplicate.language_code}).`,
        variant: "destructive",
      });
      return;
    }

    const payload = {
      country_id: form.country_id,
      language_code: normalizedLanguageCode,
      language_name: form.language_name,
      front_thank_you_text: form.front_thank_you_text,
      back_qr_label: form.back_qr_label,
      is_primary: form.is_primary,
    };

    try {
      await firestoreService.upsertLanguageTemplate(editingId || `${form.country_id}-${normalizedLanguageCode}`, payload);
      toast({ title: editingId ? "Szablon językowy zaktualizowany" : "Szablon językowy dodany" });
      resetForm();
      fetchData();
    } catch (error) {
      toast({ title: "Błąd zapisu szablonu", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    }
  };

  const handleEdit = (t: LanguageTemplate) => {
    setForm({
      country_id: t.country_id,
      language_code: t.language_code,
      language_name: t.language_name,
      front_thank_you_text: t.front_thank_you_text,
      back_qr_label: t.back_qr_label,
      is_primary: Boolean(t.is_primary),
    });
    setEditingId(t.id);
    setShowAdd(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Czy na pewno chcesz usunąć ten szablon językowy?")) return;

    try {
      await firestoreService.deleteLanguageTemplate(id);
      toast({ title: "Szablon usunięty" });
      fetchData();
    } catch (error) {
      toast({ title: "Błąd usuwania", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    }
  };

  const sortedCountries = useMemo(
    () => sortCountriesByName(uniqueCountriesByIso(countries)),
    [countries],
  );

  const sortedLanguages = useMemo(
    () => [...WORLD_LANGUAGES].sort((left, right) => left.name_pl.localeCompare(right.name_pl, "pl", { sensitivity: "base" })),
    [],
  );

  const filteredTemplates = useMemo(() => {
    const countryNameById = new Map(countries.map((country) => [country.id, country.name_pl]));
    const countryIsoById = new Map(countries.map((country) => [country.id, normalizeCountryCode(country.iso2 || country.id)]));

    return templates
      .filter((template) => filterCountry === "all" || countryIsoById.get(template.country_id) === filterCountry)
      .sort((left, right) => {
        const leftCountry = left.countries?.name_pl || countryNameById.get(left.country_id) || "";
        const rightCountry = right.countries?.name_pl || countryNameById.get(right.country_id) || "";
        const countryOrder = leftCountry.localeCompare(rightCountry, "pl", { sensitivity: "base" });

        return countryOrder || left.language_name.localeCompare(right.language_name, "pl", { sensitivity: "base" });
      });
  }, [countries, filterCountry, templates]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Languages className="w-5 h-5 text-primary" /> Szablony Wariantów Językowych
          </h2>
          <p className="text-sm text-muted-foreground">
            Słownik tekstów na przód i tył kartki zależnie od kraju i języka.
          </p>
        </div>
        <Button
          onClick={() => {
            resetForm();
            setShowAdd(true);
          }}
          className="bg-primary text-primary-foreground gap-2"
        >
          <Plus className="w-4 h-4" /> Dodaj Szablon Językowy
        </Button>
      </div>

      {/* Filter by country */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
          <Globe className="w-4 h-4" /> Filtruj wg kraju:
        </label>
        <Select value={filterCountry} onValueChange={setFilterCountry}>
          <SelectTrigger className="w-[200px] h-9">
            <SelectValue placeholder="Wszystkie kraje" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie kraje</SelectItem>
            {sortedCountries.map((c) => (
              <SelectItem key={c.id} value={normalizeCountryCode(c.iso2 || c.id)}>
                {c.name_pl} ({c.iso2})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Add / Edit Form Modal or Card */}
      {showAdd && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border rounded-xl p-5 shadow-sm space-y-4"
        >
          <div className="flex justify-between items-center border-b pb-3">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Languages className="w-4 h-4 text-primary" />
              {editingId ? "Edytuj Szablon Językowy" : "Nowy Szablon Językowy"}
            </h3>
            <Button size="icon" variant="ghost" onClick={resetForm}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Kraj <span className="text-destructive">*</span>
              </label>
              <Select value={form.country_id} onValueChange={handleCountryChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Wybierz kraj" />
                </SelectTrigger>
                <SelectContent>
                  {sortedCountries.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name_pl} ({c.iso2})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1 flex items-center gap-1">
                <BookOpen className="w-3.5 h-3.5 text-primary" />
                Słownik Języka
              </label>
              <Select value={form.language_code} onValueChange={handleLanguageSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Słownik języków..." />
                </SelectTrigger>
                <SelectContent>
                  {sortedLanguages.map((l) => (
                    <SelectItem key={l.code} value={l.code}>
                      {l.name_pl} ({l.code}) — {l.name_native}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Kod języka (ISO / BCP-47) <span className="text-destructive">*</span>
              </label>
              <Input
                placeholder="np. pl, fr, en, de, nl-be, bem"
                value={form.language_code}
                onChange={(e) => setForm({ ...form, language_code: e.target.value.toLowerCase() })}
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Nazwa języka <span className="text-destructive">*</span>
              </label>
              <Input
                placeholder="np. Polski, Francuski"
                value={form.language_name}
                onChange={(e) => setForm({ ...form, language_name: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Napis dziękczynny na PRZÓD pod pocztówką
              </label>
              <Textarea
                rows={2}
                placeholder="np. DZIĘKUJĘ ŻE JESTEŚ Z NAMI!"
                value={form.front_thank_you_text}
                onChange={(e) => setForm({ ...form, front_thank_you_text: e.target.value })}
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Napis na TYŁ (przy kodzie QR)
              </label>
              <Textarea
                rows={2}
                placeholder="np. Podziękuj autorowi za pocztówkę z wycieczki"
                value={form.back_qr_label}
                onChange={(e) => setForm({ ...form, back_qr_label: e.target.value })}
              />
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-muted/30 p-3 text-sm">
            <input type="checkbox" checked={form.is_primary} onChange={(event) => setForm({ ...form, is_primary: event.target.checked })} className="h-4 w-4 accent-primary" />
            <span><span className="font-semibold">Język podstawowy</span><br /><span className="text-xs text-muted-foreground">Będzie automatycznie używany w kreatorze i jako domyślny przy zakupie. W kraju może być tylko jeden, ale może też nie być żadnego.</span></span>
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={resetForm}>
              Anuluj
            </Button>
            <Button onClick={handleSave} className="gap-2">
              <Check className="w-4 h-4" /> Zapisz Szablon
            </Button>
          </div>
        </motion.div>
      )}

      {/* Templates List */}
      <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Wczytywanie szablonów...</div>
        ) : filteredTemplates.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            Brak szablonów językowych w bazie. Dodaj pierwszy szablon powyżej!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-xs uppercase font-medium text-muted-foreground border-b">
                <tr>
                  <th className="p-3">Kraj</th>
                  <th className="p-3">Język</th>
                  <th className="p-3">Napis Przód (Pod Dziękuję)</th>
                  <th className="p-3">Napis Tył (Przy QR)</th>
                  <th className="p-3 text-right">Akcje</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredTemplates.map((t) => (
                  <tr key={t.id} className="hover:bg-muted/30 transition-colors">
                    <td className="p-3 font-medium">
                      {t.countries?.name_pl || "Kraj"} ({t.countries?.iso2})
                    </td>
                    <td className="p-3">
                      <span className="font-semibold">{t.language_name}</span>{" "}
                      <span className="text-xs text-muted-foreground">({t.language_code})</span>
                      {t.is_primary && <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"><Star className="h-3 w-3 fill-current" />Podstawowy</span>}
                    </td>
                    <td className="p-3 max-w-xs truncate text-foreground font-mono text-xs">
                      {t.front_thank_you_text}
                    </td>
                    <td className="p-3 max-w-xs truncate text-foreground font-mono text-xs">
                      {t.back_qr_label}
                    </td>
                    <td className="p-3 text-right space-x-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleEdit(t)}
                        title="Edytuj"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDelete(t.id)}
                        title="Usuń"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
