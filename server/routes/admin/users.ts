import { json, preflight } from "../../../api/_lib/http.js";
import { gcpAccessToken, listDocuments } from "../../../api/_lib/gcp-firestore.js";
import { resolveFirebaseAuthProjectId } from "../../../api/_lib/runtime-config.js";
import { requireAdmin } from "../../auth/require-admin.js";

type DeletionStatus = "scheduled" | "processing" | "cancelled" | "completed";

type IdentityUser = {
  localId?: unknown;
  email?: unknown;
  displayName?: unknown;
  createdAt?: unknown;
};

const asString = (value: unknown) => typeof value === "string" ? value : "";

const timestampFromIdentity = (value: unknown) => {
  const milliseconds = Number(value);
  return Number.isFinite(milliseconds) && milliseconds > 0 ? new Date(milliseconds).toISOString() : null;
};

const supportedDeletionStatus = (value: unknown): DeletionStatus | null =>
  value === "scheduled" || value === "processing" || value === "cancelled" || value === "completed" ? value : null;

const identityUsers = async () => {
  const token = await gcpAccessToken();
  const projectId = resolveFirebaseAuthProjectId();
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/accounts:batchGet?maxResults=1000`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const body = await response.json().catch(() => null) as { users?: IdentityUser[] } | null;
  if (!response.ok || !body) throw new Error(`firebase_auth_users_list_failed:${response.status}`);
  return Array.isArray(body.users) ? body.users : [];
};

/** Returns actual Firebase Authentication accounts, enriched only with their matching profile and deletion state. */
export default {
  async fetch(request: Request) {
    if (request.method === "OPTIONS") return preflight();
    if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
    const forbidden = await requireAdmin(request);
    if (forbidden) return forbidden;

    try {
      const [accounts, profileEntries, deletionEntries] = await Promise.all([
        identityUsers(),
        listDocuments("users"),
        listDocuments("account_deletion_requests"),
      ]);
      const profiles = new Map(profileEntries.map((entry) => [entry.id, entry.data]));
      const deletions = new Map(deletionEntries.map((entry) => [entry.id, entry.data]));
      const users = accounts.flatMap((account) => {
        const id = asString(account.localId);
        if (!id) return [];
        const profile = profiles.get(id) || {};
        const deletion = deletions.get(id) || {};
        const firstName = asString(profile.first_name);
        const lastName = asString(profile.last_name);
        const profileName = [firstName, lastName].filter(Boolean).join(" ") || asString(profile.display_name);
        return [{
          id,
          email: asString(account.email) || asString(profile.email),
          name: profileName || asString(account.displayName) || "Bez nazwy",
          createdAt: timestampFromIdentity(account.createdAt),
          deletionStatus: supportedDeletionStatus(deletion.status),
          scheduledFor: asString(deletion.scheduled_for) || null,
        }];
      }).sort((left, right) => (right.createdAt || "").localeCompare(left.createdAt || ""));
      return json({ users });
    } catch (error) {
      console.error("[admin users] unable to list Firebase Authentication users", error);
      return json({ error: "admin_users_list_failed" }, 502);
    }
  },
};
