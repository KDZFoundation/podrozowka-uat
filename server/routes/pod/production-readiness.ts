import { json, preflight } from "../../../api/_lib/http.js";
import { gcpPodPrintArtifactStorage } from "../../../api/_lib/gcp-storage.js";
import { requireAdmin } from "../../auth/require-admin.js";
import { gcpPodPrintAssetSetStore } from "../../services/pod-print-asset-set-store.js";
import { gcpPodProductionBatchArtifactStore } from "../../services/pod-production-batch-artifact-store.js";
import { gcpPodProductionBatchStore } from "../../services/pod-production-batch-store.js";
import { gcpPodProductionProofStore } from "../../services/pod-production-proof-store.js";
import { evaluatePodProductionReadiness } from "../../services/pod-production-readiness.js";
import { gcpPodProductionReleaseStore } from "../../services/pod-production-release-store.js";

export default {
  async fetch(request: Request) {
    if (request.method === "OPTIONS") return preflight();
    const denied = await requireAdmin(request);
    if (denied) return denied;
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    try {
      const body = await request.json().catch(() => null) as { batch_id?: unknown; release_id?: unknown } | null;
      const batchId = typeof body?.batch_id === "string" ? body.batch_id.trim() : "";
      const releaseId = typeof body?.release_id === "string" ? body.release_id.trim() : "";
      if (!batchId || !releaseId) return json({ error: "pod_readiness_reference_required" }, 400);
      const report = await evaluatePodProductionReadiness({
        batchId,
        releaseId,
        batchStore: gcpPodProductionBatchStore,
        artifactStore: gcpPodProductionBatchArtifactStore,
        assetSetStore: gcpPodPrintAssetSetStore,
        proofStore: gcpPodProductionProofStore,
        releaseStore: gcpPodProductionReleaseStore,
        storage: gcpPodPrintArtifactStorage,
        env: process.env,
      });
      return json(report, report.status === "READY_FOR_RELEASE" ? 200 : 409);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "pod_readiness_request_failed" }, 500);
    }
  },
};
