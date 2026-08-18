/**
 * Skrypt migracji danych z Supabase do Google Firebase / Cloud Firestore
 *
 * Uruchomienie:
 * npx tsx scripts/migrate-supabase-to-firebase.ts
 *
 * Wymaga zmiennych środowiskowych:
 * SUPABASE_URL=https://nqqephusxnxzzkfulfae.supabase.co
 * SUPABASE_SERVICE_ROLE_KEY=...
 * FIREBASE_SERVICE_ACCOUNT_KEY_PATH=... (lub standardowe Google Application Default Credentials)
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

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
    card_language_templates: RecordItem[];
    users: RecordItem[];
    orders: RecordItem[];
    inventory_units: RecordItem[];
    recipient_registrations: RecordItem[];
    gamification_tiers: RecordItem[];
  };
}

async function exportSupabaseTable(tableName: string): Promise<RecordItem[]> {
  try {
    const { data, error } = await supabase.from(tableName).select("*");
    if (error) {
      console.warn(`[Supabase Export] Błąd odczytu tabeli ${tableName}: ${error.message}`);
      return [];
    }
    console.log(`[Supabase Export] Pobrano ${data?.length || 0} rekordów z tabeli: ${tableName}`);
    return (data || []) as RecordItem[];
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Supabase Export] Wyjątek podczas eksportu ${tableName}:`, message);
    return [];
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
  const languageTemplates = await exportSupabaseTable("card_language_templates");
  const profiles = await exportSupabaseTable("profiles");
  const orders = await exportSupabaseTable("orders");
  const orderItems = await exportSupabaseTable("order_items");
  const inventoryUnits = await exportSupabaseTable("inventory_units");
  const registrations = await exportSupabaseTable("recipient_registrations");
  const gamificationTiers = await exportSupabaseTable("gamification_tiers");

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
      card_language_templates: languageTemplates,
      users: profiles,
      orders: nestedOrders,
      inventory_units: inventoryUnits,
      recipient_registrations: registrations,
      gamification_tiers: gamificationTiers,
    },
  };

  const outputDir = path.resolve(process.cwd(), "migration-data");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, "firestore-import-payload.json");
  fs.writeFileSync(outputPath, JSON.stringify(exportPayload, null, 2), "utf-8");

  console.log(`\n✅ Pomyślnie wygenerowano plik wsadowy migracji Firestore: ${outputPath}`);
  console.log("Statystyki wyeksportowanych obiektów:");
  console.log(` - Kraje: ${countries.length}`);
  console.log(` - Kategorie: ${categories.length}`);
  console.log(` - Autorzy: ${authors.length}`);
  console.log(` - Wzory kartek: ${cardDesigns.length}`);
  console.log(` - Profile: ${profiles.length}`);
  console.log(` - Zamówienia: ${nestedOrders.length}`);
  console.log(` - Jednostki magazynowe: ${inventoryUnits.length}`);
  console.log(` - Rejestracje: ${registrations.length}`);
}

runMigration().catch((err) => {
  console.error("Błąd krytyczny skryptu migracji:", err);
});
