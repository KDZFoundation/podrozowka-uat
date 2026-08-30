import { corsHeaders, json, preflight } from "../../../api/_lib/http.js";
import { gcpPodPrintArtifactStorage } from "../../../api/_lib/gcp-storage.js";
import { requireAdmin } from "../../auth/require-admin.js";
import {
  PodPrintArtifactError,
  createPodPrintArtifact,
  reprintPodPrintArtifact,
  type PodPrintArtifactStorage,
  type PodPrintArtifactStore,
} from "../../../src/lib/podPrintArtifact.js";
import { PodPrintManifestIntegrityError, readFrozenPodPrintManifest, type PodPrintManifestStore } from "../../../src/lib/podPrintManifestPersistence.js";
import { sha256Utf8 } from "../../../src/lib/podPrintManifest.js";
import { POD_PDF_RENDERER_VERSION } from "../../../src/lib/podPdfMetadata.js";
import { gcpPodPrintArtifactStore } from "../../services/pod-print-artifact-store.js";
import { gcpPodPrintManifestStore } from "../../services/pod-print-manifest-store.js";

const MAX_PDF_BYTES = 80 * 1024 * 1024;

export interface PodPrintArtifactRouteDependencies {
  authorize: typeof requireAdmin;
  artifactStore: PodPrintArtifactStore;
  manifestStore: PodPrintManifestStore;
  storage: PodPrintArtifactStorage;
  now: () => string;
}

const responseHeaders = (artifactId: string, pdfSha256: string) => ({
  ...corsHeaders,
  "Cache-Control": "private, no-store",
  "Content-Disposition": `attachment; filename="${artifactId}.pdf"`,
  "Content-Type": "application/pdf",
  "X-POD-Artifact-Id": artifactId,
  "X-POD-PDF-SHA256": pdfSha256,
});

const errorStatus = (code: string) => {
  if (code.endsWith("_not_found") || code === "pod_artifact_missing_object") return 404;
  if (code.endsWith("_too_large")) return 413;
  if (code.endsWith("_required") || code.endsWith("_invalid") || code === "pod_artifact_empty_pdf") return 400;
  if (code === "pod_artifact_asset_version_missing") return 422;
  if (code.includes("conflict") || code.includes("mismatch") || code.includes("not_frozen")) return 409;
  return 500;
};

const assertHttpUrl = (value: string, code: string) => {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new PodPrintArtifactError(code);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new PodPrintArtifactError(code);
};

const validateFrozenRenderAssets = (manifest: Awaited<ReturnType<typeof readFrozenPodPrintManifest>>) => {
  if (!manifest) return;
  for (const item of manifest.manifest.format_groups.flatMap((group) => group.items)) {
    const input = item.render_input;
    assertHttpUrl(input.qr_url, "pod_artifact_qr_url_invalid");
    if (input.image_front_url) {
      assertHttpUrl(input.image_front_url, "pod_artifact_asset_url_invalid");
      if (!input.image_version?.trim()) throw new PodPrintArtifactError("pod_artifact_asset_version_missing");
    }
    if (input.country_flag_url) assertHttpUrl(input.country_flag_url, "pod_artifact_asset_url_invalid");
  }
};

export const createPodPrintArtifactHandler = (dependencies: PodPrintArtifactRouteDependencies) => ({
  fetch: async (request: Request) => {
    if (request.method === "OPTIONS") return preflight();
    const denied = await dependencies.authorize(request);
    if (denied) return denied;
    try {
      const url = new URL(request.url);
      if (request.method === "GET") {
        const artifactId = url.searchParams.get("artifact_id")?.trim() || "";
        if (!artifactId) throw new PodPrintArtifactError("pod_artifact_id_required");
        const result = await reprintPodPrintArtifact(dependencies.storage, dependencies.artifactStore, artifactId);
        return new Response(Uint8Array.from(result.bytes).buffer, {
          status: 200,
          headers: responseHeaders(result.artifact.id, result.artifact.pdf_sha256),
        });
      }
      if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
      const manifestId = url.searchParams.get("manifest_id")?.trim() || "";
      const printJobId = url.searchParams.get("print_job_id")?.trim() || "";
      const rendererVersion = url.searchParams.get("renderer_version")?.trim() || "";
      if (!manifestId) throw new PodPrintArtifactError("pod_artifact_manifest_id_required");
      if (!printJobId) throw new PodPrintArtifactError("pod_artifact_print_job_id_required");
      if (!rendererVersion) throw new PodPrintArtifactError("pod_artifact_renderer_version_required");
      if (request.headers.get("content-type")?.split(";", 1)[0] !== "application/pdf") {
        throw new PodPrintArtifactError("pod_artifact_content_type_invalid");
      }
      const contentLength = Number(request.headers.get("content-length") || 0);
      if (contentLength > MAX_PDF_BYTES) throw new PodPrintArtifactError("pod_artifact_pdf_too_large");
      const pdfBytes = new Uint8Array(await request.arrayBuffer());
      if (pdfBytes.byteLength > MAX_PDF_BYTES) throw new PodPrintArtifactError("pod_artifact_pdf_too_large");
      if (new TextDecoder().decode(pdfBytes.slice(0, 5)) !== "%PDF-") {
        throw new PodPrintArtifactError("pod_artifact_pdf_invalid");
      }
      const frozen = await readFrozenPodPrintManifest(dependencies.manifestStore, manifestId);
      if (!frozen) throw new PodPrintArtifactError("pod_artifact_manifest_not_found");
      if (printJobId !== frozen.header.batch_id) throw new PodPrintArtifactError("pod_artifact_print_job_id_mismatch");
      if (rendererVersion !== POD_PDF_RENDERER_VERSION) throw new PodPrintArtifactError("pod_artifact_renderer_version_mismatch");
      if (frozen.header.id !== manifestId || frozen.header.manifest_sha256 !== await sha256Utf8(frozen.canonicalJson)) {
        throw new PodPrintArtifactError("pod_artifact_manifest_hash_mismatch");
      }
      validateFrozenRenderAssets(frozen);
      const result = await createPodPrintArtifact(dependencies.storage, dependencies.artifactStore, {
        printJobId,
        rendererVersion,
        pdfBytes,
        createdAt: dependencies.now(),
        manifest: {
          id: frozen.header.id,
          state: frozen.header.state,
          manifest_sha256: frozen.header.manifest_sha256,
          print_job_ids: frozen.header.print_job_ids,
          print_format_ids: frozen.header.print_format_ids,
          sheet_count: frozen.header.sheet_count,
          postcard_count: frozen.header.postcard_count,
        },
      });
      return json({
        artifact_id: result.artifact.id,
        manifest_sha256: result.artifact.manifest_sha256,
        pdf_sha256: result.artifact.pdf_sha256,
        storage_generation: result.artifact.storage_generation,
        size_bytes: result.artifact.size_bytes,
        created: result.created,
      });
    } catch (error) {
      if (error instanceof PodPrintArtifactError) return json({ error: error.code }, errorStatus(error.code));
      if (error instanceof PodPrintManifestIntegrityError) {
        const code = error.message.includes("not_frozen")
          ? "pod_artifact_manifest_not_frozen"
          : "pod_artifact_manifest_hash_mismatch";
        return json({ error: code }, 409);
      }
      const message = error instanceof Error ? error.message : "pod_artifact_request_failed";
      return json({ error: message }, 500);
    }
  },
});

export default createPodPrintArtifactHandler({
  authorize: requireAdmin,
  artifactStore: gcpPodPrintArtifactStore,
  manifestStore: gcpPodPrintManifestStore,
  storage: gcpPodPrintArtifactStorage,
  now: () => new Date().toISOString(),
});
