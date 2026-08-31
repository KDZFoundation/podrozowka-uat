import { json, preflight } from "../../../api/_lib/http.js";
import { requireAdmin } from "../../auth/require-admin.js";
import { PodProductionBatchError } from "../../../src/lib/podProductionBatch.js";
import {
  PodProductionBatchPersistenceError,
  freezePodProductionBatch,
  type PodProductionBatchStore,
} from "../../../src/lib/podProductionBatchPersistence.js";
import { gcpPodProductionBatchStore } from "../../services/pod-production-batch-store.js";
import { gcpPodPrintManifestStore } from "../../services/pod-print-manifest-store.js";
import { gcpPodPrintAssetSetStore } from "../../services/pod-print-asset-set-store.js";
import { derivePodPrintAssetSetId } from "../../../src/lib/podPrintAssetSet.js";
import {
  loadPodProductionBatchPlan,
  verifyPodProductionBatchSources,
  type PodProductionBatchSelection,
  type PodProductionBatchSourceStores,
} from "../../services/pod-production-batch.js";
import { listDocuments } from "../../../api/_lib/gcp-firestore.js";
import { readFrozenPodPrintManifest } from "../../../src/lib/podPrintManifestPersistence.js";
import { derivePodProductionBatchMembershipId } from "../../../src/lib/podProductionBatchPersistence.js";

interface Dependencies extends PodProductionBatchSourceStores {
  authorize: typeof requireAdmin;
  batchStore: PodProductionBatchStore;
  now: () => string;
  listCandidates?: () => Promise<Array<{ print_manifest_id: string; asset_set_id: string; item_count: number }>>;
}

const adminUid = (request: Request) => {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] || "";
  try {
    const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")) as { sub?: unknown };
    return typeof claims.sub === "string" ? claims.sub : "authenticated-admin";
  } catch {
    return "authenticated-admin";
  }
};

const statusFor = (code: string) => code.includes("required") || code.includes("invalid") || code.includes("unknown") || code.includes("unsupported")
  ? 400
  : code.includes("missing") || code.includes("not_found") ? 404
    : code.includes("limit") ? 413
      : code.includes("conflict") || code.includes("mismatch") || code.includes("changed") || code.includes("not_frozen") ? 409
        : 500;

export const createPodProductionBatchHandler = (dependencies: Dependencies) => ({
  fetch: async (request: Request) => {
    if (request.method === "OPTIONS") return preflight();
    const denied = await dependencies.authorize(request);
    if (denied) return denied;
    try {
      if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
      const body = await request.json().catch(() => null) as {
        operation?: unknown;
        batch_id?: unknown;
        chunk_index?: unknown;
        selections?: unknown;
      } | null;
      const operation = body?.operation === "get_header" || body?.operation === "get_chunk" || body?.operation === "list_candidates" ? body.operation : "create";
      if (operation === "list_candidates") {
        if (!dependencies.listCandidates) throw new PodProductionBatchError("pod_batch_candidate_listing_unavailable");
        return json({ candidates: await dependencies.listCandidates() });
      }
      if (operation === "get_header") {
        const batchId = typeof body?.batch_id === "string" ? body.batch_id.trim() : "";
        if (!batchId) throw new PodProductionBatchPersistenceError("pod_batch_id_required");
        const header = await dependencies.batchStore.readHeader(batchId);
        if (!header) throw new PodProductionBatchPersistenceError("pod_batch_not_found");
        return json({ header: header.data });
      }
      if (operation === "get_chunk") {
        const batchId = typeof body?.batch_id === "string" ? body.batch_id.trim() : "";
        const chunkIndex = typeof body?.chunk_index === "number" ? body.chunk_index : -1;
        if (!batchId || !Number.isInteger(chunkIndex) || chunkIndex < 0) {
          throw new PodProductionBatchPersistenceError("pod_batch_chunk_reference_invalid");
        }
        const header = await dependencies.batchStore.readHeader(batchId);
        if (!header || header.data.state !== "FROZEN" || chunkIndex >= header.data.chunk_count) {
          throw new PodProductionBatchPersistenceError("pod_batch_chunk_missing");
        }
        const chunk = await dependencies.batchStore.readChunk(`${batchId}-${String(chunkIndex).padStart(6, "0")}`);
        if (!chunk || chunk.batch_id !== batchId || chunk.chunk_index !== chunkIndex) {
          throw new PodProductionBatchPersistenceError("pod_batch_chunk_missing");
        }
        return json({ chunk });
      }
      if (!Array.isArray(body?.selections)) throw new PodProductionBatchError("pod_batch_selections_required");
      const selections = body.selections.map((selection): PodProductionBatchSelection => {
        const value = selection && typeof selection === "object" ? selection as Record<string, unknown> : {};
        return {
          print_manifest_id: typeof value.print_manifest_id === "string" ? value.print_manifest_id.trim() : "",
          asset_set_id: typeof value.asset_set_id === "string" ? value.asset_set_id.trim() : "",
        };
      });
      const manifest = await loadPodProductionBatchPlan(dependencies, selections);
      const frozen = await freezePodProductionBatch(dependencies.batchStore, {
        manifest,
        createdAt: dependencies.now(),
        createdBy: adminUid(request),
      });
      await verifyPodProductionBatchSources(dependencies, selections, frozen.header.id, frozen.header.batch_sha256);
      return json({ header: frozen.header });
    } catch (error) {
      if (error instanceof PodProductionBatchError || error instanceof PodProductionBatchPersistenceError) {
        return json({ error: error.code }, statusFor(error.code));
      }
      return json({ error: error instanceof Error ? error.message : "pod_batch_request_failed" }, 500);
    }
  },
});

export default createPodProductionBatchHandler({
  authorize: requireAdmin,
  manifestStore: gcpPodPrintManifestStore,
  assetSetStore: gcpPodPrintAssetSetStore,
  batchStore: gcpPodProductionBatchStore,
  now: () => new Date().toISOString(),
  listCandidates: async () => {
    const manifestHeaders = (await listDocuments("pod_print_manifests", 500))
      .filter((document) => document.data.state === "frozen")
      .sort((left, right) => left.id.localeCompare(right.id));
    const candidates: Array<{ print_manifest_id: string; asset_set_id: string; item_count: number }> = [];
    for (const manifestHeader of manifestHeaders) {
      const manifestId = manifestHeader.id;
      const manifest = await readFrozenPodPrintManifest(gcpPodPrintManifestStore, manifestId).catch(() => null);
      if (!manifest) continue;
      const assetSetId = await derivePodPrintAssetSetId(manifest.header.manifest_sha256);
      const assetSet = await gcpPodPrintAssetSetStore.readHeader(assetSetId).catch(() => null);
      if (!assetSet || assetSet.data.state !== "frozen"
        || assetSet.data.manifest_id !== manifest.header.id
        || assetSet.data.manifest_sha256 !== manifest.header.manifest_sha256) continue;
      let claimed = false;
      for (const item of manifest.manifest.format_groups.flatMap((group) => group.items)) {
        if (await gcpPodProductionBatchStore.readMembership(await derivePodProductionBatchMembershipId(item.print_job_item_id))) {
          claimed = true;
          break;
        }
      }
      if (!claimed) candidates.push({ print_manifest_id: manifestId, asset_set_id: assetSetId, item_count: manifest.header.postcard_count });
    }
    return candidates;
  },
});
