import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

type RecordItem = Record<string, unknown>;

interface ExportPayload {
  collections?: {
    countries?: RecordItem[];
    categories?: RecordItem[];
    card_language_templates?: RecordItem[];
  };
}

const args = process.argv.slice(2);
const inputIndex = args.indexOf("--input");
const outputDirIndex = args.indexOf("--output-dir");
const input = inputIndex >= 0 ? args[inputIndex + 1] : "migration-data/supabase-catalog-export.json";
const outputDir = outputDirIndex >= 0 ? args[outputDirIndex + 1] : "migration-data/generated";
const checkOnly = args.includes("--check");

function rows(payload: ExportPayload, name: "countries" | "categories" | "card_language_templates") {
  return Array.isArray(payload.collections?.[name]) ? payload.collections![name]! : [];
}

function requireId(row: RecordItem, collection: string) {
  if (typeof row.id !== "string" || !row.id) throw new Error(`${collection}: dokument bez id.`);
  return row.id;
}

function transformCountries(payload: ExportPayload) {
  return rows(payload, "countries").map((row) => ({
    ...row,
    id: requireId(row, "countries"),
    name: typeof row.name_pl === "string" ? row.name_pl : String(row.name ?? ""),
    is_active: row.active !== false,
    schema_version: 1,
    migration_source: "supabase",
  }));
}

function transformCategories(payload: ExportPayload) {
  return rows(payload, "categories").map((row) => ({
    ...row,
    id: requireId(row, "categories"),
    name_pl: typeof row.name === "string" ? row.name : String(row.name_pl ?? ""),
    icon: typeof row.icon_url === "string" ? row.icon_url : row.icon ?? null,
    is_active: row.active !== false,
    schema_version: 1,
    migration_source: "supabase",
  }));
}

function transformLanguageTemplates(payload: ExportPayload) {
  return rows(payload, "card_language_templates").map((row) => ({
    ...row,
    id: requireId(row, "card_language_templates"),
    schema_version: 1,
    migration_source: "supabase",
  }));
}

async function writeCollection(collection: string, documents: RecordItem[]) {
  if (checkOnly) return;
  const target = resolve(process.cwd(), outputDir, `${collection}.firestore.json`);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify({ schema_version: 1, collection, documents }, null, 2)}\n`);
}

async function main() {
  const payload = JSON.parse(await readFile(resolve(process.cwd(), input), "utf8")) as ExportPayload;
  const collections = [
    ["countries", transformCountries(payload)],
    ["categories", transformCategories(payload)],
    ["card_language_templates", transformLanguageTemplates(payload)],
  ] as const;

  for (const [collection, documents] of collections) {
    console.log(`${collection}: ${documents.length} dokumentów`);
    await writeCollection(collection, documents);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
