import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const collections = [
  "countries",
  "categories",
  "card_language_templates",
  "card_designs",
  "inventory_locations",
  "stock_production_orders",
  "stock_batches",
  "inventory_units",
  "inventory_movements",
  "inventory_unit_events",
  "qr_print_jobs",
  "qr_print_job_items",
] as const;

async function main() {
  const app = getApps()[0] ?? initializeApp({ credential: applicationDefault(), projectId: "podrozowka" });
  const firestore = getFirestore(app, "ai-studio-podrozowkauat-e1d9b39b-c759-477c-98ea-34396a1afd2f");
  const result = [] as Array<{ collection: string; documents: number; examples: string }>;
  for (const collection of collections) {
    const snapshot = await firestore.collection(collection).get();
    result.push({
      collection,
      documents: snapshot.size,
      examples: snapshot.docs.slice(0, 3).map((document) => document.id).join(", ") || "—",
    });
  }
  console.table(result);
  const designs = await firestore.collection("card_designs").get();
  console.table(designs.docs.map((document) => {
    const data = document.data();
    return {
      id: document.id,
      title: data.title ?? "",
      active: data.active ?? data.is_active ?? null,
      price_grosze: data.price_grosze ?? null,
      price_pln: data.price_pln ?? null,
      field_names: Object.keys(data).sort().join(", "),
    };
  }));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
