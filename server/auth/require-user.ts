import { json } from "../../api/_lib/http.js";
import { verifyFirebaseIdToken } from "./require-admin.js";

export type AuthenticatedFirebaseUser = {
  uid: string;
  email: string;
};

/** Verify the Firebase session without granting administrative access. */
export const requireFirebaseUser = async (request: Request): Promise<AuthenticatedFirebaseUser | Response> => {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return json({ error: "authentication_required" }, 401);

  try {
    const claims = await verifyFirebaseIdToken(match[1]);
    const uid = typeof claims?.sub === "string" ? claims.sub : "";
    if (!uid) return json({ error: "invalid_authentication_token" }, 401);
    return { uid, email: typeof claims.email === "string" ? claims.email : "" };
  } catch {
    return json({ error: "authentication_verification_failed" }, 503);
  }
};

