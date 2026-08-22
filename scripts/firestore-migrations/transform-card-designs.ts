import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

type JsonRecord = Record<string, unknown>;

interface SupabaseDesign extends JsonRecord {
  id: string;
  country_id: string;
  category_id?: string | null;
  author_id?: string | null;
  title?: string | null;
  description?: string | null;
  language_code?: string | null;
  view_no?: number | null;
  thank_you_text?: string | null;
  back_qr_label?: string | null;
  photo_author?: string | null;
  image_front_url?: string | null;
  price_grosze?: number | null;
  currency?: string | null;
  active?: boolean | null;
  crop_settings?: JsonRecord | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface SupabaseImage extends JsonRecord {
  id: string;
  card_design_id: string;
  url: string;
  sort_order?: number | null;
  alt?: string | null;
}

interface FirestoreCardDesignDocument extends Omit<SupabaseDesign, "active" | "crop_settings"> {
  active: boolean;
  currency: "PLN";
  language_code: string;
  view_no: number;
  price_grosze: number;
  crop_settings: {
    fit: "auto" | "crop";
    zoom: number;
    x: number;
    y: number;
  };
  image_front_storage_path?: string;
  images: Array<{ id: string; url: string; sort_order: number; alt: string | null }>;
  schema_version: 1;
  migration_source: "supabase";
}

interface SourcePayload {
  collections?: {
    card_designs?: SupabaseDesign[];
    card_design_images?: SupabaseImage[];
  };
  card_designs?: SupabaseDesign[];
  card_design_images?: SupabaseImage[];
}

const defaults = { fit: "auto" as const, zoom: 100, x: 50, y: 50 };

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function parseArguments(args: string[]) {
  const option = (name: string) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };

  return {
    input: option("--input") ?? "migration-data/firestore-import-payload.json",
    output: option("--output") ?? "migration-data/generated/card_designs.firestore.json",
    assetsDir: option("--assets-dir") ?? "migration-data/generated/card-design-assets",
    check: args.includes("--check"),
  };
}

function getDataUriMetadata(value: string | null | undefined) {
  if (!value?.startsWith("data:")) return null;
  const match = /^data:([^;,]+);base64,(.+)$/s.exec(value);
  if (!match) throw new Error("Nieprawidłowy format obrazu data URI.");
  const extensionByMime: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  };
  const extension = extensionByMime[match[1]];
  if (!extension) throw new Error(`Nieobsługiwany format obrazu: ${match[1]}`);
  return { mime: match[1], extension, base64: match[2] };
}

function normalizeCropSettings(value: unknown) {
  const source = value && typeof value === "object" ? (value as JsonRecord) : {};
  const numberOr = (field: string, fallback: number) =>
    typeof source[field] === "number" && Number.isFinite(source[field]) ? source[field] : fallback;

  return {
    fit: source.fit === "crop" ? "crop" as const : "auto" as const,
    zoom: Math.min(200, Math.max(100, numberOr("zoom", defaults.zoom))),
    x: Math.min(100, Math.max(0, numberOr("x", defaults.x))),
    y: Math.min(100, Math.max(0, numberOr("y", defaults.y))),
  };
}

export function transformCardDesigns(payload: SourcePayload): FirestoreCardDesignDocument[] {
  const designs = asArray<SupabaseDesign>(payload.collections?.card_designs ?? payload.card_designs);
  const images = asArray<SupabaseImage>(payload.collections?.card_design_images ?? payload.card_design_images);

  const imagesByDesign = new Map<string, SupabaseImage[]>();
  for (const image of images) {
    if (!image.card_design_id || !image.url) continue;
    imagesByDesign.set(image.card_design_id, [...(imagesByDesign.get(image.card_design_id) ?? []), image]);
  }

  return designs.map((design) => {
    if (!design.id || !design.country_id) {
      throw new Error("Każdy card_designs musi mieć id oraz country_id.");
    }

    const designImages = (imagesByDesign.get(design.id) ?? [])
      .sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0))
      .map((image) => ({
        id: image.id,
        url: image.url,
        sort_order: image.sort_order ?? 0,
        alt: image.alt ?? null,
      }));

    const frontImage = design.image_front_url ?? designImages[0]?.url ?? null;
    const frontDataUri = getDataUriMetadata(frontImage);

    return {
      ...design,
      title: design.title ?? null,
      description: design.description ?? null,
      // Firestore documents must stay below 1 MB. Base64 source files are
      // extracted locally and later uploaded to Firebase Storage.
      image_front_url: frontDataUri ? null : frontImage,
      ...(frontDataUri ? { image_front_storage_path: `card-designs/${design.id}/front.${frontDataUri.extension}` } : {}),
      language_code: design.language_code?.trim() || "pl",
      view_no: Math.max(1, Math.trunc(design.view_no ?? 1)),
      price_grosze: Math.max(0, Math.trunc(design.price_grosze ?? 0)),
      currency: "PLN",
      active: design.active !== false,
      crop_settings: normalizeCropSettings(design.crop_settings),
      images: designImages,
      schema_version: 1,
      migration_source: "supabase",
    } as FirestoreCardDesignDocument;
  });
}

async function extractFrontAssets(payload: SourcePayload, assetsDir: string) {
  const designs = asArray<SupabaseDesign>(payload.collections?.card_designs ?? payload.card_designs);
  const extracted: Array<{ id: string; path: string; bytes: number }> = [];

  for (const design of designs) {
    const asset = getDataUriMetadata(design.image_front_url);
    if (!asset || !design.id) continue;
    const relativePath = `card-designs/${design.id}/front.${asset.extension}`;
    const outputPath = resolve(process.cwd(), assetsDir, relativePath);
    await mkdir(dirname(outputPath), { recursive: true });
    const data = Buffer.from(asset.base64, "base64");
    await writeFile(outputPath, data);
    extracted.push({ id: design.id, path: relativePath, bytes: data.length });
  }

  return extracted;
}

async function main() {
  const { input, output, assetsDir, check } = parseArguments(process.argv.slice(2));
  const inputPath = resolve(process.cwd(), input);
  const outputPath = resolve(process.cwd(), output);
  const payload = JSON.parse(await readFile(inputPath, "utf8")) as SourcePayload;
  const documents = transformCardDesigns(payload);
  const dataUriCount = asArray<SupabaseDesign>(payload.collections?.card_designs ?? payload.card_designs)
    .filter((design) => design.image_front_url?.startsWith("data:")).length;

  const summary = {
    source: input,
    targetCollection: "card_designs",
    documents: documents.length,
    designsWithGallery: documents.filter((design) => design.images.length > 0).length,
    extractedImageAssets: dataUriCount,
  };

  console.table([summary]);

  if (!check) {
    const extracted = await extractFrontAssets(payload, assetsDir);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify({ schema_version: 1, collection: "card_designs", documents }, null, 2)}\n`);
    console.log(`Zapisano lokalny artefakt migracji: ${output}`);
    console.log(`Wyodrębniono lokalnie ${extracted.length} obrazów do: ${assetsDir}`);
  }
}

// `tsx` normalizes the module URL on Windows, whereas argv keeps backslashes.
// The file is an executable migration script, not a library-only module.
if (process.argv[1]?.replace(/\\/g, "/").endsWith("/transform-card-designs.ts")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
