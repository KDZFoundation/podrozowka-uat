import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

interface CardDesignExport {
  collection: "card_designs";
  documents: Array<{ id: string; [key: string]: unknown }>;
}

const args = process.argv.slice(2);
const inputIndex = args.indexOf("--input");
const input = inputIndex >= 0
  ? args[inputIndex + 1]
  : "migration-data/generated/card_designs.firestore.json";
const checkOnly = args.includes("--check");

async function main() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("Import zablokowany: ustaw FIRESTORE_EMULATOR_HOST dla lokalnego emulatora Firestore.");
  }

  const payload = JSON.parse(await readFile(resolve(process.cwd(), input), "utf8")) as CardDesignExport;
  if (payload.collection !== "card_designs" || !Array.isArray(payload.documents)) {
    throw new Error("Nieprawidłowy artefakt migracji card_designs.");
  }

  const invalid = payload.documents.filter((design) => !design.id || !design.country_id || typeof design.price_grosze !== "number");
  if (invalid.length > 0) {
    throw new Error(`Walidacja zatrzymała import: ${invalid.length} dokumentów nie ma wymaganych pól.`);
  }

  console.table([{
    source: input,
    target: "Firestore emulator / card_designs",
    documents: payload.documents.length,
    mode: checkOnly ? "walidacja" : "import lokalny",
  }]);

  if (checkOnly) return;

  const projectId = process.env.GCLOUD_PROJECT || "podrozowka";
  const databaseId = process.env.FIRESTORE_DATABASE_ID || "ai-studio-podrozowkauat-e1d9b39b-c759-477c-98ea-34396a1afd2f";
  const app = getApps()[0] ?? initializeApp({ credential: applicationDefault(), projectId });
  const firestore = getFirestore(app, databaseId);

  for (let index = 0; index < payload.documents.length; index += 400) {
    const batch = firestore.batch();
    for (const design of payload.documents.slice(index, index + 400)) {
      batch.set(firestore.collection("card_designs").doc(design.id), design, { merge: true });
    }
    await batch.commit();
  }

  console.log(`Zaimportowano lokalnie ${payload.documents.length} dokumentów card_designs.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
