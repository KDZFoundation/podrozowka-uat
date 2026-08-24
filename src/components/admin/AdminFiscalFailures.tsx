import { useEffect, useState, useCallback } from "react";
import { Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { firestoreService } from "@/integrations/firebase/services/firestoreService";

interface FailedOrder {
  id: string;
  order_number: string;
  created_at: string;
  total_amount: number;
  invoice_requested: boolean;
  company_name: string | null;
  company_nip: string | null;
  fiscal_document_error: string | null;
  user_id: string;
  buyer_email?: string | null;
}

const AdminFiscalFailures = () => {
  const [rows, setRows] = useState<FailedOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<FailedOrder | null>(null);
  const [manualNumber, setManualNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const orders = await firestoreService.getAllOrders();
      setRows(orders
        .filter((order) => (order as Record<string, unknown>).fiscal_document_status === "failed")
        .map((order) => {
          const raw = order as Record<string, unknown>;
          return {
            id: order.id,
            order_number: order.order_number,
            created_at: order.created_at,
            total_amount: order.total_amount_pln,
            invoice_requested: Boolean(raw.invoice_requested),
            company_name: typeof raw.company_name === "string" ? raw.company_name : null,
            company_nip: typeof raw.company_nip === "string" ? raw.company_nip : null,
            fiscal_document_error: typeof raw.fiscal_document_error === "string" ? raw.fiscal_document_error : null,
            user_id: order.user_id,
          };
        }));
    } catch (error) {
      toast.error("Nie udało się pobrać listy", { description: error instanceof Error ? error.message : undefined });
      setRows([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openResolve = (row: FailedOrder) => {
    setSelected(row);
    setManualNumber("");
    setNotes("");
  };

  const submitResolve = async () => {
    if (!selected) return;
    setSaving(true);
    const patch: Record<string, unknown> = {
      fiscal_document_status: "issued_manual",
      fiscal_document_error: notes.trim() ? `[resolved] ${notes.trim()}`.slice(0, 500) : null,
      fiscal_document_issued_at: new Date().toISOString(),
    };
    if (manualNumber.trim()) patch.fiscal_document_number = manualNumber.trim().slice(0, 100);
    try {
      await firestoreService.updateOrder(selected.id, patch);
    } catch (error) {
      toast.error("Nie udało się zapisać", { description: error instanceof Error ? error.message : undefined });
      setSaving(false);
      return;
    }
    setSaving(false);
    toast.success("Oznaczono jako rozwiązane");
    setSelected(null);
    load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
          <AlertTriangle className="w-6 h-6 text-destructive" />
          Fiskalizacja — do interwencji
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Zamówienia, dla których nie udało się wystawić dokumentu w 360 Księgowość.
          Wystaw je ręcznie w panelu księgowości i tutaj oznacz jako rozwiązane.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Ładowanie…
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-card rounded-xl p-6 text-center text-muted-foreground flex flex-col items-center gap-2">
          <CheckCircle2 className="w-8 h-8 text-primary" />
          Brak zamówień z błędem fiskalizacji.
        </div>
      ) : (
        <div className="bg-card rounded-xl shadow-soft overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3">Numer</th>
                  <th className="text-left px-4 py-3">Data</th>
                  <th className="text-right px-4 py-3">Kwota</th>
                  <th className="text-left px-4 py-3">Nabywca</th>
                  <th className="text-left px-4 py-3">Błąd</th>
                  <th className="text-right px-4 py-3">Akcje</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-4 py-3 font-mono">{r.order_number}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(r.created_at).toLocaleString("pl-PL")}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {Number(r.total_amount).toLocaleString("pl-PL", {
                        minimumFractionDigits: 2,
                      })}{" "}
                      zł
                    </td>
                    <td className="px-4 py-3">
                      {r.invoice_requested ? (
                        <div>
                          <p className="font-medium">{r.company_name || "—"}</p>
                          <p className="text-xs text-muted-foreground font-mono">
                            NIP {r.company_nip || "—"}
                          </p>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Klient detaliczny</span>
                      )}
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <p className="text-xs text-destructive break-words">
                        {r.fiscal_document_error || "—"}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="outline" onClick={() => openResolve(r)}>
                        Oznacz jako rozwiązane
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Oznacz jako rozwiązane</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Zamówienie <span className="font-mono text-foreground">{selected?.order_number}</span>.
              Użyj tego dialogu, gdy dokument został wystawiony ręcznie poza systemem.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="manual_number">Numer dokumentu (opcjonalnie)</Label>
              <Input
                id="manual_number"
                value={manualNumber}
                onChange={(e) => setManualNumber(e.target.value)}
                placeholder="np. FV/2026/04/123"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Uwagi (opcjonalnie)</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Krótka notatka dla zespołu"
                maxLength={480}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)} disabled={saving}>
              Anuluj
            </Button>
            <Button onClick={submitResolve} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Zapisz
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminFiscalFailures;
