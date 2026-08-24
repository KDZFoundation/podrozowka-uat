import { useEffect, useState, useCallback } from "react";
import { collection, getDocs, limit, query } from "firebase/firestore";
import { db } from "@/integrations/firebase/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Search, Clock } from "lucide-react";

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

const ACTOR_LABELS: Record<string, string> = {
  system: "System",
  admin: "Admin",
  traveler: "Podróżnik",
  recipient: "Obdarowany",
};

interface EventRow {
  id: string;
  event_type: string;
  actor_type: string;
  payload_json: unknown;
  created_at: string;
  unit_code: string;
  country_name: string | null;
  design_title: string | null;
  view_no: number | null;
}

const PAGE_SIZE = 50;

const AdminEventLog = () => {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [eventTypeFilter, setEventTypeFilter] = useState("all");
  const [page, setPage] = useState(0);

  const fetchEvents = useCallback(async () => {
    setIsLoading(true);

    try {
      const [eventSnapshot, unitSnapshot, designSnapshot, countrySnapshot] = await Promise.all([
        getDocs(query(collection(db, "inventory_unit_events"), limit(500))),
        getDocs(collection(db, "inventory_units")),
        getDocs(collection(db, "card_designs")),
        getDocs(collection(db, "countries")),
      ]);
      const units = new Map(unitSnapshot.docs.map((item) => [item.id, item.data()]));
      const designs = new Map(designSnapshot.docs.map((item) => [item.id, item.data()]));
      const countries = new Map(countrySnapshot.docs.map((item) => [item.id, item.data()]));
      const toIso = (value: unknown) => {
        if (typeof value === "string") return value;
        if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") return value.toDate().toISOString();
        return new Date(0).toISOString();
      };
      const rows = eventSnapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .filter((event) => eventTypeFilter === "all" || event.event_type === eventTypeFilter)
        .sort((left, right) => toIso(right.created_at).localeCompare(toIso(left.created_at)))
        .slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
        .map((event) => {
          const unit = units.get(String(event.inventory_unit_id || "")) || {};
          const design = designs.get(String(unit.card_design_id || "")) || {};
          const country = countries.get(String(design.country_id || "")) || {};
          return {
            id: event.id,
            event_type: String(event.event_type || ""),
            actor_type: String(event.actor_type || "system"),
            payload_json: event.payload_json || {},
            created_at: toIso(event.created_at),
            unit_code: String(unit.internal_inventory_code || unit.public_claim_code || ""),
            country_name: (country.name_pl || country.name || null) as string | null,
            design_title: (design.title || null) as string | null,
            view_no: typeof design.view_no === "number" ? design.view_no : null,
          } satisfies EventRow;
        });
      setEvents(rows);
    } catch (error) {
      console.warn("Firestore event log unavailable:", error);
      setEvents([]);
    }
    setIsLoading(false);
  }, [eventTypeFilter, page]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const filtered = events.filter((e) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      e.unit_code?.toLowerCase().includes(q) ||
      e.country_name?.toLowerCase().includes(q) ||
      JSON.stringify(e.payload_json).toLowerCase().includes(q)
    );
  });

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("pl-PL", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const eventBadge = (type: string) => {
    const colors: Record<string, string> = {
      created_in_stock: "bg-muted text-muted-foreground",
      reserved_for_order: "bg-[hsl(var(--gold))]/15 text-[hsl(var(--gold))]",
      qr_generated: "bg-primary/15 text-primary",
      qr_applied: "bg-primary/25 text-primary",
      shipped: "bg-accent/15 text-accent",
      registered: "bg-accent/20 text-accent",
      voided: "bg-destructive/15 text-destructive",
      damaged: "bg-destructive/25 text-destructive",
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[type] || "bg-muted text-muted-foreground"}`}>
        {EVENT_TYPE_LABELS[type] || type}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      <h2 className="font-display text-xl font-bold text-foreground flex items-center gap-2">
        <Clock className="w-5 h-5 text-primary" /> Log zdarzeń
      </h2>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Szukaj po kodzie, kraju, payload..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={eventTypeFilter} onValueChange={(v) => { setEventTypeFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Typ zdarzenia" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie zdarzenia</SelectItem>
            {Object.entries(EVENT_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card rounded-xl shadow-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-3 font-medium text-muted-foreground">Data</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Zdarzenie</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Aktor</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Kod inwentarza</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Kraj / Wzór</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Payload</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-primary" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Brak zdarzeń</td></tr>
              ) : (
                filtered.map((e) => (
                  <tr key={e.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">{formatDate(e.created_at)}</td>
                    <td className="p-3">{eventBadge(e.event_type)}</td>
                    <td className="p-3">
                      <span className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-medium text-muted-foreground">
                        {ACTOR_LABELS[e.actor_type] || e.actor_type}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-xs">{e.unit_code}</td>
                    <td className="p-3 text-xs">
                      {e.country_name} <span className="text-muted-foreground">V{e.view_no} {e.design_title || ""}</span>
                    </td>
                    <td className="p-3 font-mono text-[10px] text-muted-foreground/70 max-w-[250px] truncate" title={JSON.stringify(e.payload_json)}>
                      {e.payload_json && Object.keys(e.payload_json).length > 0 ? JSON.stringify(e.payload_json) : "—"}
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
          <Button variant="outline" size="sm" disabled={filtered.length < PAGE_SIZE} onClick={() => setPage((p) => p + 1)}>Następna</Button>
        </div>
      </div>
    </div>
  );
};

export default AdminEventLog;
