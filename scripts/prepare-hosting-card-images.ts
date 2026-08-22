import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

type CardDesign = { id: string; image_front_url?: string | null };
type ExportPayload = { collections?: { card_designs?: CardDesign[] } };

const sourceFile = "migration-data/supabase-catalog-export.json";
const assetRoot = "migration-data/generated/card-design-assets";
const publicRoot = "public/card-designs";

async function main() {
  const payload = JSON.parse(await readFile(resolve(process.cwd(), sourceFile), "utf8")) as ExportPayload;
  const designs = payload.collections?.card_designs || [];
  let processed = 0;

  for (const design of designs) {
    if (!design.id || !design.image_front_url?.startsWith("data:")) continue;
    const input = resolve(process.cwd(), assetRoot, "card-designs", design.id, "front.jpg");
    const destination = resolve(process.cwd(), publicRoot, design.id);
    await mkdir(destination, { recursive: true });

    await sharp(input)
      .rotate()
      .resize({ width: 1440, height: 1080, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82, effort: 5 })
      .toFile(resolve(destination, "front.webp"));

    await sharp(input)
      .rotate()
      .resize({ width: 640, height: 480, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 70, effort: 5 })
      .toFile(resolve(destination, "thumb.webp"));
    processed++;
  }

  console.log(`Przygotowano ${processed} zestawów obrazów dla Firebase Hosting.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
