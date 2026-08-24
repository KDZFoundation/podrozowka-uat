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
  const { user, isLoading: authLoading, isAdmin } = useAuth();
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
    try {
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
    } finally {
      setIsLoading(false);
    }
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
