import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = process.argv.find((argument) => argument.startsWith("--target="))?.slice("--target=".length);

if (target !== "uat") {
  throw new Error("deployment_config_target_required:use_--target=uat");
}

const readJson = async (relativePath) => JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
const [targets, config, indexes] = await Promise.all([
  readJson(".firebaserc"),
  readJson("firebase.uat.json"),
  readJson("firestore.indexes.json"),
]);

const failures = [];
if (targets.projects?.default) failures.push("firebase_default_project_must_not_be_set");
if (targets.projects?.uat !== "podrozowka") failures.push("uat_project_target_invalid");
if (config.firestore?.database !== "ai-studio-podrozowkauat-e1d9b39b-c759-477c-98ea-34396a1afd2f") {
  failures.push("uat_firestore_database_invalid");
}
if (config.hosting?.site !== "podrozowka") failures.push("uat_hosting_site_invalid");

const hasInventorySerialIndex = indexes.indexes?.some((index) =>
  index.collectionGroup === "inventory_units"
  && index.queryScope === "COLLECTION"
  && index.fields?.[0]?.fieldPath === "card_design_id"
  && index.fields?.[0]?.order === "ASCENDING"
  && index.fields?.[1]?.fieldPath === "inventory_serial_no"
  && index.fields?.[1]?.order === "DESCENDING",
);
if (!hasInventorySerialIndex) failures.push("inventory_units_serial_index_missing");

if (failures.length) throw new Error(`deployment_config_invalid:${failures.join(",")}`);
console.log("deployment_config_valid:uat");
