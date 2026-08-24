import { useQuery, useQueryClient } from "@tanstack/react-query";
import { runtimeConfigService, type RuntimeFeatureFlag } from "@/integrations/firebase/services/runtimeConfigService";
import { Switch } from "@/components/ui/switch";
import { FlaskConical, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

const KNOWN_FLAGS = [
  { key: "travel_stats", name: "Statystyki Kilometrów", description: "Liczenie dystansu kartek od Warszawy", is_enabled: false },
  { key: "wall_of_connections", name: "Ściana Relacji", description: "Galeria zdjęć z rejestracji", is_enabled: false },
  { key: "travelers_journal", name: "Dziennik Ambasadora", description: "Oś czasu relacji", is_enabled: false },
  { key: "cultural_missions", name: "Misje Kulturowe", description: "Wyzwania dla podróżników", is_enabled: false },
];

const AdminLab = () => {
  const queryClient = useQueryClient();
  const [togglingKey, setTogglingKey] = useState<string | null>(null);

  const { data: flags = [], isLoading } = useQuery({
    queryKey: ["admin-feature-flags"],
    queryFn: async () => {
      const data = await runtimeConfigService.getFeatureFlags();
      const existingKeys = new Set(data.map((f) => f.key));
      const missingFlags = KNOWN_FLAGS.filter((kf) => !existingKeys.has(kf.key));

      if (missingFlags.length > 0) {
        await Promise.all(missingFlags.map((flag) => runtimeConfigService.setFeatureFlag(flag)));
        data.push(...missingFlags);
      }

      const knownKeys = new Set(KNOWN_FLAGS.map((kf) => kf.key));
      return data
        .filter((f) => knownKeys.has(f.key))
        .sort((a, b) => a.name.localeCompare(b.name, "pl"));
    },
  });

  const toggleFlag = async (key: string, currentValue: boolean) => {
    setTogglingKey(key);
    const flag = flags.find((item) => item.key === key);
    if (!flag) {
      toast.error("Nie udało się zmienić flagi");
    } else {
      try {
        await runtimeConfigService.setFeatureFlag({
          ...flag,
          is_enabled: !currentValue,
        } satisfies RuntimeFeatureFlag);
        toast.success(`Flaga "${key}" ${!currentValue ? "włączona" : "wyłączona"}`);
        queryClient.invalidateQueries({ queryKey: ["admin-feature-flags"] });
        queryClient.invalidateQueries({ queryKey: ["feature-flags"] });
      } catch {
        toast.error("Nie udało się zmienić flagi");
      }
    }
    setTogglingKey(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-foreground">Laboratorium</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Włączaj i wyłączaj eksperymentalne funkcje platformy.
        </p>
      </div>

      <div className="grid gap-4">
        {flags.map((flag) => (
          <div
            key={flag.key}
            className="flex items-center justify-between gap-4 rounded-xl bg-card p-5 shadow-soft border border-border"
          >
            <div className="flex items-start gap-3 min-w-0">
              <div className="mt-0.5 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <FlaskConical className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="font-medium text-foreground truncate">{flag.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{flag.description}</p>
                <code className="text-[10px] text-muted-foreground/60 font-mono mt-1 block">
                  {flag.key}
                </code>
              </div>
            </div>
            <Switch
              checked={flag.is_enabled}
              disabled={togglingKey === flag.key}
              onCheckedChange={() => toggleFlag(flag.key, flag.is_enabled)}
            />
          </div>
        ))}

        {flags.length === 0 && (
          <p className="text-center text-muted-foreground py-8">Brak zdefiniowanych flag.</p>
        )}
      </div>
    </div>
  );
};

export default AdminLab;
