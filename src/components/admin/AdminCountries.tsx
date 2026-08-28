import { useState, useEffect, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { Plus, Pencil, Trash2, Check, X, Globe2, Sparkles, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { WORLD_COUNTRIES } from "@/data/worldCountries";
import { firestoreService } from "@/integrations/firebase/services/firestoreService";
import { normalizeCountryCode, sortCountriesByName, uniqueCountriesByIso } from "@/lib/countryCatalog";

interface Country {
  id: string;
  iso2: string;
  iso3: string | null;
  name_pl: string;
  slug: string | null;
  active: boolean;
  created_at: string;
  flag_url: string | null;
}

const AdminCountries = () => {
  const [countries, setCountries] = useState<Country[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSeeding, setIsSeeding] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const { toast } = useToast();

  // Form state
  const [form, setForm] = useState({ iso2: '', iso3: '', name_pl: '', slug: '', flag_url: '', active: true });

  const fetchCountries = useCallback(async () => {
    try {
      const data = await firestoreService.getCountries();
      setCountries(data.map((country) => ({
        id: country.id,
        iso2: country.iso2 || "",
        iso3: (country as Country).iso3 || null,
        name_pl: country.name_pl || country.name,
        slug: (country as Country).slug || null,
        active: country.is_active !== false && (country as Country).active !== false,
        created_at: country.created_at || "",
        flag_url: country.flag_url || null,
      })));
    } catch (error) {
      toast({ title: "Błąd wczytywania krajów", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchCountries(); }, [fetchCountries]);

  const resetForm = () => {
    setForm({ iso2: '', iso3: '', name_pl: '', slug: '', flag_url: '', active: true });
    setEditingId(null);
    setShowAdd(false);
  };

  const handleSeedAllWorldCountries = async () => {
    setIsSeeding(true);
    try {
      await Promise.all(WORLD_COUNTRIES.map((country) => firestoreService.upsertCountry(country.iso2, country)));
      toast({ title: "Słownik krajów zaktualizowany!", description: `Pomyślnie zaimportowano/zaktualizowano ${WORLD_COUNTRIES.length} krajów świata.` });
      fetchCountries();
    } catch (err) {
      toast({
        title: "Błąd importu krajów",
        description: (err as Error).message,
        variant: "destructive",
      });
    } finally {
      setIsSeeding(false);
    }
  };

  const handleSave = async () => {
    if (!form.iso2 || !form.name_pl) {
      toast({ title: "Podaj ISO2 i nazwę kraju", variant: "destructive" });
      return;
    }

    const slug = form.slug || form.name_pl.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

    try {
      await firestoreService.upsertCountry(editingId || form.iso2.toUpperCase(), {
        iso2: form.iso2.toUpperCase(), iso3: form.iso3 || null, name_pl: form.name_pl, slug,
        flag_url: form.flag_url || null, active: form.active,
      });
      toast({ title: editingId ? "Kraj zaktualizowany" : "Kraj dodany" });
      resetForm();
      fetchCountries();
    } catch (error) {
      toast({ title: "Błąd zapisu", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    }
  };

  const handleEdit = (c: Country) => {
    setForm({ iso2: c.iso2, iso3: c.iso3 || '', name_pl: c.name_pl, slug: c.slug || '', flag_url: c.flag_url || '', active: c.active });
    setEditingId(c.id);
    setShowAdd(true);
  };

  const handleDelete = async (id: string) => {
    const country = countries.find((item) => item.id === id);
    const designCount = (await firestoreService.getCardDesigns({ includeInactive: true })).filter((design) => design.country_id === id).length;
    if (designCount > 0) {
      toast({ title: "Nie można usunąć kraju używanego przez wzory", description: `${country?.name_pl ?? "Ten kraj"} ma przypisane wzory (${designCount}). Ustaw kraj jako nieaktywny zamiast go usuwać.`, variant: "destructive" });
      return;
    }
    try {
      await firestoreService.deleteCountry(id);
      toast({ title: "Kraj usunięty" });
      fetchCountries();
    } catch (error) {
      toast({ title: "Błąd usuwania", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    }
  };

  const toggleActive = async (id: string, active: boolean) => {
    try {
      await firestoreService.setCountryActive(id, !active);
      fetchCountries();
    } catch (error) {
      toast({ title: "Błąd zmiany statusu", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    }
  };

  const catalogCountries = useMemo(
    () => sortCountriesByName(uniqueCountriesByIso(countries)),
    [countries],
  );

  const filteredCountries = catalogCountries.filter((c) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      c.name_pl.toLowerCase().includes(q) ||
      c.iso2.toLowerCase().includes(q) ||
      (c.iso3 && c.iso3.toLowerCase().includes(q))
    );
  });

  if (isLoading) return <div className="animate-pulse text-muted-foreground text-center py-8">Ładowanie krajów...</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
        <div>
          <h2 className="font-display text-xl font-bold text-foreground flex items-center gap-2">
            <Globe2 className="w-5 h-5 text-primary" /> Słownik Kraje ({catalogCountries.length})
          </h2>
          <p className="text-xs text-muted-foreground">
            Zarządzaj bazą wszystkich państw i terytoriów świata dostępnych w systemie.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSeedAllWorldCountries}
            disabled={isSeeding}
            className="gap-1.5 text-xs text-primary border-primary/30 hover:bg-primary/5"
          >
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            {isSeeding ? "Importowanie..." : `Zaimportuj Kraje Świata (${WORLD_COUNTRIES.length})`}
          </Button>

          <Button size="sm" onClick={() => { resetForm(); setShowAdd(true); }}>
            <Plus className="w-4 h-4 mr-1" /> Dodaj Kraj
          </Button>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex items-center gap-2 bg-card p-2 rounded-lg border shadow-xs">
        <Search className="w-4 h-4 text-muted-foreground ml-2" />
        <Input
          placeholder="Szukaj kraju wg nazwy, ISO2 lub ISO3..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="border-0 shadow-none focus-visible:ring-0 text-sm h-8"
        />
        {searchQuery && (
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setSearchQuery("")}>
            <X className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>

      {/* Add/Edit form */}
      {showAdd && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-xl p-4 shadow-soft border border-border space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Kod kraju / regionu *</label>
              <Input value={form.iso2} onChange={(e) => setForm({ ...form, iso2: normalizeCountryCode(e.target.value) })} placeholder="PL lub GB-SCT" maxLength={6} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Kod ISO3</label>
              <Input value={form.iso3} onChange={(e) => setForm({ ...form, iso3: normalizeCountryCode(e.target.value) })} placeholder="POL lub GBR-SCT" maxLength={7} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Nazwa Polska *</label>
              <Input value={form.name_pl} onChange={(e) => setForm({ ...form, name_pl: e.target.value })} placeholder="Polska" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Slug URL</label>
              <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="polska" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed p-3">
            <img
              src={form.flag_url || (form.iso2 ? `https://flagcdn.com/w80/${form.iso2.toLowerCase()}.png` : "")}
              alt="Podgląd flagi"
              className={`h-12 w-12 object-contain ${form.flag_url || form.iso2 ? "" : "hidden"}`}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Flaga kraju na tyle kartki</p>
              <p className="text-xs text-muted-foreground">Własny adres HTTPS zastępuje automatyczną flagę ISO2.</p>
            </div>
            <Input
              value={form.flag_url}
              onChange={(event) => setForm((current) => ({ ...current, flag_url: event.target.value }))}
              placeholder="https://example.com/flaga.png"
              className="max-w-sm"
            />
            {form.flag_url && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setForm((current) => ({ ...current, flag_url: "" }))}>
                Usuń adres
              </Button>
            )}
          </div>
          <div className="flex items-center gap-3 pt-1">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="rounded" />
              Aktywny w systemie
            </label>
            <div className="flex-1" />
            <Button variant="outline" size="sm" onClick={resetForm}><X className="w-4 h-4 mr-1" />Anuluj</Button>
            <Button size="sm" onClick={handleSave}><Check className="w-4 h-4 mr-1" />{editingId ? 'Zapisz' : 'Dodaj'}</Button>
          </div>
        </motion.div>
      )}

      {/* Table */}
      <div className="bg-card rounded-xl shadow-soft border overflow-hidden">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur-xs z-10">
              <tr className="border-b border-border text-xs text-muted-foreground uppercase font-medium">
                <th className="text-left p-3">Flaga / ISO2</th>
                <th className="text-left p-3">ISO3</th>
                <th className="text-left p-3">Nazwa (PL)</th>
                <th className="text-left p-3">Slug</th>
                <th className="text-left p-3">Status</th>
                <th className="text-right p-3">Akcje</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredCountries.map((c) => (
                <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                  <td className="p-3 font-mono font-bold flex items-center gap-2">
                    <img
                      src={c.flag_url || `https://flagcdn.com/w40/${c.iso2.toLowerCase()}.png`}
                      alt={c.iso2}
                      className="w-5 h-3.5 object-cover rounded-xs border shadow-2xs"
                      onError={(e) => (e.currentTarget.style.display = 'none')}
                    />
                    <span>{c.iso2}</span>
                  </td>
                  <td className="p-3 font-mono text-xs text-muted-foreground">{c.iso3 || '—'}</td>
                  <td className="p-3 font-semibold">{c.name_pl}</td>
                  <td className="p-3 text-xs text-muted-foreground font-mono">{c.slug || '—'}</td>
                  <td className="p-3">
                    <button onClick={() => toggleActive(c.id, c.active)}
                      className={`px-2.5 py-0.5 rounded-full text-xs font-medium cursor-pointer ${
                        c.active
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : 'bg-muted text-muted-foreground'
                      }`}>
                      {c.active ? 'Aktywny' : 'Nieaktywny'}
                    </button>
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => handleEdit(c)} className="p-1.5 rounded hover:bg-muted" title="Edytuj">
                        <Pencil className="w-4 h-4 text-muted-foreground" />
                      </button>
                      <button onClick={() => handleDelete(c.id)} className="p-1.5 rounded hover:bg-destructive/10" title="Usuń">
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredCountries.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground">
                    Brak wyników wyszukiwania. Kliknij "Zaimportuj Kraje Świata", aby automatycznie dodać całą bazę!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminCountries;
