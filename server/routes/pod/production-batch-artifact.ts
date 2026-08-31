import { corsHeaders, json, preflight } from "../../../api/_lib/http.js";
import { gcpPodPrintArtifactStorage, initiateGcsCreateOnlyResumableUpload } from "../../../api/_lib/gcp-storage.js";
import { requireAdmin } from "../../auth/require-admin.js";
import {
  PodProductionBatchArtifactError,
  createPodProductionBatchArtifact,
  derivePodProductionBatchArtifactId,
  finalizePodProductionBatchArtifactUpload,
  preparePodProductionBatchArtifactUpload,
  reprintPodProductionBatchArtifact,
  type PodProductionBatchArtifactStore,
} from "../../../src/lib/podProductionBatchArtifact.js";
import {
  PodProductionBatchPersistenceError,
  readFrozenPodProductionBatch,
  type PodProductionBatchStore,
} from "../../../src/lib/podProductionBatchPersistence.js";
import type { PodPrintArtifactStorage } from "../../../src/lib/podPrintArtifact.js";
import { gcpPodProductionBatchStore } from "../../services/pod-production-batch-store.js";
import { gcpPodProductionBatchArtifactStore } from "../../services/pod-production-batch-artifact-store.js";

const MAX_PDF_BYTES = 80 * 1024 * 1024;

interface Dependencies {
  authorize: typeof requireAdmin;
  batchStore: PodProductionBatchStore;
  artifactStore: PodProductionBatchArtifactStore;
  storage: PodPrintArtifactStorage;
  initiateUpload?: typeof initiateGcsCreateOnlyResumableUpload;
  now: () => string;
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

const statusFor = (code: string) => code.includes("not_found") || code.includes("missing") ? 404
  : code.includes("invalid") || code.includes("required") ? 400
    : code.includes("too_large") ? 413
      : code.includes("conflict") || code.includes("mismatch") || code.includes("not_frozen") ? 409
        : 500;

const readUploadRequest = async (request: Request) => {
  if (request.headers.get("content-type")?.split(";", 1)[0] !== "application/json") {
    throw new PodProductionBatchArtifactError("pod_batch_artifact_content_type_invalid");
  }
  const body = await request.json().catch(() => null) as { pdf_sha256?: unknown; size_bytes?: unknown } | null;
  const pdfSha256 = typeof body?.pdf_sha256 === "string" ? body.pdf_sha256.trim().toLowerCase() : "";
  const sizeBytes = Number(body?.size_bytes);
  if (!/^[0-9a-f]{64}$/.test(pdfSha256)) throw new PodProductionBatchArtifactError("pod_batch_artifact_hash_mismatch");
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_PDF_BYTES) {
    throw new PodProductionBatchArtifactError("pod_batch_artifact_pdf_too_large");
  }
  return { pdfSha256, sizeBytes };
};

export const createPodProductionBatchArtifactHandler = (dependencies: Dependencies) => ({
  fetch: async (request: Request) => {
    if (request.method === "OPTIONS") return preflight();
    const denied = await dependencies.authorize(request);
    if (denied) return denied;
    try {
      const url = new URL(request.url);
      if (request.method === "GET") {
        let artifactId = url.searchParams.get("artifact_id")?.trim() || "";
        if (!artifactId) {
          const batchId = url.searchParams.get("batch_id")?.trim() || "";
          const groupValue = url.searchParams.get("group_index");
          const groupIndex = groupValue === null ? -1 : Number(groupValue);
          artifactId = await derivePodProductionBatchArtifactId(batchId, groupIndex);
        }
        const result = await reprintPodProductionBatchArtifact(dependencies.storage, dependencies.artifactStore, artifactId);
        return new Response(Uint8Array.from(result.bytes).buffer, {
          status: 200,
          headers: {
            ...corsHeaders,
            "Cache-Control": "private, no-store",
            "Content-Disposition": `attachment; filename="${result.artifact.batch_id}-group-${result.artifact.group_index}.pdf"`,
            "Content-Type": "application/pdf",
            "X-POD-Batch-Artifact-Id": result.artifact.id,
            "X-POD-Batch-SHA256": result.artifact.batch_sha256,
            "X-POD-PDF-SHA256": result.artifact.pdf_sha256,
            "X-POD-Storage-Generation": result.artifact.storage_generation,
          },
        });
      }
      if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
      const batchId = url.searchParams.get("batch_id")?.trim() || "";
      const groupValue = url.searchParams.get("group_index");
      const groupIndex = groupValue === null ? -1 : Number(groupValue);
      if (!batchId || !Number.isInteger(groupIndex) || groupIndex < 0) {
        throw new PodProductionBatchArtifactError("pod_batch_artifact_reference_invalid");
      }
      const operation = url.searchParams.get("operation")?.trim() || "legacy_upload";
      const batch = await readFrozenPodProductionBatch(dependencies.batchStore, batchId);
      if (!batch) throw new PodProductionBatchArtifactError("pod_batch_artifact_batch_not_found");

      if (operation === "initiate_upload" || operation === "finalize_upload") {
        const upload = await readUploadRequest(request);
        const input = {
          batch,
          groupIndex,
          pdfSha256: upload.pdfSha256,
          sizeBytes: upload.sizeBytes,
          createdAt: dependencies.now(),
          createdBy: adminUid(request),
        } as const;
        if (operation === "initiate_upload") {
          if (!dependencies.initiateUpload) throw new Error("pod_batch_artifact_resumable_upload_unavailable");
          const prepared = await preparePodProductionBatchArtifactUpload(input);
          const existing = await dependencies.artifactStore.read(prepared.id);
          if (existing) return json({ artifact_id: prepared.id, existing: true, upload_url: null });
          const configuredOrigin = process.env.FRONTEND_ORIGIN || "https://podrozowka.web.app";
          const requestOrigin = request.headers.get("origin") || configuredOrigin;
          if (requestOrigin !== configuredOrigin) throw new PodProductionBatchArtifactError("pod_batch_artifact_origin_invalid");
          try {
            const uploadUrl = await dependencies.initiateUpload(
              prepared.object,
              upload.sizeBytes,
              prepared.objectMetadata,
              requestOrigin,
            );
            return json({ artifact_id: prepared.id, existing: false, upload_url: uploadUrl });
          } catch (error) {
            if (error instanceof PodProductionBatchArtifactError
              && error.code === "pod_artifact_storage_precondition_failed") {
              return json({ artifact_id: prepared.id, existing: true, upload_url: null });
            }
            throw error;
          }
        }
        const result = await finalizePodProductionBatchArtifactUpload(dependencies.storage, dependencies.artifactStore, input);
        return json({
          artifact_id: result.artifact.id,
          batch_id: result.artifact.batch_id,
          batch_sha256: result.artifact.batch_sha256,
          pdf_sha256: result.artifact.pdf_sha256,
          storage_generation: result.artifact.storage_generation,
          size_bytes: result.artifact.size_bytes,
          created: result.created,
        });
      }
      if (request.headers.get("content-type")?.split(";", 1)[0] !== "application/pdf") {
        throw new PodProductionBatchArtifactError("pod_batch_artifact_content_type_invalid");
      }
      const contentLength = Number(request.headers.get("content-length") || 0);
      if (contentLength > MAX_PDF_BYTES) throw new PodProductionBatchArtifactError("pod_batch_artifact_pdf_too_large");
      const bytes = new Uint8Array(await request.arrayBuffer());
      if (bytes.byteLength > MAX_PDF_BYTES) throw new PodProductionBatchArtifactError("pod_batch_artifact_pdf_too_large");
      const result = await createPodProductionBatchArtifact(dependencies.storage, dependencies.artifactStore, {
        batch,
        groupIndex,
        pdfBytes: bytes,
        createdAt: dependencies.now(),
        createdBy: adminUid(request),
      });
      return json({
        artifact_id: result.artifact.id,
        batch_id: result.artifact.batch_id,
        batch_sha256: result.artifact.batch_sha256,
        pdf_sha256: result.artifact.pdf_sha256,
        storage_generation: result.artifact.storage_generation,
        created: result.created,
      });
    } catch (error) {
      if (error instanceof PodProductionBatchArtifactError) return json({ error: error.code }, statusFor(error.code));
      if (error instanceof PodProductionBatchPersistenceError) return json({ error: error.code }, statusFor(error.code));
      return json({ error: error instanceof Error ? error.message : "pod_batch_artifact_request_failed" }, 500);
    }
  },
});

export default createPodProductionBatchArtifactHandler({
  authorize: requireAdmin,
  batchStore: gcpPodProductionBatchStore,
  artifactStore: gcpPodProductionBatchArtifactStore,
  storage: gcpPodPrintArtifactStorage,
  now: () => new Date().toISOString(),
});
