import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Search, Plus, Package, ArrowLeft, Clock, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface InventoryUnit {
  id: string;
  internal_inventory_code: string;
  business_status: string | null;
  fulfillment_status: string;
  traveler_user_id: string | null;
  order_id: string | null;
  public_claim_code: string | null;
  qr_generated_at: string | null;
  shipped_at: string | null;
  registered_at: string | null;
  created_at: string;
  card_design_id: string;
  stock_batch_id: string;
  design_title: string | null;
  country_name: string | null;
  view_no: number | null;
  batch_name: string | null;
  source_type: string;
  distribution_channel: string;
  purpose: string | null;
  event_name: string | null;
  partner_name: string | null;
  production_status: string;
  location_name: string | null;
}

interface AdminInventoryJoin {
  id: string;
  internal_inventory_code: string;
  business_status: string;
  fulfillment_status: string;
  traveler_user_id: string | null;
  order_id: string | null;
  public_claim_code: string;
  qr_generated_at: string | null;
  shipped_at: string | null;
  registered_at: string | null;
  created_at: string;
  card_design_id: string;
  stock_batch_id: string | null;
  current_location_id: string | null;
  card_designs: {
    title: string | null;
    view_no: number;
    countries: {
      name_pl: string;
    } | null;
  } | null;
  stock_batches: {
    name: string;
    source_type: string;
    purpose: string | null;
    distribution_channel: string;
    event_name: string | null;
    partner_name: string | null;
    production_status: string;
  } | null;
  inventory_locations: {
    name: string;
  } | null;
}

interface CountryOption {
  id: string;
  name_pl: string;
}

interface DesignOption {
  id: string;
  title: string | null;
  view_no: number;
  country_id: string;
}

interface LocationOption {
  id: string;
  name: string;
  code: string;
}

const FULFILLMENT_LABELS: Record<string, string> = {
  in_stock: "W magazynie",
  reserved: "Zarezerwowana",
  qr_generated: "QR wygenerowany",
  qr_applied: "QR naklejony",
  shipped: "Wysłana",
  allocated: "Przydzielona do dystrybucji",
  issued: "Wydana Podróżnikowi",
  voided: "Anulowana",
  damaged: "Uszkodzona",
};

const BUSINESS_LABELS: Record<string, string> = {
  purchased: "Kupiona",
  assigned: "Przypisana Podróżnikowi",
  registered: "Zarejestrowana",
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  created_in_stock: "Utworzono w magazynie",
  reserved_for_order: "Zarezerwowano",
  qr_generated: "QR wygenerowany",
  qr_applied: "QR naklejony",
  shipped: "Wysłano",
  registered: "Zarejestrowano",
  voided: "Unieważniono",
  damaged: "Uszkodzona",
};

const ACTOR_TYPE_LABELS: Record<string, string> = {
  system: "System",
  admin: "Admin",
  traveler: "Podróżnik",
  recipient: "Obdarowany",
};

const PAGE_SIZE = 50;

const AdminInventory = () => {
  const { toast } = useToast();
  const [units, setUnits] = useState<InventoryUnit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [countryFilter, setCountryFilter] = useState("all");
  const [fulfillmentFilter, setFulfillmentFilter] = useState("all");
  const [businessFilter, setBusinessFilter] = useState("all");
  const [page, setPage] = useState(0);

  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [designs, setDesigns] = useState<DesignOption[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);

  // Init batch dialog
  const [showInitDialog, setShowInitDialog] = useState(false);
  const [initDesignId, setInitDesignId] = useState("");
  const [initQuantity, setInitQuantity] = useState("5000");
  const [initBatchName, setInitBatchName] = useState("");
  const [initLocationId, setInitLocationId] = useState("");
  const [isInitializing, setIsInitializing] = useState(false);
  const [isClearingInventory, setIsClearingInventory] = useState(false);

  // Detail view
  const [selectedUnit, setSelectedUnit] = useState<InventoryUnit | null>(null);
  const [unitEvents, setUnitEvents] = useState<Array<{
    id: string;
    event_type: string;
    actor_type: string;
    actor_id: string | null;
    payload_json: unknown;
    created_at: string;
  }>>([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  const openUnitDetail = async (unit: InventoryUnit) => {
    setSelectedUnit(unit);
    setEventsLoading(true);
    const { data } = await supabase
      .from("inventory_unit_events")
      .select("id, event_type, actor_type, actor_id, payload_json, created_at")
      .eq("inventory_unit_id", unit.id)
      .order("created_at", { ascending: true });
    setUnitEvents(data || []);
    setEventsLoading(false);
  };

  const fetchFilters = useCallback(async () => {
    const [{ data: c }, { data: d }, { data: l }] = await Promise.all([
      supabase.from("countries").select("id, name_pl").order("name_pl"),
      supabase.from("card_designs").select("id, title, view_no, country_id").order("view_no"),
      supabase.from("inventory_locations").select("id, name, code").eq("active", true).order("name"),
    ]);
    if (c) setCountries(c);
    if (d) setDesigns(d);
    if (l) {
      setLocations(l);
      setInitLocationId((current) => current || l[0]?.id || "");
    }
  }, []);

  const fetchUnits = useCallback(async () => {
    setIsLoading(true);

    let query = supabase
      .from("inventory_units")
      .select(`
        id, internal_inventory_code, business_status, fulfillment_status,
        traveler_user_id, order_id, public_claim_code,
        qr_generated_at, shipped_at, registered_at, created_at,
        card_design_id, stock_batch_id, current_location_id,
        card_designs!inner(title, view_no, countries!inner(name_pl)),
        stock_batches!inner(name, source_type, purpose, distribution_channel, event_name, partner_name, production_status),
        inventory_locations(name)
      `)
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (fulfillmentFilter !== "all") {
      query = query.eq("fulfillment_status", fulfillmentFilter as Database["public"]["Enums"]["fulfillment_status"]);
    }
    if (businessFilter !== "all") {
      query = query.eq("business_status", businessFilter as Database["public"]["Enums"]["business_status"]);
    }
    if (countryFilter !== "all") {
      query = query.eq("card_designs.countries.id", countryFilter);
    }

    const { data, error } = await query;

    if (!error && data) {
      const typedData = data as unknown as AdminInventoryJoin[];
      setUnits(
        typedData.map((u: AdminInventoryJoin) => ({
          id: u.id,
          internal_inventory_code: u.internal_inventory_code,
          business_status: u.business_status,
          fulfillment_status: u.fulfillment_status,
          traveler_user_id: u.traveler_user_id,
          order_id: u.order_id,
          public_claim_code: u.public_claim_code,
          qr_generated_at: u.qr_generated_at,
          shipped_at: u.shipped_at,
          registered_at: u.registered_at,
          created_at: u.created_at,
          card_design_id: u.card_design_id,
          stock_batch_id: u.stock_batch_id || "",
          design_title: u.card_designs?.title || null,
          country_name: u.card_designs?.countries?.name_pl || null,
          view_no: u.card_designs?.view_no || null,
          batch_name: u.stock_batches?.name || null,
          source_type: u.stock_batches?.source_type || "stock",
          distribution_channel: u.stock_batches?.distribution_channel || "warehouse",
          purpose: u.stock_batches?.purpose || null,
          event_name: u.stock_batches?.event_name || null,
          partner_name: u.stock_batches?.partner_name || null,
          production_status: u.stock_batches?.production_status || "received",
          location_name: u.inventory_locations?.name || null,
        }))
      );
    }
    setIsLoading(false);
  }, [countryFilter, fulfillmentFilter, businessFilter, page]);

  useEffect(() => {
    fetchFilters();
  }, [fetchFilters]);

  useEffect(() => {
    fetchUnits();
  }, [fetchUnits]);

  const filteredUnits = units.filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      u.internal_inventory_code.toLowerCase().includes(q) ||
      u.public_claim_code?.toLowerCase().includes(q) ||
      u.order_id?.toLowerCase().includes(q) ||
      u.country_name?.toLowerCase().includes(q) ||
      u.design_title?.toLowerCase().includes(q)
    );
  });

  const initializeBatch = async () => {
    if (!initDesignId) {
      toast({ title: "Wybierz wzór Podróżówki", variant: "destructive" });
      return;
    }

    const quantity = parseInt(initQuantity);
    if (Number.isNaN(quantity) || quantity < 1 || quantity > 10000) {
      toast({ title: "Ilość musi być między 1 a 10000", variant: "destructive" });
      return;
    }

    setIsInitializing(true);
    const now = new Date().toISOString();
    const design = designs.find((candidate) => candidate.id === initDesignId);
    const country = countries.find((candidate) => candidate.id === design?.country_id);
    const batchName = initBatchName.trim() || `Magazyn — ${country?.name_pl || "Wzór"} V${design?.view_no || 0} — ${new Date().toLocaleDateString("pl-PL")}`;
    const { data: batch, error: batchError } = await supabase
      .from("stock_batches")
      .insert({
        name: batchName,
        description: "Ręcznie dodany stan magazynowy",
        card_design_id: initDesignId,
        quantity,
        source_type: "stock",
        purpose: "Stan magazynowy",
        distribution_channel: "warehouse",
        location_id: initLocationId || null,
        production_status: "received",
        received_at: now,
      })
      .select("id")
      .single();

    if (batchError || !batch) {
      toast({ title: "Nie udało się utworzyć partii magazynowej", description: batchError?.message, variant: "destructive" });
      setIsInitializing(false);
      return;
    }

    const prefix = `STK-${batch.id.replaceAll("-", "").slice(0, 8).toUpperCase()}`;
    const CHUNK = 500;
    let created = 0;

    for (let i = 0; i < quantity; i += CHUNK) {
      const chunk = Math.min(CHUNK, quantity - i);
      const rows = Array.from({ length: chunk }, (_, index) => ({
        stock_batch_id: batch.id,
        card_design_id: initDesignId,
        internal_inventory_code: `${prefix}-${String(i + index + 1).padStart(5, "0")}`,
        fulfillment_status: "in_stock" as const,
        current_location_id: initLocationId || null,
      }));

      const { error } = await supabase.from("inventory_units").insert(rows);
      if (error) {
        toast({ title: `Dodano ${created} z ${quantity} sztuk`, description: error.message, variant: "destructive" });
        setIsInitializing(false);
        return;
      }
      created += chunk;
    }

    toast({ title: `Dodano ${created} sztuk na magazyn` });
    setShowInitDialog(false);
    setInitBatchName("");
    setInitDesignId("");
    setInitQuantity("5000");
    setIsInitializing(false);
    fetchUnits();
  };

  const handleVoid = async (unitId: string) => {
    const { error } = await supabase
      .from("inventory_units")
      .update({ fulfillment_status: "voided" as Database["public"]["Enums"]["fulfillment_status"] })
      .eq("id", unitId);
    if (error) {
      toast({ title: "Błąd", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Sztuka unieważniona" });
      fetchUnits();
    }
  };

  const handleDamaged = async (unitId: string) => {
    const { error } = await supabase
      .from("inventory_units")
      .update({ fulfillment_status: "damaged" as Database["public"]["Enums"]["fulfillment_status"] })
      .eq("id", unitId);
    if (error) {
      toast({ title: "Błąd", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Sztuka oznaczona jako uszkodzona" });
      fetchUnits();
    }
  };

  const handleDeleteUnit = async (unitId: string) => {
    if (!confirm("Czy na pewno chcesz usunąć tę pozycję z magazynu?")) return;
    const { error } = await supabase.from("inventory_units").delete().eq("id", unitId);
    if (error) {
      toast({ title: "Błąd usuwania z magazynu", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Pozycja usunięta z magazynu" });
      fetchUnits();
    }
  };

  const canDeleteUnit = (unit: InventoryUnit) =>
    !unit.order_id &&
    !unit.public_claim_code &&
    !unit.shipped_at &&
    !unit.registered_at &&
    unit.business_status !== "registered" &&
    !["shipped", "issued"].includes(unit.fulfillment_status);

  const handleClearInventory = async () => {
    if (!confirm("Czy na pewno chcesz usunąć wszystkie pozycje z magazynu? Operacji nie można cofnąć.")) return;

    setIsClearingInventory(true);
    try {
      const { error: jobItemsError } = await supabase
        .from("qr_print_job_items")
        .delete()
        .not("id", "is", null);
      if (jobItemsError) throw jobItemsError;

      const { error: jobsError } = await supabase
        .from("qr_print_jobs")
        .delete()
        .not("id", "is", null);
      if (jobsError) throw jobsError;

      const { error: unitsError } = await supabase
        .from("inventory_units")
        .delete()
        .not("id", "is", null);
      if (unitsError) throw unitsError;

      setSelectedUnit(null);
      setUnitEvents([]);
      toast({ title: "Magazyn został wyczyszczony" });
      await fetchUnits();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nie udało się wyczyścić magazynu.";
      toast({ title: "Błąd czyszczenia magazynu", description: message, variant: "destructive" });
    } finally {
      setIsClearingInventory(false);
    }
  };

  const formatDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString("pl-PL", { day: "numeric", month: "short", year: "numeric" }) : "—";

  const fulfillmentBadge = (status: string) => {
    const colors: Record<string, string> = {
      in_stock: "bg-muted text-muted-foreground",
      reserved: "bg-[hsl(var(--gold))]/15 text-[hsl(var(--gold))]",
      qr_generated: "bg-primary/15 text-primary",
      qr_applied: "bg-primary/25 text-primary",
      shipped: "bg-accent/15 text-accent",
      allocated: "bg-primary/10 text-primary",
      issued: "bg-accent/20 text-accent",
      voided: "bg-destructive/15 text-destructive",
      damaged: "bg-destructive/25 text-destructive",
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || "bg-muted text-muted-foreground"}`}>
        {FULFILLMENT_LABELS[status] || status}
      </span>
    );
  };

  const businessBadge = (status: string | null) => {
    if (!status) return <span className="text-xs text-muted-foreground">—</span>;
    const colors: Record<string, string> = {
      purchased: "bg-[hsl(var(--gold))]/15 text-[hsl(var(--gold))]",
      assigned: "bg-primary/15 text-primary",
      registered: "bg-accent/15 text-accent",
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || ""}`}>
        {BUSINESS_LABELS[status] || status}
      </span>
    );
  };

  // Unit detail view
  if (selectedUnit) {
    const formatDateFull = (d: string) =>
      new Date(d).toLocaleDateString("pl-PL", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

    return (
      <div className="space-y-6">
        <button onClick={() => setSelectedUnit(null)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Wróć do listy
        </button>

        <div className="bg-card rounded-xl p-6 shadow-soft space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h3 className="font-display text-xl font-bold font-mono">{selectedUnit.internal_inventory_code}</h3>
            <div className="flex gap-2">
              {fulfillmentBadge(selectedUnit.fulfillment_status)}
              {businessBadge(selectedUnit.business_status)}
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><span className="text-muted-foreground">Kraj:</span><p>{selectedUnit.country_name || "—"}</p></div>
            <div><span className="text-muted-foreground">Wzór:</span><p>V{selectedUnit.view_no} {selectedUnit.design_title || ""}</p></div>
            <div><span className="text-muted-foreground">Claim code:</span><p className="font-mono text-xs">{selectedUnit.public_claim_code || "—"}</p></div>
            <div><span className="text-muted-foreground">Zamówienie:</span><p className="font-mono text-xs">{selectedUnit.order_id || "—"}</p></div>
            <div><span className="text-muted-foreground">Partia:</span><p>{selectedUnit.batch_name || "—"}</p></div>
          </div>
          {selectedUnit.fulfillment_status !== 'voided' && selectedUnit.fulfillment_status !== 'damaged' && (
            <div className="flex gap-2 border-t border-border pt-4">
              <Button variant="destructive" size="sm" onClick={() => { handleVoid(selectedUnit.id); setSelectedUnit(null); }}>Unieważnij</Button>
              <Button variant="destructive" size="sm" onClick={() => { handleDamaged(selectedUnit.id); setSelectedUnit(null); }}>Uszkodzona</Button>
            </div>
          )}
        </div>

        {/* Event timeline */}
        <div className="bg-card rounded-xl p-6 shadow-soft">
          <h4 className="font-display font-semibold mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" /> Historia zdarzeń
          </h4>
          {eventsLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
          ) : unitEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">Brak zarejestrowanych zdarzeń</p>
          ) : (
            <div className="relative">
              <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
              <div className="space-y-4">
                {unitEvents.map((ev, i) => (
                  <div key={ev.id} className="relative pl-10">
                    <div className="absolute left-2.5 top-1 w-3 h-3 rounded-full bg-primary border-2 border-background" />
                    <div className="bg-muted/50 rounded-lg p-3">
                      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
                        <span className="text-sm font-medium text-foreground">
                          {EVENT_TYPE_LABELS[ev.event_type] || ev.event_type}
                        </span>
                        <span className="text-xs text-muted-foreground">{formatDateFull(ev.created_at)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="px-1.5 py-0.5 bg-background rounded text-[10px] font-medium">
                          {ACTOR_TYPE_LABELS[ev.actor_type] || ev.actor_type}
                        </span>
                        {ev.payload_json && Object.keys(ev.payload_json).length > 0 && (
                          <span className="font-mono text-[10px] text-muted-foreground/70 truncate max-w-[300px]">
                            {JSON.stringify(ev.payload_json)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div>
          <h2 className="font-display text-xl font-bold text-foreground">Magazyn & System POD</h2>
          <p className="text-xs text-muted-foreground">Jednostki ze sklepu powstają automatycznie jako POD. Tutaj możesz również dodać gotowe Podróżówki na stan magazynowy.</p>
        </div>
        <div className="flex gap-2">
          {import.meta.env.DEV && (
            <Button variant="destructive" onClick={handleClearInventory} size="sm" disabled={isClearingInventory} className="gap-2">
              {isClearingInventory ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Wyczyść dane testowe
            </Button>
          )}
          <Button onClick={() => setShowInitDialog(true)} size="sm" className="gap-2">
            <Plus className="w-4 h-4" /> Dodaj na magazyn
          </Button>
        </div>
      </div>

      {/* Init batch dialog */}
      {showInitDialog && (
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <h3 className="font-display text-lg font-semibold">Dodaj Podróżówki na magazyn</h3>
          <p className="text-sm text-muted-foreground">Wybierz wzór i liczbę gotowych sztuk. Nazwa partii jest opcjonalna.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Nazwa partii (opcjonalnie)</label>
              <Input value={initBatchName} onChange={(e) => setInitBatchName(e.target.value)} placeholder="np. Festiwal 2026" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Wzór kartki</label>
              <Select value={initDesignId} onValueChange={setInitDesignId}>
                <SelectTrigger><SelectValue placeholder="Wybierz wzór" /></SelectTrigger>
                <SelectContent>
                  {designs.map((d) => {
                    const c = countries.find((co) => co.id === d.country_id);
                    return (
                      <SelectItem key={d.id} value={d.id}>
                        {c?.name_pl} — Widok {d.view_no} {d.title ? `(${d.title})` : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Ilość sztuk</label>
              <Input type="number" value={initQuantity} onChange={(e) => setInitQuantity(e.target.value)} min={1} max={10000} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={initializeBatch} disabled={isInitializing}>
              {isInitializing ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Dodaję...</> : <><Package className="w-4 h-4 mr-2" /> Dodaj na magazyn</>}
            </Button>
            <Button variant="outline" onClick={() => setShowInitDialog(false)} disabled={isInitializing}>Anuluj</Button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Szukaj po kodzie, QR, zamówieniu..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={countryFilter} onValueChange={(v) => { setCountryFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Kraj" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie kraje</SelectItem>
            {countries.map((c) => <SelectItem key={c.id} value={c.id}>{c.name_pl}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={fulfillmentFilter} onValueChange={(v) => { setFulfillmentFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Realizacja" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie statusy</SelectItem>
            {Object.entries(FULFILLMENT_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={businessFilter} onValueChange={(v) => { setBusinessFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Biznesowy" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie</SelectItem>
            <SelectItem value="purchased">Kupiona</SelectItem>
            <SelectItem value="assigned">Przypisana Podróżnikowi</SelectItem>
            <SelectItem value="registered">Zarejestrowana</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl shadow-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-3 font-medium text-muted-foreground">Kod</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Kraj</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Wzór</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Partia</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Realizacja</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Biznesowy</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Claim code</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Zamówienie</th>
                <th className="text-left p-3 font-medium text-muted-foreground">QR gen.</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Wysłano</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Rejestracja</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Akcje</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={12} className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-primary" /></td></tr>
              ) : filteredUnits.length === 0 ? (
                <tr><td colSpan={12} className="p-8 text-center text-muted-foreground">Brak wyników</td></tr>
              ) : (
                filteredUnits.map((u) => (
                  <tr key={u.id} className="border-b border-border/50 hover:bg-muted/30 cursor-pointer" onClick={() => openUnitDetail(u)}>
                    <td className="p-3 font-mono text-xs">{u.internal_inventory_code}</td>
                    <td className="p-3">{u.country_name || "—"}</td>
                    <td className="p-3 text-muted-foreground">V{u.view_no} {u.design_title || ""}</td>
                    <td className="p-3 text-xs">{u.batch_name || "—"}</td>
                    <td className="p-3">{fulfillmentBadge(u.fulfillment_status)}</td>
                    <td className="p-3">{businessBadge(u.business_status)}</td>
                    <td className="p-3 font-mono text-xs">{u.public_claim_code || "—"}</td>
                    <td className="p-3 font-mono text-xs">{u.order_id || "—"}</td>
                    <td className="p-3 text-xs text-muted-foreground">{formatDate(u.qr_generated_at)}</td>
                    <td className="p-3 text-xs text-muted-foreground">{formatDate(u.shipped_at)}</td>
                    <td className="p-3 text-xs text-muted-foreground">{formatDate(u.registered_at)}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        {u.fulfillment_status !== 'voided' && u.fulfillment_status !== 'damaged' && (
                          <>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleVoid(u.id); }}
                              className="px-2 py-0.5 rounded text-xs font-medium bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                              title="Unieważnij"
                            >Unieważnij</button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDamaged(u.id); }}
                              className="px-2 py-0.5 rounded text-xs font-medium bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                              title="Uszkodzona"
                            >Uszkodzona</button>
                          </>
                        )}
                        {canDeleteUnit(u) && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteUnit(u.id); }}
                            className="p-1 rounded text-destructive hover:bg-destructive/10 transition-colors ml-1"
                            title="Usuń nieużywaną pozycję testową"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between p-3 border-t border-border">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Poprzednia</Button>
          <span className="text-xs text-muted-foreground">Strona {page + 1}</span>
          <Button variant="outline" size="sm" disabled={filteredUnits.length < PAGE_SIZE} onClick={() => setPage((p) => p + 1)}>Następna</Button>
        </div>
      </div>
    </div>
  );
};

export default AdminInventory;
