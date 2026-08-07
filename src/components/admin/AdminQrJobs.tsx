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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, QrCode, Printer, ArrowLeft, Eye, Plus, Download, CheckCheck, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PrintJob {
  id: string;
  name: string;
  status: string;
  total_items: number;
  generated_items: number;
  shipment_id: string | null;
  order_id: string | null;
  created_at: string;
}

interface PrintJobItem {
  id: string;
  inventory_unit_id: string;
  public_claim_code: string;
  qr_url: string;
  generated_at: string;
  unit_code: string | null;
  design_title: string | null;
  country_name: string | null;
  view_no: number | null;
}

interface QrPrintJobItemJoin {
  id: string;
  inventory_unit_id: string;
  public_claim_code: string;
  qr_url: string;
  generated_at: string;
  inventory_units: {
    internal_inventory_code: string;
    card_designs: {
      title: string | null;
      view_no: number;
      countries: {
        name_pl: string;
      } | null;
    } | null;
  } | null;
}

interface ReservedUnitJoin {
  id: string;
  internal_inventory_code: string;
  card_designs: {
    title: string | null;
    view_no: number;
  } | null;
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  pending: { label: "Oczekuje", className: "bg-muted text-muted-foreground" },
  generating: { label: "Generowanie...", className: "bg-[hsl(var(--gold))]/15 text-[hsl(var(--gold))]" },
  ready: { label: "Gotowe", className: "bg-accent/15 text-accent" },
  printed: { label: "Wydrukowane", className: "bg-primary/15 text-primary" },
  failed: { label: "Błąd", className: "bg-destructive/15 text-destructive" },
};

const AdminQrJobs = () => {
  const { toast } = useToast();
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<PrintJob | null>(null);
  const [jobItems, setJobItems] = useState<PrintJobItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [jobToDelete, setJobToDelete] = useState<PrintJob | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // New job form
  const [showNewJob, setShowNewJob] = useState(false);
  const [jobName, setJobName] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState("all");
  const [ordersList, setOrdersList] = useState<{ id: string; order_number: string; shipping_name: string | null; created_at: string }[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [reservedUnits, setReservedUnits] = useState<{ id: string; code: string; design: string; order_id: string | null }[]>([]);

  const fetchJobs = useCallback(async () => {
    setIsLoading(true);
    const { data } = await supabase
      .from("qr_print_jobs")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setJobs(data);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const fetchJobItems = async (jobId: string) => {
    setItemsLoading(true);
    const { data } = await supabase
      .from("qr_print_job_items")
      .select(`
        id, inventory_unit_id, public_claim_code, qr_url, generated_at,
        inventory_units!inner(internal_inventory_code, card_designs!inner(title, view_no, countries!inner(name_pl)))
      `)
      .eq("print_job_id", jobId);

    if (data) {
      const typedData = data as unknown as QrPrintJobItemJoin[];
      setJobItems(
        typedData.map((i: QrPrintJobItemJoin) => ({
          id: i.id,
          inventory_unit_id: i.inventory_unit_id,
          public_claim_code: i.public_claim_code,
          qr_url: i.qr_url,
          generated_at: i.generated_at,
          unit_code: i.inventory_units?.internal_inventory_code || null,
          design_title: i.inventory_units?.card_designs?.title || null,
          country_name: i.inventory_units?.card_designs?.countries?.name_pl || null,
          view_no: i.inventory_units?.card_designs?.view_no || null,
        }))
      );
    }
    setItemsLoading(false);
  };

  const openJob = (job: PrintJob) => {
    setSelectedJob(job);
    fetchJobItems(job.id);
  };

  const loadUnitsForOrder = async (orderId: string) => {
    let query = supabase
      .from("inventory_units")
      .select("id, internal_inventory_code, order_id, card_designs!inner(title, view_no, countries!inner(name_pl))")
      .order("created_at", { ascending: true })
      .limit(500);

    if (orderId && orderId !== "all") {
      query = query.eq("order_id", orderId);
    } else {
      query = query.in("fulfillment_status", ["reserved", "in_stock", "shipped", "purchased"]);
    }

    const { data } = await query;

    if (data) {
      const typedData = data as unknown as (ReservedUnitJoin & { order_id: string | null; card_designs: { title: string | null; view_no: number; countries: { name_pl: string } | null } | null })[];
      setReservedUnits(
        typedData.map((u) => ({
          id: u.id,
          code: u.internal_inventory_code,
          design: `${u.card_designs?.countries?.name_pl || ""} — V${u.card_designs?.view_no} ${u.card_designs?.title || ""}`,
          order_id: u.order_id,
        }))
      );
    } else {
      setReservedUnits([]);
    }
  };

  const fetchOrdersForSelection = async () => {
    const { data } = await supabase
      .from("orders")
      .select("id, order_number, shipping_name, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) {
      setOrdersList(data);
    }
  };

  const openNewJob = async () => {
    setShowNewJob(true);
    setJobName("Druk QR - Wszystkie zarezerwowane");
    setSelectedOrderId("all");
    await fetchOrdersForSelection();
    await loadUnitsForOrder("all");
  };

  const handleOrderChange = (orderId: string) => {
    setSelectedOrderId(orderId);
    if (orderId === "all") {
      setJobName("Druk QR - Wszystkie zarezerwowane");
    } else {
      const selected = ordersList.find((o) => o.id === orderId);
      if (selected) {
        setJobName(`Druk QR - Zamówienie ${selected.order_number}`);
      }
    }
    loadUnitsForOrder(orderId);
  };

  const generateRandomToken = (len = 32): string => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    let res = "";
    for (let i = 0; i < len; i++) res += chars[Math.floor(Math.random() * chars.length)];
    return res;
  };

  const hashToken = async (token: string): Promise<string> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(token);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  };

  const generateQr = async () => {
    if (!jobName) {
      toast({ title: "Podaj nazwę zadania druku", variant: "destructive" });
      return;
    }
    if (reservedUnits.length === 0) {
      toast({ title: "Brak sztuk do wygenerowania QR", variant: "destructive" });
      return;
    }

    setIsGenerating(true);

    try {
      // First try Edge Function
      const { data, error } = await supabase.functions.invoke("generate-qr", {
        body: {
          inventory_unit_ids: reservedUnits.map((u) => u.id),
          print_job_name: jobName,
          order_id: selectedOrderId !== "all" ? selectedOrderId : undefined,
        },
      });

      if (!error && data?.success && data?.generated > 0) {
        toast({ title: `Wygenerowano QR dla ${data.generated} sztuk!` });
        setShowNewJob(false);
        fetchJobs();
        setIsGenerating(false);
        return;
      }

      console.warn("Edge function invoke failed or returned error, executing direct client-side QR generation fallback...", error || data?.error);

      // Fallback: Direct database QR Job creation
      const { data: { user } } = await supabase.auth.getUser();

      const { data: newJob, error: jobErr } = await supabase
        .from("qr_print_jobs")
        .insert({
          name: jobName,
          order_id: selectedOrderId !== "all" ? selectedOrderId : null,
          total_items: reservedUnits.length,
          generated_items: reservedUnits.length,
          status: "ready" as Database["public"]["Enums"]["qr_print_job_status"],
          created_by: user?.id || null,
        })
        .select("id")
        .single();

      if (jobErr) throw jobErr;

      const baseUrl = window.location.origin;
      const jobItemsToInsert = [];

      for (const unit of reservedUnits) {
        const publicToken = generateRandomToken(32);
        const tokenHash = await hashToken(publicToken);
        const randomHex = Math.random().toString(16).substring(2, 6).toUpperCase();
        const claimCode = `PDZ-${randomHex}-${Math.random().toString(16).substring(2, 6).toUpperCase()}`;
        const qrUrl = `${baseUrl}/r/${publicToken}`;

        // Update inventory unit
        await supabase
          .from("inventory_units")
          .update({
            public_claim_code: claimCode,
            public_claim_token_hash: tokenHash,
            fulfillment_status: "qr_generated" as Database["public"]["Enums"]["fulfillment_status"],
            qr_generated_at: new Date().toISOString(),
          })
          .eq("id", unit.id);

        jobItemsToInsert.push({
          print_job_id: newJob.id,
          inventory_unit_id: unit.id,
          public_claim_code: claimCode,
          qr_url: qrUrl,
        });
      }

      await supabase.from("qr_print_job_items").insert(jobItemsToInsert);

      toast({ title: `Wygenerowano QR dla ${reservedUnits.length} sztuk!` });
      setShowNewJob(false);
      fetchJobs();
    } catch (err) {
      console.error("Error generating QR:", err);
      toast({ title: "Błąd generowania QR", description: err instanceof Error ? err.message : "Nieznany błąd", variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  const markAsPrinted = async (jobId: string) => {
    const { error } = await supabase
      .from("qr_print_jobs")
      .update({ status: "printed" as Database["public"]["Enums"]["qr_print_job_status"] })
      .eq("id", jobId);
    if (!error) {
      toast({ title: "Oznaczono jako wydrukowane" });
      fetchJobs();
      if (selectedJob?.id === jobId) setSelectedJob({ ...selectedJob, status: "printed" });
    }
  };

  const markAsApplied = async (jobId: string) => {
    // Update print job status
    await supabase.from("qr_print_jobs").update({ status: "printed" as Database["public"]["Enums"]["qr_print_job_status"] }).eq("id", jobId);

    // Update all inventory units in this job to qr_applied
    const { data: jobItemsList } = await supabase
      .from("qr_print_job_items")
      .select("inventory_unit_id")
      .eq("print_job_id", jobId);

    if (jobItemsList) {
      const unitIds = jobItemsList.map((i) => i.inventory_unit_id);
      await supabase
        .from("inventory_units")
        .update({
          fulfillment_status: "qr_applied" as Database["public"]["Enums"]["fulfillment_status"],
          qr_applied_at: new Date().toISOString(),
        })
        .in("id", unitIds);
    }

    toast({ title: "Oznaczono jako naklejone (qr_applied)" });
    fetchJobs();
    if (selectedJob?.id === jobId) setSelectedJob({ ...selectedJob, status: "printed" });
  };

  const [pdfLoading, setPdfLoading] = useState(false);

  const downloadPdf = async (jobId: string, jobName: string) => {
    setPdfLoading(true);
    const { data, error } = await supabase.functions.invoke("generate-qr-pdf", {
      body: { print_job_id: jobId },
    });

    if (error || data?.error) {
      toast({ title: "Błąd generowania PDF", description: error?.message || data?.error, variant: "destructive" });
      setPdfLoading(false);
      return;
    }

    if (data?.pdf) {
      // data.pdf is a data URI string
      const link = document.createElement("a");
      link.href = data.pdf;
      link.download = `QR-${jobName.replace(/\s+/g, "-")}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast({ title: "PDF pobrany" });
    }
    setPdfLoading(false);
  };

  const confirmDeleteJob = async () => {
    if (!jobToDelete) return;
    const jobId = jobToDelete.id;
    setIsDeleting(true);

    try {
      const affectedOrderIds = new Set<string>();
      if (jobToDelete.order_id) {
        affectedOrderIds.add(jobToDelete.order_id);
      }

      // 1. Fetch job items to reset inventory units
      const { data: items } = await supabase
        .from("qr_print_job_items")
        .select("inventory_unit_id")
        .eq("print_job_id", jobId);

      if (items && items.length > 0) {
        const unitIds = items.map((i) => i.inventory_unit_id).filter(Boolean);
        if (unitIds.length > 0) {
          // Fetch order_ids from inventory_units
          const { data: unitOrders } = await supabase
            .from("inventory_units")
            .select("order_id")
            .in("id", unitIds);

          if (unitOrders) {
            unitOrders.forEach((u) => {
              if (u.order_id) affectedOrderIds.add(u.order_id);
            });
          }

          // Reset inventory units to reserved
          const { error: resetErr } = await supabase
            .from("inventory_units")
            .update({
              public_claim_code: null,
              public_claim_token_hash: null,
              fulfillment_status: "reserved" as Database["public"]["Enums"]["fulfillment_status"],
              qr_generated_at: null,
              qr_applied_at: null,
            })
            .in("id", unitIds);

          if (resetErr) {
            console.warn("Notice: Error resetting inventory units:", resetErr);
          }
        }
      }

      // 2. Delete job items
      const { error: itemsErr } = await supabase
        .from("qr_print_job_items")
        .delete()
        .eq("print_job_id", jobId);

      if (itemsErr) {
        console.error("Error deleting qr_print_job_items:", itemsErr);
      }

      // 3. Delete job
      const { error: jobErr } = await supabase
        .from("qr_print_jobs")
        .delete()
        .eq("id", jobId);

      if (jobErr) {
        throw jobErr;
      }

      // 4. Update order status for affected orders back to 'paid' (W przygotowaniu)
      for (const orderId of affectedOrderIds) {
        const { data: ord } = await supabase
          .from("orders")
          .select("payment_status, status")
          .eq("id", orderId)
          .single();

        if (ord) {
          const targetStatus = ord.payment_status === "paid" ? "paid" : "pending";
          await supabase
            .from("orders")
            .update({
              status: targetStatus as Database["public"]["Enums"]["order_status"],
              fulfilled_at: null,
            })
            .eq("id", orderId);
        }
      }

      toast({ title: "Usunięto zadanie druku QR" });
      if (selectedJob?.id === jobId) {
        setSelectedJob(null);
        setJobItems([]);
      }
      setJobToDelete(null);
      fetchJobs();
    } catch (err) {
      console.error("Error deleting QR job:", err);
      toast({
        title: "Błąd podczas usuwania zadania",
        description: err instanceof Error ? err.message : "Nieznany błąd",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("pl-PL", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const statusBadge = (status: string) => {
    const s = STATUS_LABELS[status] || STATUS_LABELS.pending;
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.className}`}>{s.label}</span>;
  };

  // Job detail view
  if (selectedJob) {
    return (
      <div className="space-y-6">
        <button onClick={() => { setSelectedJob(null); setJobItems([]); }} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Wróć do listy
        </button>

        <div className="bg-card rounded-xl p-6 shadow-soft space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h3 className="font-display text-xl font-bold">{selectedJob.name}</h3>
            <div className="flex gap-2 items-center flex-wrap">
              {statusBadge(selectedJob.status)}
              {(selectedJob.status === "ready" || selectedJob.status === "printed") && (
                <Button size="sm" variant="outline" onClick={() => downloadPdf(selectedJob.id, selectedJob.name)} disabled={pdfLoading} className="gap-2">
                  {pdfLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Pobierz PDF
                </Button>
              )}
              {selectedJob.status === "ready" && (
                <Button size="sm" variant="outline" onClick={() => markAsPrinted(selectedJob.id)} className="gap-2">
                  <Printer className="w-4 h-4" /> Wydrukowane
                </Button>
              )}
              {(selectedJob.status === "ready" || selectedJob.status === "printed") && (
                <Button size="sm" variant="outline" onClick={() => markAsApplied(selectedJob.id)} className="gap-2">
                  <CheckCheck className="w-4 h-4" /> Naklejone (applied)
                </Button>
              )}
              <Button size="sm" variant="destructive" onClick={() => setJobToDelete(selectedJob)} className="gap-2">
                <Trash2 className="w-4 h-4" /> Usuń
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><span className="text-muted-foreground">Sztuk:</span><p className="font-bold">{selectedJob.generated_items} / {selectedJob.total_items}</p></div>
            <div><span className="text-muted-foreground">Data:</span><p>{formatDate(selectedJob.created_at)}</p></div>
            <div><span className="text-muted-foreground">Wysyłka:</span><p>{selectedJob.shipment_id || "—"}</p></div>
            <div><span className="text-muted-foreground">Zamówienie:</span><p className="font-mono text-xs">{selectedJob.order_id?.slice(0, 8) || "—"}</p></div>
          </div>
        </div>

        <div className="bg-card rounded-xl shadow-soft overflow-hidden">
          {itemsLoading ? (
            <div className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-primary" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-3 font-medium text-muted-foreground">Kod inwentarza</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Kraj</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Wzór</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Claim code</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">QR URL</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Data gen.</th>
                  </tr>
                </thead>
                <tbody>
                  {jobItems.map((item) => (
                    <tr key={item.id} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="p-3 font-mono text-xs">{item.unit_code}</td>
                      <td className="p-3">{item.country_name}</td>
                      <td className="p-3 text-muted-foreground">{item.design_title ? `V${item.view_no} ${item.design_title}` : `V${item.view_no}`}</td>
                      <td className="p-3 font-mono text-xs font-bold">{item.public_claim_code}</td>
                      <td className="p-3 font-mono text-xs text-primary break-all max-w-[200px]">{item.qr_url}</td>
                      <td className="p-3 text-xs text-muted-foreground">{formatDate(item.generated_at)}</td>
                    </tr>
                  ))}
                  {jobItems.length === 0 && (
                    <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Brak elementów</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <AlertDialog open={!!jobToDelete} onOpenChange={(open) => { if (!open && !isDeleting) setJobToDelete(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Usunąć zadanie druku QR?</AlertDialogTitle>
              <AlertDialogDescription>
                Czy na pewno chcesz usunąć zadanie <strong>{jobToDelete?.name}</strong>?
                Kody QR dla sztuk w tym zadaniu zostaną wyczyszczone, a sztuki przywrócone do stanu zarezerwowanego.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Anuluj</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  confirmDeleteJob();
                }}
                disabled={isDeleting}
                className="bg-destructive hover:bg-destructive/90 text-destructive-foreground gap-2"
              >
                {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Usuń zadanie
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // New job form
  if (showNewJob) {
    return (
      <div className="space-y-6">
        <button onClick={() => setShowNewJob(false)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Wróć do listy
        </button>

        <div className="bg-card rounded-xl p-6 shadow-soft space-y-4">
          <h3 className="font-display text-lg font-semibold">Nowe zadanie druku QR</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Nazwa zadania</label>
              <Input value={jobName} onChange={(e) => setJobName(e.target.value)} placeholder="np. Druk QR - Partia PL-01" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Wybierz zamówienie</label>
              <Select value={selectedOrderId} onValueChange={handleOrderChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Wybierz zamówienie..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Wszystkie zarezerwowane / wolne sztuki</SelectItem>
                  {ordersList.map((order) => (
                    <SelectItem key={order.id} value={order.id}>
                      {order.order_number} {order.shipping_name ? `— ${order.shipping_name}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <p className="text-sm text-muted-foreground mb-2">Zarezerwowane sztuki ({reservedUnits.length}) — zostaną przypisane do tego zadania druku:</p>
            {reservedUnits.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">Brak zarezerwowanych sztuk w magazynie. Najpierw zarezerwuj sztuki dla zamówienia.</p>
            ) : (
              <div className="max-h-[300px] overflow-y-auto border border-border rounded-lg">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b border-border">
                      <th className="text-left p-2 font-medium text-muted-foreground">Kod</th>
                      <th className="text-left p-2 font-medium text-muted-foreground">Wzór</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reservedUnits.map((u) => (
                      <tr key={u.id} className="border-b border-border/30">
                        <td className="p-2 font-mono">{u.code}</td>
                        <td className="p-2">{u.design}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button onClick={generateQr} disabled={isGenerating || reservedUnits.length === 0} className="gap-2">
              {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
              Generuj QR ({reservedUnits.length} szt.)
            </Button>
            <Button variant="outline" onClick={() => setShowNewJob(false)} disabled={isGenerating}>Anuluj</Button>
          </div>
        </div>
      </div>
    );
  }

  // Jobs list
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-bold text-foreground">Zadania druku QR</h2>
        <Button onClick={openNewJob} size="sm" className="gap-2"><Plus className="w-4 h-4" /> Nowe zadanie</Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : jobs.length === 0 ? (
        <div className="bg-card rounded-xl p-12 text-center shadow-soft">
          <QrCode className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">Brak zadań druku QR</p>
        </div>
      ) : (
        <div className="bg-card rounded-xl shadow-soft overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-3 font-medium text-muted-foreground">Nazwa</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                <th className="text-right p-3 font-medium text-muted-foreground">Sztuk</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Data</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-b border-border/50 hover:bg-muted/30 cursor-pointer" onClick={() => openJob(job)}>
                  <td className="p-3 font-medium">{job.name}</td>
                  <td className="p-3">{statusBadge(job.status)}</td>
                  <td className="p-3 text-right">{job.generated_items} / {job.total_items}</td>
                  <td className="p-3 text-xs text-muted-foreground">{formatDate(job.created_at)}</td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-xs text-primary">Szczegóły →</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={(e) => {
                          e.stopPropagation();
                          setJobToDelete(job);
                        }}
                        title="Usuń zadanie"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AlertDialog open={!!jobToDelete} onOpenChange={(open) => { if (!open && !isDeleting) setJobToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Usunąć zadanie druku QR?</AlertDialogTitle>
            <AlertDialogDescription>
              Czy na pewno chcesz usunąć zadanie <strong>{jobToDelete?.name}</strong>?
              Kody QR dla sztuk w tym zadaniu zostaną wyczyszczone, a sztuki przywrócone do stanu zarezerwowanego.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Anuluj</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDeleteJob();
              }}
              disabled={isDeleting}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground gap-2"
            >
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Usuń zadanie
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminQrJobs;
