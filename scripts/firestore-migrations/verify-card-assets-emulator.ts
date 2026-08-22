import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

async function main() {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
    throw new Error("Ustaw FIRESTORE_EMULATOR_HOST oraz FIREBASE_STORAGE_EMULATOR_HOST.");
  }

  const app = getApps()[0] ?? initializeApp({
    credential: applicationDefault(),
    projectId: process.env.GCLOUD_PROJECT || "podrozowka",
    storageBucket: "podrozowka.firebasestorage.app",
  });
  const firestore = getFirestore(app, process.env.FIRESTORE_DATABASE_ID || "ai-studio-podrozowkauat-e1d9b39b-c759-477c-98ea-34396a1afd2f");
  const bucket = getStorage(app).bucket();
  const designs = await firestore.collection("card_designs").get();
  const rows = await Promise.all(designs.docs.map(async (design) => {
    const path = design.data().image_front_storage_path as string | undefined;
    const exists = path ? (await bucket.file(path).exists())[0] : false;
    return { id: design.id, storagePath: path || "brak", exists: exists ? "OK" : "BRAK" };
  }));

  console.table(rows);
  if (rows.some((row) => row.exists !== "OK")) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
