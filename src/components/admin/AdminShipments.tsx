import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Search, ArrowLeft, Plus, Truck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

type ShipmentStatus = Database["public"]["Enums"]["shipment_status"];

interface ShipmentRow {
  id: string;
  order_id: string;
  order_number: string | null;
  user_id: string;
  display_name: string | null;
  status: string;
  tracking_number: string | null;
  carrier: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  created_at: string;
  inpost_shipment_id?: string | null;
  size?: string | null;
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  pending: { label: "Oczekuje", className: "bg-muted text-muted-foreground" },
  packed: { label: "Spakowana", className: "bg-[hsl(var(--gold))]/15 text-[hsl(var(--gold))]" },
  shipped: { label: "Wysłana", className: "bg-primary/15 text-primary" },
  delivered: { label: "Dostarczona", className: "bg-accent/15 text-accent" },
  returned: { label: "Zwrócona", className: "bg-destructive/15 text-destructive" },
};

const PAGE_SIZE = 50;

const AdminShipments = () => {
  const { toast } = useToast();
  const [shipments, setShipments] = useState<ShipmentRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(0);

  // Create shipment
  const [showCreate, setShowCreate] = useState(false);
  const [newOrderId, setNewOrderId] = useState("");
  const [newCarrier, setNewCarrier] = useState("");
  const [newTracking, setNewTracking] = useState("");
  const [newMethod, setNewMethod] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Detail
  const [selectedShipment, setSelectedShipment] = useState<ShipmentRow | null>(null);
  const [selectedParcelSize, setSelectedParcelSize] = useState<"small" | "medium" | "large">("small");
  const [isGeneratingInpost, setIsGeneratingInpost] = useState(false);

  const fetchShipments = useCallback(async () => {
    setIsLoading(true);
    let query = supabase
      .from("shipments")
      .select("id, order_id, user_id, status, tracking_number, carrier, shipped_at, delivered_at, created_at, inpost_shipment_id, size")
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (statusFilter !== "all") query = query.eq("status", statusFilter as ShipmentStatus);

    const { data } = await query;
    if (data) {
      // Fetch order numbers and display names safely
      const orderIds = [...new Set(data.map(s => s.order_id))].filter((id): id is string => Boolean(id));
      const userIds = [...new Set(data.map(s => s.user_id))].filter((id): id is string => Boolean(id));

      let orders: { id: string; order_number: string }[] | null = null;
      let profiles: { user_id: string; display_name: string | null }[] | null = null;

      const promises: Promise<void>[] = [];

      if (orderIds.length > 0) {
        promises.push(
          supabase.from("orders").select("id, order_number").in("id", orderIds).then(({ data }) => {
            orders = data;
          })
        );
      }
      if (userIds.length > 0) {
        promises.push(
          supabase.from("profiles").select("user_id, display_name").in("user_id", userIds).then(({ data }) => {
            profiles = data;
          })
        );
      }

      await Promise.all(promises);

      const orderMap = new Map(orders?.map(o => [o.id, o.order_number]) || []);
      const nameMap = new Map(profiles?.map(p => [p.user_id, p.display_name]) || []);

      setShipments(data.map(s => ({
        ...s,
        order_number: s.order_id ? orderMap.get(s.order_id) || null : null,
        display_name: s.user_id ? nameMap.get(s.user_id) || null : null,
      })));
    }
    setIsLoading(false);
  }, [statusFilter, page]);

  useEffect(() => { fetchShipments(); }, [fetchShipments]);

  const createShipment = async () => {
    if (!newOrderId) {
      toast({ title: "Podaj ID zamówienia", variant: "destructive" });
      return;
    }
    setIsCreating(true);

    // Get order to find user_id
    const { data: order } = await supabase.from("orders").select("id, user_id").eq("id", newOrderId).single();
    if (!order) {
      toast({ title: "Zamówienie nie znalezione", variant: "destructive" });
      setIsCreating(false);
      return;
    }

    const { error } = await supabase.from("shipments").insert({
      order_id: order.id,
      user_id: order.user_id,
      carrier: newCarrier || null,
      tracking_number: newTracking || null,
      shipping_method: newMethod || null,
    });

    if (error) {
      toast({ title: "Błąd tworzenia wysyłki", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Wysyłka utworzona" });
      setShowCreate(false);
      setNewOrderId("");
      setNewCarrier("");
      setNewTracking("");
      setNewMethod("");
      fetchShipments();
    }
    setIsCreating(false);
  };

  const generateInpostShipment = async (orderId: string, size: string = "small") => {
    setIsGeneratingInpost(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-inpost-shipment", {
        body: { order_id: orderId, size },
      });

      if (error) {
        toast({
          title: "Błąd integracji InPost ShipX",
          description: error.message || "Nie udało się połączyć z funkcją brzegową.",
          variant: "destructive",
        });
      } else if (data?.error) {
        toast({
          title: "Błąd InPost ShipX",
          description: typeof data.error === "string" ? data.error : JSON.stringify(data.error),
          variant: "destructive",
        });
      } else {
        toast({
          title: "Przesyłka zarejestrowana w InPost Sandbox!",
          description: `Numer przesyłki: ${data.shipment?.tracking_number || data.tracking_number}`,
        });
        fetchShipments();
        if (selectedShipment) {
          setSelectedShipment({
            ...selectedShipment,
            tracking_number: data.shipment?.tracking_number || data.tracking_number,
            carrier: "InPost",
            inpost_shipment_id: data.shipment?.inpost_shipment_id || data.shipx_response?.id,
          });
        }
      }
    } catch (err: unknown) {
      toast({
        title: "Błąd wywołania",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setIsGeneratingInpost(false);
    }
  };

  const updateStatus = async (shipmentId: string, status: string) => {
    const { error } = await supabase
      .from("shipments")
      .update({ status: status as ShipmentStatus })
      .eq("id", shipmentId);

    if (error) {
      toast({ title: "Błąd aktualizacji", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Status: ${STATUS_LABELS[status]?.label || status}` });
      fetchShipments();
      if (selectedShipment?.id === shipmentId) {
        setSelectedShipment({ ...selectedShipment, status });
      }
    }
  };

  const updateTracking = async (shipmentId: string, tracking: string, carrier: string) => {
    const { error } = await supabase
      .from("shipments")
      .update({ tracking_number: tracking, carrier })
      .eq("id", shipmentId);

    if (!error) {
      toast({ title: "Dane śledzenia zaktualizowane" });
      fetchShipments();
    }
  };

  const filteredShipments = shipments.filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.order_number?.toLowerCase().includes(q) ||
      s.tracking_number?.toLowerCase().includes(q) ||
      s.display_name?.toLowerCase().includes(q) ||
      s.carrier?.toLowerCase().includes(q)
    );
  });

  const formatDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString("pl-PL", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

  const statusBadge = (status: string) => {
    const s = STATUS_LABELS[status] || STATUS_LABELS.pending;
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.className}`}>{s.label}</span>;
  };

  // Detail view
  if (selectedShipment) {
    return (
      <div className="space-y-6">
        <button onClick={() => setSelectedShipment(null)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Wróć do listy
        </button>
        <div className="bg-card rounded-xl p-6 shadow-soft space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h3 className="font-display text-xl font-bold">Wysyłka</h3>
            {statusBadge(selectedShipment.status)}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><span className="text-muted-foreground">Zamówienie:</span><p className="font-mono text-xs">{selectedShipment.order_number || selectedShipment.order_id.slice(0, 8)}</p></div>
            <div><span className="text-muted-foreground">Klient:</span><p>{selectedShipment.display_name || "—"}</p></div>
            <div><span className="text-muted-foreground">Wysłano:</span><p>{formatDate(selectedShipment.shipped_at)}</p></div>
            <div><span className="text-muted-foreground">Dostarczono:</span><p>{formatDate(selectedShipment.delivered_at)}</p></div>
          </div>

          <div className="border-t border-border pt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Zmień status:</label>
              <Select value={selectedShipment.status} onValueChange={(v) => updateStatus(selectedShipment.id, v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Nr śledzenia:</label>
              <Input
                defaultValue={selectedShipment.tracking_number || ""}
                onBlur={(e) => updateTracking(selectedShipment.id, e.target.value, selectedShipment.carrier || "")}
                placeholder="np. PL123456789"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Przewoźnik:</label>
              <Input
                defaultValue={selectedShipment.carrier || ""}
                onBlur={(e) => updateTracking(selectedShipment.id, selectedShipment.tracking_number || "", e.target.value)}
                placeholder="np. InPost, DPD"
              />
            </div>
          </div>

          <div className="border-t border-border pt-4 mt-2">
            <h4 className="font-semibold text-sm mb-3 text-foreground flex items-center gap-2">
              <Truck className="w-4 h-4 text-primary" /> Generowanie przesyłki InPost ShipX (Sandbox)
            </h4>
            <div className="flex flex-wrap items-center gap-3">
              <div className="w-[180px]">
                <label className="text-xs text-muted-foreground block mb-1">Gabaryt paczki:</label>
                <Select value={selectedParcelSize} onValueChange={(v: "small" | "medium" | "large") => setSelectedParcelSize(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="small">Gabaryt A (Mała)</SelectItem>
                    <SelectItem value="medium">Gabaryt B (Średnia)</SelectItem>
                    <SelectItem value="large">Gabaryt C (Duża)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="pt-5">
                <Button
                  onClick={() => generateInpostShipment(selectedShipment.order_id, selectedParcelSize)}
                  disabled={isGeneratingInpost}
                  className="gap-2"
                >
                  {isGeneratingInpost ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Truck className="w-4 h-4" />
                  )}
                  Zgłoś w InPost ShipX
                </Button>
              </div>
            </div>
            {selectedShipment.inpost_shipment_id && (
              <p className="text-xs text-muted-foreground mt-2 font-mono">
                ID przesyłki InPost: {selectedShipment.inpost_shipment_id}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Create form
  if (showCreate) {
    return (
      <div className="space-y-6">
        <button onClick={() => setShowCreate(false)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Wróć
        </button>
        <div className="bg-card rounded-xl p-6 shadow-soft space-y-4">
          <h3 className="font-display text-lg font-semibold">Nowa wysyłka</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">ID zamówienia *</label>
              <Input value={newOrderId} onChange={(e) => setNewOrderId(e.target.value)} placeholder="UUID zamówienia" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Przewoźnik</label>
              <Input value={newCarrier} onChange={(e) => setNewCarrier(e.target.value)} placeholder="np. InPost" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Nr śledzenia</label>
              <Input value={newTracking} onChange={(e) => setNewTracking(e.target.value)} placeholder="np. PL123456789" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Metoda wysyłki</label>
              <Input value={newMethod} onChange={(e) => setNewMethod(e.target.value)} placeholder="np. Kurier, Paczkomat" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={createShipment} disabled={isCreating}>
              {isCreating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Truck className="w-4 h-4 mr-2" />}
              Utwórz wysyłkę
            </Button>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Anuluj</Button>
          </div>
        </div>
      </div>
    );
  }

  // List
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-bold text-foreground">Wysyłki</h2>
        <Button onClick={() => setShowCreate(true)} size="sm" className="gap-2"><Plus className="w-4 h-4" /> Nowa wysyłka</Button>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Szukaj po numerze, kliencie, trackingu..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card rounded-xl shadow-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-3 font-medium text-muted-foreground">Zamówienie</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Klient</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Przewoźnik</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Nr śledzenia</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Wysłano</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-primary" /></td></tr>
              ) : filteredShipments.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Brak wysyłek</td></tr>
              ) : (
                filteredShipments.map((s) => (
                  <tr key={s.id} className="border-b border-border/50 hover:bg-muted/30 cursor-pointer" onClick={() => setSelectedShipment(s)}>
                    <td className="p-3 font-mono text-xs">{s.order_number || s.order_id.slice(0, 8)}</td>
                    <td className="p-3">{s.display_name || "—"}</td>
                    <td className="p-3">{statusBadge(s.status)}</td>
                    <td className="p-3 text-muted-foreground">{s.carrier || "—"}</td>
                    <td className="p-3 font-mono text-xs">{s.tracking_number || "—"}</td>
                    <td className="p-3 text-xs text-muted-foreground">{formatDate(s.shipped_at)}</td>
                    <td className="p-3 text-xs text-primary">Szczegóły →</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between p-3 border-t border-border">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Poprzednia</Button>
          <span className="text-xs text-muted-foreground">Strona {page + 1}</span>
          <Button variant="outline" size="sm" disabled={filteredShipments.length < PAGE_SIZE} onClick={() => setPage(p => p + 1)}>Następna</Button>
        </div>
      </div>
    </div>
  );
};

export default AdminShipments;
