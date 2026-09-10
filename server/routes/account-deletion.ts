import { json, preflight } from "../../api/_lib/http.js";
import { requireFirebaseUser } from "../auth/require-user.js";
import { cancelAccountDeletion, getDeletionRequest, requestAccountDeletion } from "../services/account-deletion.js";

const errorResponse = (error: unknown) => {
  const code = error instanceof Error ? error.message : "account_deletion_request_failed";
  const status = code === "account_deletion_request_not_found" ? 404
    : code === "account_deletion_already_completed" || code === "account_deletion_processing" ? 409
      : 500;
  return json({ error: code }, status);
};

export default {
  async fetch(request: Request) {
    if (request.method === "OPTIONS") return preflight();
    const authenticated = await requireFirebaseUser(request);
    if (authenticated instanceof Response) return authenticated;
    if (request.method === "GET") return json({ request: await getDeletionRequest(authenticated.uid) });
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const body = await request.json().catch(() => null) as { action?: unknown; confirmed?: unknown } | null;
    if (body?.action === "request") {
      if (body.confirmed !== true) return json({ error: "account_deletion_confirmation_required" }, 400);
      try {
        const result = await requestAccountDeletion(authenticated.uid);
        return json(result, result.alreadyRequested ? 200 : 201);
      } catch (error) {
        return errorResponse(error);
      }
    }
    if (body?.action === "cancel") {
      try {
        return json({ request: await cancelAccountDeletion(authenticated.uid) });
      } catch (error) {
        return errorResponse(error);
      }
    }
    return json({ error: "account_deletion_invalid_action" }, 400);
  },
};
