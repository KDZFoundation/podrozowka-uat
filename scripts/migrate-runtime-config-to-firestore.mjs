/*
 * One-time, idempotent migration of non-secret runtime configuration.
 *
 * It intentionally does NOT copy payment or courier credentials. HotPay and
 * courier secrets stay in Vercel environment variables, where they cannot be
 * read by a browser or Firestore client.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const envFile = resolve(root, ".env.local");
const configFile = resolve(root, "firebase-applet-config.json");

const loadEnv = () => Object.fromEntries(
  readFileSync(envFile, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator), line.slice(separator + 1)];
    }),
);

const env = loadEnv();
const firebase = JSON.parse(readFileSync(configFile, "utf8"));
const supabaseUrl = env.SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Brakuje SUPABASE_URL lub SUPABASE_SERVICE_ROLE_KEY w .env.local.");
}

const accessToken = execSync("gcloud auth print-access-token", { encoding: "utf8" }).trim();
if (!accessToken) throw new Error("Nie udało się uzyskać tokenu Google Cloud z gcloud auth.");

const firestoreBase = `https://firestore.googleapis.com/v1/projects/${firebase.projectId}/databases/${firebase.firestoreDatabaseId}/documents`;

const supabaseRows = async (table, select) => {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?select=${encodeURIComponent(select)}`, {
    headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
  });
  if (!response.ok) throw new Error(`Supabase ${table}: ${response.status}`);
  return response.json();
};

const firestoreValue = (value) => {
  if (value === null) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  return { stringValue: String(value) };
};

const writeDocument = async (collection, id, fields) => {
  const body = {
    fields: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, firestoreValue(value)])),
  };
  const response = await fetch(`${firestoreBase}/${collection}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Firestore ${collection}/${id}: ${response.status} ${await response.text()}`);
};

const now = new Date().toISOString();
const [flags, configs, tiers] = await Promise.all([
  supabaseRows("feature_flags", "key,name,description,is_enabled"),
  supabaseRows("gamification_config", "id,points_per_unit,points_per_country,points_per_registration"),
  supabaseRows("gamification_tiers", "id,name,min_points"),
]);

for (const flag of flags) {
  await writeDocument("feature_flags", flag.key, { ...flag, migrated_from: "supabase", migrated_at: now });
}

const config = configs[0];
if (config) {
  await writeDocument("gamification_config", "default", {
    points_per_unit: config.points_per_unit,
    points_per_country: config.points_per_country,
    points_per_registration: config.points_per_registration,
    migrated_from: "supabase",
    migrated_at: now,
  });
}

for (const tier of tiers) {
  await writeDocument("gamification_tiers", tier.id, { ...tier, migrated_from: "supabase", migrated_at: now });
}

console.log(JSON.stringify({
  feature_flags: flags.length,
  gamification_config: config ? 1 : 0,
  gamification_tiers: tiers.length,
  payment_credentials: "not_migrated_by_design",
  shipping_credentials: "not_migrated_by_design",
}, null, 2));
