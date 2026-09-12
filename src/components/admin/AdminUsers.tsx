import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, UserRound, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { adminApiHeaders } from "@/lib/adminApiAuth";
import { backendApiUrl } from "@/lib/backendApi";

type UserRow = {
  id: string;
  email: string;
  name: string;
  createdAt: string | null;
  deletionStatus: "scheduled" | "processing" | "cancelled" | "completed" | null;
  scheduledFor: string | null;
};

const displayDate = (value: string | null) => value
  ? new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
  : "Brak danych";

const deletionLabel = (status: UserRow["deletionStatus"], scheduledFor: string | null) => {
  if (status === "scheduled") return `Usunięcie: ${displayDate(scheduledFor)}`;
  if (status === "processing") return "Trwa anonimizacja";
  if (status === "completed") return "Konto usunięte";
  if (status === "cancelled") return "Wniosek anulowany";
  return "Aktywne";
};

export default function AdminUsers() {
  const { isAdmin } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(backendApiUrl("/api/admin/users"), { headers: await adminApiHeaders() });
      const body = await response.json().catch(() => null) as { users?: UserRow[] } | null;
      if (!response.ok || !body || !Array.isArray(body.users)) throw new Error("admin_users_list_failed");
      setUsers(body.users);
    } catch (cause) {
      console.error("Admin users load error:", cause);
      setError("Nie udało się wczytać listy użytkowników.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void loadUsers();
  }, [isAdmin, loadUsers]);

  const filteredUsers = useMemo(() => {
    const phrase = search.trim().toLocaleLowerCase("pl-PL");
    if (!phrase) return users;
    return users.filter((user) => `${user.name} ${user.email}`.toLocaleLowerCase("pl-PL").includes(phrase));
  }, [search, users]);

  if (!isAdmin) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-primary">Konta i wnioski RODO</p>
          <h2 className="font-display text-2xl font-bold text-foreground">Użytkownicy</h2>
          <p className="mt-1 text-sm text-muted-foreground">Lista kont zarejestrowanych w Podróżówce oraz terminy zaplanowanego usunięcia.</p>
        </div>
        <div className="rounded-xl border bg-card px-4 py-3 text-right shadow-sm">
          <p className="text-2xl font-bold text-foreground">{users.length}</p>
          <p className="text-xs text-muted-foreground">zarejestrowanych kont</p>
        </div>
      </div>

      <section className="rounded-2xl border bg-card p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Szukaj po imieniu lub e-mailu…" />
          </div>
          <span className="text-sm text-muted-foreground">{filteredUsers.length} wyników</span>
        </div>

        {loading ? <p className="py-10 text-center text-muted-foreground">Wczytywanie użytkowników…</p> : null}
        {error ? <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</p> : null}
        {!loading && !error && filteredUsers.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-10 text-center text-muted-foreground"><Users className="h-6 w-6" />Brak zarejestrowanych użytkowników.</div>
        ) : null}
        {!loading && !error && filteredUsers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b text-muted-foreground"><tr><th className="px-3 py-3 font-medium">Użytkownik</th><th className="px-3 py-3 font-medium">E-mail</th><th className="px-3 py-3 font-medium">Rejestracja</th><th className="px-3 py-3 font-medium">Status konta</th></tr></thead>
              <tbody>{filteredUsers.map((user) => <tr key={user.id} className="border-b last:border-0"><td className="px-3 py-3"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted"><UserRound className="h-4 w-4 text-muted-foreground" /></span><span className="font-medium text-foreground">{user.name}</span></div></td><td className="px-3 py-3 text-muted-foreground">{user.email || "Brak e-maila"}</td><td className="px-3 py-3 text-muted-foreground">{displayDate(user.createdAt)}</td><td className="px-3 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${user.deletionStatus === "scheduled" ? "bg-amber-100 text-amber-900" : user.deletionStatus === "processing" ? "bg-blue-100 text-blue-900" : user.deletionStatus === "completed" ? "bg-muted text-muted-foreground" : "bg-emerald-100 text-emerald-900"}`}>{deletionLabel(user.deletionStatus, user.scheduledFor)}</span></td></tr>)}</tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}
