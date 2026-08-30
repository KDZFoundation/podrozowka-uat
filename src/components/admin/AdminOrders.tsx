import { useEffect, useState, useCallback } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/integrations/firebase/config";
import { firestoreService } from "@/integrations/firebase/services/firestoreService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Search, ArrowLeft, PackageCheck, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { PodProductionPanel } from "@/components/admin/PodProductionPanel";

interface OrderRow {
  id: string;
  order_number: string;
  user_id: string;
  status: string;
  payment_status: string;
  payment_method: string;
  total_amount: number;
  currency: string;
  customer_email: string | null;
  shipping_name: string | null;
  shipping_city: string | null;
  created_at: string;
  display_name: string | null;
}

interface OrderDetail {
  id: string;
  order_number: string;
  user_id: string;
  status: string;
  payment_status: string;
  payment_method: string;
  total_amount: number;
  currency: string;
  customer_email: string | null;
  shipping_name: string | null;
  shipping_address: string | null;
  shipping_city: string | null;
  shipping_postal_code: string | null;
  shipping_country: string | null;
  notes: string | null;
  paid_at: string | null;
  fulfilled_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  items: {
    id: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    design_title: string | null;
    country_name: string | null;
    view_no: number | null;
  }[];
}

interface ReservedUnit {
  id: string;
  code: string;
  fulfillment: string;
  design: string;
  country: string | null;
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return "Wystąpił błąd podczas tworzenia pliku PDF";
};

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  pending: { label: "Oczekuje na płatność", className: "bg-muted text-muted-foreground" },
  paid: { label: "Oczekuje na druk", className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  processing_pod: { label: "W przygotowaniu (API Drukarnia)", className: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 font-semibold" },
  fulfilled: { label: "Zrealizowane (API Drukarnia)", className: "bg-accent/15 text-accent font-semibold" },
  cancelled: { label: "Anulowane", className: "bg-destructive/15 text-destructive" },
};

const PAYMENT_LABELS: Record<string, string> = {
  unpaid: "Nieopłacone",
  paid: "Opłacone",
  refunded: "Zwrócone",
  failed: "Nieudane",
  initialization_failed: "Nie rozpoczęto płatności",
  payment_review_required: "Wymaga ręcznej weryfikacji",
};

const PAGE_SIZE = 50;

const AdminOrders = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [methodFilter, setMethodFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [selectedOrder, setSelectedOrder] = useState<OrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reservedUnits, setReservedUnits] = useState<ReservedUnit[]>([]);

  const handleDeleteOrder = async (orderId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!confirm("Usunąć zamówienie? Jeżeli istnieją zdublowane wpisy o tym samym numerze, również zostaną usunięte.")) return;

    const target = orders.find((order) => order.id === orderId);
    if (!target) return;
    try {
      const deletedOrders = await firestoreService.deleteOrdersByNumber(target.order_number);
      toast({
        title: "Zamówienie zostało usunięte",
        description: deletedOrders > 1 ? `Usunięto ${deletedOrders} zdublowane wpisy tego zamówienia.` : undefined,
      });
      if (selectedOrder?.id === orderId) {
        setSelectedOrder(null);
      }
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      fetchOrders();
    } catch (error) {
      toast({ title: "Nie można usunąć zamówienia", description: getErrorMessage(error), variant: "destructive" });
    }
  };

  const fetchOrders = useCallback(async () => {
    setIsLoading(true);
    try {
      const firestoreOrders = await firestoreService.getAllOrders();
      const filtered = firestoreOrders.filter((order) =>
        (statusFilter === "all" || order.status === statusFilter) &&
        (paymentFilter === "all" || order.payment_status === paymentFilter),
      );
      setOrders(
        filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((fo) => ({
              id: fo.id,
              order_number: fo.order_number || fo.id.slice(0, 8).toUpperCase(),
              user_id: fo.user_id || "",
              status: fo.status || "new",
              payment_status: fo.payment_status || "pending",
              payment_method: fo.payment_method || "online",
              total_amount: fo.total_amount_pln || 0,
              currency: "PLN",
              customer_email: fo.guest_email || null,
              shipping_name: null,
              shipping_city: null,
              created_at: typeof fo.created_at === "string" ? fo.created_at : new Date().toISOString(),
              display_name: fo.guest_email || null,
        })),
      );
    } catch (err) {
      console.warn("fetchOrders handled error:", err);
      setOrders([]);
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, paymentFilter, page]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const fetchDetail = async (orderId: string) => {
    setDetailLoading(true);
    const order = await firestoreService.getOrderById(orderId);
    if (order) {
      const rawOrder = order as unknown as Record<string, unknown>;
      const address = (order.shipping_address || {}) as Record<string, string | undefined>;
      setSelectedOrder({
        id: order.id,
        order_number: order.order_number,
        user_id: order.user_id || "",
        status: order.status,
        payment_status: order.payment_status,
        payment_method: order.payment_method,
        total_amount: order.total_amount_pln,
        currency: "PLN",
        customer_email: order.guest_email || null,
        shipping_name: address.name || [address.first_name, address.last_name].filter(Boolean).join(" ") || null,
        shipping_address: address.address || address.street || null,
        shipping_city: address.city || null,
        shipping_postal_code: address.postal_code || null,
        shipping_country: "Polska",
        notes: null,
        paid_at: typeof rawOrder.paid_at === "string" ? rawOrder.paid_at : null,
        fulfilled_at: typeof rawOrder.fulfilled_at === "string" ? rawOrder.fulfilled_at : null,
        cancelled_at: typeof rawOrder.cancelled_at === "string" ? rawOrder.cancelled_at : null,
        created_at: order.created_at || new Date(0).toISOString(),
        items: order.items.map((item, index) => ({
          id: `${order.id}-${index}`,
          quantity: item.quantity,
          unit_price: item.unit_price_pln,
          total_price: item.total_price_pln,
          design_title: item.title || null,
          country_name: null,
          view_no: null,
        })),
      });
      fetchReservedUnits(orderId);
    }
    setDetailLoading(false);
  };

  const updateOrderStatus = async (orderId: string, status: string) => {
    const updates: Record<string, unknown> = { status };
    if (status === "fulfilled") updates.fulfilled_at = new Date().toISOString();
    if (status === "cancelled") updates.cancelled_at = new Date().toISOString();
    try {
      await firestoreService.updateOrder(orderId, updates);
      toast({ title: `Status zmieniony na: ${STATUS_LABELS[status]?.label || status}` });
      if (selectedOrder) fetchDetail(orderId);
      fetchOrders();
    } catch (error) {
      toast({ title: "Błąd aktualizacji", description: getErrorMessage(error), variant: "destructive" });
    }
  };

  const updatePaymentStatus = async (orderId: string, paymentStatus: string) => {
    const updates: Record<string, unknown> = { payment_status: paymentStatus };
    if (paymentStatus === "paid") {
      updates.paid_at = new Date().toISOString();
      updates.status = "paid";
    }
    try {
      await firestoreService.updateOrder(orderId, updates);
      toast({ title: `Płatność: ${PAYMENT_LABELS[paymentStatus]}` });
      if (selectedOrder) fetchDetail(orderId);
      fetchOrders();
    } catch (error) {
      toast({ title: "Błąd aktualizacji", description: getErrorMessage(error), variant: "destructive" });
    }
  };

  const fetchReservedUnits = async (orderId: string) => {
    try {
      const [unitsSnapshot, designsSnapshot, countriesSnapshot] = await Promise.all([
        getDocs(query(collection(db, "inventory_units"), where("order_id", "==", orderId))),
        getDocs(collection(db, "card_designs")),
        getDocs(collection(db, "countries")),
      ]);
      const countries = new Map(countriesSnapshot.docs.map((country) => {
        const data = country.data();
        return [country.id, String(data.name_pl || data.name || "")];
      }));
      const designs = new Map(designsSnapshot.docs.map((design) => {
        const data = design.data();
        return [design.id, {
          title: String(data.title || ""),
          viewNo: Number(data.view_no || 0),
          countryId: typeof data.country_id === "string" ? data.country_id : "",
        }];
      }));
      setReservedUnits(unitsSnapshot.docs.map((unit) => {
        const data = unit.data();
        const design = designs.get(String(data.card_design_id || ""));
        return {
          id: unit.id,
          code: String(data.internal_inventory_code || data.inventory_code || unit.id),
          fulfillment: String(data.fulfillment_status || data.status || "reserved"),
          design: design ? `V${design.viewNo} ${design.title}`.trim() : "Wzór niedostępny",
          country: design?.countryId ? countries.get(design.countryId) || null : null,
        };
      }));
    } catch (error) {
      console.warn("Reserved inventory units fetch failed:", error);
      setReservedUnits([]);
    }
  };

  const [confirmingCod, setConfirmingCod] = useState(false);
  const confirmCodPayment = async (orderId: string) => {
    setConfirmingCod(true);
    try {
      const order = await firestoreService.getOrderById(orderId);
      if (!order) throw new Error("Nie znaleziono zamówienia.");
      await firestoreService.updateOrder(orderId, {
        payment_status: "paid",
        status: "paid",
        paid_at: new Date().toISOString(),
        cod_confirmed_at: new Date().toISOString(),
      });
      toast({ title: "Płatność za pobraniem potwierdzona" });
      await fetchDetail(orderId);
      fetchOrders();
    } catch (error) {
      toast({
        title: "Nie udało się potwierdzić odbioru gotówki",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setConfirmingCod(false);
    }
  };


  const filteredOrders = orders.filter((o) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      o.order_number.toLowerCase().includes(q) ||
      o.display_name?.toLowerCase().includes(q) ||
      o.customer_email?.toLowerCase().includes(q) ||
      o.shipping_name?.toLowerCase().includes(q) ||
      o.shipping_city?.toLowerCase().includes(q)
    );
  });

  const formatDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString("pl-PL", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

  const statusBadge = (status: string) => {
    const s = STATUS_LABELS[status] || STATUS_LABELS.pending;
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.className}`}>{s.label}</span>;
  };

  // Detail view
  if (selectedOrder) {
    return (
      <div className="space-y-6">
        <button onClick={() => setSelectedOrder(null)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Wróć do listy
        </button>

        {detailLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : (
          <>
            <div className="bg-card rounded-xl p-6 shadow-soft space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <h3 className="font-display text-xl font-bold">{selectedOrder.order_number}</h3>
                <div className="flex gap-2 flex-wrap items-center">
                  {statusBadge(selectedOrder.status)}
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                    {PAYMENT_LABELS[selectedOrder.payment_status]}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    selectedOrder.payment_method === "cod"
                      ? "bg-[hsl(var(--gold))]/15 text-[hsl(var(--gold))]"
                      : "bg-primary/15 text-primary"
                  }`}>
                    {selectedOrder.payment_method === "cod" ? "Za pobraniem" : "Online"}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => handleDeleteOrder(selectedOrder.id, e)}
                    className="text-destructive hover:bg-destructive/10 gap-1 ml-2"
                  >
                    <Trash2 className="w-4 h-4" /> Usuń zamówienie
                  </Button>
                </div>
              </div>

              {selectedOrder.payment_method === "cod" && selectedOrder.payment_status === "unpaid" && (
                <div className="rounded-lg border border-[hsl(var(--gold))]/30 bg-[hsl(var(--gold))]/5 p-4 flex items-center justify-between flex-wrap gap-3">
                  <div className="text-sm">
                    <p className="font-medium">Zamówienie za pobraniem</p>
                    <p className="text-muted-foreground">Potwierdź odbiór gotówki po dostawie — wystawimy dokument fiskalny.</p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => confirmCodPayment(selectedOrder.id)}
                    disabled={confirmingCod}
                    className="gap-2"
                  >
                    {confirmingCod ? <Loader2 className="w-4 h-4 animate-spin" /> : <PackageCheck className="w-4 h-4" />}
                    Potwierdź odbiór gotówki
                  </Button>
                </div>
              )}


              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div><span className="text-muted-foreground">Data:</span><p>{formatDate(selectedOrder.created_at)}</p></div>
                <div><span className="text-muted-foreground">Kwota:</span><p className="font-bold">{Number(selectedOrder.total_amount).toFixed(2)} {selectedOrder.currency}</p></div>
                <div><span className="text-muted-foreground">Opłacono:</span><p>{formatDate(selectedOrder.paid_at)}</p></div>
                <div><span className="text-muted-foreground">Zrealizowano:</span><p>{formatDate(selectedOrder.fulfilled_at)}</p></div>
              </div>

              {selectedOrder.shipping_name && (
                <div className="border-t border-border pt-4 text-sm">
                  <p className="text-muted-foreground mb-1">Adres wysyłki:</p>
                  <p>{selectedOrder.shipping_name}</p>
                  <p>{selectedOrder.shipping_address}</p>
                  <p>{selectedOrder.shipping_postal_code} {selectedOrder.shipping_city}</p>
                  <p>{selectedOrder.shipping_country}</p>
                </div>
              )}

              {/* Status actions */}
              <div className="border-t border-border pt-4 flex flex-wrap gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Zmień status:</label>
                  <Select value={selectedOrder.status} onValueChange={(v) => updateOrderStatus(selectedOrder.id, v)}>
                    <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Zmień płatność:</label>
                  <Select value={selectedOrder.payment_status} onValueChange={(v) => updatePaymentStatus(selectedOrder.id, v)}>
                    <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(PAYMENT_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="bg-card rounded-xl shadow-soft overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-3 font-medium text-muted-foreground">Wzór</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Kraj</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Ilość</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Cena jedn.</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Suma</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedOrder.items.map((item) => (
                    <tr key={item.id} className="border-b border-border/50">
                      <td className="p-3">V{item.view_no} {item.design_title || ""}</td>
                      <td className="p-3">{item.country_name}</td>
                      <td className="p-3 text-right">{item.quantity}</td>
                      <td className="p-3 text-right">{Number(item.unit_price).toFixed(2)} PLN</td>
                      <td className="p-3 text-right font-medium">{Number(item.total_price).toFixed(2)} PLN</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* POD units are generated after payment; there is no stock reservation. */}
            <div className="bg-card rounded-xl p-6 shadow-soft space-y-4">
              <h4 className="font-display font-semibold">Sztuki POD z indywidualnymi kodami QR</h4>

              {selectedOrder.payment_status !== 'paid' && reservedUnits.length === 0 && (
                <p className="text-sm text-muted-foreground">Sztuki i kody QR zostaną utworzone automatycznie po opłaceniu zamówienia.</p>
              )}

              {selectedOrder.payment_status === 'paid' && reservedUnits.length === 0 && (
                <p className="text-sm text-muted-foreground">Trwa przygotowanie sztuk i kodów QR dla zadania POD.</p>
              )}

              {reservedUnits.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left p-2 font-medium text-muted-foreground">Kod inwentarza</th>
                        <th className="text-left p-2 font-medium text-muted-foreground">Kraj</th>
                        <th className="text-left p-2 font-medium text-muted-foreground">Wzór</th>
                        <th className="text-left p-2 font-medium text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reservedUnits.map((u) => (
                        <tr key={u.id} className="border-b border-border/50">
                          <td className="p-2 font-mono text-xs">{u.code}</td>
                          <td className="p-2">{u.country}</td>
                          <td className="p-2">{u.design}</td>
                          <td className="p-2">
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary/15 text-primary">
                              {u.fulfillment === 'reserved' ? 'Zarezerwowana' : u.fulfillment}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-xs text-muted-foreground mt-2">Utworzono {reservedUnits.length} sztuk POD z unikalnymi kodami QR</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 text-sm font-medium text-primary">Kolejka produkcyjna</p>
          <h2 className="font-display text-2xl font-bold text-foreground">Zamówienia POD</h2>
          <p className="mt-1 text-sm text-muted-foreground">Otwórz opłacone zamówienie, przygotuj plik SRA3 z kodami QR, a następnie przekaż je do drukarni.</p>
        </div>
      </div>

      <PodProductionPanel />

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Szukaj po numerze, nazwisku..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie statusy</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={paymentFilter} onValueChange={(v) => { setPaymentFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Płatność" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie płatności</SelectItem>
            {Object.entries(PAYMENT_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={methodFilter} onValueChange={(v) => { setMethodFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Metoda" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie metody</SelectItem>
            <SelectItem value="online">Online</SelectItem>
            <SelectItem value="cod">Za pobraniem</SelectItem>
          </SelectContent>
        </Select>
      </div>


      <div className="bg-card rounded-xl shadow-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-3 font-medium text-muted-foreground">Nr zamówienia</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Klient</th>
                 <th className="text-left p-3 font-medium text-muted-foreground">E-mail</th>
                 <th className="text-left p-3 font-medium text-muted-foreground">Data</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Płatność</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Metoda</th>
                <th className="text-right p-3 font-medium text-muted-foreground">Kwota</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={9} className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-primary" /></td></tr>
              ) : filteredOrders.length === 0 ? (
                <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">Brak zamówień</td></tr>
              ) : (
                filteredOrders.map((o) => (
                  <tr key={o.id} className="border-b border-border/50 hover:bg-muted/30 cursor-pointer" onClick={() => fetchDetail(o.id)}>
                    <td className="p-3 font-mono text-xs">{o.order_number}</td>
                    <td className="p-3">{o.display_name || "—"}</td>
                     <td className="p-3 text-xs text-muted-foreground">{o.customer_email || "—"}</td>
                     <td className="p-3 text-xs text-muted-foreground">{formatDate(o.created_at)}</td>
                    <td className="p-3">{statusBadge(o.status)}</td>
                    <td className="p-3 text-xs">{PAYMENT_LABELS[o.payment_status]}</td>
                    <td className="p-3 text-xs">
                      <span className={`px-2 py-0.5 rounded-full font-medium ${
                        o.payment_method === "cod"
                          ? "bg-[hsl(var(--gold))]/15 text-[hsl(var(--gold))]"
                          : "bg-primary/10 text-primary"
                      }`}>
                        {o.payment_method === "cod" ? "Pobranie" : "Online"}
                      </span>
                    </td>
                    <td className="p-3 text-right font-medium">{Number(o.total_amount).toFixed(2)} {o.currency}</td>
                    <td className="p-3 text-xs text-primary">
                      <div className="flex items-center justify-end gap-2">
                        <span>Szczegóły →</span>
                        <button
                          onClick={(e) => handleDeleteOrder(o.id, e)}
                          className="p-1 rounded text-destructive hover:bg-destructive/10 transition-colors"
                          title="Usuń zamówienie"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
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
          <Button variant="outline" size="sm" disabled={filteredOrders.length < PAGE_SIZE} onClick={() => setPage((p) => p + 1)}>Następna</Button>
        </div>
      </div>
    </div>
  );
};

export default AdminOrders;
