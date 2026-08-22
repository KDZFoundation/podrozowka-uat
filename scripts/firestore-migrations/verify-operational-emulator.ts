import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const collections = [
  "inventory_locations", "stock_production_orders", "stock_batches", "inventory_units",
  "inventory_movements", "inventory_unit_events", "qr_print_jobs", "qr_print_job_items",
  "pod_production_batches", "pod_production_batch_orders",
] as const;

async function main() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Ustaw FIRESTORE_EMULATOR_HOST.");
  const source = JSON.parse(await readFile(resolve(process.cwd(), "migration-data/supabase-operational-export.json"), "utf8")) as {
    collections: Partial<Record<(typeof collections)[number], unknown[]>>;
  };
  const app = getApps()[0] ?? initializeApp({ credential: applicationDefault(), projectId: process.env.GCLOUD_PROJECT || "podrozowka" });
  const firestore = getFirestore(app, process.env.FIRESTORE_DATABASE_ID || "ai-studio-podrozowkauat-e1d9b39b-c759-477c-98ea-34396a1afd2f");
  const result = [] as Array<{ collection: string; expected: number; actual: number; status: string }>;
  for (const collection of collections) {
    const snapshot = await firestore.collection(collection).get();
    const expected = source.collections[collection]?.length || 0;
    result.push({ collection, expected, actual: snapshot.size, status: snapshot.size === expected ? "OK" : "BŁĄD" });
  }
  console.table(result);
  if (result.some((row) => row.status !== "OK")) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
