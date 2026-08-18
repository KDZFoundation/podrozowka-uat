import { doc, writeBatch, setDoc } from "firebase/firestore";
import { db, isFirebaseConfigured } from "../config";
import { supabase } from "@/integrations/supabase/client";

export interface MigrationTableResult {
  table: string;
  count: number;
  status: "success" | "skipped" | "error";
  error?: string;
}

export interface MigrationOverallResult {
  success: boolean;
  totalMigrated: number;
  tables: MigrationTableResult[];
  startedAt: string;
  finishedAt: string;
}

export type MigrationProgressCallback = (currentTable: string, index: number, total: number, message: string) => void;

// Helper to remove undefined fields and clamp huge strings which Firestore rejects
function sanitizeForFirestore(obj: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val === undefined) {
      continue;
    }
    if (typeof val === "string" && val.length > 800000) {
      // Truncate huge raw strings > 800KB to fit Firestore 1MB doc limit
      clean[key] = val.substring(0, 800000);
    } else if (val !== null && typeof val === "object" && !Array.isArray(val) && !(val instanceof Date)) {
      clean[key] = sanitizeForFirestore(val as Record<string, unknown>);
    } else {
      clean[key] = val;
    }
  }
  return clean;
}

const TABLES_TO_MIGRATE = [
  { table: "categories", collection: "categories", idField: "id" },
  { table: "countries", collection: "countries", idField: "id" },
  { table: "languages", collection: "languages", idField: "id" },
  { table: "authors", collection: "authors", idField: "id" },
  { table: "card_designs", collection: "card_designs", idField: "id" },
  { table: "card_design_images", collection: "card_design_images", idField: "id" },
  { table: "card_languages", collection: "card_languages", idField: "id" },
  { table: "shipping_methods", collection: "shipping_methods", idField: "id" },
  { table: "discount_codes", collection: "discount_codes", idField: "id" },
  { table: "news", collection: "news", idField: "id" },
  { table: "feature_flags", collection: "feature_flags", idField: "id" },
  { table: "orders", collection: "orders", idField: "id" },
  { table: "order_items", collection: "order_items", idField: "id" },
  { table: "postcard_batches", collection: "postcard_batches", idField: "id" },
  { table: "postcard_codes", collection: "postcard_codes", idField: "id" },
  { table: "recipient_registrations", collection: "recipient_registrations", idField: "id" },
  { table: "postcard_scans", collection: "postcard_scans", idField: "id" },
  { table: "profiles", collection: "profiles", idField: "id" },
  { table: "user_roles", collection: "user_roles", idField: "id" },
  { table: "gamification_config", collection: "gamification_config", idField: "id" },
  { table: "gamification_tiers", collection: "gamification_tiers", idField: "id" },
];

export async function migrateFromSupabaseToFirestore(
  onProgress?: MigrationProgressCallback
): Promise<MigrationOverallResult> {
  const startedAt = new Date().toISOString();
  const tablesResult: MigrationTableResult[] = [];
  let totalMigrated = 0;

  if (!isFirebaseConfigured) {
    throw new Error("Firebase Firestore nie jest skonfigurowany w aplikacji.");
  }

  const totalTables = TABLES_TO_MIGRATE.length;

  for (let i = 0; i < totalTables; i++) {
    const { table, collection: collectionName, idField } = TABLES_TO_MIGRATE[i];
    
    if (onProgress) {
      onProgress(table, i + 1, totalTables, `Pobieranie danych z tabeli ${table}...`);
    }

    try {
      // Dynamic query to Supabase table
      const queryBuilder = supabase.from(table as keyof typeof supabase) as unknown as {
        select: (columns: string) => Promise<{
          data: Record<string, unknown>[] | null;
          error: { message: string } | null;
        }>;
      };
      const { data, error } = await queryBuilder.select("*");

      if (error) {
        // Table might not exist or no permission
        console.warn(`[Migration] Błąd pobierania tabeli ${table}:`, error.message);
        tablesResult.push({
          table,
          count: 0,
          status: "skipped",
          error: error.message,
        });
        continue;
      }

      const rows = (data || []) as Record<string, unknown>[];
      if (rows.length === 0) {
        tablesResult.push({
          table,
          count: 0,
          status: "success",
        });
        continue;
      }

      if (onProgress) {
        onProgress(table, i + 1, totalTables, `Zapisywanie ${rows.length} rekordów do Firestore (${collectionName})...`);
      }

      // Safe chunk size (20 items per batch to avoid Firestore 10MB payload limit)
      const chunkSize = 20;
      let tableSuccessCount = 0;

      for (let c = 0; c < rows.length; c += chunkSize) {
        const chunk = rows.slice(c, c + chunkSize);

        try {
          // Try batch write first
          const batch = writeBatch(db);
          for (const row of chunk) {
            const docId = String(row[idField] || row.id || `${table}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
            const docRef = doc(db, collectionName, docId);
            const cleanData = sanitizeForFirestore({
              ...row,
              _migrated_from: "supabase",
              _migrated_at: new Date().toISOString(),
            });
            batch.set(docRef, cleanData, { merge: true });
          }
          await batch.commit();
          tableSuccessCount += chunk.length;
        } catch (batchError) {
          console.warn(`[Migration] Batch error dla ${table}, przełączam na zapis indywidualny:`, batchError);
          // Fallback to individual setDoc for each document in the chunk
          for (const row of chunk) {
            try {
              const docId = String(row[idField] || row.id || `${table}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
              const docRef = doc(db, collectionName, docId);
              const cleanData = sanitizeForFirestore({
                ...row,
                _migrated_from: "supabase",
                _migrated_at: new Date().toISOString(),
              });
              await setDoc(docRef, cleanData, { merge: true });
              tableSuccessCount++;
            } catch (singleErr) {
              console.error(`[Migration] Błąd zapisu pojedynczego dokumentu ${table}:`, singleErr);
            }
          }
        }
      }

      totalMigrated += tableSuccessCount;
      tablesResult.push({
        table,
        count: tableSuccessCount,
        status: tableSuccessCount > 0 ? "success" : "skipped",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[Migration] Krytyczny błąd migracji tabeli ${table}:`, msg);
      tablesResult.push({
        table,
        count: 0,
        status: "error",
        error: msg,
      });
    }
  }

  const finishedAt = new Date().toISOString();
  return {
    success: tablesResult.some((t) => t.status === "success" && t.count > 0),
    totalMigrated,
    tables: tablesResult,
    startedAt,
    finishedAt,
  };
}

