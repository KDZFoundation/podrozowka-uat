import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

type RecordItem = Record<string, unknown>;

const collectionNames = [
  "inventory_locations",
  "stock_production_orders",
  "stock_batches",
  "inventory_units",
  "inventory_movements",
  "inventory_unit_events",
  "qr_print_jobs",
  "qr_print_job_items",
  "pod_production_batches",
  "pod_production_batch_orders",
] as const;

type CollectionName = typeof collectionNames[number];
interface SourcePayload { collections?: Partial<Record<CollectionName, RecordItem[]>>; }

const args = process.argv.slice(2);
const inputIndex = args.indexOf("--input");
const outputDirIndex = args.indexOf("--output-dir");
const input = inputIndex >= 0 ? args[inputIndex + 1] : "migration-data/supabase-operational-export.json";
const outputDir = outputDirIndex >= 0 ? args[outputDirIndex + 1] : "migration-data/generated";
const checkOnly = args.includes("--check");

async function main() {
  const payload = JSON.parse(await readFile(resolve(process.cwd(), input), "utf8")) as SourcePayload;
  for (const collection of collectionNames) {
    const sourceRows = payload.collections?.[collection] || [];
    const documents = sourceRows.map((row) => {
      if (typeof row.id !== "string" || !row.id) throw new Error(`${collection}: rekord bez id.`);
      return { ...row, schema_version: 1, migration_source: "supabase" as const };
    });
    console.log(`${collection}: ${documents.length} dokumentów`);
    if (!checkOnly) {
      const target = resolve(process.cwd(), outputDir, `${collection}.firestore.json`);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, `${JSON.stringify({ schema_version: 1, collection, documents }, null, 2)}\n`);
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
