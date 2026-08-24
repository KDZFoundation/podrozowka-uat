import { useAuth } from "@/hooks/useAuth";
import { MapPin, Mail, Calendar } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db, isFirebaseConfigured } from "@/integrations/firebase/config";
import { firestoreService } from "@/integrations/firebase/services/firestoreService";
import { Card, CardContent } from "@/components/ui/card";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { Loader2 } from "lucide-react";

interface TimelineEvent {
  id: string;
  date: string;
  type: "received" | "registered";
  country?: string;
  recipientName?: string;
  recipientMessage?: string;
  designTitle?: string;
}

interface JournalUnit {
  id: string;
  created_at: string;
  registered_at: string | null;
  card_designs: {
    title: string | null;
    country_id: string;
    countries: {
      name_pl: string;
    } | null;
  } | null;
  recipient_registrations: {
    registered_at: string;
    recipient_name: string;
    recipient_message: string | null;
  }[] | {
    registered_at: string;
    recipient_name: string;
    recipient_message: string | null;
  } | null;
}

const TravelerJournal = () => {
  const { user } = useAuth();

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["traveler-journal", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      // 1. Try Firestore
      if (isFirebaseConfigured && user?.id) {
        try {
          const [units, regsSnap, designsSnap, countriesSnap] = await Promise.all([
            firestoreService.getPaidTravelerUnits(user.id),
            getDocs(query(collection(db, "recipient_registrations"), where("traveler_user_id", "==", user.id))),
            getDocs(collection(db, "card_designs")),
            getDocs(collection(db, "countries")),
          ]);

          const designsMap = new Map(designsSnap.docs.map(d => [d.id, d.data()]));
          const countriesMap = new Map(countriesSnap.docs.map(c => [c.id, c.data().name_pl || c.data().name || c.id]));
          const regsByUnit = new Map(regsSnap.docs.map(r => [r.data().inventory_unit_id, r.data()]));

          const timeline: TimelineEvent[] = [];
          units.forEach(unit => {
              const u = unit;
              const design = designsMap.get(u.card_design_id);
              const country = countriesMap.get(design?.country_id) || "Polska";
              const designTitle = design?.title || "Podróżówka";

              timeline.push({
                id: `${unit.id}-received`,
                date: u.created_at || new Date().toISOString(),
                type: "received",
                country,
                designTitle,
              });

              const reg = regsByUnit.get(unit.id);
              if (reg || u.business_status === "registered") {
                timeline.push({
                  id: `${unit.id}-registered`,
                  date: reg?.registered_at || u.registered_at || new Date().toISOString(),
                  type: "registered",
                  country: reg?.registered_country_iso2 ? (countriesMap.get(reg.registered_country_iso2) || reg.registered_country_iso2) : country,
                  recipientName: reg?.recipient_name,
                  recipientMessage: reg?.recipient_message,
                  designTitle,
                });
              }
          });

          return timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        } catch (e) {
          console.warn("Firestore traveler-journal error:", e);
        }
      }
      return [];
    },
  });



  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Calendar className="w-10 h-10 mx-auto mb-3 opacity-40" />
        <p className="text-sm">Twoja oś czasu jest jeszcze pusta.</p>
        <p className="text-xs mt-1">Zamów pierwszą Podróżówkę, aby rozpocząć swoją historię!</p>
      </div>
    );
  }

  return (
    <div className="relative pl-8">
      {/* Vertical line */}
      <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-primary/20" />

      <div className="space-y-6">
        {events.map((event, index) => {
          const isRegistered = event.type === "registered";

          return (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, delay: index * 0.06 }}
              className="relative"
            >
              {/* Dot on the timeline */}
              <div
                className={`absolute -left-8 top-4 w-3 h-3 rounded-full border-2 ${
                  isRegistered
                    ? "bg-primary border-primary shadow-[0_0_8px_hsl(var(--primary)/0.4)]"
                    : "bg-background border-muted-foreground/40"
                }`}
              />

              <Card className={`transition-shadow hover:shadow-md ${isRegistered ? "border-primary/30" : ""}`}>
                <CardContent className="p-4">
                  {/* Date */}
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                    <Calendar className="w-3.5 h-3.5" />
                    <time>
                      {format(new Date(event.date), "d MMMM yyyy, HH:mm", {
                        locale: pl,
                      })}
                    </time>
                  </div>

                  {isRegistered ? (
                    <>
                      <p className="text-sm font-semibold text-foreground">
                        🎉 Kartka zarejestrowana!
                      </p>
                      <div className="mt-2 space-y-1.5">
                        {event.country && (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <MapPin className="w-3.5 h-3.5 text-primary" />
                            <span>{event.country}</span>
                          </div>
                        )}
                        {event.recipientName && (
                          <p className="text-sm text-foreground">
                            Obdarowany:{" "}
                            <span className="font-medium">{event.recipientName}</span>
                          </p>
                        )}
                        {event.recipientMessage && (
                          <div className="flex items-start gap-1.5 mt-1">
                            <Mail className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                            <p className="text-xs text-muted-foreground italic line-clamp-3">
                              „{event.recipientMessage}"
                            </p>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-semibold text-foreground">
                        📬 Kartka przypisana do Ciebie
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        {event.designTitle && (
                          <span className="text-xs text-muted-foreground">
                            {event.designTitle}
                          </span>
                        )}
                        {event.country && (
                          <span className="inline-flex items-center gap-1 text-xs bg-muted px-2 py-0.5 rounded-full">
                            <MapPin className="w-3 h-3" />
                            {event.country}
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

export default TravelerJournal;
