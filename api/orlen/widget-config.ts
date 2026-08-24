import { json, preflight } from "../_lib/http.js";
import { fromFirestoreFields, readDocument } from "../_lib/gcp-firestore.js";

/** ORLEN's browser widget token is public-by-design but scoped to a domain.
 * Keep its source in the deployment environment rather than in Supabase secrets.
 */
export default {
  fetch: async (request: Request) => {
    if (request.method === "OPTIONS") return preflight();
    if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
    let settings: Record<string, unknown> = {};
    try {
      const document = await readDocument("config", "orlen_paczka");
      settings = fromFirestoreFields(document.fields) as Record<string, unknown>;
    } catch {
      // Environment variables remain a useful emergency fallback for local runs.
    }
    return json({
      token: process.env.ORLEN_WIDGET_TOKEN || process.env.INPOST_ORLEN_WIDGET_TOKEN || settings.widget_token || null,
      map_url: process.env.ORLEN_WIDGET_MAP_URL || settings.map_url || "https://api.orlenpaczka.pl/",
    });
  },
};
