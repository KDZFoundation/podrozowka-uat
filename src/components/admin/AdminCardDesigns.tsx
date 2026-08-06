import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, Image as ImageIcon, Sparkles, Languages, ListFilter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { AdminCardCreator } from "./AdminCardCreator";
import { AdminLanguageTemplates } from "./AdminLanguageTemplates";
import { deleteCardDesignCascade } from "@/lib/cardDesignUtils";

interface Country {
  id: string;
  iso2: string;
  name_pl: string;
}

interface CardDesign {
  id: string;
  country_id: string;
  category_id?: string | null;
  language_code: string;
  view_no: number;
  title: string | null;
  thank_you_text: string | null;
  image_front_url: string | null;
  photo_author: string | null;
  back_qr_label: string | null;
  crop_settings?: unknown;
  active: boolean;
  country_name?: string;
  category_name?: string;
}

interface AdminCardDesignJoin {
  id: string;
  country_id: string;
  category_id?: string | null;
  language_code: string;
  view_no: number;
  title: string | null;
  thank_you_text: string | null;
  image_front_url: string | null;
  photo_author: string | null;
  back_qr_label: string | null;
  crop_settings?: unknown;
  active: boolean;
  countries: {
    name_pl: string;
  } | null;
  categories: {
    name: string;
  } | null;
}

const AdminCardDesigns = () => {
  const [designs, setDesigns] = useState<CardDesign[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"list" | "creator" | "templates">("list");
  const [editingDesign, setEditingDesign] = useState<CardDesign | null>(null);
  const [filterCountry, setFilterCountry] = useState<string>("all");
  const { toast } = useToast();

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    const [{ data: designsData }, { data: countriesData }] = await Promise.all([
      supabase
        .from("card_designs")
        .select("*, countries!inner(name_pl), categories(name)")
        .order("country_id")
        .order("view_no"),
      supabase.from("countries").select("id, iso2, name_pl").order("name_pl"),
    ]);

    if (designsData) {
      const typedDesigns = designsData as unknown as AdminCardDesignJoin[];
      setDesigns(
        typedDesigns.map((d: AdminCardDesignJoin) => ({
          ...d,
          country_name: d.countries?.name_pl,
          category_name: d.categories?.name,
        }))
      );
    }
    if (countriesData) setCountries(countriesData as Country[]);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDelete = async (id: string) => {
    if (!confirm("Czy na pewno chcesz usunąć ten wzór kartki?")) return;
    const res = await deleteCardDesignCascade(id);
    if (!res.success) {
      toast({ title: "Błąd usuwania", description: res.error, variant: "destructive" });
    } else {
      toast({ title: "Usuwanie wzoru", description: res.message || "Wzór kartki został usunięty" });
      fetchData();
    }
  };

  const toggleActive = async (id: string, active: boolean) => {
    await supabase.from("card_designs").update({ active: !active }).eq("id", id);
    fetchData();
  };

  const startNewCreator = () => {
    setEditingDesign(null);
    setActiveTab("creator");
  };

  const editInCreator = (d: CardDesign) => {
    setEditingDesign(d);
    setActiveTab("creator");
  };

  const filtered = filterCountry === "all"
    ? designs
    : designs.filter((d) => d.country_id === filterCountry);

  return (
    <div className="space-y-6">
      {/* Top Header & Main Navigation Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ImageIcon className="w-6 h-6 text-primary" /> Zarządzanie Wzorami Kartek
          </h1>
          <p className="text-sm text-muted-foreground">
            Kreator kartki, baza wzorów oraz słownik wariantów językowych dla administratora.
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "list" | "creator" | "templates")}>
          <TabsList>
            <TabsTrigger value="list" className="gap-1.5">
              <ListFilter className="w-4 h-4" /> Wzory ({designs.length})
            </TabsTrigger>
            <TabsTrigger value="creator" className="gap-1.5">
              <Sparkles className="w-4 h-4 text-primary" /> Kreator Wzorów
            </TabsTrigger>
            <TabsTrigger value="templates" className="gap-1.5">
              <Languages className="w-4 h-4 text-primary" /> Słownik Językowy
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* TAB 1: LIST OF DESIGNS */}
      {activeTab === "list" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Filtruj wg kraju:</span>
              <select
                value={filterCountry}
                onChange={(e) => setFilterCountry(e.target.value)}
                className="px-3 py-1.5 bg-background border border-input rounded-lg text-sm"
              >
                <option value="all">Wszystkie kraje</option>
                {countries.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name_pl} ({c.iso2})
                  </option>
                ))}
              </select>
            </div>

            <Button onClick={startNewCreator} className="gap-1.5">
              <Plus className="w-4 h-4" /> Stwórz Nową Kartkę
            </Button>
          </div>

          <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">Wczytywanie wzorów...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-xs font-medium text-muted-foreground uppercase">
                      <th className="text-left p-3">Kraj</th>
                      <th className="text-left p-3">Kategoria</th>
                      <th className="text-left p-3">Nr widoku</th>
                      <th className="text-left p-3">Autor zdjęcia</th>
                      <th className="text-left p-3">Język</th>
                      <th className="text-left p-3">Podgląd Front</th>
                      <th className="text-left p-3">Status</th>
                      <th className="text-right p-3">Akcje</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filtered.map((d) => (
                      <tr key={d.id} className="hover:bg-muted/30 transition-colors">
                        <td className="p-3 font-medium">{d.country_name}</td>
                        <td className="p-3 font-semibold text-xs">{d.category_name || "Ogólne"}</td>
                        <td className="p-3 font-mono text-xs">Widok #{d.view_no}</td>
                        <td className="p-3 text-xs text-muted-foreground">
                          {d.photo_author ? `Fot. ${d.photo_author}` : "—"}
                        </td>
                        <td className="p-3">
                          <span className="uppercase text-xs font-mono font-bold bg-muted px-2 py-0.5 rounded">
                            {d.language_code}
                          </span>
                        </td>
                        <td className="p-3">
                          {d.image_front_url ? (
                            <img
                              src={d.image_front_url}
                              alt={d.title || ""}
                              className="w-14 h-9 object-cover rounded border bg-slate-100"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td className="p-3">
                          <button
                            onClick={() => toggleActive(d.id, d.active)}
                            className={`px-2.5 py-0.5 rounded-full text-xs font-medium cursor-pointer ${
                              d.active
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {d.active ? "Aktywny" : "Nieaktywny"}
                          </button>
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => editInCreator(d)}
                              className="h-8 gap-1 text-xs"
                            >
                              <Pencil className="w-3.5 h-3.5" /> Edytuj
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => handleDelete(d.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-muted-foreground">
                          Brak wzorów kartek w bazie. Kliknij "Stwórz Nową Kartkę" aby dodać pierwszą!
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: POSTCARD CREATOR */}
      {activeTab === "creator" && (
        <AdminCardCreator
          initialDesign={editingDesign || undefined}
          onSaveSuccess={() => {
            fetchData();
            setActiveTab("list");
          }}
          onCancel={() => setActiveTab("list")}
        />
      )}

      {/* TAB 3: LANGUAGE DICTIONARY TEMPLATES */}
      {activeTab === "templates" && <AdminLanguageTemplates />}
    </div>
  );
};

export default AdminCardDesigns;
