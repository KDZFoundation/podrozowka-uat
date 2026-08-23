import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

type Artifact = {
  collection: string;
  documents: Array<{ id: string; [key: string]: unknown }>;
};

const artifactFiles = [
  "countries.firestore.json",
  "categories.firestore.json",
  "card_language_templates.firestore.json",
  "card_designs.firestore.json",
  "inventory_locations.firestore.json",
  "stock_production_orders.firestore.json",
  "stock_batches.firestore.json",
  "inventory_units.firestore.json",
  "inventory_movements.firestore.json",
  "inventory_unit_events.firestore.json",
  "qr_print_jobs.firestore.json",
  "qr_print_job_items.firestore.json",
  "pod_production_batches.firestore.json",
  "pod_production_batch_orders.firestore.json",
];

const dryRun = process.argv.includes("--dry-run");
const confirmed = process.argv.includes("--confirm=IMPORT_PODROZOWKA_UAT");

async function main() {
  const artifacts = await Promise.all(
    artifactFiles.map(async (file) => JSON.parse(await readFile(resolve(process.cwd(), "migration-data/generated", file), "utf8")) as Artifact)
  );
  const total = artifacts.reduce((sum, artifact) => sum + artifact.documents.length, 0);
  console.table(artifacts.map((artifact) => ({ collection: artifact.collection, documents: artifact.documents.length })));
  console.log(`Łącznie: ${total} dokumentów.`);

  if (dryRun) return;
  if (!confirmed) {
    throw new Error("Import zablokowany. Uruchom z --confirm=IMPORT_PODROZOWKA_UAT po sprawdzeniu dry-run.");
  }

  const app = getApps()[0] ?? initializeApp({ credential: applicationDefault(), projectId: "podrozowka" });
  const firestore = getFirestore(app, "ai-studio-podrozowkauat-e1d9b39b-c759-477c-98ea-34396a1afd2f");

  for (const artifact of artifacts) {
    for (let index = 0; index < artifact.documents.length; index += 400) {
      const batch = firestore.batch();
      for (const document of artifact.documents.slice(index, index + 400)) {
        if (!document.id) throw new Error(`${artifact.collection}: dokument bez id.`);
        batch.set(firestore.collection(artifact.collection).doc(document.id), document, { merge: true });
      }
      await batch.commit();
    }
    console.log(`Zaimportowano ${artifact.documents.length} dokumentów do ${artifact.collection}.`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
