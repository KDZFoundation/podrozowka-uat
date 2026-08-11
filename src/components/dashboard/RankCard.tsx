import { motion, animate } from "framer-motion";
import { Award, Globe2, Users, ChevronRight, Sparkles, Share2, MapPin } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useEffect, useRef, useState, useCallback } from "react";
import html2canvas from "html2canvas";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { DEFAULT_GAMIFICATION_TIERS, useGamificationTiers } from "@/hooks/useGamificationTiers";

const getTier = (rank: string, tiers: typeof DEFAULT_GAMIFICATION_TIERS) => tiers.find((t) => t.name === rank) ?? tiers[0];
const getNextTier = (rank: string, tiers: typeof DEFAULT_GAMIFICATION_TIERS) => {
  const idx = tiers.findIndex((t) => t.name === rank);
  return idx >= 0 && idx < tiers.length - 1 ? tiers[idx + 1] : null;
};

function AnimatedCounter({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  const prevValue = useRef(0);

  useEffect(() => {
    const controls = animate(prevValue.current, value, {
      duration: 1.4,
      ease: "easeOut",
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    prevValue.current = value;
    return () => controls.stop();
  }, [value]);

  return <>{display.toLocaleString("pl-PL")}</>;
}

interface RankCardProps {
  userId: string;
}

interface RankUnitJoin {
  id: string;
  card_designs: {
    country_id: string;
  } | null;
}

const fetchRankData = async (userId: string) => {
  // Fetch profile gamification fields
  const { data: profile } = await supabase
    .from("profiles")
    .select("total_points, current_rank, total_kilometers")
    .eq("user_id", userId)
    .maybeSingle();

  // Fetch unique countries & registration count
  const { data: units } = await supabase
    .from("inventory_units")
    .select("id, card_designs!inner(country_id)")
    .eq("traveler_user_id", userId);

  const typedUnits = (units || []) as unknown as RankUnitJoin[];
  const unitIds = typedUnits.map((u) => u.id);
  const countrySet = new Set(
    typedUnits.map((u) => u.card_designs?.country_id).filter(Boolean)
  );

  let regCount = 0;
  if (unitIds.length > 0) {
    const { count } = await supabase
      .from("recipient_registrations")
      .select("id", { count: "exact", head: true })
      .in("inventory_unit_id", unitIds);
    regCount = count || 0;
  }

  return {
    totalPoints: profile?.total_points ?? 0,
    currentRank: (profile?.current_rank as string) ?? "Zwiadowca",
    uniqueCountries: countrySet.size,
    registeredRelations: regCount,
    totalKilometers: profile?.total_kilometers ?? 0,
  };
};

const RankCard = ({ userId }: RankCardProps) => {
  const shareRef = useRef<HTMLDivElement>(null);
  const [isSharing, setIsSharing] = useState(false);
  const { isAdmin } = useAuth();
  const { flags } = useFeatureFlags();
  const { data: configuredTiers = DEFAULT_GAMIFICATION_TIERS } = useGamificationTiers();

  const { data, isLoading } = useQuery({
    queryKey: ["rank-card", userId],
    queryFn: () => fetchRankData(userId),
    refetchInterval: 30_000,
  });

  const handleShare = useCallback(async () => {
    if (!shareRef.current || isSharing) return;
    setIsSharing(true);
    try {
      const canvas = await html2canvas(shareRef.current, {
        backgroundColor: null,
        scale: 2,
        useCORS: true,
      });
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
      if (!blob) return;

      const file = new File([blob], "moj-wplyw-kulturowy.png", { type: "image/png" });

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: "Mój Wpływ Kulturowy!",
          text: "Sprawdź mój Wpływ Kulturowy na Podróżówce! 🌍",
          files: [file],
        });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "moj-wplyw-kulturowy.png";
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      // user cancelled share dialog
    } finally {
      setIsSharing(false);
    }
  }, [isSharing]);

  const totalPoints = data?.totalPoints ?? 0;
  const currentRank = data?.currentRank ?? "Zwiadowca";
  const uniqueCountries = data?.uniqueCountries ?? 0;
  const registeredRelations = data?.registeredRelations ?? 0;
  const totalKilometers = data?.totalKilometers ?? 0;
  const showTravelStats = isAdmin && flags.travel_stats;

  const tier = getTier(currentRank, configuredTiers);
  const nextTier = getNextTier(currentRank, configuredTiers);
  const isLegend = !nextTier;

  const progressValue = nextTier
    ? Math.min(100, Math.round(((totalPoints - tier.min_points) / (nextTier.min_points - tier.min_points)) * 100))
    : 100;

  const pointsToNext = nextTier ? nextTier.min_points - totalPoints : 0;

  if (isLoading) {
    return (
      <div className="rounded-2xl bg-card shadow-soft p-8 animate-pulse">
        <div className="h-6 w-40 bg-muted rounded mb-4" />
        <div className="h-10 w-28 bg-muted rounded mb-4" />
        <div className="h-2.5 w-full bg-muted rounded-full" />
      </div>
    );
  }

  return (
    <div>
      <motion.div
        ref={shareRef}
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className={`relative overflow-hidden rounded-2xl shadow-soft ${
          isLegend
            ? "bg-gradient-to-br from-[hsl(43,74%,15%)] via-[hsl(43,50%,20%)] to-[hsl(20,20%,12%)] text-[hsl(var(--warm-white))]"
            : "bg-card text-foreground"
        }`}
      >
      {/* Decorative shimmer for Legenda */}
      {isLegend && (
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full bg-[hsl(var(--gold))]/10 blur-3xl" />
          <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full bg-[hsl(var(--gold))]/5 blur-2xl" />
        </div>
      )}

      <div className="relative z-10 p-6 md:p-8">
        {/* Top row: rank badge */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                isLegend
                  ? "bg-[hsl(var(--gold))]/20 ring-1 ring-[hsl(var(--gold))]/40"
                  : `${tier.bg} ring-1 ${tier.ring}/30`
              }`}
            >
              {isLegend ? (
                <Sparkles className="w-6 h-6 text-[hsl(var(--gold))]" />
              ) : (
                <Award className={`w-6 h-6 text-${tier.accent}`} />
              )}
            </div>
            <div>
              <p
                className={`text-xs font-medium uppercase tracking-widest ${
                  isLegend ? "text-[hsl(var(--gold))]" : "text-muted-foreground"
                }`}
              >
                Twoja ranga
              </p>
              <h2
                className={`font-display text-xl md:text-2xl font-bold uppercase tracking-wide ${
                  isLegend ? "text-[hsl(var(--gold-light))]" : `text-${tier.accent}`
                }`}
              >
                {currentRank}
              </h2>
            </div>
          </div>

          {nextTier && (
            <div className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground">
              <span>Następna:</span>
              <span className="font-semibold text-foreground">{nextTier.name}</span>
              <ChevronRight className="w-3 h-3" />
            </div>
          )}
        </div>

        {/* Progress bar */}
        {nextTier ? (
          <div className="mb-6">
            <div className="flex justify-between text-xs mb-2">
              <span className={isLegend ? "text-[hsl(var(--gold))]/70" : "text-muted-foreground"}>
                {totalPoints} pkt
              </span>
              <span className={isLegend ? "text-[hsl(var(--gold))]/70" : "text-muted-foreground"}>
                {nextTier.min_points} pkt
              </span>
            </div>
            <Progress
              value={progressValue}
              className={`h-2.5 ${isLegend ? "bg-white/10" : "bg-muted"}`}
            />
            <p
              className={`text-xs mt-2 ${
                isLegend ? "text-[hsl(var(--gold))]/60" : "text-muted-foreground"
              }`}
            >
              Jeszcze <span className="font-semibold">{pointsToNext}</span> punktów do rangi{" "}
              <span className="font-semibold">{nextTier.name}</span>
            </p>
          </div>
        ) : (
          <div className="mb-6">
            <Progress value={100} className="h-2.5 bg-[hsl(var(--gold))]/20" />
            <p className="text-xs mt-2 text-[hsl(var(--gold))]/70 flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> Osiągnąłeś najwyższą rangę — jesteś legendą!
            </p>
          </div>
        )}

        {/* Cultural Impact Score */}
        <div
          className={`rounded-xl p-5 ${
            isLegend ? "bg-white/5 ring-1 ring-[hsl(var(--gold))]/10" : "bg-muted/50"
          }`}
        >
          <p
            className={`text-xs font-medium uppercase tracking-widest mb-1 ${
              isLegend ? "text-[hsl(var(--gold))]/70" : "text-muted-foreground"
            }`}
          >
            Twój Wpływ Kulturowy
          </p>
          <div className="flex items-baseline gap-2 mb-4">
            <span
              className={`font-display text-4xl md:text-5xl font-bold ${
                isLegend ? "text-[hsl(var(--gold-light))]" : `text-${tier.accent}`
              }`}
            >
              <AnimatedCounter value={totalPoints} />
            </span>
            <span
              className={`text-sm ${
                isLegend ? "text-[hsl(var(--gold))]/60" : "text-muted-foreground"
              }`}
            >
              punktów
            </span>
          </div>

          <div className={`grid ${showTravelStats ? 'grid-cols-3' : 'grid-cols-2'} gap-3`}>
            <div
              className={`flex items-center gap-2 rounded-lg p-3 ${
                isLegend ? "bg-white/5" : "bg-card"
              }`}
            >
              <Globe2
                className={`w-4 h-4 flex-shrink-0 ${
                  isLegend ? "text-[hsl(var(--gold))]" : "text-primary"
                }`}
              />
              <div>
                <p
                  className={`font-display text-lg font-bold ${
                    isLegend ? "text-[hsl(var(--warm-white))]" : "text-foreground"
                  }`}
                >
                  {uniqueCountries}
                </p>
                <p
                  className={`text-xs ${
                    isLegend ? "text-[hsl(var(--gold))]/60" : "text-muted-foreground"
                  }`}
                >
                  Globalny zasięg
                </p>
              </div>
            </div>
            <div
              className={`flex items-center gap-2 rounded-lg p-3 ${
                isLegend ? "bg-white/5" : "bg-card"
              }`}
            >
              <Users
                className={`w-4 h-4 flex-shrink-0 ${
                  isLegend ? "text-[hsl(var(--gold))]" : "text-accent"
                }`}
              />
              <div>
                <p
                  className={`font-display text-lg font-bold ${
                    isLegend ? "text-[hsl(var(--warm-white))]" : "text-foreground"
                  }`}
                >
                  {registeredRelations}
                </p>
                <p
                  className={`text-xs ${
                    isLegend ? "text-[hsl(var(--gold))]/60" : "text-muted-foreground"
                  }`}
                >
                  Relacje
                </p>
              </div>
            </div>
            {showTravelStats && (
              <div
                className={`flex items-center gap-2 rounded-lg p-3 ${
                  isLegend ? "bg-white/5" : "bg-card"
                }`}
              >
                <MapPin
                  className={`w-4 h-4 flex-shrink-0 ${
                    isLegend ? "text-[hsl(var(--gold))]" : "text-primary"
                  }`}
                />
                <div>
                  <p
                    className={`font-display text-lg font-bold ${
                      isLegend ? "text-[hsl(var(--warm-white))]" : "text-foreground"
                    }`}
                  >
                    {totalKilometers.toLocaleString("pl-PL")}
                    <span className={`text-xs font-normal ml-1 ${
                      isLegend ? "text-[hsl(var(--gold))]/60" : "text-muted-foreground"
                    }`}>km</span>
                  </p>
                  <p
                    className={`text-xs ${
                      isLegend ? "text-[hsl(var(--gold))]/60" : "text-muted-foreground"
                    }`}
                  >
                    Zasięg z Polski
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      </motion.div>

      <button
        onClick={handleShare}
        disabled={isSharing}
        className={`mt-3 w-full flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
          isLegend
            ? "bg-[hsl(var(--gold))]/20 text-[hsl(var(--gold-light))] hover:bg-[hsl(var(--gold))]/30"
            : "bg-primary/10 text-primary hover:bg-primary/20"
        }`}
      >
        <Share2 className="w-4 h-4" />
        {isSharing ? "Generowanie…" : "Pochwal się statystykami"}
      </button>
    </div>
  );
};

export default RankCard;
