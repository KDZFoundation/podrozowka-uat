import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

interface CollectionExport {
  collection: string;
  documents: Array<{ id: string; [key: string]: unknown }>;
}

const args = process.argv.slice(2);
const inputIndex = args.indexOf("--input");
const input = inputIndex >= 0 ? args[inputIndex + 1] : "";

async function main() {
  if (!input) throw new Error("Podaj plik wejściowy: --input migration-data/generated/<kolekcja>.firestore.json");
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("Import zablokowany: ustaw FIRESTORE_EMULATOR_HOST dla lokalnego emulatora Firestore.");
  }

  const payload = JSON.parse(await readFile(resolve(process.cwd(), input), "utf8")) as CollectionExport;
  if (!payload.collection || !Array.isArray(payload.documents) || payload.documents.some((document) => !document.id)) {
    throw new Error("Nieprawidłowy artefakt migracji kolekcji.");
  }

  const app = getApps()[0] ?? initializeApp({ credential: applicationDefault(), projectId: process.env.GCLOUD_PROJECT || "podrozowka" });
  const firestore = getFirestore(app, process.env.FIRESTORE_DATABASE_ID || "ai-studio-podrozowkauat-e1d9b39b-c759-477c-98ea-34396a1afd2f");
  for (let index = 0; index < payload.documents.length; index += 400) {
    const batch = firestore.batch();
    for (const document of payload.documents.slice(index, index + 400)) {
      batch.set(firestore.collection(payload.collection).doc(document.id), document, { merge: true });
    }
    await batch.commit();
  }
  console.log(`Zaimportowano lokalnie ${payload.documents.length} dokumentów do ${payload.collection}.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
