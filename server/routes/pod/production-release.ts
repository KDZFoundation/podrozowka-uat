import { json, preflight } from "../../../api/_lib/http.js";
import { gcpPodPrintArtifactStorage } from "../../../api/_lib/gcp-storage.js";
import { requireAdmin } from "../../auth/require-admin.js";
import {
  PodProductionReleaseError,
  derivePodProductionReleaseEventId,
  derivePodProductionReleaseId,
  nextPodProductionReleaseStatus,
  type PodProductionReleaseEventType,
} from "../../../src/lib/podProductionRelease.js";
import { readFrozenPodProductionBatch } from "../../../src/lib/podProductionBatchPersistence.js";
import { gcpPodPrintAssetSetStore } from "../../services/pod-print-asset-set-store.js";
import { gcpPodProductionBatchArtifactStore } from "../../services/pod-production-batch-artifact-store.js";
import { gcpPodProductionBatchStore } from "../../services/pod-production-batch-store.js";
import { gcpPodProductionProofStore } from "../../services/pod-production-proof-store.js";
import { evaluatePodProductionReadiness } from "../../services/pod-production-readiness.js";
import { gcpPodProductionReleaseStore } from "../../services/pod-production-release-store.js";

const adminUid = (request: Request) => {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] || "";
  try {
    const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")) as { sub?: unknown };
    return typeof claims.sub === "string" ? claims.sub : "authenticated-admin";
  } catch { return "authenticated-admin"; }
};

const eventType = (value: unknown): PodProductionReleaseEventType => {
  if (value === "MARKED_READY" || value === "RELEASED_TO_PRINTER" || value === "CANCELLED") return value;
  throw new PodProductionReleaseError("pod_release_event_type_invalid");
};

const statusFor = (code: string) => code.includes("not_found") ? 404
  : code.includes("required") || code.includes("invalid") || code.includes("duplicate") ? 400
    : code.includes("blocked") || code.includes("conflict") || code.includes("mismatch") || code.includes("transition") ? 409 : 500;

export default {
  async fetch(request: Request) {
    if (request.method === "OPTIONS") return preflight();
    const denied = await requireAdmin(request);
    if (denied) return denied;
    try {
      if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
      const body = await request.json().catch(() => null) as Record<string, unknown> | null;
      const operation = body?.operation === "transition" || body?.operation === "get" ? body.operation : "create";
      const actor = adminUid(request);
      const now = new Date().toISOString();
      if (operation === "get") {
        const releaseId = typeof body?.release_id === "string" ? body.release_id.trim() : "";
        const release = await gcpPodProductionReleaseStore.readRelease(releaseId);
        if (!release) throw new PodProductionReleaseError("pod_release_not_found");
        return json({ release: release.data });
      }

      const idempotencyKey = typeof body?.idempotency_key === "string" ? body.idempotency_key.trim() : "";
      if (!idempotencyKey) throw new PodProductionReleaseError("pod_release_idempotency_key_required");
      if (operation === "create") {
        const batchId = typeof body?.batch_id === "string" ? body.batch_id.trim() : "";
        let proofArtifactIds = Array.isArray(body?.proof_artifact_ids)
          ? body.proof_artifact_ids.map(String).map((value) => value.trim()).filter(Boolean) : [];
        let proofApprovalEventIds = Array.isArray(body?.proof_approval_event_ids)
          ? body.proof_approval_event_ids.map(String).map((value) => value.trim()).filter(Boolean) : [];
        if (!batchId || !proofArtifactIds.length || proofArtifactIds.length !== proofApprovalEventIds.length) {
          throw new PodProductionReleaseError("pod_release_proof_references_required");
        }
        if (new Set(proofArtifactIds).size !== proofArtifactIds.length
          || new Set(proofApprovalEventIds).size !== proofApprovalEventIds.length) {
          throw new PodProductionReleaseError("pod_release_proof_reference_duplicate");
        }
        const proofPairs = proofArtifactIds.map((artifactId, index) => ({ artifactId, approvalId: proofApprovalEventIds[index] }))
          .sort((left, right) => left.artifactId.localeCompare(right.artifactId));
        proofArtifactIds = proofPairs.map((pair) => pair.artifactId);
        proofApprovalEventIds = proofPairs.map((pair) => pair.approvalId);
        const batch = await readFrozenPodProductionBatch(gcpPodProductionBatchStore, batchId);
        if (!batch) throw new PodProductionReleaseError("pod_release_batch_not_found");
        const proofFormats = new Set<string>();
        for (let index = 0; index < proofArtifactIds.length; index += 1) {
          const artifact = await gcpPodProductionProofStore.readArtifact(proofArtifactIds[index]);
          const approval = await gcpPodProductionProofStore.readApproval(proofApprovalEventIds[index]);
          if (!artifact || !approval || approval.proof_artifact_id !== artifact.id || approval.proof_sha256 !== artifact.proof_sha256) {
            throw new PodProductionReleaseError("pod_release_proof_approval_mismatch");
          }
          if (proofFormats.has(artifact.print_format_id)) throw new PodProductionReleaseError("pod_release_proof_format_duplicate");
          proofFormats.add(artifact.print_format_id);
        }
        const batchFormats = new Set(batch.manifest.groups.map((group) => group.print_format_id));
        if (proofFormats.size !== batchFormats.size || [...batchFormats].some((formatId) => !proofFormats.has(formatId))) {
          throw new PodProductionReleaseError("pod_release_proof_format_mismatch");
        }
        const id = await derivePodProductionReleaseId(batchId);
        const eventId = await derivePodProductionReleaseEventId(id, idempotencyKey);
        const existingEvent = await gcpPodProductionReleaseStore.readEvent(eventId);
        const existing = await gcpPodProductionReleaseStore.readRelease(id);
        if (existingEvent || existing) {
          if (!existingEvent || !existing || existingEvent.event_type !== "CREATED" || existing.data.batch_sha256 !== batch.header.batch_sha256) {
            throw new PodProductionReleaseError("pod_release_idempotency_conflict");
          }
          return json({ release: existing.data, event: existingEvent, created: false });
        }
        const release = {
          id,
          release_version: 1 as const,
          batch_id: batch.header.id,
          batch_sha256: batch.header.batch_sha256,
          status: "DRAFT" as const,
          proof_artifact_ids: proofArtifactIds,
          proof_approval_event_ids: proofApprovalEventIds,
          created_at: now,
          created_by: actor,
          updated_at: now,
          schema_version: 1 as const,
        };
        const event = {
          id: eventId,
          release_id: id,
          batch_id: batch.header.id,
          event_type: "CREATED" as const,
          from_status: null,
          to_status: "DRAFT" as const,
          idempotency_key: idempotencyKey,
          actor_uid: actor,
          reason: null,
          created_at: now,
          schema_version: 1 as const,
        };
        try {
          await gcpPodProductionReleaseStore.createRelease(release, event);
        } catch {
          const concurrentEvent = await gcpPodProductionReleaseStore.readEvent(eventId);
          const concurrentRelease = await gcpPodProductionReleaseStore.readRelease(id);
          if (!concurrentEvent || !concurrentRelease || concurrentEvent.event_type !== "CREATED"
            || concurrentRelease.data.batch_sha256 !== batch.header.batch_sha256) {
            throw new PodProductionReleaseError("pod_release_idempotency_conflict");
          }
          return json({ release: concurrentRelease.data, event: concurrentEvent, created: false });
        }
        return json({ release, event, created: true });
      }

      const releaseId = typeof body?.release_id === "string" ? body.release_id.trim() : "";
      const type = eventType(body?.event_type);
      const current = await gcpPodProductionReleaseStore.readRelease(releaseId);
      if (!current) throw new PodProductionReleaseError("pod_release_not_found");
      const eventId = await derivePodProductionReleaseEventId(releaseId, idempotencyKey);
      const existingEvent = await gcpPodProductionReleaseStore.readEvent(eventId);
      if (existingEvent) {
        if (existingEvent.event_type !== type || existingEvent.release_id !== releaseId) throw new PodProductionReleaseError("pod_release_idempotency_conflict");
        return json({ release: current.data, event: existingEvent, created: false });
      }
      const next = nextPodProductionReleaseStatus(current.data.status, type);
      let readiness = null;
      if (type === "MARKED_READY" || type === "RELEASED_TO_PRINTER") {
        readiness = await evaluatePodProductionReadiness({
          batchId: current.data.batch_id,
          releaseId,
          batchStore: gcpPodProductionBatchStore,
          artifactStore: gcpPodProductionBatchArtifactStore,
          assetSetStore: gcpPodPrintAssetSetStore,
          proofStore: gcpPodProductionProofStore,
          releaseStore: gcpPodProductionReleaseStore,
          storage: gcpPodPrintArtifactStorage,
          env: process.env,
        });
        if (readiness.status !== "READY_FOR_RELEASE") throw new PodProductionReleaseError("pod_release_blocked_by_readiness");
      }
      const reason = typeof body?.reason === "string" && body.reason.trim() ? body.reason.trim() : null;
      if (reason && reason.length > 2000) throw new PodProductionReleaseError("pod_release_reason_invalid");
      const release = { ...current.data, status: next, updated_at: now };
      const event = {
        id: eventId,
        release_id: releaseId,
        batch_id: current.data.batch_id,
        event_type: type,
        from_status: current.data.status,
        to_status: next,
        idempotency_key: idempotencyKey,
        actor_uid: actor,
        reason,
        created_at: now,
        schema_version: 1 as const,
      };
      try {
        await gcpPodProductionReleaseStore.transition(release, current.updateTime, event);
      } catch {
        const concurrentEvent = await gcpPodProductionReleaseStore.readEvent(eventId);
        const concurrentRelease = await gcpPodProductionReleaseStore.readRelease(releaseId);
        if (!concurrentEvent || !concurrentRelease || concurrentEvent.event_type !== type
          || concurrentEvent.to_status !== next || concurrentRelease.data.status !== next) {
          throw new PodProductionReleaseError("pod_release_cas_conflict");
        }
        return json({ release: concurrentRelease.data, event: concurrentEvent, readiness, created: false });
      }
      return json({ release, event, readiness, created: true });
    } catch (error) {
      if (error instanceof PodProductionReleaseError) return json({ error: error.code }, statusFor(error.code));
      return json({ error: error instanceof Error ? error.message : "pod_release_request_failed" }, 500);
    }
  },
};
