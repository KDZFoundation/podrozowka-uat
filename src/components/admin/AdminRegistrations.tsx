import { useEffect, useState, useCallback } from "react";
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

const PAGE_SIZE = 50;

const AdminRegistrations = () => {
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const fetchRegistrations = useCallback(async () => {
    setIsLoading(true);

    try {
      const rows = await firestoreService.getAdminRegistrations(250);
      const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
      setRegistrations(pageRows);
    } finally {
      setIsLoading(false);
    }
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
