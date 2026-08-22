/**
 * Skrypt migracji danych z Supabase do Google Firebase / Cloud Firestore
 *
 * Uruchomienie (tylko lokalny eksport, bez zapisu do Firebase):
 * .\\node_modules\\.bin\\tsx.cmd scripts/migrate-supabase-to-firebase.ts --catalog-only
 *
 * Wymaga zmiennych środowiskowych:
 * SUPABASE_URL=https://nqqephusxnxzzkfulfae.supabase.co
 * SUPABASE_SERVICE_ROLE_KEY=...
 * FIREBASE_SERVICE_ACCOUNT_KEY_PATH=... (lub standardowe Google Application Default Credentials)
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

function loadLocalEnvironment() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;

  for (const rawLine of fs.readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

loadLocalEnvironment();

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  "https://nqqephusxnxzzkfulfae.supabase.co";

const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpcWhhaXlpZWlzZ2VtcW9weGZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM4OTgwODgsImV4cCI6MjA5OTQ3NDA4OH0.k8_3QvkEz33nwhowVDyBYxlSnh0ymK4thGvyw1zoo0g";

if (!SUPABASE_KEY) {
  console.warn("⚠️ Brak klucza SUPABASE_SERVICE_ROLE_KEY / VITE_SUPABASE_PUBLISHABLE_KEY. Uruchamianie w trybie generowania szablonów migracji.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

type RecordItem = Record<string, unknown>;

interface MigrationExport {
  exportedAt: string;
  sourceUrl: string;
  collections: {
    countries: RecordItem[];
    categories: RecordItem[];
    authors: RecordItem[];
    card_designs: RecordItem[];
    card_design_images: RecordItem[];
    card_language_templates: RecordItem[];
    users: RecordItem[];
    orders: RecordItem[];
    inventory_units: RecordItem[];
    inventory_locations: RecordItem[];
    stock_batches: RecordItem[];
    stock_production_orders: RecordItem[];
    inventory_movements: RecordItem[];
    inventory_unit_events: RecordItem[];
    qr_print_jobs: RecordItem[];
    qr_print_job_items: RecordItem[];
    pod_production_batches: RecordItem[];
    pod_production_batch_orders: RecordItem[];
    recipient_registrations: RecordItem[];
    gamification_tiers: RecordItem[];
  };
}

const catalogOnly = process.argv.includes("--catalog-only");
const outputArgumentIndex = process.argv.indexOf("--output");
const outputFileName = outputArgumentIndex >= 0
  ? process.argv[outputArgumentIndex + 1]
  : `supabase-export-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;

async function exportSupabaseTable(tableName: string): Promise<RecordItem[]> {
  try {
    const { data, error } = await supabase.from(tableName).select("*");
    if (error) {
      throw new Error(`Nie można odczytać tabeli ${tableName}: ${error.message}`);
    }
    console.log(`[Supabase Export] Pobrano ${data?.length || 0} rekordów z tabeli: ${tableName}`);
    return (data || []) as RecordItem[];
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`[Supabase Export] ${message}`);
  }
}

async function runMigration() {
  console.log("=================================================");
  console.log(" Rozpoczynanie migracji Supabase -> Firestore");
  console.log(` Źródło: ${SUPABASE_URL}`);
  console.log("=================================================");

  const countries = await exportSupabaseTable("countries");
  const categories = await exportSupabaseTable("categories");
  const authors = await exportSupabaseTable("authors");
  const cardDesigns = await exportSupabaseTable("card_designs");
  const cardDesignImages = await exportSupabaseTable("card_design_images");
  const languageTemplates = await exportSupabaseTable("card_language_templates");
  const profiles = catalogOnly ? [] : await exportSupabaseTable("profiles");
  const orders = catalogOnly ? [] : await exportSupabaseTable("orders");
  const orderItems = catalogOnly ? [] : await exportSupabaseTable("order_items");
  const inventoryUnits = catalogOnly ? [] : await exportSupabaseTable("inventory_units");
  const inventoryLocations = catalogOnly ? [] : await exportSupabaseTable("inventory_locations");
  const stockBatches = catalogOnly ? [] : await exportSupabaseTable("stock_batches");
  const stockProductionOrders = catalogOnly ? [] : await exportSupabaseTable("stock_production_orders");
  const inventoryMovements = catalogOnly ? [] : await exportSupabaseTable("inventory_movements");
  const inventoryUnitEvents = catalogOnly ? [] : await exportSupabaseTable("inventory_unit_events");
  const qrPrintJobs = catalogOnly ? [] : await exportSupabaseTable("qr_print_jobs");
  const qrPrintJobItems = catalogOnly ? [] : await exportSupabaseTable("qr_print_job_items");
  const podProductionBatches = catalogOnly ? [] : await exportSupabaseTable("pod_production_batches");
  const podProductionBatchOrders = catalogOnly ? [] : await exportSupabaseTable("pod_production_batch_orders");
  const registrations = catalogOnly ? [] : await exportSupabaseTable("recipient_registrations");
  const gamificationTiers = catalogOnly ? [] : await exportSupabaseTable("gamification_tiers");

  // Transformacja zamówień (zagnieżdżenie order_items w orders)
  const nestedOrders = orders.map((order) => {
    const items = orderItems.filter((item) => item.order_id === order.id);
    return {
      ...order,
      items: items.map((i) => ({
        card_design_id: i.card_design_id,
        title: i.title || "Pocztówka Podróżówka",
        quantity: i.quantity,
        unit_price_pln: i.unit_price_pln,
        total_price_pln: i.total_price_pln,
        language_code: i.selected_language_code,
      })),
    };
  });

  const exportPayload: MigrationExport = {
    exportedAt: new Date().toISOString(),
    sourceUrl: SUPABASE_URL,
    collections: {
      countries,
      categories,
      authors,
      card_designs: cardDesigns,
      card_design_images: cardDesignImages,
      card_language_templates: languageTemplates,
      users: profiles,
      orders: nestedOrders,
      inventory_units: inventoryUnits,
      inventory_locations: inventoryLocations,
      stock_batches: stockBatches,
      stock_production_orders: stockProductionOrders,
      inventory_movements: inventoryMovements,
      inventory_unit_events: inventoryUnitEvents,
      qr_print_jobs: qrPrintJobs,
      qr_print_job_items: qrPrintJobItems,
      pod_production_batches: podProductionBatches,
      pod_production_batch_orders: podProductionBatchOrders,
      recipient_registrations: registrations,
      gamification_tiers: gamificationTiers,
    },
  };

  const outputDir = path.resolve(process.cwd(), "migration-data");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, outputFileName);
  fs.writeFileSync(outputPath, JSON.stringify(exportPayload, null, 2), "utf-8");

  console.log(`\n✅ Pomyślnie wygenerowano plik wsadowy migracji Firestore: ${outputPath}`);
  console.log("Statystyki wyeksportowanych obiektów:");
  console.log(` - Kraje: ${countries.length}`);
  console.log(` - Kategorie: ${categories.length}`);
  console.log(` - Autorzy: ${authors.length}`);
  console.log(` - Wzory kartek: ${cardDesigns.length}`);
  console.log(` - Zdjęcia galerii wzorów: ${cardDesignImages.length}`);
  console.log(` - Profile: ${profiles.length}`);
  console.log(` - Zamówienia: ${nestedOrders.length}`);
  console.log(` - Jednostki magazynowe: ${inventoryUnits.length}`);
  console.log(` - Lokalizacje: ${inventoryLocations.length}`);
  console.log(` - Partie magazynowe: ${stockBatches.length}`);
  console.log(` - Zlecenia magazynowe: ${stockProductionOrders.length}`);
  console.log(` - Ruchy magazynowe: ${inventoryMovements.length}`);
  console.log(` - Zdarzenia jednostek: ${inventoryUnitEvents.length}`);
  console.log(` - Zlecenia QR: ${qrPrintJobs.length}`);
  console.log(` - Pozycje zleceń QR: ${qrPrintJobItems.length}`);
  console.log(` - Dzienne paczki POD: ${podProductionBatches.length}`);
  console.log(` - Rejestracje: ${registrations.length}`);
}

runMigration().catch((err) => {
  console.error("Błąd krytyczny skryptu migracji:", err);
  process.exitCode = 1;
});
