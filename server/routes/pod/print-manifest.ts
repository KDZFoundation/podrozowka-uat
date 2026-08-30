import { json, preflight } from "../../../api/_lib/http.js";
import { requireAdmin } from "../../auth/require-admin.js";
import { POD_IMPOSITION_ALGORITHM } from "../../../src/lib/podImposition.js";
import { POD_PRINT_MANIFEST_VERSION } from "../../../src/lib/podPrintManifest.js";
import {
  PodPrintManifestConflictError,
  PodPrintManifestIntegrityError,
  derivePodPrintManifestId,
  freezePodPrintManifest,
} from "../../../src/lib/podPrintManifestPersistence.js";
import { buildAuthoritativePodPrintManifest } from "../../services/pod-print-manifest.js";
import { gcpPodPrintManifestStore } from "../../services/pod-print-manifest-store.js";

type ManifestOperation = "freeze" | "get_header" | "get_chunk";

export interface PodPrintManifestRouteDependencies {
  authorize: typeof requireAdmin;
  buildManifest: typeof buildAuthoritativePodPrintManifest;
  store: typeof gcpPodPrintManifestStore;
  now: () => string;
}

const adminUid = (request: Request) => {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] || "";
  try {
    const payload = token.split(".")[1];
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { sub?: unknown };
    return typeof claims.sub === "string" ? claims.sub : "authenticated-admin";
  } catch {
    return "authenticated-admin";
  }
};

const parseRequest = async (request: Request) => {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const batchId = typeof body?.batch_id === "string" ? body.batch_id.trim() : "";
  const batchRevision = typeof body?.batch_revision === "string" ? body.batch_revision.trim() : "";
  const printJobIds = Array.isArray(body?.print_job_ids)
    ? body.print_job_ids.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean)
    : [];
  const operation: ManifestOperation = body?.operation === "get_chunk"
    ? "get_chunk"
    : body?.operation === "get" || body?.operation === "get_header"
      ? "get_header"
      : "freeze";
  const chunkIndex = typeof body?.chunk_index === "number" ? body.chunk_index : null;
  if (!batchId) throw new Error("batch_id_required");
  if (!batchRevision) throw new Error("batch_revision_required");
  if (!printJobIds.length) throw new Error("print_job_ids_required");
  if (new Set(printJobIds).size !== printJobIds.length) throw new Error("duplicate_print_job_id");
  if (operation === "get_chunk" && (!Number.isInteger(chunkIndex) || Number(chunkIndex) < 0)) {
    throw new Error("chunk_index_required");
  }
  return { batchId, batchRevision, printJobIds, operation, chunkIndex };
};

export const createPodPrintManifestHandler = (dependencies: PodPrintManifestRouteDependencies) => ({
  fetch: async (request: Request) => {
    if (request.method === "OPTIONS") return preflight();
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const denied = await dependencies.authorize(request);
    if (denied) return denied;
    try {
      const input = await parseRequest(request);
      const manifestId = await derivePodPrintManifestId({
        batchId: input.batchId,
        batchRevision: input.batchRevision,
        printJobIds: input.printJobIds,
        manifestVersion: POD_PRINT_MANIFEST_VERSION,
        algorithmVersion: POD_IMPOSITION_ALGORITHM,
      });
      if (input.operation === "get_header" || input.operation === "get_chunk") {
        const header = await dependencies.store.readHeader(manifestId);
        if (!header) return json({ error: "manifest_not_found", manifest_id: manifestId }, 404);
        if (header.data.state !== "frozen") {
          return json({ error: `manifest_not_frozen:${manifestId}`, manifest_id: manifestId }, 422);
        }
        if (input.operation === "get_header") return json({ header: header.data });
        const chunkId = `${manifestId}-${String(input.chunkIndex).padStart(6, "0")}`;
        const chunk = await dependencies.store.readChunk(chunkId);
        if (!chunk) return json({ error: `manifest_chunk_missing:${chunkId}`, manifest_id: manifestId }, 422);
        return json({ chunk: chunk.data });
      }
      const manifest = await dependencies.buildManifest({ printJobIds: input.printJobIds });
      const frozen = await freezePodPrintManifest(dependencies.store, {
        batchId: input.batchId,
        batchRevision: input.batchRevision,
        printJobIds: input.printJobIds,
        manifest,
        createdAt: dependencies.now(),
        createdBy: adminUid(request),
      });
      return json({ header: frozen.header }, 200);
    } catch (error) {
      if (error instanceof PodPrintManifestConflictError) return json({ error: error.message }, 409);
      if (error instanceof PodPrintManifestIntegrityError) return json({ error: error.message }, 422);
      const message = error instanceof Error ? error.message : "manifest_request_failed";
      const status = message.endsWith("_required") || message.startsWith("duplicate_") ? 400 : 500;
      return json({ error: message }, status);
    }
  },
});

export default createPodPrintManifestHandler({
  authorize: requireAdmin,
  buildManifest: buildAuthoritativePodPrintManifest,
  store: gcpPodPrintManifestStore,
  now: () => new Date().toISOString(),
});
