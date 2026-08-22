import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const expected = {
  countries: 228,
  categories: 5,
  card_language_templates: 25,
  card_designs: 5,
} as const;

async function main() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("Weryfikacja zablokowana: ustaw FIRESTORE_EMULATOR_HOST.");
  }

  const app = getApps()[0] ?? initializeApp({ credential: applicationDefault(), projectId: process.env.GCLOUD_PROJECT || "podrozowka" });
  const firestore = getFirestore(app, process.env.FIRESTORE_DATABASE_ID || "ai-studio-podrozowkauat-e1d9b39b-c759-477c-98ea-34396a1afd2f");
  const result: Array<{ collection: string; expected: number; actual: number; status: string }> = [];

  for (const [collection, count] of Object.entries(expected)) {
    const snapshot = await firestore.collection(collection).get();
    result.push({ collection, expected: count, actual: snapshot.size, status: snapshot.size === count ? "OK" : "BŁĄD" });
  }

  console.table(result);
  if (result.some((item) => item.status !== "OK")) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
