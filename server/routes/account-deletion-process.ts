import { json, preflight } from "../../api/_lib/http.js";
import { finalizeDueAccountDeletions, isCronAuthorized } from "../services/account-deletion.js";

export default {
  async fetch(request: Request) {
    if (request.method === "OPTIONS") return preflight();
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    if (!isCronAuthorized(request)) return json({ error: "cron_authentication_required" }, 401);
    try {
      return json(await finalizeDueAccountDeletions());
    } catch (error) {
      console.error("[account-deletion process]", error instanceof Error ? error.message : error);
      return json({ error: "account_deletion_processing_failed" }, 500);
    }
  },
};

