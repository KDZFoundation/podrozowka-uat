import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Package,
  Globe2,
  QrCode,
  BarChart3,
  ArrowLeft,
  Loader2,
  CheckCircle,
  ShoppingBag,
  Box,
  Image,
  ShoppingCart,
  Truck,
  UserCheck,
  Clock,
  Wrench,
  Map as MapIcon,
  FlaskConical,
  Trophy,
  Receipt,
  Tags,
  CreditCard,
  Printer,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { isFirestoreCatalogEnabled } from "@/integrations/firebase/config";
import { firestoreService } from "@/integrations/firebase/services/firestoreService";
import { inventoryService } from "@/integrations/firebase/services/inventoryService";
import AdminCountries from "@/components/admin/AdminCountries";
import AdminCardDesigns from "@/components/admin/AdminCardDesigns";
import AdminInventory from "@/components/admin/AdminInventory";
import AdminOrders from "@/components/admin/AdminOrders";
import AdminQrJobs from "@/components/admin/AdminQrJobs";
import AdminShipments from "@/components/admin/AdminShipments";
import AdminRegistrations from "@/components/admin/AdminRegistrations";
import AdminEventLog from "@/components/admin/AdminEventLog";
import AdminDevTools from "@/components/admin/AdminDevTools";
import AdminGlobalMap from "@/components/admin/AdminGlobalMap";
import AdminLab from "@/components/admin/AdminLab";
import AdminGamification from "@/components/admin/AdminGamification";
import AdminProducts from "@/components/admin/AdminProducts";
import AdminFiscalFailures from "@/components/admin/AdminFiscalFailures";
import AdminCategories from "@/components/admin/AdminCategories";
import AdminIntegrations from "@/components/admin/AdminIntegrations";
import AdminAuthors from "@/components/admin/AdminAuthors";
import { isDevelopmentRuntime } from "@/lib/runtimeEnvironment";
import { Blocks } from "lucide-react";

type TabId =
  | "overview"
  | "dev-tools"
  | "map"
  | "countries"
  | "card-designs"
  | "products"
  | "categories"
  | "inventory"
  | "orders"
  | "shipments"
  | "qr-jobs"
  | "registrations"
  | "event-log"
  | "lab"
  | "gamification"
  | "fiscal"
  | "integrations"
  | "authors";

interface AdminStats {
  totalUnits: number;
  inStock: number;
  reserved: number;
  shipped: number;
  registered: number;
  voided: number;
  countries: number;
  designs: number;
}

const AdminPanel = () => {
  const { user, isLoading: authLoading, isAdmin, isDbAdmin } = useAuth();
  const navigate = useNavigate();
  const devToolsEnabled = isDevelopmentRuntime();
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [stats, setStats] = useState<AdminStats>({
    totalUnits: 0,
    inStock: 0,
    reserved: 0,
    shipped: 0,
    registered: 0,
    voided: 0,
    countries: 0,
    designs: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    if (isFirestoreCatalogEnabled) {
      const [inventory, countries, designs] = await Promise.all([
        inventoryService.getInventorySnapshot(),
        firestoreService.getCountries(),
        firestoreService.getCardDesigns({ includeInactive: true }),
      ]);
      const units = inventory.units;
      setStats({
        totalUnits: units.length,
        inStock: units.filter((unit) => unit.fulfillment_status === "in_stock").length,
        reserved: units.filter((unit) => unit.fulfillment_status === "reserved").length,
        shipped: units.filter((unit) => unit.fulfillment_status === "shipped").length,
        registered: units.filter((unit) => unit.business_status === "registered").length,
        voided: units.filter((unit) => ["voided", "damaged"].includes(unit.fulfillment_status || "")).length,
        countries: countries.length,
        designs: designs.length,
      });
      setIsLoading(false);
      return;
    }

    const [
      { count: totalUnits },
      { count: inStock },
      { count: reserved },
      { count: shipped },
      { count: registered },
      { count: voided },
      { count: countries },
      { count: designs },
    ] = await Promise.all([
      supabase.from("inventory_units").select("*", { count: "exact", head: true }),
      supabase.from("inventory_units").select("*", { count: "exact", head: true }).eq("fulfillment_status", "in_stock"),
      supabase.from("inventory_units").select("*", { count: "exact", head: true }).eq("fulfillment_status", "reserved"),
      supabase.from("inventory_units").select("*", { count: "exact", head: true }).eq("fulfillment_status", "shipped"),
      supabase.from("inventory_units").select("*", { count: "exact", head: true }).eq("business_status", "registered"),
      supabase
        .from("inventory_units")
        .select("*", { count: "exact", head: true })
        .in("fulfillment_status", ["voided", "damaged"]),
      supabase.from("countries").select("*", { count: "exact", head: true }),
      supabase.from("card_designs").select("*", { count: "exact", head: true }),
    ]);

    setStats({
      totalUnits: totalUnits || 0,
      inStock: inStock || 0,
      reserved: reserved || 0,
      shipped: shipped || 0,
      registered: registered || 0,
      voided: voided || 0,
      countries: countries || 0,
      designs: designs || 0,
    });
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) navigate("/dashboard");
  }, [user, authLoading, isAdmin, navigate]);

  useEffect(() => {
    if (!isAdmin) return;
    fetchStats();
  }, [isAdmin, fetchStats]);

  useEffect(() => {
    if (!devToolsEnabled && activeTab === "dev-tools") {
      setActiveTab("overview");
    }
  }, [activeTab, devToolsEnabled]);

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) return null;

  const navigationTabs: { id: TabId; label: string; icon: typeof Package }[] = [
    { id: "overview", label: "Przegląd", icon: BarChart3 },
    { id: "dev-tools", label: "Narzędzia Dev", icon: Wrench },
    { id: "countries", label: "Kraje", icon: Globe2 },
    { id: "card-designs", label: "Kreator wzorów", icon: Image },
    { id: "products", label: "Produkty", icon: ShoppingBag },
    { id: "authors", label: "Autorzy", icon: UserCheck },
    { id: "orders", label: "Zamówienia (Drukarnia)", icon: ShoppingCart },
    { id: "shipments", label: "Wysyłki", icon: Truck },
    { id: "map", label: "Mapa Globalna", icon: MapIcon },
    { id: "categories", label: "Kategorie", icon: Tags },
    { id: "inventory", label: "Magazyn", icon: Box },
    { id: "qr-jobs", label: "Druk QR", icon: QrCode },
    { id: "registrations", label: "Rejestracje", icon: UserCheck },
    { id: "event-log", label: "Log zdarzeń", icon: Clock },
    { id: "gamification", label: "Grywalizacja", icon: Trophy },
    { id: "fiscal", label: "Fiskalizacja", icon: Receipt },
    { id: "integrations", label: "Integracje", icon: Blocks },
    { id: "lab", label: "Laboratorium", icon: FlaskConical },
  ];

  const workflowCards: { id: TabId; step: string; title: string; description: string; icon: typeof Package }[] = [
    { id: "card-designs", step: "01", title: "Wzory", description: "Przygotuj przód, tył i język kartki.", icon: Image },
    { id: "products", step: "02", title: "Produkty", description: "Opublikuj wzór i ustaw cenę sklepową.", icon: ShoppingBag },
    { id: "orders", step: "03", title: "POD i drukarnia", description: "Obsłuż opłacone zamówienie, QR oraz PDF SRA3.", icon: Printer },
    { id: "shipments", step: "04", title: "Wysyłka", description: "Uzupełnij status nadania i zakończ realizację.", icon: Truck },
  ];

  const overviewCards = [
    { icon: Box, label: "Wszystkie sztuki", value: stats.totalUnits, color: "text-foreground" },
    { icon: Package, label: "W magazynie", value: stats.inStock, color: "text-muted-foreground" },
    { icon: ShoppingBag, label: "Zarezerwowane", value: stats.reserved, color: "text-[hsl(var(--gold))]" },
    { icon: Truck, label: "Wysłane", value: stats.shipped, color: "text-primary" },
    { icon: CheckCircle, label: "Zarejestrowane", value: stats.registered, color: "text-accent" },
    { icon: Package, label: "Unieważ./Uszk.", value: stats.voided, color: "text-destructive" },
    { icon: Globe2, label: "Krajów", value: stats.countries, color: "text-primary" },
    { icon: Image, label: "Wzorów", value: stats.designs, color: "text-primary" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 shadow-sm backdrop-blur-md">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <a
                href="/dashboard"
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Dashboard</span>
              </a>
              <span className="font-display text-xl font-semibold text-primary">Panel Admina</span>
            </div>
          </div>
        </div>
      </header>

      <div className="border-b border-border bg-card">
        <div className="container mx-auto px-4">
          <nav aria-label="Menu panelu administratora" className="overflow-x-auto py-2">
            <div className="flex min-w-max items-center gap-1 rounded-xl bg-muted/60 p-1">
            {navigationTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors ${activeTab === tab.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
            </div>
          </nav>
        </div>
      </div>

      <main className="container mx-auto px-4 py-8">
        {devToolsEnabled && !isDbAdmin && user && (
          <div className="mb-6 p-5 border border-amber-200 bg-amber-50/60 rounded-xl space-y-4 shadow-sm max-w-4xl">
            <div className="flex items-start gap-3">
              <span className="text-xl">⚠️</span>
              <div className="space-y-1">
                <h3 className="font-semibold text-amber-900">Brak pełnej konfiguracji administratora i grywalizacji w bazie danych</h3>
                <p className="text-sm text-amber-800 leading-relaxed">
                  Twój adres e-mail (<strong className="font-medium">{user.email}</strong>) jest zalogowany, ale Twoje konto nie posiada roli <code className="px-1 py-0.5 bg-amber-100 rounded text-xs font-mono text-amber-900">admin</code> w nowej bazie danych Supabase, oraz brakuje w niej tabel grywalizacji. Może to powodować błędy RLS (np. przy generowaniu danych testowych lub rejestracji kart).
                </p>
              </div>
            </div>
            <div className="space-y-2 bg-white/95 p-4 rounded-lg border border-amber-200">
              <p className="text-xs font-semibold text-amber-900 uppercase tracking-wider">
                Uruchom poniższy skrypt SQL w panelu Supabase SQL Editor, aby to naprawić (skonfiguruje on Twoją rolę oraz brakujące tabele grywalizacji, zdjęć i kategorii kart):
              </p>
              <pre className="text-[11px] font-mono p-3 bg-slate-900 text-slate-100 rounded-lg overflow-x-auto select-all">
{`-- 1. Nadanie roli admina Twojemu użytkownikowi
INSERT INTO public.user_roles (user_id, role)
VALUES ('${user.id}', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;

-- 2. Tworzenie brakującej tabeli gamification_config
CREATE TABLE IF NOT EXISTS public.gamification_config (
  id integer PRIMARY KEY DEFAULT 1,
  points_per_unit integer NOT NULL DEFAULT 10,
  points_per_country integer NOT NULL DEFAULT 50,
  points_per_registration integer NOT NULL DEFAULT 100,
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

INSERT INTO public.gamification_config (id, points_per_unit, points_per_country, points_per_registration)
VALUES (1, 10, 50, 100)
ON CONFLICT (id) DO NOTHING;

-- 3. Tworzenie brakującej tabeli gamification_tiers
CREATE TABLE IF NOT EXISTS public.gamification_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  min_points integer NOT NULL UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

INSERT INTO public.gamification_tiers (name, min_points) VALUES
('Zwiadowca', 0),
('Ambasador', 500),
('Misjonarz Kultury', 2500),
('Legenda Podróżówki', 7500)
ON CONFLICT (name) DO NOTHING;

-- 4. Tworzenie brakującej tabeli card_design_images
CREATE TABLE IF NOT EXISTS public.card_design_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_design_id uuid NOT NULL REFERENCES public.card_designs(id) ON DELETE CASCADE,
  url text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS card_design_images_design_idx ON public.card_design_images(card_design_id, sort_order);

-- 5. Tworzenie i uzupełnianie tabeli categories
CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  icon_url text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

INSERT INTO public.categories (id, name, slug, icon_url, sort_order) VALUES
('d58de85b-ab9a-48c3-9315-f7bd76a404c6', 'Natura', 'natura', NULL, 10),
('0f367839-8b75-4a73-b8bd-94017c810cbe', 'Architektura', 'architektura', NULL, 20),
('910aa227-07a3-49fe-a007-9fdf01170038', 'Sztuka', 'sztuka', NULL, 30),
('8889ecf8-fbdd-42ba-bc36-587177f6365c', 'Wydarzenia', 'wydarzenia', NULL, 40),
('8c15c469-9579-40c6-98b6-722ec0d59715', 'Postacie', 'postacie', NULL, 50)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  icon_url = EXCLUDED.icon_url,
  sort_order = EXCLUDED.sort_order;

-- 5b. Dodanie kolumny category_id do card_designs i aktualizacja unikalnego klucza oraz walut/cen
ALTER TABLE public.card_designs ADD COLUMN IF NOT EXISTS category_id uuid NULL REFERENCES public.categories(id) ON DELETE SET NULL;
ALTER TABLE public.card_designs ADD COLUMN IF NOT EXISTS price_grosze integer NOT NULL DEFAULT 0;
ALTER TABLE public.card_designs ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'PLN';
ALTER TABLE public.card_designs ADD COLUMN IF NOT EXISTS description text;
CREATE INDEX IF NOT EXISTS idx_card_designs_category_id ON public.card_designs(category_id);

DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.card_designs'::regclass
    AND contype = 'u'
    AND (
      SELECT array_agg(attname::text ORDER BY attname::text)
      FROM unnest(conkey) k
      JOIN pg_attribute a ON a.attrelid = 'public.card_designs'::regclass AND a.attnum = k
    ) = ARRAY['country_id','view_no']
  LIMIT 1;

  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.card_designs DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE public.card_designs DROP CONSTRAINT IF EXISTS card_designs_country_category_view_uniq;
ALTER TABLE public.card_designs ADD CONSTRAINT card_designs_country_category_view_uniq UNIQUE (country_id, category_id, view_no);

-- 6. Nadanie wymaganych uprawnień
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gamification_config TO authenticated;
GRANT ALL ON public.gamification_config TO service_role;
GRANT SELECT ON public.gamification_config TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gamification_tiers TO authenticated;
GRANT ALL ON public.gamification_tiers TO service_role;
GRANT SELECT ON public.gamification_tiers TO anon;

GRANT SELECT ON public.card_design_images TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.card_design_images TO authenticated;
GRANT ALL ON public.card_design_images TO service_role;

GRANT SELECT ON public.categories TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;

-- 7. Włączenie RLS i dodanie polityk bezpieczeństwa
ALTER TABLE public.card_design_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view images of active designs" ON public.card_design_images;
CREATE POLICY "Public can view images of active designs"
  ON public.card_design_images FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.card_designs cd
      WHERE cd.id = card_design_images.card_design_id
        AND cd.active = true
    )
  );

DROP POLICY IF EXISTS "Admins can manage card_design_images" ON public.card_design_images;
CREATE POLICY "Admins can manage card_design_images"
  ON public.card_design_images FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Categories are viewable by everyone" ON public.categories;
CREATE POLICY "Categories are viewable by everyone"
  ON public.categories FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins manage categories" ON public.categories;
CREATE POLICY "Admins manage categories"
  ON public.categories FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));`}
              </pre>
              <p className="text-xs text-amber-700 leading-relaxed">
                Przejdź do: <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" className="underline hover:text-amber-900 font-medium">Supabase Dashboard</a> → Wybierz swój projekt (<strong>{import.meta.env.VITE_SUPABASE_PROJECT_ID || "xiqhaiyieisgemqopxfw"}</strong>) → SQL Editor → Wklej powyższy skrypt i kliknij <strong>Run</strong>. Po wykonaniu zapytania odśwież tę stronę.
              </p>
            </div>
          </div>
        )}

        {activeTab === "overview" && (
          <div className="space-y-6">
            <div>
              <p className="mb-2 text-sm font-medium text-primary">Centrum operacyjne</p>
              <h2 className="font-display text-2xl font-bold text-foreground">Przepływ POD</h2>
              <p className="mt-1 text-muted-foreground">Pracuj w kolejności od wzoru do wysyłki. Jednostki i kody QR powstają dopiero po opłaceniu zamówienia.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              {workflowCards.map((card) => (
                <button
                  key={card.id}
                  onClick={() => setActiveTab(card.id)}
                  className="group rounded-2xl border border-border/70 bg-card p-5 text-left shadow-soft transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-card"
                >
                  <div className="mb-4 flex items-start justify-between">
                    <span className="text-xs font-bold tracking-wider text-primary">{card.step}</span>
                    <card.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="font-display text-lg font-semibold">{card.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{card.description}</p>
                </button>
              ))}
            </div>
            <h3 className="pt-2 font-display text-xl font-bold text-foreground">Stan platformy</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {overviewCards.map((s) => (
                <motion.div
                  key={s.label}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-card rounded-xl p-4 shadow-soft"
                >
                  <s.icon className={`w-5 h-5 ${s.color} mb-2`} />
                  <p className={`font-display text-2xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "dev-tools" && <AdminDevTools />}
        {activeTab === "map" && <AdminGlobalMap />}
        {activeTab === "countries" && <AdminCountries />}
        {activeTab === "card-designs" && <AdminCardDesigns />}
        {activeTab === "authors" && <AdminAuthors />}
        {activeTab === "products" && <AdminProducts />}
        {activeTab === "categories" && <AdminCategories />}
        {activeTab === "inventory" && <AdminInventory />}
        {activeTab === "orders" && <AdminOrders />}
        {activeTab === "shipments" && <AdminShipments />}
        {activeTab === "qr-jobs" && <AdminQrJobs />}
        {activeTab === "registrations" && <AdminRegistrations />}
        {activeTab === "event-log" && <AdminEventLog />}
        {activeTab === "gamification" && <AdminGamification />}
        {activeTab === "fiscal" && <AdminFiscalFailures />}
        {activeTab === "integrations" && <AdminIntegrations />}
        {activeTab === "lab" && <AdminLab />}
      </main>
    </div>
  );
};

export default AdminPanel;
