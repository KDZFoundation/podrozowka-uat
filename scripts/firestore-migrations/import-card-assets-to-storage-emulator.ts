import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";

interface CardDesignExport {
  documents: Array<{
    id: string;
    image_front_storage_path?: string;
  }>;
}

const args = process.argv.slice(2);
const inputIndex = args.indexOf("--input");
const input = inputIndex >= 0 ? args[inputIndex + 1] : "migration-data/generated/card_designs.firestore.json";
const assetsDirectory = "migration-data/generated/card-design-assets";

const contentTypeByExtension: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

async function main() {
  if (!process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
    throw new Error("Import zablokowany: ustaw FIREBASE_STORAGE_EMULATOR_HOST dla lokalnego emulatora Storage.");
  }

  const payload = JSON.parse(await readFile(resolve(process.cwd(), input), "utf8")) as CardDesignExport;
  const documents = payload.documents.filter((document) => document.image_front_storage_path);
  if (documents.length === 0) throw new Error("Nie znaleziono obrazów do importu.");

  const projectId = process.env.GCLOUD_PROJECT || "podrozowka";
  const app = getApps()[0] ?? initializeApp({
    credential: applicationDefault(),
    projectId,
    storageBucket: "podrozowka.firebasestorage.app",
  });
  const bucket = getStorage(app).bucket();

  for (const document of documents) {
    const storagePath = document.image_front_storage_path!;
    const localFile = resolve(process.cwd(), assetsDirectory, storagePath);
    const extension = storagePath.split(".").pop()?.toLowerCase() || "jpg";
    await bucket.file(storagePath).save(await readFile(localFile), {
      contentType: contentTypeByExtension[extension] || "application/octet-stream",
      resumable: false,
      metadata: { metadata: { card_design_id: document.id, migration_source: "supabase" } },
    });
  }

  console.log(`Zaimportowano lokalnie ${documents.length} obrazów do Firebase Storage Emulator.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
