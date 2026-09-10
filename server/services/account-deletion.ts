import crypto from "node:crypto";
import {
  fromFirestoreFields,
  gcpAccessToken,
  queryDocuments,
  readDocument,
  updateDocumentIfCurrent,
  writeDocument,
} from "../../api/_lib/gcp-firestore.js";
import { resolveFirebaseAuthProjectId } from "../../api/_lib/runtime-config.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_DAYS = 30;

export type AccountDeletionRequest = {
  user_id: string;
  status: "scheduled" | "processing" | "cancelled" | "completed";
  requested_at: string;
  scheduled_for: string;
  cancelled_at?: string;
  completed_at?: string;
};

const asRequest = (value: Record<string, unknown>): AccountDeletionRequest | null => {
  const status = value.status;
  const requestedAt = value.requested_at;
  const scheduledFor = value.scheduled_for;
  const userId = value.user_id;
  if (typeof userId !== "string" || typeof requestedAt !== "string" || typeof scheduledFor !== "string") return null;
  if (status !== "scheduled" && status !== "processing" && status !== "cancelled" && status !== "completed") return null;
  return {
    user_id: userId,
    status,
    requested_at: requestedAt,
    scheduled_for: scheduledFor,
    ...(typeof value.cancelled_at === "string" ? { cancelled_at: value.cancelled_at } : {}),
    ...(typeof value.completed_at === "string" ? { completed_at: value.completed_at } : {}),
  };
};

const now = () => new Date().toISOString();
const scheduledFor = () => new Date(Date.now() + RETENTION_DAYS * DAY_MS).toISOString();

const notifyAdministrators = async (title: string, message: string, requestId: string) => {
  const roles = await queryDocuments("admin_roles", "active", { booleanValue: true });
  const admins = roles.filter(({ data }) => data.role === "admin");
  await Promise.all(admins.map(({ id }) => writeDocument("notifications", crypto.randomUUID(), {
    user_id: id,
    title,
    message,
    is_read: false,
    type: "account_deletion",
    account_deletion_request_id: requestId,
    created_at: now(),
  })));
};

export const getDeletionRequest = async (uid: string) => {
  const document = await readDocument("account_deletion_requests", uid).catch(() => null);
  return document?.fields ? asRequest(fromFirestoreFields(document.fields)) : null;
};

export const requestAccountDeletion = async (uid: string) => {
  const document = await readDocument("account_deletion_requests", uid).catch(() => null);
  const existing = document?.fields ? asRequest(fromFirestoreFields(document.fields)) : null;
  if (existing?.status === "scheduled") return { request: existing, alreadyRequested: true };
  if (existing?.status === "processing") throw new Error("account_deletion_processing");
  if (existing?.status === "completed") throw new Error("account_deletion_already_completed");

  const request: AccountDeletionRequest = {
    user_id: uid,
    status: "scheduled",
    requested_at: now(),
    scheduled_for: scheduledFor(),
  };
  if (document?.updateTime) {
    await updateDocumentIfCurrent(`account_deletion_requests/${uid}`, request, document.updateTime);
  } else {
    await writeDocument("account_deletion_requests", uid, request);
  }
  await notifyAdministrators(
    "Wniosek o usunięcie konta",
    `Użytkownik złożył wniosek o usunięcie konta. Automatyczna anonimizacja nastąpi po 30 dniach: ${request.scheduled_for}.`,
    uid,
  );
  return { request, alreadyRequested: false };
};

export const cancelAccountDeletion = async (uid: string) => {
  const document = await readDocument("account_deletion_requests", uid).catch(() => null);
  const existing = document?.fields ? asRequest(fromFirestoreFields(document.fields)) : null;
  if (!document?.updateTime || !existing) throw new Error("account_deletion_request_not_found");
  if (existing.status !== "scheduled") return existing;
  const cancelled = { ...existing, status: "cancelled" as const, cancelled_at: now() };
  await updateDocumentIfCurrent(`account_deletion_requests/${uid}`, cancelled, document.updateTime);
  return cancelled;
};

const deleteFirebaseAuthUser = async (uid: string) => {
  const token = await gcpAccessToken();
  const projectId = resolveFirebaseAuthProjectId();
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/accounts:delete`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ localId: uid }),
    },
  );
  if (response.ok) return;
  const body = await response.text();
  // The account may have been removed manually after the request was accepted.
  if (response.status === 404) return;
  throw new Error(`firebase_auth_delete_failed:${response.status}:${body.slice(0, 300)}`);
};

const anonymizeProfile = async (uid: string, completedAt: string) => {
  const redacted = {
    email: null,
    first_name: null,
    last_name: null,
    full_name: "Usunięty użytkownik",
    display_name: "Usunięty użytkownik",
    username: null,
    phone: null,
    phone_number: null,
    avatar_url: null,
    account_status: "deleted",
    anonymized_at: completedAt,
    updated_at: completedAt,
  };
  for (const collection of ["users", "profiles"]) {
    const document = await readDocument(collection, uid).catch(() => null);
    if (document?.updateTime) await updateDocumentIfCurrent(`${collection}/${uid}`, redacted, document.updateTime);
  }
};

/**
 * Finalization deliberately does not erase paid-order documents. They can be
 * required for tax, accounting, complaints and defence of claims. The account
 * link is removed; the remaining retention policy is stated in PrivacyPolicy.
 */
const detachOrders = async (uid: string, completedAt: string) => {
  const deletedReference = `deleted:${crypto.createHash("sha256").update(uid).digest("hex").slice(0, 24)}`;
  const orders = await queryDocuments("orders", "user_id", { stringValue: uid });
  await Promise.all(orders.map(async ({ path, updateTime }) => {
    if (!updateTime) return;
    await updateDocumentIfCurrent(path, { user_id: deletedReference, account_deleted_at: completedAt }, updateTime);
  }));
};

export const finalizeDueAccountDeletions = async (currentTime = Date.now()) => {
  const due = await queryDocuments("account_deletion_requests", "status", { stringValue: "scheduled" });
  let completed = 0;
  let failed = 0;
  for (const entry of due) {
    const request = asRequest(entry.data);
    if (!request || Date.parse(request.scheduled_for) > currentTime || !entry.updateTime) continue;
    try {
      const completedAt = new Date(currentTime).toISOString();
      // Claim the due request before touching any personal data. This prevents
      // a last-moment cancellation from racing with the scheduled worker.
      await updateDocumentIfCurrent(entry.path, { status: "processing", processing_started_at: completedAt }, entry.updateTime);
      await anonymizeProfile(request.user_id, completedAt);
      await detachOrders(request.user_id, completedAt);
      await deleteFirebaseAuthUser(request.user_id);
      const processingDocument = await readDocument("account_deletion_requests", entry.id);
      if (!processingDocument.updateTime) throw new Error("account_deletion_request_lost");
      await updateDocumentIfCurrent(entry.path, { status: "completed", completed_at: completedAt }, processingDocument.updateTime);
      completed += 1;
    } catch (error) {
      failed += 1;
      console.error("[account-deletion finalize]", entry.id, error instanceof Error ? error.message : error);
      // A transient Firebase/Auth failure must not leave a request permanently
      // locked in processing. It remains scheduled and is retried on the next
      // daily run; the internal error detail stays in server logs only.
      const current = await readDocument("account_deletion_requests", entry.id).catch(() => null);
      const currentRequest = current?.fields ? asRequest(fromFirestoreFields(current.fields)) : null;
      if (current?.updateTime && currentRequest?.status === "processing") {
        await updateDocumentIfCurrent(entry.path, { status: "scheduled", last_attempt_failed_at: new Date(currentTime).toISOString() }, current.updateTime).catch(() => undefined);
      }
    }
  }
  return { completed, failed };
};

export const isCronAuthorized = (request: Request) => {
  const configured = process.env.CRON_SECRET || "";
  const received = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!configured || !received) return false;
  const expected = Buffer.from(configured);
  const actual = Buffer.from(received);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
};
