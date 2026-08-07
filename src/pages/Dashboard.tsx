import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { User, Package, ArrowLeft, Loader2, Shield, ShoppingCart, Store } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import useRealtimeNotifications from "@/hooks/useRealtimeNotifications";
import UserStats from "@/components/dashboard/UserStats";
import RankCard from "@/components/dashboard/RankCard";
import MyPostcards from "@/components/dashboard/MyPostcards";
import MyOrders from "@/components/dashboard/MyOrders";
import CulturalMissions from "@/components/dashboard/CulturalMissions";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import TravelerJournal from "@/components/dashboard/TravelerJournal";
import { Button } from "@/components/ui/button";

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
  total_points: number;
  current_rank: string;
}

const Dashboard = () => {
  const { user, isLoading: authLoading, isAdmin, signOut } = useAuth();
  const { flags } = useFeatureFlags();
  useRealtimeNotifications();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'my-postcards' | 'my-orders'>('overview');

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return;

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!error && data) {
        setProfile(data as Profile);
      }
      setIsLoading(false);
    };

    if (user) fetchProfile();
  }, [user]);

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;

  const tabs = [
    { id: 'overview', label: 'Przegląd', icon: User },
    { id: 'my-orders', label: 'Moje zamówienia', icon: ShoppingCart },
    { id: 'my-postcards', label: 'Moje Podróżówki', icon: Package },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Mój panel — Podróżówka</title>
        <meta name="description" content="Twój panel Podróżówki: zamówienia, zarejestrowane pocztówki, statystyki podróży i ranga w społeczności." />
        <link rel="canonical" href="https://podrozowka.lovable.app/dashboard" />
        <meta name="robots" content="noindex, follow" />
        <meta property="og:title" content="Mój panel — Podróżówka" />
        <meta property="og:description" content="Zarządzaj swoimi Podróżówkami w jednym miejscu." />
        <meta property="og:url" content="https://podrozowka.lovable.app/dashboard" />
      </Helmet>
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 shadow-sm backdrop-blur-md">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <a href="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="w-4 h-4" /><span className="hidden sm:inline">Powrót</span>
              </a>
              <h1 className="font-display text-xl font-semibold text-foreground">Panel podróżnika</h1>
            </div>
            <div className="flex items-center gap-3">
              {isAdmin && (
                <a href="/admin" className="flex items-center gap-1 px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-sm font-medium hover:bg-primary/20 transition-colors">
                  <Shield className="w-4 h-4" />Admin
                </a>
              )}
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-foreground">{profile?.display_name || user.email}</p>
                <p className="text-xs text-muted-foreground">{profile?.postcards_purchased || 0} zakupionych</p>
              </div>
              <button onClick={signOut} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                Wyloguj
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="border-b border-border bg-card">
        <div className="container mx-auto px-4">
          <nav className="flex gap-1 overflow-x-auto py-2">
            {tabs.map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${activeTab === tab.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}>
                <tab.icon className="w-4 h-4" />{tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <main className="container mx-auto px-4 py-8 space-y-6">
        {activeTab === 'overview' && (
          <>
            <section>
              <div className="rounded-2xl border border-primary/20 bg-primary/[0.06] p-5">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                  <Store className="h-5 w-5" />
                </div>
                <h2 className="font-display text-xl font-semibold">Wybierz nowe Podróżówki</h2>
                <p className="mt-1 text-sm text-muted-foreground">Łącz wzory dowolnie. Minimum 10 sztuk dotyczy całego zamówienia.</p>
                <Button className="mt-4" onClick={() => navigate("/sklep")}>Przejdź do sklepu</Button>
              </div>
            </section>
            <RankCard userId={user.id} />
            <UserStats profile={profile} userId={user.id} />
            {flags?.cultural_missions && <CulturalMissions />}
            {flags?.travelers_journal && (
              <div className="mt-12">
                <div className="flex items-center gap-2 mb-6">
                  <h3 className="text-2xl font-display font-bold text-foreground">Dziennik Ambasadora</h3>
                  <span className="px-2 py-1 text-xs font-bold bg-primary/10 text-primary rounded-full">BETA</span>
                </div>
                <TravelerJournal />
              </div>
            )}
          </>
        )}
        {activeTab === 'my-orders' && <MyOrders userId={user.id} />}
        {activeTab === 'my-postcards' && <MyPostcards userId={user.id} />}
      </main>
    </div>
  );
};

export default Dashboard;
