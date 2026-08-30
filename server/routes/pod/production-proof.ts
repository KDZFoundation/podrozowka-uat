import { corsHeaders, json, preflight } from "../../../api/_lib/http.js";
import { gcpPodPrintArtifactStorage } from "../../../api/_lib/gcp-storage.js";
import { requireAdmin } from "../../auth/require-admin.js";
import { getPodPrintFormat } from "../../../src/lib/podPrintFormats.js";
import {
  PodProductionProofError,
  createPodProductionProofArtifact,
  derivePodProductionProofApprovalId,
  readPodProductionProofArtifact,
  type PodProductionProofStore,
} from "../../../src/lib/podProductionProof.js";
import type { PodPrintArtifactStorage } from "../../../src/lib/podPrintArtifact.js";
import { gcpPodProductionProofStore } from "../../services/pod-production-proof-store.js";

interface Dependencies {
  authorize: typeof requireAdmin;
  store: PodProductionProofStore;
  storage: PodPrintArtifactStorage;
  now: () => string;
}

const adminUid = (request: Request) => {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] || "";
  try {
    const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")) as { sub?: unknown };
    return typeof claims.sub === "string" ? claims.sub : "authenticated-admin";
  } catch { return "authenticated-admin"; }
};

const statusFor = (code: string) => code.includes("not_found") ? 404
  : code.includes("required") || code.includes("invalid") || code.includes("unknown") ? 400
    : code.includes("conflict") || code.includes("mismatch") ? 409 : 500;

export const createPodProductionProofHandler = (dependencies: Dependencies) => ({
  fetch: async (request: Request) => {
    if (request.method === "OPTIONS") return preflight();
    const denied = await dependencies.authorize(request);
    if (denied) return denied;
    try {
      const url = new URL(request.url);
      if (request.method === "GET") {
        const artifactId = url.searchParams.get("artifact_id")?.trim() || "";
        const result = await readPodProductionProofArtifact(dependencies.storage, dependencies.store, artifactId);
        return new Response(Uint8Array.from(result.bytes).buffer, {
          headers: {
            ...corsHeaders,
            "Cache-Control": "private, no-store",
            "Content-Disposition": `attachment; filename="proof-${result.artifact.print_format_id}.pdf"`,
            "Content-Type": "application/pdf",
            "X-POD-Proof-Artifact-Id": result.artifact.id,
            "X-POD-Proof-SHA256": result.artifact.proof_sha256,
            "X-POD-PDF-SHA256": result.artifact.pdf_sha256,
            "X-POD-Storage-Generation": result.artifact.storage_generation,
          },
        });
      }
      if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
      const body = await request.json().catch(() => null) as Record<string, unknown> | null;
      const operation = body?.operation === "approve" ? "approve" : "create";
      if (operation === "create") {
        const formatId = typeof body?.print_format_id === "string" ? body.print_format_id.trim() : "";
        const result = await createPodProductionProofArtifact(dependencies.storage, dependencies.store, {
          format: getPodPrintFormat(formatId),
          createdAt: dependencies.now(),
          createdBy: adminUid(request),
        });
        return json({ artifact: result.artifact, created: result.created });
      }
      const artifactId = typeof body?.artifact_id === "string" ? body.artifact_id.trim() : "";
      const idempotencyKey = typeof body?.idempotency_key === "string" ? body.idempotency_key.trim() : "";
      const comment = typeof body?.comment === "string" ? body.comment.trim() : "";
      if (body?.confirm_physical_proof !== true || !comment) throw new PodProductionProofError("pod_proof_manual_confirmation_required");
      if (comment.length > 2000) throw new PodProductionProofError("pod_proof_approval_comment_invalid");
      const artifact = await dependencies.store.readArtifact(artifactId);
      if (!artifact) throw new PodProductionProofError("pod_proof_artifact_not_found");
      const id = await derivePodProductionProofApprovalId(artifactId, idempotencyKey);
      const event = {
        id,
        proof_artifact_id: artifact.id,
        proof_sha256: artifact.proof_sha256,
        event_type: "PHYSICAL_PROOF_APPROVED" as const,
        idempotency_key: idempotencyKey,
        comment,
        actor_uid: adminUid(request),
        created_at: dependencies.now(),
        schema_version: 1 as const,
      };
      const existing = await dependencies.store.readApproval(id);
      if (existing) {
        if (existing.proof_artifact_id !== event.proof_artifact_id || existing.proof_sha256 !== event.proof_sha256
          || existing.comment !== event.comment || existing.actor_uid !== event.actor_uid) {
          throw new PodProductionProofError("pod_proof_approval_idempotency_conflict");
        }
        return json({ approval_event: existing, created: false });
      }
      try {
        await dependencies.store.createApproval(id, event);
      } catch {
        const concurrent = await dependencies.store.readApproval(id);
        if (!concurrent || concurrent.proof_artifact_id !== event.proof_artifact_id
          || concurrent.proof_sha256 !== event.proof_sha256 || concurrent.comment !== event.comment
          || concurrent.actor_uid !== event.actor_uid) {
          throw new PodProductionProofError("pod_proof_approval_idempotency_conflict");
        }
        return json({ approval_event: concurrent, created: false });
      }
      return json({ approval_event: event, created: true });
    } catch (error) {
      if (error instanceof PodProductionProofError) return json({ error: error.code }, statusFor(error.code));
      return json({ error: error instanceof Error ? error.message : "pod_proof_request_failed" }, 500);
    }
  },
});

export default createPodProductionProofHandler({
  authorize: requireAdmin,
  store: gcpPodProductionProofStore,
  storage: gcpPodPrintArtifactStorage,
  now: () => new Date().toISOString(),
});
