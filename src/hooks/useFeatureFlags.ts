import { useQuery } from "@tanstack/react-query";
import { runtimeConfigService } from "@/integrations/firebase/services/runtimeConfigService";

export type FeatureFlagKey =
  | "travel_stats"
  | "wall_of_connections"
  | "travelers_journal"
  | "cultural_missions"
  | "cod_payment_enabled"
  | "inpost_shipping_enabled"
  | "orlen_paczka_enabled"
  | "pocztex_shipping_enabled";

export type FeatureFlags = Record<FeatureFlagKey, boolean>;

const DEFAULT_FLAGS: FeatureFlags = {
  travel_stats: false,
  wall_of_connections: false,
  travelers_journal: false,
  cultural_missions: false,
  cod_payment_enabled: true,
  inpost_shipping_enabled: true,
  orlen_paczka_enabled: true,
  pocztex_shipping_enabled: true,
};

interface FeatureFlagRow {
  key: string;
  is_enabled: boolean;
}

async function fetchFlags(): Promise<FeatureFlags> {
  const data = await runtimeConfigService.getFeatureFlags().catch(() => []);
  if (data.length === 0) return { ...DEFAULT_FLAGS };

  const flags = { ...DEFAULT_FLAGS };
  (data as unknown as FeatureFlagRow[]).forEach((row) => {
    const key = row.key as FeatureFlagKey;
    if (key in flags) {
      flags[key] = row.is_enabled;
    }
  });
  return flags;
}

export function useFeatureFlags() {
  const { data: flags = DEFAULT_FLAGS, isLoading } = useQuery({
    queryKey: ["feature-flags"],
    queryFn: fetchFlags,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  return { flags, isLoading };
}

export function useFeatureFlag(key: FeatureFlagKey): boolean {
  const { flags } = useFeatureFlags();
  return flags[key];
}
