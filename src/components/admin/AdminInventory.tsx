import { useEffect, useState, useCallback } from "react";
import { inventoryService, type LocalInventoryBatch, type LocalInventoryCountry, type LocalInventoryDesign, type LocalInventoryUnit, type LocalStockOrder } from "@/integrations/firebase/services/inventoryService";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Search, Plus, Package, ArrowLeft, Clock, Trash2, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { generatePodPrintPdf } from "@/lib/generatePodPrintPdf";

interface StockProductionOrder {
  id: string;
  order_number: string;
  name: string;
  total_quantity: number;
  status: string;
  created_at: string;
}

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
  const { user } = useAuth();
  const [units, setUnits] = useState<InventoryUnit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [countryFilter, setCountryFilter] = useState("all");
  const [fulfillmentFilter, setFulfillmentFilter] = useState("all");
  const [businessFilter, setBusinessFilter] = useState("all");
  const [page, setPage] = useState(0);

  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [designs, setDesigns] = useState<DesignOption[]>([]);

  // Init batch dialog
  const [showInitDialog, setShowInitDialog] = useState(false);
  const [initDesignId, setInitDesignId] = useState("");
  const [initQuantity, setInitQuantity] = useState("5000");
  const [initBatchName, setInitBatchName] = useState("");
  const [isInitializing, setIsInitializing] = useState(false);
  const [isClearingInventory, setIsClearingInventory] = useState(false);
  const [pendingDeleteUnit, setPendingDeleteUnit] = useState<{ id: string; code: string } | null>(null);
  const [isDeletingUnit, setIsDeletingUnit] = useState(false);
  const [stockOrders, setStockOrders] = useState<StockProductionOrder[]>([]);
  const [receivingOrderId, setReceivingOrderId] = useState<string | null>(null);

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
    try {
      const events = await inventoryService.getUnitEvents(unit.id);
      setUnitEvents(events as typeof unitEvents);
    } catch (error) {
      toast({ title: "Nie udało się wczytać historii jednostki", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
      setUnitEvents([]);
    } finally {
      setEventsLoading(false);
    }
  };

  const fetchFilters = useCallback(async () => {
    const snapshot = await inventoryService.getInventorySnapshot();
    setCountries(snapshot.countries.map((country: LocalInventoryCountry) => ({ id: country.id, name_pl: country.name_pl || country.name || "" })));
    setDesigns(snapshot.designs.map((design: LocalInventoryDesign) => ({ id: design.id, title: design.title || null, view_no: design.view_no || 1, country_id: design.country_id || "" })));
  }, []);

  const fetchUnits = useCallback(async () => {
    setIsLoading(true);
    try {
      const snapshot = await inventoryService.getInventorySnapshot();
      const countriesById = new Map<string, LocalInventoryCountry>(snapshot.countries.map((country) => [country.id, country]));
      const designsById = new Map<string, LocalInventoryDesign>(snapshot.designs.map((design) => [design.id, design]));
      const batchesById = new Map<string, LocalInventoryBatch>(snapshot.batches.map((batch) => [batch.id, batch]));
      let localUnits = snapshot.units.map((unit: LocalInventoryUnit) => {
        const design = designsById.get(unit.card_design_id || "");
        const country = countriesById.get(design?.country_id || "");
        const batch = batchesById.get(unit.stock_batch_id || "");
        return {
          ...unit,
          design_title: design?.title || null,
          country_name: country?.name_pl || country?.name || null,
          view_no: design?.view_no || null,
          batch_name: batch?.name || null,
          source_type: batch?.source_type || "stock",
          distribution_channel: batch?.distribution_channel || "warehouse",
          purpose: batch?.purpose || null,
          event_name: batch?.event_name || null,
          partner_name: batch?.partner_name || null,
          production_status: batch?.production_status || "received",
        } as InventoryUnit;
      });
      if (fulfillmentFilter !== "all") localUnits = localUnits.filter((unit) => unit.fulfillment_status === fulfillmentFilter);
      if (businessFilter !== "all") localUnits = localUnits.filter((unit) => unit.business_status === businessFilter);
      if (countryFilter !== "all") localUnits = localUnits.filter((unit) => designsById.get(unit.card_design_id)?.country_id === countryFilter);
      setUnits(localUnits.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE));
    } catch (error) {
      setUnits([]);
      toast({ title: "Nie udało się wczytać magazynu", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [countryFilter, fulfillmentFilter, businessFilter, page, toast]);

  useEffect(() => {
    fetchFilters();
  }, [fetchFilters]);

  useEffect(() => {
    fetchUnits();
  }, [fetchUnits]);

  const fetchStockOrders = useCallback(async () => {
    const snapshot = await inventoryService.getInventorySnapshot();
    setStockOrders(snapshot.orders
      .filter((order: LocalStockOrder) => ["draft", "ordered", "in_production"].includes(order.status || ""))
      .map((order: LocalStockOrder) => ({ id: order.id, order_number: order.order_number || "", name: order.name || "", total_quantity: order.total_quantity || 0, status: order.status || "draft", created_at: order.created_at || "" })));
  }, []);

  useEffect(() => {
    fetchStockOrders();
  }, [fetchStockOrders]);

  const filteredUnits = units.filter((u) => {
    if (u.source_type === "stock" && u.production_status !== "received") return false;
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
    const design = designs.find((candidate) => candidate.id === initDesignId);
    const country = countries.find((candidate) => candidate.id === design?.country_id);
    const batchName = initBatchName.trim() || `Magazyn — ${country?.name_pl || "Wzór"} V${design?.view_no || 0} — ${new Date().toLocaleDateString("pl-PL")}`;
    try {
      const result = await inventoryService.prepareStockPrintOrder({
        cardDesignId: initDesignId,
        quantity,
        name: batchName,
        adminUid: user?.id || "local-admin",
      });
      try {
        const pdf = await generatePodPrintPdf(result.printJobId, result.documentNumber);
        toast({
          title: `PDF dla ${result.quantity} sztuk jest gotowy`,
          description: `${pdf.fileName}. Po odbiorze wydruku potwierdź przyjęcie na magazyn.`,
        });
      } catch (pdfError) {
        toast({
          title: `Partia ${result.quantity} sztuk została zapisana`,
          description: `Nie udało się automatycznie pobrać PDF: ${pdfError instanceof Error ? pdfError.message : "Nieznany błąd"}. Plik możesz ponowić w menu Druk QR.`,
          variant: "destructive",
        });
      }

      setShowInitDialog(false);
      setInitBatchName("");
      setInitDesignId("");
      setInitQuantity("5000");
      await Promise.all([fetchUnits(), fetchStockOrders()]);
    } catch (error) {
      toast({ title: "Nie udało się przygotować partii do druku", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally {
      setIsInitializing(false);
    }
  };

  const receiveStockOrder = async (stockOrder: StockProductionOrder) => {
    setReceivingOrderId(stockOrder.id);
    try {
      const receivedUnits = await inventoryService.receiveStockProductionOrder(stockOrder.id);
      toast({ title: "Wydruk przyjęty na magazyn", description: `${receivedUnits} szt. jest dostępnych fizycznie na magazynie.` });
      await Promise.all([fetchUnits(), fetchStockOrders()]);
    } catch (error) {
      toast({ title: "Nie udało się przyjąć wydruku", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally {
      setReceivingOrderId(null);
    }
  };

  const handleVoid = async (unitId: string) => {
    try {
      await inventoryService.setUnitStatus(unitId, "voided");
      toast({ title: "Sztuka unieważniona" });
      fetchUnits();
    } catch (error) {
      toast({ title: "Błąd", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    }
  };

  const handleDamaged = async (unitId: string) => {
    try {
      await inventoryService.setUnitStatus(unitId, "damaged");
      toast({ title: "Sztuka oznaczona jako uszkodzona" });
      fetchUnits();
    } catch (error) {
      toast({ title: "Błąd", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    }
  };

  const handleDeleteUnit = async (unitId: string) => {
    setIsDeletingUnit(true);
    try {
      await inventoryService.deleteUnit(unitId);
      toast({ title: "Pozycja usunięta z magazynu" });
      setPendingDeleteUnit(null);
      await fetchUnits();
    } catch (error) {
      toast({ title: "Błąd usuwania z magazynu", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally {
      setIsDeletingUnit(false);
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
    if (!confirm("Czy usunąć wszystkie testowe zamówienia magazynowe wraz z partiami, jednostkami i zadaniami QR? Zamówienia sklepowe/POD pozostaną bez zmian. Operacji nie można cofnąć.")) return;

    setIsClearingInventory(true);
    try {
      const result = await inventoryService.clearTestInventory();

      setSelectedUnit(null);
      setUnitEvents([]);
      toast({
        title: "Testowe dane magazynowe zostały wyczyszczone",
        description: `Usunięto ${result.stockOrders} zleceń, ${result.stockBatches} partii i ${result.inventoryUnits} jednostek.`,
      });
      await Promise.all([fetchUnits(), fetchStockOrders()]);
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
          <p className="text-xs text-muted-foreground">Jednostki ze sklepu powstają automatycznie jako POD. Zamówienia magazynowe trafiają na stan dopiero po fizycznym odbiorze wydruku.</p>
        </div>
        <div className="flex gap-2">
          {(import.meta.env.DEV || import.meta.env.VITE_ENABLE_TEST_DATA_CLEANUP === "true") && (
            <Button variant="destructive" onClick={handleClearInventory} size="sm" disabled={isClearingInventory} className="gap-2">
              {isClearingInventory ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Wyczyść dane testowe
            </Button>
          )}
          <Button onClick={() => setShowInitDialog(true)} size="sm" className="gap-2">
            <Plus className="w-4 h-4" /> Nowe zamówienie do drukarni
          </Button>
        </div>
      </div>

      {/* Init batch dialog */}
      {showInitDialog && (
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <h3 className="font-display text-lg font-semibold">Nowe zamówienie magazynowe</h3>
          <p className="text-sm text-muted-foreground">
            System wygeneruje PDF SRA3 z kodami QR dla drukarni. Stan magazynowy powstanie dopiero po potwierdzeniu odbioru fizycznego wydruku.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Nazwa zamówienia (opcjonalnie)</label>
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
              {isInitializing ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Przygotowuję...</> : <><Package className="w-4 h-4 mr-2" /> Utwórz zamówienie i PDF</>}
            </Button>
            <Button variant="outline" onClick={() => setShowInitDialog(false)} disabled={isInitializing}>Anuluj</Button>
          </div>
        </div>
      )}

      {stockOrders.length > 0 && (
        <div className="rounded-xl border border-primary/20 bg-primary/[0.04] p-5">
          <div className="mb-4 flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            <div>
              <h3 className="font-display text-lg font-semibold">Wydruki oczekujące na przyjęcie</h3>
              <p className="text-sm text-muted-foreground">Potwierdź dopiero po otrzymaniu fizycznych Podróżówek od drukarni.</p>
            </div>
          </div>
          <div className="space-y-2">
            {stockOrders.map((stockOrder) => (
              <div key={stockOrder.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
                <div>
                  <p className="font-medium">{stockOrder.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {stockOrder.order_number} · {stockOrder.total_quantity} szt. · PDF SRA3 z kodami QR gotowy do przekazania drukarni
                  </p>
                </div>
                <Button size="sm" onClick={() => receiveStockOrder(stockOrder)} disabled={receivingOrderId === stockOrder.id}>
                  {receivingOrderId === stockOrder.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                  Potwierdź przyjęcie na magazyn
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      {pendingDeleteUnit && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <div>
            <p className="font-medium text-foreground">Usunąć pozycję {pendingDeleteUnit.code}?</p>
            <p className="text-sm text-muted-foreground">Pozycja zostanie trwale usunięta ze stanu magazynowego.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setPendingDeleteUnit(null)} disabled={isDeletingUnit}>Anuluj</Button>
            <Button variant="destructive" onClick={() => handleDeleteUnit(pendingDeleteUnit.id)} disabled={isDeletingUnit}>
              {isDeletingUnit ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              {isDeletingUnit ? "Usuwam..." : "Usuń pozycję"}
            </Button>
          </div>
        </div>
      )}

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
                            onClick={(e) => { e.stopPropagation(); setPendingDeleteUnit({ id: u.id, code: u.internal_inventory_code }); }}
                            className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 ml-1"
                            title="Usuń niewykorzystaną pozycję z magazynu"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Usuń
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
