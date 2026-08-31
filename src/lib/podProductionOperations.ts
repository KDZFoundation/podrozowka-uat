import { auth } from "@/integrations/firebase/config";
import { backendApiUrl } from "@/lib/backendApi";
import { createOrLoadPodProductionBatch, type PodProductionBatchSelectionRequest } from "@/lib/podProductionBatchClient";
import { reconstructAndVerifyPodPrintManifest, type PodPrintManifestChunk, type PodPrintManifestHeader } from "@/lib/podPrintManifestPersistence";
import type { PodPrintRenderInput } from "@/lib/podPrintManifest";
import { loadFrozenPodPrintAssetsById, type LoadedPodPrintAssets } from "@/lib/podPrintAssetClient";
import { generatePodProductionBatchGroupPdf, type PodProductionBatchRenderSources } from "@/lib/generatePodProductionBatchPdf";
import type { FrozenPodProductionBatch } from "@/lib/podProductionBatchPersistence";

const adminToken = async () => {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Wymagane jest aktywne konto administratora.");
  return token;
};

const post = async <T,>(path: string, body: Record<string, unknown>) => {
  const response = await fetch(backendApiUrl(path), {
    method: "POST",
    headers: { Authorization: `Bearer ${await adminToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => null) as T & { error?: string } | null;
  if (!response.ok || !result) throw new Error(result?.error || "pod_production_request_failed");
  return result;
};

export interface PodProductionCandidate extends PodProductionBatchSelectionRequest { item_count: number }

export const listPodProductionCandidates = async () => (
  await post<{ candidates: PodProductionCandidate[] }>("/api/pod/production-batch", { operation: "list_candidates" })
).candidates;

const loadManifestById = async (manifestId: string) => {
  const header = (await post<{ header: PodPrintManifestHeader }>("/api/pod/print-manifest", {
    operation: "get_header_by_id",
    manifest_id: manifestId,
  })).header;
  const chunks: PodPrintManifestChunk[] = [];
  for (let chunkIndex = 0; chunkIndex < header.chunk_count; chunkIndex += 1) {
    chunks.push((await post<{ chunk: PodPrintManifestChunk }>("/api/pod/print-manifest", {
      operation: "get_chunk_by_id",
      manifest_id: manifestId,
      chunk_index: chunkIndex,
    })).chunk);
  }
  return reconstructAndVerifyPodPrintManifest(header, chunks);
};

const loadBatchRenderSources = async (batch: FrozenPodProductionBatch): Promise<PodProductionBatchRenderSources> => {
  const renderInputs = new Map<string, PodPrintRenderInput>();
  const assetsBySetId = new Map<string, LoadedPodPrintAssets>();
  for (const reference of batch.manifest.source_manifests) {
    const frozen = await loadManifestById(reference.id);
    for (const group of frozen.manifest.format_groups) {
      for (const item of group.items) renderInputs.set(item.print_job_item_id, item.render_input);
    }
  }
  try {
    for (const reference of batch.manifest.asset_sets) assetsBySetId.set(reference.id, await loadFrozenPodPrintAssetsById(reference.id));
  } catch (error) {
    assetsBySetId.forEach((assets) => assets.dispose());
    throw error;
  }
  return {
    renderInputs,
    assetsBySetId,
    dispose: () => assetsBySetId.forEach((assets) => assets.dispose()),
  };
};

export const loadFrozenPodProductionBatch = async (batchId: string): Promise<FrozenPodProductionBatch> => {
  const id = batchId.trim();
  if (!id) throw new Error("pod_batch_id_required");
  const header = (await post<{ header: FrozenPodProductionBatch["header"] }>("/api/pod/production-batch", {
    operation: "get_header",
    batch_id: id,
  })).header;
  const chunks = [];
  for (let chunkIndex = 0; chunkIndex < header.chunk_count; chunkIndex += 1) {
    chunks.push((await post<{ chunk: FrozenPodProductionBatch["chunks"][number] }>("/api/pod/production-batch", {
      operation: "get_chunk",
      batch_id: id,
      chunk_index: chunkIndex,
    })).chunk);
  }
  return reconstructAndVerifyPodProductionBatch(header, chunks);
};

export const createPodProductionAndArtifacts = async (selections: PodProductionBatchSelectionRequest[]) => {
  const batch = await createOrLoadPodProductionBatch(selections);
  const artifacts: Awaited<ReturnType<typeof generatePodProductionBatchGroupPdf>>[] = [];
  for (const group of batch.manifest.groups) {
    artifacts.push(await generatePodProductionBatchGroupPdf(batch.manifest, group.group_index, () => loadBatchRenderSources(batch)));
  }
  return { batch, artifacts };
};

export const createPodProductionProof = (printFormatId: string) => post<{ artifact: { id: string; print_format_id: string; proof_sha256: string; storage_generation: string } }>(
  "/api/pod/production-proof",
  { operation: "create", print_format_id: printFormatId },
);

export const approvePodProductionProof = (artifactId: string, comment: string, idempotencyKey: string) => post<{ approval_event: { id: string } }>(
  "/api/pod/production-proof",
  { operation: "approve", artifact_id: artifactId, comment, idempotency_key: idempotencyKey, confirm_physical_proof: true },
);

export const createPodProductionRelease = (batchId: string, proofArtifactIds: string[], approvalIds: string[], idempotencyKey: string) => post<{ release: { id: string; status: string } }>(
  "/api/pod/production-release",
  { operation: "create", batch_id: batchId, proof_artifact_ids: proofArtifactIds, proof_approval_event_ids: approvalIds, idempotency_key: idempotencyKey },
);

export const transitionPodProductionRelease = (releaseId: string, eventType: "MARKED_READY" | "RELEASED_TO_PRINTER" | "CANCELLED", idempotencyKey: string, reason?: string) => post<{ release: { id: string; status: string } }>(
  "/api/pod/production-release",
  { operation: "transition", release_id: releaseId, event_type: eventType, idempotency_key: idempotencyKey, reason },
);

export const checkPodProductionReadiness = async (batchId: string, releaseId: string) => {
  const response = await fetch(backendApiUrl("/api/pod/production-readiness"), {
    method: "POST",
    headers: { Authorization: `Bearer ${await adminToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ batch_id: batchId, release_id: releaseId }),
  });
  const result = await response.json().catch(() => null) as {
  status: "READY_FOR_RELEASE" | "BLOCKED";
  checks: Array<{ code: string; ok: boolean; detail: string }>;
  warnings: string[];
  } & { error?: string } | null;
  if ((!response.ok && response.status !== 409) || !result?.status) throw new Error(result?.error || "pod_readiness_request_failed");
  return result;
};
