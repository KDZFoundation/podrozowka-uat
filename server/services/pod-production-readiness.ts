import { sha256Bytes, type PodPrintArtifactStorage } from "../../src/lib/podPrintArtifact.js";
import { derivePodProductionBatchArtifactId, reprintPodProductionBatchArtifact, type PodProductionBatchArtifactStore } from "../../src/lib/podProductionBatchArtifact.js";
import { readFrozenPodProductionBatch, type PodProductionBatchStore } from "../../src/lib/podProductionBatchPersistence.js";
import { verifyPodPrintAssetSet, type PodPrintAssetSetItem, type PodPrintAssetSetStore } from "../../src/lib/podPrintAssetSet.js";
import { hashPodProductionProofManifest, type PodProductionProofStore } from "../../src/lib/podProductionProof.js";
import type { PodProductionReleaseStore } from "./pod-production-release-store.js";

export type PodProductionReadinessStatus = "READY_FOR_RELEASE" | "BLOCKED";
export interface PodProductionReadinessCheck { code: string; ok: boolean; detail: string }
export interface PodProductionReadinessReport {
  status: PodProductionReadinessStatus;
  batch_id: string;
  release_id: string;
  checks: PodProductionReadinessCheck[];
  warnings: string[];
}

const configured = (env: NodeJS.ProcessEnv, name: string, kind: "hash" | "url" | "host" | "value") => {
  const value = (env[name] || "").trim();
  if (!value) return false;
  if (kind === "hash") return /^[0-9a-f]{64}$/i.test(value);
  if (kind === "url") { try { return new URL(value).protocol === "https:"; } catch { return false; } }
  if (kind === "host") return value.split(",").every((part) => /^[a-z0-9.-]+$/i.test(part.trim()) && !part.includes("*"));
  return true;
};

const configurationChecks = (env: NodeJS.ProcessEnv): PodProductionReadinessCheck[] => {
  const checks: PodProductionReadinessCheck[] = [
  ["POD_PRINT_ARTIFACT_BUCKET", "value"],
  ["POD_PRINT_ASSET_ALLOWED_HOSTS", "host"],
  ["POD_PRINT_FONT_ALLOWED_HOSTS", "host"],
  ["POD_PRINT_TEMPLATE_FRONT_SHA256", "hash"],
  ["POD_PRINT_TEMPLATE_BACK_SHA256", "hash"],
  ["POD_PRINT_FONT_INTER_300_URL", "url"],
  ["POD_PRINT_FONT_INTER_300_SHA256", "hash"],
  ["POD_PRINT_FONT_INTER_400_URL", "url"],
  ["POD_PRINT_FONT_INTER_400_SHA256", "hash"],
  ["POD_PRINT_FONT_PATRICK_HAND_400_URL", "url"],
  ["POD_PRINT_FONT_PATRICK_HAND_400_SHA256", "hash"],
  ].map(([name, kind]) => ({
  code: `configuration:${name}`,
  ok: configured(env, name, kind as "hash" | "url" | "host" | "value"),
  detail: configured(env, name, kind as "hash" | "url" | "host" | "value") ? "configured" : "missing_or_invalid",
  }));
  const allowedFontHosts = new Set((env.POD_PRINT_FONT_ALLOWED_HOSTS || "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean));
  for (const name of ["POD_PRINT_FONT_INTER_300_URL", "POD_PRINT_FONT_INTER_400_URL", "POD_PRINT_FONT_PATRICK_HAND_400_URL"]) {
    let host = "";
    try { host = new URL(env[name] || "").hostname.toLowerCase(); } catch { /* URL syntax check reports the failure. */ }
    checks.push({ code: `configuration:${name}:allowlist`, ok: Boolean(host && allowedFontHosts.has(host)), detail: host || "invalid_url" });
  }
  return checks;
};

export const evaluatePodProductionReadiness = async (input: {
  batchId: string;
  releaseId: string;
  batchStore: PodProductionBatchStore;
  artifactStore: PodProductionBatchArtifactStore;
  assetSetStore: PodPrintAssetSetStore;
  proofStore: PodProductionProofStore;
  releaseStore: PodProductionReleaseStore;
  storage: PodPrintArtifactStorage;
  env: NodeJS.ProcessEnv;
}): Promise<PodProductionReadinessReport> => {
  const checks = configurationChecks(input.env);
  const warnings: string[] = [];
  const batch = await readFrozenPodProductionBatch(input.batchStore, input.batchId);
  checks.push({ code: "batch:frozen", ok: Boolean(batch), detail: batch ? batch.header.batch_sha256 : "missing_or_not_frozen" });
  const release = await input.releaseStore.readRelease(input.releaseId);
  const releaseMatches = Boolean(release && batch && release.data.batch_id === batch.header.id && release.data.batch_sha256 === batch.header.batch_sha256);
  checks.push({ code: "release:batch_binding", ok: releaseMatches, detail: releaseMatches ? release!.data.status : "missing_or_mismatch" });
  if (!batch || !release || !releaseMatches) return { status: "BLOCKED", batch_id: input.batchId, release_id: input.releaseId, checks, warnings };

  if (batch.manifest.groups.some((group) => group.positions.some((position) => position.format_source === "legacy_fallback_v1"))) {
    warnings.push("legacy_print_format_fallback_present");
  }

  for (const group of batch.manifest.groups) {
    const artifactId = await derivePodProductionBatchArtifactId(batch.header.id, group.group_index);
    try {
      const result = await reprintPodProductionBatchArtifact(input.storage, input.artifactStore, artifactId);
      checks.push({ code: `batch_artifact:${group.group_index}`, ok: result.artifact.batch_sha256 === batch.header.batch_sha256, detail: result.artifact.storage_generation });
    } catch (error) {
      checks.push({ code: `batch_artifact:${group.group_index}`, ok: false, detail: error instanceof Error ? error.message : "unavailable" });
    }
  }

  for (const assetSet of batch.manifest.asset_sets) {
    const header = await input.assetSetStore.readHeader(assetSet.id);
    let ok = Boolean(header && header.data.state === "frozen" && header.data.asset_set_sha256 === assetSet.sha256);
    let detail = ok ? "frozen" : "missing_or_hash_mismatch";
    const items: PodPrintAssetSetItem[] = [];
    if (ok && header) {
      for (let chunkIndex = 0; chunkIndex < header.data.chunk_count && ok; chunkIndex += 1) {
        const chunk = await input.assetSetStore.readChunk(`${assetSet.id}-${String(chunkIndex).padStart(6, "0")}`);
        if (!chunk) { ok = false; detail = "chunk_missing"; break; }
        for (const itemId of chunk.item_ids) {
          const item = await input.assetSetStore.readItem(itemId);
          if (!item?.storage_generation) { ok = false; detail = "item_or_generation_missing"; break; }
          items.push(item);
          try {
            const metadata = await input.storage.readMetadata(item.storage_object, item.storage_generation);
            const bytes = await input.storage.download(item.storage_object, item.storage_generation);
            if (metadata.generation !== item.storage_generation || metadata.size !== item.size_bytes
              || bytes.byteLength !== item.size_bytes || await sha256Bytes(bytes) !== item.sha256
              || metadata.contentType !== item.content_type || metadata.metadata.asset_sha256 !== item.sha256) {
              ok = false; detail = "storage_metadata_mismatch"; break;
            }
          } catch (error) { ok = false; detail = error instanceof Error ? error.message : "storage_unavailable"; break; }
        }
      }
    }
    if (ok && header) {
      try { await verifyPodPrintAssetSet(header.data, items); }
      catch (error) { ok = false; detail = error instanceof Error ? error.message : "asset_set_integrity_mismatch"; }
    }
    checks.push({ code: `asset_set:${assetSet.id}`, ok, detail });
  }

  const approvedFormats = new Set<string>();
  const proofArtifactIds = Array.isArray(release.data.proof_artifact_ids) ? release.data.proof_artifact_ids : [];
  const proofApprovalEventIds = Array.isArray(release.data.proof_approval_event_ids) ? release.data.proof_approval_event_ids : [];
  checks.push({
    code: "release:proof_references",
    ok: proofArtifactIds.length > 0 && proofArtifactIds.length === proofApprovalEventIds.length,
    detail: `${proofArtifactIds.length}:${proofApprovalEventIds.length}`,
  });
  for (let index = 0; index < proofArtifactIds.length; index += 1) {
    const artifactId = proofArtifactIds[index];
    const eventId = proofApprovalEventIds[index];
    const artifact = await input.proofStore.readArtifact(artifactId);
    const event = eventId ? await input.proofStore.readApproval(eventId) : null;
    let ok = Boolean(artifact && event && event.proof_artifact_id === artifact.id && event.proof_sha256 === artifact.proof_sha256);
    let detail = ok ? artifact!.storage_generation : "approval_missing_or_mismatch";
    if (ok && artifact) {
      try {
        if (await hashPodProductionProofManifest(artifact.proof_manifest) !== artifact.proof_sha256
          || artifact.proof_manifest.print_format_id !== artifact.print_format_id) {
          throw new Error("proof_manifest_hash_mismatch");
        }
        const metadata = await input.storage.readMetadata(artifact.storage_object, artifact.storage_generation);
        const bytes = await input.storage.download(artifact.storage_object, artifact.storage_generation);
        ok = metadata.generation === artifact.storage_generation && metadata.size === artifact.size_bytes
          && metadata.contentType === artifact.content_type && bytes.byteLength === artifact.size_bytes
          && await sha256Bytes(bytes) === artifact.pdf_sha256 && metadata.bucket === artifact.storage_bucket
          && metadata.metageneration === artifact.storage_metageneration && metadata.crc32c === artifact.crc32c
          && metadata.md5Hash === artifact.md5_hash;
        if (ok) approvedFormats.add(artifact.print_format_id); else detail = "proof_generation_mismatch";
      } catch (error) { ok = false; detail = error instanceof Error ? error.message : "proof_unavailable"; }
    }
    checks.push({ code: `physical_proof:${artifactId}`, ok, detail });
  }
  for (const formatId of new Set(batch.manifest.groups.map((group) => group.print_format_id))) {
    checks.push({ code: `physical_proof_format:${formatId}`, ok: approvedFormats.has(formatId), detail: approvedFormats.has(formatId) ? "approved" : "missing" });
  }

  return { status: checks.every((check) => check.ok) ? "READY_FOR_RELEASE" : "BLOCKED", batch_id: batch.header.id, release_id: release.data.id, checks, warnings };
};
