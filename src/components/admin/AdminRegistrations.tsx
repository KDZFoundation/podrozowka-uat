import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isFirestoreCatalogEnabled } from "@/integrations/firebase/config";
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
import { Loader2, Search, Mail, User, MessageSquare } from "lucide-react";

interface Registration {
  id: string;
  recipient_name: string;
  recipient_message: string | null;
  recipient_email: string | null;
  contact_opt_in: boolean;
  registered_at: string;
  unit_code: string;
  country_name: string | null;
  design_title: string | null;
  view_no: number | null;
  traveler_name: string | null;
}

interface RpcRegistration {
  contact_opt_in: boolean;
  created_at: string;
  id: string;
  inventory_unit_id: string;
  latitude: number | null;
  longitude: number | null;
  recipient_email: string | null;
  recipient_message: string | null;
  recipient_name: string;
  registered_at: string;
}

interface UnitDetails {
  id: string;
  internal_inventory_code: string;
  traveler_user_id: string | null;
  card_designs: {
    title: string | null;
    view_no: number;
    countries: {
      name_pl: string;
    };
  } | null;
}

const PAGE_SIZE = 50;

const AdminRegistrations = () => {
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const fetchRegistrations = useCallback(async () => {
    setIsLoading(true);

    if (isFirestoreCatalogEnabled) {
      const rows = await firestoreService.getAdminRegistrations(250);
      const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
      setRegistrations(pageRows);
      setIsLoading(false);
      return;
    }

    // Admin-only RPC: returns full registration rows (incl. recipient_email/lat/lng)
    // The base table no longer exposes those columns to clients.
    const { data: regs, error } = await supabase.rpc("admin_list_recipient_registrations");

    if (!error && regs) {
      const typedRegs = regs as RpcRegistration[];
      const sorted = [...typedRegs].sort(
        (a: RpcRegistration, b: RpcRegistration) => new Date(b.registered_at).getTime() - new Date(a.registered_at).getTime()
      );
      const pageRows = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

      const unitIds = pageRows.map((r: RpcRegistration) => r.inventory_unit_id);
      let unitMap = new Map<string, UnitDetails>();
      if (unitIds.length > 0) {
        const { data: units } = await supabase
          .from("inventory_units")
          .select(`
            id, internal_inventory_code, traveler_user_id,
            card_designs!inner(title, view_no, countries!inner(name_pl))
          `)
          .in("id", unitIds);
        if (units) {
          unitMap = new Map((units as unknown as UnitDetails[]).map((u) => [u.id, u]));
        }
      }

      const travelerIds = [
        ...new Set(Array.from(unitMap.values()).map((u: UnitDetails) => u.traveler_user_id).filter(Boolean)),
      ] as string[];
      let nameMap = new Map<string, string>();
      if (travelerIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, display_name")
          .in("user_id", travelerIds);
        if (profiles) {
          nameMap = new Map(profiles.map((p) => [p.user_id, p.display_name || ""]));
        }
      }

      setRegistrations(
        pageRows.map((r: RpcRegistration) => {
          const u = unitMap.get(r.inventory_unit_id);
          return {
            id: r.id,
            recipient_name: r.recipient_name,
            recipient_message: r.recipient_message,
            recipient_email: r.recipient_email,
            contact_opt_in: r.contact_opt_in,
            registered_at: r.registered_at,
            unit_code: u?.internal_inventory_code || "",
            country_name: u?.card_designs?.countries?.name_pl || null,
            design_title: u?.card_designs?.title || null,
            view_no: u?.card_designs?.view_no || null,
            traveler_name: u?.traveler_user_id ? nameMap.get(u.traveler_user_id) || null : null,
          };
        })
      );
    }
    setIsLoading(false);
  }, [page]);

  useEffect(() => {
    fetchRegistrations();
  }, [fetchRegistrations]);

  const filtered = registrations.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.recipient_name.toLowerCase().includes(q) ||
      r.recipient_email?.toLowerCase().includes(q) ||
      r.unit_code?.toLowerCase().includes(q) ||
      r.country_name?.toLowerCase().includes(q) ||
      r.traveler_name?.toLowerCase().includes(q)
    );
  });

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("pl-PL", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-4">
      <h2 className="font-display text-xl font-bold text-foreground">Rejestracje odbiorców</h2>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Szukaj po nazwisku, emailu, kodzie, kraju..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      <div className="bg-card rounded-xl shadow-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-3 font-medium text-muted-foreground">Obdarowany</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Email</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Zgoda</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Wiadomość</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Kraj</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Wzór</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Kod</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Podróżnik</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Data</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={9} className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-primary" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">Brak rejestracji</td></tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="p-3 font-medium flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-muted-foreground" />{r.recipient_name}
                    </td>
                    <td className="p-3 text-xs">
                      {r.recipient_email ? (
                        <span className="flex items-center gap-1"><Mail className="w-3 h-3 text-muted-foreground" />{r.recipient_email}</span>
                      ) : "—"}
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.contact_opt_in ? 'bg-accent/15 text-accent' : 'bg-muted text-muted-foreground'}`}>
                        {r.contact_opt_in ? "Tak" : "Nie"}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground max-w-[200px] truncate">
                      {r.recipient_message ? (
                        <span className="flex items-center gap-1" title={r.recipient_message}>
                          <MessageSquare className="w-3 h-3 flex-shrink-0" />{r.recipient_message}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="p-3">{r.country_name || "—"}</td>
                    <td className="p-3 text-muted-foreground">V{r.view_no} {r.design_title || ""}</td>
                    <td className="p-3 font-mono text-xs">{r.unit_code}</td>
                    <td className="p-3">{r.traveler_name || "—"}</td>
                    <td className="p-3 text-xs text-muted-foreground">{formatDate(r.registered_at)}</td>
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

export default AdminRegistrations;
