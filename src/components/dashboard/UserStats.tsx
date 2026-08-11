import { motion } from "framer-motion";
import { ShoppingBag, Package, Globe2, Trophy, MapPin, Percent, Star, Award } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_GAMIFICATION_TIERS, useGamificationTiers } from "@/hooks/useGamificationTiers";

interface Profile {
  id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  country: string | null;
  city: string | null;
  postcards_purchased: number;
  postcards_received: number;
  total_points?: number;
  current_rank?: string;
}

interface UserStatsProps {
  profile: Profile | null;
  userId: string;
}

interface CountryStat {
  name: string;
  total: number;
  registered: number;
}

const rankStyle = (name: string) => {
  if (name === "Zwiadowca") return { color: "text-muted-foreground", bgColor: "bg-muted" };
  if (name === "Odkrywca") return { color: "text-primary", bgColor: "bg-primary/10" };
  if (name === "Ambasador") return { color: "text-[hsl(var(--gold))]", bgColor: "bg-[hsl(var(--gold))]/10" };
  if (name === "Misjonarz Kultury") return { color: "text-accent", bgColor: "bg-accent/10" };
  return { color: "text-primary", bgColor: "bg-primary/10" };
};

interface StatsUnitJoin {
  id: string;
  business_status: string | null;
  card_designs: {
    countries: {
      name_pl: string;
    } | null;
  } | null;
}

const fetchUserStats = async (userId: string) => {
  const { data, error } = await supabase
    .from('inventory_units')
    .select('id, business_status, card_designs!inner(countries!inner(name_pl))')
    .eq('traveler_user_id', userId);

  if (error) throw error;

  const typedUnits = (data || []) as unknown as StatsUnitJoin[];
  const totalUnits = typedUnits.length;
  const purchasedCount = typedUnits.filter((u) => u.business_status === 'purchased').length;
  const registeredCount = typedUnits.filter((u) => u.business_status === 'registered').length;

  const countryMap = new Map<string, { total: number; registered: number }>();
  typedUnits.forEach((u) => {
    const name = u.card_designs?.countries?.name_pl;
    if (!name) return;
    const existing = countryMap.get(name) || { total: 0, registered: 0 };
    existing.total++;
    if (u.business_status === 'registered') existing.registered++;
    countryMap.set(name, existing);
  });

  const countryStats: CountryStat[] = Array.from(countryMap.entries())
    .map(([name, s]) => ({ name, ...s }))
    .sort((a, b) => b.total - a.total);

  return { totalUnits, purchasedCount, registeredCount, countryStats };
};

const UserStats = ({ profile, userId }: UserStatsProps) => {
  const { data, isLoading } = useQuery({
    queryKey: ['user-stats', userId],
    queryFn: () => fetchUserStats(userId),
  });
  const { data: configuredTiers = DEFAULT_GAMIFICATION_TIERS } = useGamificationTiers();

  const totalUnits = data?.totalUnits ?? 0;
  const purchasedCount = data?.purchasedCount ?? 0;
  const registeredCount = data?.registeredCount ?? 0;
  const countryStats = data?.countryStats ?? [];
  const regPercent = totalUnits > 0 ? Math.round((registeredCount / totalUnits) * 100) : 0;

  const totalPoints = profile?.total_points ?? 0;
  const currentRank = profile?.current_rank ?? 'Zwiadowca';
  const rankIndex = configuredTiers.findIndex((tier) => tier.name === currentRank);
  const currentTier = configuredTiers[rankIndex >= 0 ? rankIndex : 0];
  const nextTier = rankIndex >= 0 ? configuredTiers[rankIndex + 1] : configuredTiers[1];
  const rankInfo = { ...rankStyle(currentRank), next: nextTier?.name ?? null, nextThreshold: nextTier?.min_points ?? 0 };
  const progressToNext = nextTier
    ? Math.min(100, Math.round(((totalPoints - currentTier.min_points) / (nextTier.min_points - currentTier.min_points)) * 100))
    : 100;

  const statsCards = [
    { icon: Package, value: totalUnits, label: "Wszystkie kartki", color: "text-primary", bgColor: "bg-primary/10" },
    { icon: ShoppingBag, value: purchasedCount, label: "Kupione (aktywne)", color: "text-[hsl(var(--gold))]", bgColor: "bg-[hsl(var(--gold))]/10" },
    { icon: Trophy, value: registeredCount, label: "Zarejestrowane", color: "text-accent", bgColor: "bg-accent/10" },
    { icon: Percent, value: `${regPercent}%`, label: "Rejestracji", color: "text-primary", bgColor: "bg-primary/10" },
  ];

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-2xl p-6 md:p-8 shadow-soft">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <span className="font-display text-2xl font-bold text-primary">{(profile?.display_name || "U")[0].toUpperCase()}</span>
          </div>
          <div>
            <h1 className="font-display text-2xl md:text-3xl font-bold text-foreground mb-1">Witaj, {profile?.display_name || "Podróżniku"}!</h1>
            <p className="text-muted-foreground">{totalUnits} kartek • {registeredCount} zarejestrowanych</p>
            {profile?.city && profile?.country && (
              <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1"><MapPin className="w-3 h-3" />{profile.city}, {profile.country}</p>
            )}
          </div>
        </div>
      </motion.div>

      {/* Gamification / Cultural Impact */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="bg-card rounded-2xl p-6 md:p-8 shadow-soft">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg font-semibold text-foreground flex items-center gap-2">
            <Award className={`w-5 h-5 ${rankInfo.color}`} /> Cultural Impact
          </h3>
          <span className={`text-xs font-semibold px-3 py-1 rounded-full ${rankInfo.bgColor} ${rankInfo.color}`}>
            {currentRank}
          </span>
        </div>
        <div className="flex items-end gap-3 mb-3">
          <p className={`font-display text-4xl font-bold ${rankInfo.color}`}>{totalPoints}</p>
          <p className="text-sm text-muted-foreground mb-1">punktów</p>
        </div>
        {rankInfo.next && (
          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>{currentRank}</span>
              <span>{rankInfo.next} ({rankInfo.nextThreshold} pkt)</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all bg-primary`} style={{ width: `${progressToNext}%` }} />
            </div>
          </div>
        )}
        {!rankInfo.next && (
          <p className="text-sm text-muted-foreground flex items-center gap-1"><Star className="w-4 h-4 text-primary" /> Osiągnąłeś najwyższą rangę!</p>
        )}
      </motion.div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statsCards.map((stat, index) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.1 }} className="bg-card rounded-xl p-5 shadow-soft">
            <div className={`inline-flex items-center justify-center w-10 h-10 ${stat.bgColor} rounded-lg mb-3`}>
              <stat.icon className={`w-5 h-5 ${stat.color}`} />
            </div>
            <p className={`font-display text-3xl font-bold ${stat.color}`}>{isLoading ? "..." : stat.value}</p>
            <p className="text-sm text-muted-foreground mt-1">{stat.label}</p>
          </motion.div>
        ))}
      </div>

      {countryStats.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="bg-card rounded-xl p-6 shadow-soft">
          <h3 className="font-display text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Globe2 className="w-5 h-5 text-primary" /> Statystyki per kraj
          </h3>
          <div className="space-y-3">
            {countryStats.map((cs) => {
              const pct = cs.total > 0 ? Math.round((cs.registered / cs.total) * 100) : 0;
              return (
                <div key={cs.name} className="flex items-center gap-3">
                  <MapPin className="w-4 h-4 text-accent flex-shrink-0" />
                  <span className="text-sm font-medium text-foreground min-w-[120px]">{cs.name}</span>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {cs.registered}/{cs.total} ({pct}%)
                  </span>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default UserStats;
