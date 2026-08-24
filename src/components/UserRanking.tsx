import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, Medal, Award, Heart, Globe2, Sparkles, Users, TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { firestoreService } from "@/integrations/firebase/services/firestoreService";
import type { FirestoreUserProfile } from "@/integrations/firebase/types";
import { Badge } from "@/components/ui/badge";

interface RankedUser {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  total_points: number;
  current_rank: string;
  unitCount: number;
  regCount: number;
  countries: { iso2: string; name_pl: string }[];
}

const RANK_STYLE: Record<string, { badgeClass: string; glow: string }> = {
  Zwiadowca: {
    badgeClass: "bg-muted text-muted-foreground border-border",
    glow: "",
  },
  Ambasador: {
    badgeClass: "bg-[hsl(var(--gold))]/10 text-[hsl(var(--gold))] border-[hsl(var(--gold))]/30",
    glow: "shadow-[0_0_12px_hsl(var(--gold)/0.15)]",
  },
  "Misjonarz Kultury": {
    badgeClass: "bg-accent/10 text-accent border-accent/30",
    glow: "shadow-[0_0_12px_hsl(var(--accent)/0.15)]",
  },
  "Legenda Podróżówki": {
    badgeClass: "bg-[hsl(var(--gold))]/15 text-[hsl(var(--gold))] border-[hsl(var(--gold))]/40",
    glow: "shadow-[0_0_20px_hsl(var(--gold)/0.25)]",
  },
};

const DEFAULT_RANK_STYLE = {
  badgeClass: "bg-primary/10 text-primary border-primary/30",
  glow: "shadow-[0_0_12px_hsl(var(--primary)/0.15)]",
};

const getRankStyle = (rank: string) => RANK_STYLE[rank] ?? DEFAULT_RANK_STYLE;

const FLAG_URL = (iso2: string) =>
  `https://flagcdn.com/w40/${iso2.toLowerCase()}.png`;

type RankingProfile = FirestoreUserProfile & {
  total_points?: number;
  current_rank?: string;
  postcards_purchased?: number;
};

const fetchRanking = async (): Promise<RankedUser[]> => {
  try {
    const firestoreUsers = await firestoreService.getTopTravelers(10);
    if (firestoreUsers.length > 0 && firestoreUsers.some(u => (u.gamification_points || 0) > 0)) {
      return firestoreUsers.map((user) => {
        const u = user as RankingProfile;
        return {
        user_id: u.id || u.user_id || "",
        display_name: u.display_name || u.full_name || "Podróżnik",
        avatar_url: u.avatar_url || null,
        total_points: u.gamification_points || u.total_points || 0,
        current_rank: u.current_tier || u.current_rank || "Zwiadowca",
        unitCount: u.postcards_sent_count || u.postcards_purchased || 0,
        regCount: u.postcards_registered_count || 0,
        countries: [{ iso2: "PL", name_pl: "Polska" }],
        };
      });
    }
  } catch (e) {
    console.warn("Firestore fetchRanking error:", e);
  }
  return [];
};


const UserRanking = () => {
  const { data: topUsers = [], isLoading } = useQuery({
    queryKey: ["user-ranking"],
    queryFn: fetchRanking,
    refetchInterval: 60_000,
  });

  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const getRankIcon = (index: number) => {
    switch (index) {
      case 0:
        return <Trophy className="w-6 h-6 text-[hsl(var(--gold))]" />;
      case 1:
        return <Medal className="w-6 h-6 text-muted-foreground" />;
      case 2:
        return <Award className="w-6 h-6 text-[hsl(var(--gold))]" />;
      default:
        return (
          <span className="w-6 h-6 flex items-center justify-center text-sm font-bold text-muted-foreground">
            {index + 1}
          </span>
        );
    }
  };

  const getRankBgColor = (index: number) => {
    switch (index) {
      case 0:
        return "bg-[hsl(var(--gold))]/5 border-[hsl(var(--gold))]/20";
      case 1:
        return "bg-muted/50 border-border";
      case 2:
        return "bg-[hsl(var(--gold))]/3 border-[hsl(var(--gold))]/10";
      default:
        return "bg-card border-border";
    }
  };

  if (isLoading) {
    return (
      <section className="py-16 bg-secondary">
        <div className="container mx-auto px-4">
          <div className="text-center">
            <div className="animate-pulse text-muted-foreground">Ładowanie rankingu...</div>
          </div>
        </div>
      </section>
    );
  }

  if (topUsers.length === 0) {
    return (
      <section className="py-16 bg-secondary">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            viewport={{ once: true }}
            className="text-center"
          >
            <span className="inline-block px-3 py-1 bg-[hsl(var(--gold))]/10 text-[hsl(var(--gold))] rounded-full text-sm font-medium mb-4">
              Top Podróżników
            </span>
            <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-4">
              Bądź pierwszym podróżnikiem w rankingu!
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto mb-8">
              Dołącz do społeczności, kupuj Podróżówki i zostań jednym z podróżników promujących Polskę na
              świecie.
            </p>
            <a
              href="/auth"
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-all"
            >
              <Heart className="w-5 h-5" /> Dołącz teraz
            </a>
          </motion.div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-16 bg-secondary">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          viewport={{ once: true }}
          className="text-center mb-10"
        >
          <span className="inline-block px-3 py-1 bg-[hsl(var(--gold))]/10 text-[hsl(var(--gold))] rounded-full text-sm font-medium mb-4">
            Cultural Impact Ranking
          </span>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-4">
            Top Podróżników
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Użytkownicy z największym wpływem kulturowym — promują Polskę na świecie i budują relacje.
          </p>
        </motion.div>

        <div className="max-w-2xl mx-auto">
          {topUsers.map((user, index) => {
            const rankStyle = getRankStyle(user.current_rank);
            const isLegend = user.current_rank === "Legenda Podróżówki";
            const isHovered = hoveredId === user.user_id;

            return (
              <motion.div
                key={user.user_id}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: index * 0.08 }}
                viewport={{ once: true }}
                onMouseEnter={() => setHoveredId(user.user_id)}
                onMouseLeave={() => setHoveredId(null)}
                className={`relative p-4 mb-3 rounded-xl border transition-all duration-300 cursor-default ${getRankBgColor(index)} ${
                  isHovered ? `shadow-soft ${rankStyle.glow} scale-[1.01]` : ""
                }`}
              >
                <div className="flex items-center gap-4">
                  {/* Rank icon */}
                  <div className="flex-shrink-0">{getRankIcon(index)}</div>

                  {/* Avatar */}
                  <div className="flex-shrink-0">
                    {user.avatar_url ? (
                      <img
                        src={user.avatar_url}
                        alt={user.display_name || "Użytkownik"}
                        className="w-12 h-12 rounded-full object-cover border-2 border-background"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div
                        className={`w-12 h-12 rounded-full flex items-center justify-center ${
                          isLegend ? "bg-[hsl(var(--gold))]/10" : "bg-primary/10"
                        }`}
                      >
                        <span
                          className={`text-lg font-bold ${
                            isLegend ? "text-[hsl(var(--gold))]" : "text-primary"
                          }`}
                        >
                          {(user.display_name || "U")[0].toUpperCase()}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Name + badge + flags */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-foreground truncate">
                        {user.display_name || "Anonim"}
                      </p>
                      <Badge
                        className={`text-[10px] px-2 py-0 leading-4 ${rankStyle.badgeClass}`}
                      >
                        {isLegend && <Sparkles className="w-3 h-3 mr-1" />}
                        {user.current_rank}
                      </Badge>
                    </div>

                    {/* Country flags */}
                    {user.countries.length > 0 && (
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <Globe2 className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                        <div className="flex items-center gap-1 flex-wrap">
                          {user.countries.slice(0, 6).map((c) => (
                            <img
                              key={c.iso2}
                              src={FLAG_URL(c.iso2)}
                              alt={c.name_pl}
                              title={c.name_pl}
                              className="w-5 h-3.5 rounded-[2px] object-cover shadow-sm"
                              referrerPolicy="no-referrer"
                            />
                          ))}
                          {user.countries.length > 6 && (
                            <span className="text-[10px] text-muted-foreground ml-0.5">
                              +{user.countries.length - 6}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Points + country count */}
                  <div className="flex-shrink-0 text-right">
                    <p
                      className={`font-display text-xl font-bold ${
                        isLegend ? "text-[hsl(var(--gold))]" : "text-primary"
                      }`}
                    >
                      {user.total_points.toLocaleString("pl-PL")}
                    </p>
                    <div className="flex items-center justify-end gap-1 mt-0.5">
                      <Globe2
                        className={`w-3 h-3 ${
                          isLegend ? "text-[hsl(var(--gold))]" : "text-accent"
                        }`}
                      />
                      <span className="text-xs text-muted-foreground">
                        {user.countries.length} {user.countries.length === 1 ? "kraj" : user.countries.length < 5 ? "kraje" : "krajów"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Hover tooltip — cultural impact summary */}
                <AnimatePresence>
                  {isHovered && (
                    <motion.div
                      initial={{ opacity: 0, height: 0, marginTop: 0 }}
                      animate={{ opacity: 1, height: "auto", marginTop: 12 }}
                      exit={{ opacity: 0, height: 0, marginTop: 0 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                      className="overflow-hidden"
                    >
                      <div
                        className={`rounded-lg p-3 grid grid-cols-3 gap-3 text-center ${
                          isLegend
                            ? "bg-[hsl(var(--gold))]/5 border border-[hsl(var(--gold))]/10"
                            : "bg-muted/60"
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-center gap-1 mb-1">
                            <TrendingUp className="w-3.5 h-3.5 text-primary" />
                          </div>
                          <p className="font-display text-sm font-bold text-foreground">
                            {user.unitCount}
                          </p>
                          <p className="text-[10px] text-muted-foreground">Kartek</p>
                        </div>
                        <div>
                          <div className="flex items-center justify-center gap-1 mb-1">
                            <Globe2 className="w-3.5 h-3.5 text-accent" />
                          </div>
                          <p className="font-display text-sm font-bold text-foreground">
                            {user.countries.length}
                          </p>
                          <p className="text-[10px] text-muted-foreground">Krajów</p>
                        </div>
                        <div>
                          <div className="flex items-center justify-center gap-1 mb-1">
                            <Users className="w-3.5 h-3.5 text-[hsl(var(--gold))]" />
                          </div>
                          <p className="font-display text-sm font-bold text-foreground">
                            {user.regCount}
                          </p>
                          <p className="text-[10px] text-muted-foreground">Relacji</p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default UserRanking;
