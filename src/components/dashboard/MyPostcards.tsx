import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Package, Calendar, CheckCircle, ChevronDown, ChevronUp, ShoppingBag, Mail, MessageSquare, User, QrCode } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { trackEvent } from "@/lib/analytics";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/integrations/firebase/config";

interface InventoryCard {
  id: string;
  business_status: string | null;
  registered_at: string | null;
  country_name: string | null;
  design_title: string | null;
  view_no: number;
  recipient_name: string | null;
  recipient_message: string | null;
  recipient_email: string | null;
  contact_opt_in: boolean;
}

interface MyPostcardsProps {
  userId: string;
}

const statusLabels: Record<string, { label: string; color: string; icon: typeof Package }> = {
  purchased: { label: "Kupiona — czeka na rejestrację", color: "text-[hsl(var(--gold))]", icon: ShoppingBag },
  assigned: { label: "Otrzymana — czeka na wręczenie", color: "text-primary", icon: Package },
  registered: { label: "Wręczona — zarejestrowana", color: "text-accent", icon: CheckCircle },
};

const fetchPostcards = async (userId: string): Promise<InventoryCard[]> => {
  const [unitsSnapshot, designsSnapshot, countriesSnapshot] = await Promise.all([
    getDocs(query(collection(db, "inventory_units"), where("traveler_user_id", "==", userId))),
    getDocs(collection(db, "card_designs")),
    getDocs(collection(db, "countries")),
  ]);
  const designs = new Map(designsSnapshot.docs.map((document) => [document.id, document.data()]));
  const countries = new Map(countriesSnapshot.docs.map((document) => [document.id, document.data()]));
  const units = unitsSnapshot.docs
    .map((document) => ({ id: document.id, ...document.data() } as Record<string, unknown> & { id: string }))
    .sort((left, right) => String(right.created_at || "").localeCompare(String(left.created_at || "")));

  return units.map((unit) => {
    const design = designs.get(String(unit.card_design_id || ""));
    const country = design ? countries.get(String(design.country_id || "")) : null;
    return {
      id: unit.id,
      business_status: typeof unit.business_status === "string" ? unit.business_status : null,
      registered_at: typeof unit.registered_at === "string" ? unit.registered_at : null,
      country_name: typeof country?.name_pl === "string" ? country.name_pl : null,
      design_title: typeof design?.title === "string" ? design.title : null,
      view_no: Number(design?.view_no || 0),
      recipient_name: null,
      recipient_message: null,
      recipient_email: null,
      contact_opt_in: false,
    };
  });
};

const MyPostcards = ({ userId }: MyPostcardsProps) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'registered'>('all');

  useEffect(() => trackEvent("dashboard_qr_instruction_view"), []);

  const { data: cards = [], isLoading } = useQuery({
    queryKey: ['postcards', userId],
    queryFn: () => fetchPostcards(userId),
  });

  const filteredCards = cards.filter((card) =>
    filter === 'all'
      || (filter === 'pending' && ['purchased', 'assigned'].includes(card.business_status || ''))
      || card.business_status === filter
  );
  const purchasedCount = cards.filter((card) => ['purchased', 'assigned'].includes(card.business_status || '')).length;
  const registeredCount = cards.filter((card) => card.business_status === 'registered').length;

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  if (isLoading) {
    return <div className="text-center py-12"><div className="animate-pulse text-muted-foreground">Ładowanie...</div></div>;
  }

  if (cards.length === 0) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center py-12">
        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
          <Package className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="font-display text-xl font-semibold text-foreground mb-2">Brak przypisanych kartek</h3>
        <p className="text-muted-foreground max-w-md mx-auto">Kartki pojawią się tutaj po realizacji zamówienia.</p>
      </motion.div>
    );
  }

  return (
    <div className="space-y-6">
      {purchasedCount > 0 && (
        <div className="rounded-2xl border border-primary/20 bg-primary/[0.06] p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><QrCode className="h-5 w-5" /></div>
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-lg font-semibold text-foreground">Twoje kartki czekają na rejestrację</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Po zakupie zabierz kartkę w podróż i wręcz ją wybranej osobie. Gdy obdarowany zeskanuje kod QR, wybierze język i wpisze swoje dane, kartka zostanie oznaczona jako wręczona.</p>
              <p className="mt-2 text-xs font-medium text-primary">{purchasedCount} {purchasedCount === 1 ? 'kartka czeka' : 'kartek czeka'} na rejestrację obdarowanego</p>
            </div>
          </div>
        </div>
      )}

      {registeredCount > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-accent/20 bg-accent/5 px-4 py-3 text-sm text-foreground">
          <CheckCircle className="h-5 w-5 shrink-0 text-accent" />
          <span><strong>{registeredCount}</strong> {registeredCount === 1 ? 'relacja jest już zarejestrowana' : 'relacje są już zarejestrowane'} — każda wzmacnia Twój Wpływ Kulturowy.</span>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setFilter('all')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
          Wszystkie ({cards.length})
        </button>
        <button onClick={() => setFilter('pending')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filter === 'pending' ? 'bg-[hsl(var(--gold))] text-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
          Oczekujące na rejestrację ({purchasedCount})
        </button>
        <button onClick={() => setFilter('registered')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filter === 'registered' ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
          Zarejestrowane ({cards.filter(c => c.business_status === 'registered').length})
        </button>
      </div>

      <div className="space-y-4">
        {filteredCards.map((card, index) => {
          const status = statusLabels[card.business_status || 'purchased'] || statusLabels.purchased;
          const StatusIcon = status.icon;
          const isExpanded = expandedId === card.id;

          return (
            <motion.div key={card.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}
              className="bg-card rounded-xl shadow-soft overflow-hidden">
              <button onClick={() => setExpandedId(isExpanded ? null : card.id)}
                className="w-full p-4 flex items-center gap-4 text-left hover:bg-muted/30 transition-colors">
                <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                  <span className="text-3xl">🇵🇱</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm text-foreground">{card.country_name}</span>
                    <span className="text-xs text-muted-foreground">Widok #{card.view_no}</span>
                    <span className={`flex items-center gap-1 text-xs font-medium ${status.color}`}>
                      <StatusIcon className="w-3 h-3" />{status.label}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{card.design_title}</p>
                </div>
                <div className="flex-shrink-0">
                  {isExpanded ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
                </div>
              </button>

              {isExpanded && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="border-t border-border">
                  <div className="p-4 space-y-3">
                    {card.business_status === 'registered' && card.recipient_name && (
                      <div className="bg-accent/10 rounded-lg p-4 space-y-2">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-accent" />
                          <span className="text-sm font-medium text-foreground">{card.recipient_name}</span>
                        </div>
                        {card.recipient_message && (
                          <div className="flex items-start gap-2">
                            <MessageSquare className="w-4 h-4 text-muted-foreground mt-0.5" />
                            <p className="text-sm text-foreground italic">"{card.recipient_message}"</p>
                          </div>
                        )}
                        {card.recipient_email && (
                          <div className="flex items-center gap-2">
                            <Mail className="w-4 h-4 text-muted-foreground" />
                            <a href={`mailto:${card.recipient_email}`} className="text-sm text-primary hover:underline">{card.recipient_email}</a>
                          </div>
                        )}
                        {card.registered_at && (
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">{formatDate(card.registered_at)}</span>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Kraj</p>
                        <p className="font-medium text-foreground">{card.country_name}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Widok</p>
                        <p className="font-medium text-foreground">#{card.view_no}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Status</p>
                        <p className={`font-medium ${status.color} flex items-center gap-1`}><StatusIcon className="w-4 h-4" />{status.label}</p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

export default MyPostcards;
