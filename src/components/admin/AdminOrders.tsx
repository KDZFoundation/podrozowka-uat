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
import { Loader2, Search, ArrowLeft, PackageCheck, Printer, Mail, FileText, CheckCircle2, Send, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { generatePodPrintPdf } from "@/lib/generatePodPrintPdf";

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

interface AdminOrderItemJoin {
  id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  card_design_id: string;
  card_designs: {
    title: string | null;
    view_no: number;
    countries: {
      name_pl: string;
    } | null;
  } | null;
}

interface ReservedUnit {
  id: string;
  code: string;
  fulfillment: string;
  design: string;
  country: string | null;
}

interface AdminInventoryUnitJoin {
  id: string;
  internal_inventory_code: string;
  fulfillment_status: string;
  card_design_id: string;
  card_designs: {
    title: string | null;
    view_no: number;
    countries: {
      name_pl: string;
    } | null;
  } | null;
}

interface ConfirmCodResponse {
  error?: string;
  success?: boolean;
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
};

const PAGE_SIZE = 50;

const AdminOrders = () => {
  const { toast } = useToast();
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
  const [printerEmail, setPrinterEmail] = useState<string>("");
  const [isSendingPodEmail, setIsSendingPodEmail] = useState(false);
  const [isGeneratingPodPdf, setIsGeneratingPodPdf] = useState(false);
  const [lastGeneratedPodPdf, setLastGeneratedPodPdf] = useState<{
    orderId: string;
    fileName: string;
    downloadUrl: string;
  } | null>(null);

  useEffect(() => () => {
    if (lastGeneratedPodPdf) URL.revokeObjectURL(lastGeneratedPodPdf.downloadUrl);
  }, [lastGeneratedPodPdf]);

  const handleGeneratePodPdf = async (order: OrderDetail) => {
    setIsGeneratingPodPdf(true);
    try {
      // A PDF is generated from a prepared QR print job, not directly from an order.
      const { data: printJob, error: printJobError } = await supabase
        .from("qr_print_jobs")
        .select("id")
        .eq("order_id", order.id)
        .in("status", ["ready", "printed"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (printJobError) throw printJobError;
      if (!printJob) {
        toast({
          title: "Brak przygotowanego pliku POD",
          description: `Dla zamówienia ${order.order_number} nie utworzono jeszcze kodów QR. Najpierw przygotuj zadanie druku POD.`,
          variant: "destructive",
        });
        return;
      }

      const result = await generatePodPrintPdf(printJob.id, order.order_number);
      setLastGeneratedPodPdf({
        orderId: order.id,
        fileName: result.fileName,
        downloadUrl: result.downloadUrl,
      });
      toast({
        title: "Plik produkcyjny SRA3 pobrany",
        description: `${result.itemCount} kartek na ${result.sheetCount} arkuszach, front + tył, indywidualne kody QR.`,
      });
    } catch (err) {
      console.error(err);
      toast({
        title: "Błąd PDF POD",
        description: getErrorMessage(err),
        variant: "destructive",
      });
    } finally {
      setIsGeneratingPodPdf(false);
    }
  };

  const handleSendToPrinter = async (orderId: string, orderNum: string) => {
    setIsSendingPodEmail(true);
    await updateOrderStatus(orderId, "processing_pod");
    setIsSendingPodEmail(false);
    toast({
      title: "Zlecenie wysłane do drukarni! (API / E-mail)",
      description: `Wysłano zlecenie druku zamówienia ${orderNum} do systemu drukarni. Status: 'W przygotowaniu (API Drukarnia)'.`,
    });
  };

  const handleMarkPodFulfilled = async (orderId: string) => {
    await updateOrderStatus(orderId, "fulfilled");
    toast({
      title: "Zamówienie zrealizowane",
      description: "Drukarnia wydrukowała, spakowała i wysłała zamówienie do klienta.",
    });
  };

  const handleDeleteOrder = async (orderId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!confirm("Czy na pewno chcesz usunąć to zamówienie? Operacji nie można cofnąć.")) return;

    const { data: qrJobs, error: qrJobsError } = await supabase
      .from("qr_print_jobs")
      .select("id")
      .eq("order_id", orderId);

    if (qrJobsError) {
      toast({ title: "Błąd odczytu zadania QR", description: qrJobsError.message, variant: "destructive" });
      return;
    }

    const qrJobIds = qrJobs.map((job) => job.id);
    if (qrJobIds.length > 0) {
      const { error: qrItemsError } = await supabase.from("qr_print_job_items").delete().in("print_job_id", qrJobIds);
      if (qrItemsError) {
        toast({ title: "Błąd usuwania pozycji QR", description: qrItemsError.message, variant: "destructive" });
        return;
      }

      const { error: qrJobsDeleteError } = await supabase.from("qr_print_jobs").delete().in("id", qrJobIds);
      if (qrJobsDeleteError) {
        toast({ title: "Błąd usuwania zadania QR", description: qrJobsDeleteError.message, variant: "destructive" });
        return;
      }
    }

    const { error: shipmentError } = await supabase.from("shipments").delete().eq("order_id", orderId);
    if (shipmentError) {
      toast({ title: "Błąd usuwania wysyłki", description: shipmentError.message, variant: "destructive" });
      return;
    }

    const { error: itemsError } = await supabase.from("order_items").delete().eq("order_id", orderId);
    if (itemsError) {
      toast({ title: "Błąd usuwania pozycji zamówienia", description: itemsError.message, variant: "destructive" });
      return;
    }

    const { error: inventoryError } = await supabase
      .from("inventory_units")
      .update({
        order_id: null,
        fulfillment_status: "in_stock",
        public_claim_code: null,
        public_claim_token_hash: null,
        qr_generated_at: null,
        qr_applied_at: null,
      })
      .eq("order_id", orderId);
    if (inventoryError) {
      toast({ title: "Błąd zwalniania sztuk magazynowych", description: inventoryError.message, variant: "destructive" });
      return;
    }

    const { error } = await supabase.from("orders").delete().eq("id", orderId);

    if (error) {
      toast({ title: "Błąd usuwania zamówienia", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Zamówienie zostało usunięte" });
      if (selectedOrder?.id === orderId) {
        setSelectedOrder(null);
      }
      fetchOrders();
    }
  };

  const fetchOrders = useCallback(async () => {
    setIsLoading(true);
    let query = supabase
      .from("orders")
      .select("id, order_number, user_id, status, payment_status, total_amount, currency, customer_email, shipping_name, shipping_city, created_at")
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (statusFilter !== "all") query = query.eq("status", statusFilter as Database["public"]["Enums"]["order_status"]);
    if (paymentFilter !== "all") query = query.eq("payment_status", paymentFilter as Database["public"]["Enums"]["payment_status"]);

    const { data, error } = await query;
    if (!error && data) {
      // Fetch display names for users safely
      const userIds = [...new Set(data.map((o) => o.user_id))].filter((id): id is string => Boolean(id));
      let profiles: { user_id: string; display_name: string | null }[] | null = null;
      if (userIds.length > 0) {
        const { data: profData } = await supabase
          .from("profiles")
          .select("user_id, display_name")
          .in("user_id", userIds);
        profiles = profData;
      }

      const nameMap = new Map(profiles?.map((p) => [p.user_id, p.display_name]) || []);

      setOrders(
        data.map((o) => ({
          ...o,
          payment_method: "online",
          display_name: o.user_id ? nameMap.get(o.user_id) || null : null,
        }))
      );
    } else if (error) {
      console.error("Error fetching orders:", error);
    }
    setIsLoading(false);
  }, [statusFilter, paymentFilter, page]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const fetchDetail = async (orderId: string) => {
    setDetailLoading(true);
    const [{ data: order }, { data: items }] = await Promise.all([
      supabase.from("orders").select("*").eq("id", orderId).single(),
      supabase
        .from("order_items")
        .select("id, quantity, unit_price, total_price, card_design_id, card_designs!inner(title, view_no, countries!inner(name_pl))")
        .eq("order_id", orderId),
    ]);

    if (order) {
      const typedItems = (items || []) as unknown as AdminOrderItemJoin[];
      setSelectedOrder({
        ...order,
        items: typedItems.map((i: AdminOrderItemJoin) => ({
          id: i.id,
          quantity: i.quantity,
          unit_price: i.unit_price,
          total_price: i.total_price,
          design_title: i.card_designs?.title || null,
          country_name: i.card_designs?.countries?.name_pl || null,
          view_no: i.card_designs?.view_no || null,
        })),
      });
      fetchReservedUnits(orderId);
    }
    setDetailLoading(false);
  };

  const updateOrderStatus = async (orderId: string, status: string) => {
    const updates: Partial<Database["public"]["Tables"]["orders"]["Update"]> = {
      status: status as Database["public"]["Enums"]["order_status"],
    };
    if (status === "fulfilled") updates.fulfilled_at = new Date().toISOString();
    if (status === "cancelled") updates.cancelled_at = new Date().toISOString();

    const { error } = await supabase.from("orders").update(updates).eq("id", orderId);
    if (error) {
      toast({ title: "Błąd aktualizacji", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Status zmieniony na: ${STATUS_LABELS[status]?.label || status}` });
      if (selectedOrder) fetchDetail(orderId);
      fetchOrders();
    }
  };

  const updatePaymentStatus = async (orderId: string, paymentStatus: string) => {
    const updates: Partial<Database["public"]["Tables"]["orders"]["Update"]> = {
      payment_status: paymentStatus as Database["public"]["Enums"]["payment_status"],
    };
    if (paymentStatus === "paid") {
      updates.paid_at = new Date().toISOString();
      updates.status = "paid" as Database["public"]["Enums"]["order_status"];
    }

    const { error } = await supabase.from("orders").update(updates).eq("id", orderId);
    if (error) {
      toast({ title: "Błąd aktualizacji", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Płatność: ${PAYMENT_LABELS[paymentStatus]}` });
      if (selectedOrder) fetchDetail(orderId);
      fetchOrders();
    }
  };

  const fetchReservedUnits = async (orderId: string) => {
    const { data } = await supabase
      .from("inventory_units")
      .select("id, internal_inventory_code, fulfillment_status, card_design_id, card_designs!inner(title, view_no, countries!inner(name_pl))")
      .eq("order_id", orderId);
    const typedData = (data || []) as unknown as AdminInventoryUnitJoin[];
    setReservedUnits(
      typedData.map((u: AdminInventoryUnitJoin) => ({
        id: u.id,
        code: u.internal_inventory_code,
        fulfillment: u.fulfillment_status,
        design: `V${u.card_designs?.view_no} ${u.card_designs?.title || ""}`,
        country: u.card_designs?.countries?.name_pl || null,
      }))
    );
  };

  const [confirmingCod, setConfirmingCod] = useState(false);
  const confirmCodPayment = async (orderId: string) => {
    setConfirmingCod(true);
    const { data, error } = await supabase.functions.invoke("confirm-cod-payment", {
      body: { order_id: orderId },
    });
    setConfirmingCod(false);
    const res = data as ConfirmCodResponse;
    if (error || res?.error) {
      toast({
        title: "Nie udało się potwierdzić odbioru gotówki",
        description: res?.error || error?.message || "",
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Płatność za pobraniem potwierdzona" });
    fetchDetail(orderId);
    fetchOrders();
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

            {/* Print On Demand (POD) Workflow Section */}
            <div className="bg-card rounded-xl p-6 shadow-soft space-y-4 border border-primary/20">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h4 className="font-display font-semibold text-lg flex items-center gap-2">
                    <Printer className="w-5 h-5 text-primary" /> System Print on Demand (POD)
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Generowanie pliku PDF ze wzorami kartek i unikalnymi kodami QR do wysyłki e-mailem / API do Drukarni.
                  </p>
                </div>
                <div className="flex gap-2 items-center flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleGeneratePodPdf(selectedOrder)}
                    disabled={isGeneratingPodPdf || selectedOrder.payment_status !== "paid"}
                    className="gap-2"
                  >
                    {isGeneratingPodPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                    Pobierz PDF dla Drukarni
                  </Button>
                  {lastGeneratedPodPdf?.orderId === selectedOrder.id && (
                    <Button size="sm" variant="ghost" asChild>
                      <a href={lastGeneratedPodPdf.downloadUrl} download={lastGeneratedPodPdf.fileName}>
                        Pobierz ponownie PDF
                      </a>
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={() => handleSendToPrinter(selectedOrder.id, selectedOrder.order_number)}
                    disabled={isSendingPodEmail || selectedOrder.payment_status !== "paid"}
                    className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    {isSendingPodEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Wyślij do Drukarni (API / E-mail)
                  </Button>
                  {selectedOrder.status === 'processing_pod' && (
                    <Button
                      size="sm"
                      onClick={() => handleMarkPodFulfilled(selectedOrder.id)}
                      className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Oznacz jako Zrealizowane (Drukarnia API)
                    </Button>
                  )}
                </div>
              </div>

              {/* POD Flow Status Steps */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2">
                <div className={`p-3 rounded-lg border text-xs space-y-1 ${
                  selectedOrder.payment_status === 'paid' ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-muted/40 border-border'
                }`}>
                  <p className="font-semibold text-foreground">1. Zamówienie & Płatność</p>
                  <p className="text-muted-foreground">{selectedOrder.payment_status === 'paid' ? 'Opłacone przez podróżnika' : 'Oczekuje na opłacenie'}</p>
                </div>
                <div className={`p-3 rounded-lg border text-xs space-y-1 ${
                  selectedOrder.payment_status === 'paid' ? 'bg-blue-500/10 border-blue-500/30' : 'bg-muted/40 border-border'
                }`}>
                  <p className="font-semibold text-foreground">2. Generowanie PDF + QR</p>
                  <p className="text-muted-foreground">Wzory kartek z kodami QR dla drukarni</p>
                </div>
                <div className={`p-3 rounded-lg border text-xs space-y-1 ${
                  selectedOrder.status === 'processing_pod' ? 'bg-amber-500/10 border-amber-500/30' : selectedOrder.status === 'fulfilled' ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-muted/40 border-border'
                }`}>
                  <p className="font-semibold text-foreground">3. Realizacja w Drukarni</p>
                  <p className="text-muted-foreground">{selectedOrder.status === 'processing_pod' ? 'W przygotowaniu (API Drukarnia)' : selectedOrder.status === 'fulfilled' ? 'Zrealizowane' : 'Oczekuje na wysyłkę'}</p>
                </div>
                <div className={`p-3 rounded-lg border text-xs space-y-1 ${
                  selectedOrder.status === 'fulfilled' ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-muted/40 border-border'
                }`}>
                  <p className="font-semibold text-foreground">4. Pakowanie & Wysyłka</p>
                  <p className="text-muted-foreground">{selectedOrder.status === 'fulfilled' ? 'Wysłano do podróżnika' : 'Drukarnia pakuje i wysyła'}</p>
                </div>
              </div>

              {/* Email config hint */}
              <div className="bg-muted/30 p-3 rounded-lg flex items-center justify-between text-xs gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span>Adres e-mail drukarni dla zamówień POD:</span>
                  <Input
                    type="email"
                    placeholder="Adres email drukarni zostanie podany wkrótce..."
                    value={printerEmail}
                    onChange={(e) => setPrinterEmail(e.target.value)}
                    className="h-7 w-[280px] text-xs bg-background"
                  />
                </div>
                <span className="text-muted-foreground italic shrink-0">Wysyłka e-mail z kodami QR i plikami PDF w formatile POD</span>
              </div>
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

      <div className="grid gap-3 rounded-2xl border border-primary/15 bg-primary/[0.04] p-4 text-sm md:grid-cols-3">
        <div><span className="font-semibold text-primary">1. Opłacone</span><p className="mt-1 text-muted-foreground">System tworzy jednostki POD i indywidualne QR.</p></div>
        <div><span className="font-semibold text-primary">2. PDF SRA3</span><p className="mt-1 text-muted-foreground">Pobierz arkusz produkcyjny front + tył.</p></div>
        <div><span className="font-semibold text-primary">3. Drukarnia</span><p className="mt-1 text-muted-foreground">Wyślij zlecenie i aktualizuj status realizacji.</p></div>
      </div>

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
                <th className="text-left p-3 font-medium text-muted-foreground">Wysyłka</th>
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
                    <td className="p-3 text-xs">{o.shipping_city || "—"}</td>
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
