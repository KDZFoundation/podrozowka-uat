import { corsHeaders, json, preflight } from "../../../api/_lib/http.js";
import { gcpPodPrintArtifactStorage } from "../../../api/_lib/gcp-storage.js";
import { requireAdmin } from "../../auth/require-admin.js";
import { sha256Bytes, type PodPrintArtifactStorage } from "../../../src/lib/podPrintArtifact.js";
import {
  PodPrintAssetSetError,
  derivePodPrintAssetSetId,
  freezePodPrintAssetSet,
  verifyPodPrintAssetSet,
  type PodPrintAssetSetItem,
  type PodPrintAssetSetStore,
} from "../../../src/lib/podPrintAssetSet.js";
import { POD_PDF_RENDERER_VERSION } from "../../../src/lib/podPdfMetadata.js";
import { readFrozenPodPrintManifest, type PodPrintManifestStore } from "../../../src/lib/podPrintManifestPersistence.js";
import { canonicalJson, sha256Utf8 } from "../../../src/lib/podPrintManifest.js";
import { gcpPodPrintManifestStore } from "../../services/pod-print-manifest-store.js";
import { gcpPodPrintAssetSetStore } from "../../services/pod-print-asset-set-store.js";
import { collectPodPrintAssetCandidates } from "../../services/pod-print-assets.js";

type AssetOperation = "freeze" | "get_header" | "get_chunk" | "get_item";

export interface PodPrintAssetsRouteDependencies {
  authorize: typeof requireAdmin;
  manifestStore: PodPrintManifestStore;
  assetSetStore: PodPrintAssetSetStore;
  storage: PodPrintArtifactStorage;
  collectCandidates: typeof collectPodPrintAssetCandidates;
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

export const readCompletePodPrintAssetSet = async (store: PodPrintAssetSetStore, assetSetId: string) => {
  const header = await store.readHeader(assetSetId);
  if (!header) return null;
  const items: PodPrintAssetSetItem[] = [];
  for (let chunkIndex = 0; chunkIndex < header.data.chunk_count; chunkIndex += 1) {
    const chunkId = `${assetSetId}-${String(chunkIndex).padStart(6, "0")}`;
    const chunk = await store.readChunk(chunkId);
    if (!chunk) throw new PodPrintAssetSetError("pod_asset_set_chunk_missing");
    const chunkPayload = { asset_set_id: assetSetId, chunk_index: chunkIndex, item_ids: chunk.item_ids };
    if (chunk.id !== chunkId || chunk.chunk_index !== chunkIndex
      || chunk.asset_set_id !== assetSetId
      || chunk.chunk_sha256 !== await sha256Utf8(canonicalJson(chunkPayload))) {
      throw new PodPrintAssetSetError("pod_asset_set_chunk_hash_mismatch");
    }
    for (const itemId of chunk.item_ids) {
      const item = await store.readItem(itemId);
      if (!item) throw new PodPrintAssetSetError("pod_asset_set_item_missing");
      items.push(item);
    }
  }
  return verifyPodPrintAssetSet(header.data, items);
};

const parseBody = async (request: Request) => {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const requestedOperation = body?.operation;
  const operation: AssetOperation = requestedOperation === "get_header"
    || requestedOperation === "get_chunk"
    || requestedOperation === "get_item"
    ? requestedOperation
    : "freeze";
  return {
    operation,
    manifestId: typeof body?.manifest_id === "string" ? body.manifest_id.trim() : "",
    assetSetId: typeof body?.asset_set_id === "string" ? body.asset_set_id.trim() : "",
    chunkIndex: typeof body?.chunk_index === "number" ? body.chunk_index : null,
    itemId: typeof body?.item_id === "string" ? body.item_id.trim() : "",
  };
};

const errorStatus = (code: string) => {
  if (code.includes("not_found") || code.endsWith("_missing")) return 404;
  if (code.includes("required") || code.includes("invalid") || code.includes("forbidden")) return 400;
  if (code.includes("too_large")) return 413;
  if (code.includes("conflict") || code.includes("mismatch") || code.includes("not_frozen")) return 409;
  return 500;
};

export const createPodPrintAssetsHandler = (dependencies: PodPrintAssetsRouteDependencies) => ({
  fetch: async (request: Request) => {
    if (request.method === "OPTIONS") return preflight();
    const denied = await dependencies.authorize(request);
    if (denied) return denied;
    try {
      const url = new URL(request.url);
      if (request.method === "GET") {
        const assetSetId = url.searchParams.get("asset_set_id")?.trim() || "";
        const itemId = url.searchParams.get("item_id")?.trim() || "";
        if (!assetSetId || !itemId) throw new PodPrintAssetSetError("pod_asset_reference_required");
        const header = await dependencies.assetSetStore.readHeader(assetSetId);
        const item = await dependencies.assetSetStore.readItem(itemId);
        if (!header || header.data.state !== "frozen" || !item || item.asset_set_id !== assetSetId) {
          throw new PodPrintAssetSetError("pod_asset_not_found");
        }
        const metadata = await dependencies.storage.readMetadata(item.storage_object, item.storage_generation);
        const bytes = await dependencies.storage.download(item.storage_object, item.storage_generation);
        if (metadata.generation !== item.storage_generation
          || metadata.metageneration !== item.storage_metageneration
          || metadata.size !== item.size_bytes
          || metadata.contentType !== item.content_type
          || metadata.crc32c !== item.crc32c
          || metadata.md5Hash !== item.md5_hash
          || metadata.metadata.asset_sha256 !== item.sha256
          || metadata.metadata.content_type !== item.content_type
          || metadata.metadata.asset_role !== item.asset_role
          || metadata.metadata.asset_set_version !== String(header.data.asset_set_version)
          || metadata.metadata.renderer_profile_version !== header.data.render_profile_version
          || metadata.metadata.size_bytes !== String(item.size_bytes)
          || metadata.metadata.source_kind !== item.source_kind
          || bytes.byteLength !== item.size_bytes
          || await sha256Bytes(bytes) !== item.sha256) {
          throw new PodPrintAssetSetError("pod_asset_integrity_mismatch");
        }
        return new Response(Uint8Array.from(bytes).buffer, {
          status: 200,
          headers: {
            ...corsHeaders,
            "Cache-Control": "private, no-store",
            "Content-Type": item.content_type,
            "X-POD-Asset-SHA256": item.sha256,
            "X-POD-Storage-Generation": item.storage_generation,
          },
        });
      }
      if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
      const input = await parseBody(request);
      if (input.operation === "freeze") {
        if (!input.manifestId) throw new PodPrintAssetSetError("pod_asset_set_manifest_id_required");
        const frozenManifest = await readFrozenPodPrintManifest(dependencies.manifestStore, input.manifestId);
        if (!frozenManifest) throw new PodPrintAssetSetError("pod_asset_set_manifest_not_found");
        const assetSetId = await derivePodPrintAssetSetId(frozenManifest.header.manifest_sha256);
        const existing = await readCompletePodPrintAssetSet(dependencies.assetSetStore, assetSetId);
        if (existing) return json({ header: existing.header });
        const collected = await dependencies.collectCandidates(frozenManifest);
        const result = await freezePodPrintAssetSet(dependencies.storage, dependencies.assetSetStore, {
          manifest: {
            id: frozenManifest.header.id,
            state: frozenManifest.header.state,
            manifest_sha256: frozenManifest.header.manifest_sha256,
          },
          rendererVersion: POD_PDF_RENDERER_VERSION,
          renderProfileSha256: collected.renderProfileSha256,
          candidates: collected.candidates,
          createdAt: dependencies.now(),
          createdBy: adminUid(request),
        });
        return json({ header: result.header });
      }
      if (!input.assetSetId) throw new PodPrintAssetSetError("pod_asset_set_id_required");
      const header = await dependencies.assetSetStore.readHeader(input.assetSetId);
      if (!header || header.data.state !== "frozen") throw new PodPrintAssetSetError("pod_asset_set_not_found");
      if (input.operation === "get_header") return json({ header: header.data });
      if (input.operation === "get_chunk") {
        if (!Number.isInteger(input.chunkIndex) || Number(input.chunkIndex) < 0) throw new PodPrintAssetSetError("pod_asset_set_chunk_index_invalid");
        const chunk = await dependencies.assetSetStore.readChunk(`${input.assetSetId}-${String(input.chunkIndex).padStart(6, "0")}`);
        if (!chunk) throw new PodPrintAssetSetError("pod_asset_set_chunk_missing");
        return json({ chunk });
      }
      if (!input.itemId) throw new PodPrintAssetSetError("pod_asset_set_item_id_required");
      const item = await dependencies.assetSetStore.readItem(input.itemId);
      if (!item || item.asset_set_id !== input.assetSetId) throw new PodPrintAssetSetError("pod_asset_set_item_missing");
      return json({ item });
    } catch (error) {
      const code = error instanceof PodPrintAssetSetError
        ? error.code
        : error instanceof Error ? error.message : "pod_asset_set_request_failed";
      return json({ error: code }, errorStatus(code));
    }
  },
});

export default createPodPrintAssetsHandler({
  authorize: requireAdmin,
  manifestStore: gcpPodPrintManifestStore,
  assetSetStore: gcpPodPrintAssetSetStore,
  storage: gcpPodPrintArtifactStorage,
  collectCandidates: collectPodPrintAssetCandidates,
  now: () => new Date().toISOString(),
});
