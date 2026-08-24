import { useQuery } from "@tanstack/react-query";
import { runtimeConfigService } from "@/integrations/firebase/services/runtimeConfigService";

export interface GamificationTier {
  id?: string;
  name: string;
  min_points: number;
}

export const DEFAULT_GAMIFICATION_TIERS: GamificationTier[] = [
  { name: "Zwiadowca", min_points: 0 },
  { name: "Odkrywca", min_points: 500 },
  { name: "Ambasador", min_points: 1500 },
  { name: "Misjonarz Kultury", min_points: 3000 },
  { name: "Legenda Podróżówki", min_points: 7500 },
];

export const useGamificationTiers = () => useQuery({
  queryKey: ["gamification-tiers"],
  queryFn: async (): Promise<GamificationTier[]> => {
    const data = await runtimeConfigService.getGamificationTiers().catch(() => []);
    return data.length > 0 ? data : DEFAULT_GAMIFICATION_TIERS;
  },
  staleTime: 60_000,
});
