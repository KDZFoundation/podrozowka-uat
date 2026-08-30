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
import { POD_RENDER_PROFILE_VERSION } from "../../../src/lib/podRenderProfile.js";
import {
  PodPrintAssetSetError,
  type PodPrintAssetSetItem,
  type PodPrintAssetSetStore,
} from "../../../src/lib/podPrintAssetSet.js";
import { gcpPodPrintAssetSetStore } from "../../services/pod-print-asset-set-store.js";
import { readCompletePodPrintAssetSet } from "./print-assets.js";

const MAX_PDF_BYTES = 80 * 1024 * 1024;

export interface PodPrintArtifactRouteDependencies {
  authorize: typeof requireAdmin;
  artifactStore: PodPrintArtifactStore;
  manifestStore: PodPrintManifestStore;
  storage: PodPrintArtifactStorage;
  assetSetStore: PodPrintAssetSetStore;
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

const validateAssetCoverage = (
  manifest: NonNullable<Awaited<ReturnType<typeof readFrozenPodPrintManifest>>>,
  items: PodPrintAssetSetItem[],
) => {
  const positions = manifest.manifest.format_groups.flatMap((group) => group.items);
  if (items.length !== 5 + positions.length * 3) {
    throw new PodPrintArtifactError("pod_artifact_asset_coverage_mismatch:item_count");
  }
  const exact = (role: string, printJobItemId: string | null, sharedKey: string | null = null) => {
    const matches = items.filter((item) => item.asset_role === role
      && item.print_job_item_id === printJobItemId
      && (sharedKey === null || item.shared_key === sharedKey));
    if (matches.length !== 1) throw new PodPrintArtifactError(`pod_artifact_asset_coverage_mismatch:${role}`);
    return matches[0];
  };
  exact("postcard_front_template", null, "postcard-front-template");
  exact("postcard_back_template", null, "postcard-back-template");
  exact("print_font", null, "inter-300");
  exact("print_font", null, "inter-400");
  exact("print_font", null, "patrick-hand-400");
  for (const position of positions) {
    for (const role of ["postcard_front_photo", "country_flag", "qr_raster"] as const) {
      const asset = exact(role, position.print_job_item_id);
      if (asset.render_input_sha256 !== position.render_input_sha256) {
        throw new PodPrintArtifactError(`pod_artifact_asset_coverage_mismatch:${role}`);
      }
    }
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
      const assetSetId = url.searchParams.get("asset_set_id")?.trim() || "";
      if (!manifestId) throw new PodPrintArtifactError("pod_artifact_manifest_id_required");
      if (!printJobId) throw new PodPrintArtifactError("pod_artifact_print_job_id_required");
      if (!rendererVersion) throw new PodPrintArtifactError("pod_artifact_renderer_version_required");
      if (!assetSetId) throw new PodPrintArtifactError("pod_artifact_asset_set_id_required");
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
      const assetSet = await readCompletePodPrintAssetSet(dependencies.assetSetStore, assetSetId);
      if (!assetSet || assetSet.header.manifest_id !== manifestId
        || assetSet.header.manifest_sha256 !== frozen.header.manifest_sha256
        || assetSet.header.render_profile_version !== POD_RENDER_PROFILE_VERSION) {
        throw new PodPrintArtifactError("pod_artifact_asset_set_mismatch");
      }
      validateAssetCoverage(frozen, assetSet.items);
      const result = await createPodPrintArtifact(dependencies.storage, dependencies.artifactStore, {
        printJobId,
        rendererVersion,
        pdfBytes,
        createdAt: dependencies.now(),
        assetSet: {
          id: assetSet.header.id,
          assetSetSha256: assetSet.header.asset_set_sha256,
          renderProfileVersion: assetSet.header.render_profile_version,
        },
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
        asset_set_id: result.artifact.asset_set_id,
        asset_set_sha256: result.artifact.asset_set_sha256,
        render_profile_version: result.artifact.render_profile_version,
        storage_generation: result.artifact.storage_generation,
        size_bytes: result.artifact.size_bytes,
        created: result.created,
      });
    } catch (error) {
      if (error instanceof PodPrintArtifactError) return json({ error: error.code }, errorStatus(error.code));
      if (error instanceof PodPrintAssetSetError) return json({ error: error.code }, errorStatus(error.code));
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
  assetSetStore: gcpPodPrintAssetSetStore,
  now: () => new Date().toISOString(),
});
