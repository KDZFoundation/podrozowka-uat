// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createPodPrintArtifactHandler } from "../../server/routes/pod/print-artifact";
import {
  derivePodPrintArtifactId,
  sha256Bytes,
  type PodPrintArtifactDocument,
  type PodPrintArtifactStorageMetadata,
} from "../lib/podPrintArtifact";

const forbidden = Response.json({ error: "admin_access_required" }, { status: 403 });

const unusedManifestStore = {
  readHeader: vi.fn(),
  createHeader: vi.fn(),
  readChunk: vi.fn(),
  createChunk: vi.fn(),
  freezeHeader: vi.fn(),
};

describe("POD print artifact endpoint", () => {
  it("rejects unauthenticated requests before reading Storage or Firestore", async () => {
    const artifactRead = vi.fn();
    const storageRead = vi.fn();
    const handler = createPodPrintArtifactHandler({
      authorize: async () => forbidden,
      artifactStore: { read: artifactRead, createOnly: vi.fn() },
      manifestStore: unusedManifestStore,
      storage: { createOnly: vi.fn(), readMetadata: storageRead, download: vi.fn() },
      now: () => "2026-01-01T00:00:00.000Z",
    });
    const response = await handler.fetch(new Request("https://api.test/api/pod/print-artifact?artifact_id=pa-test"));
    expect(response.status).toBe(403);
    expect(artifactRead).not.toHaveBeenCalled();
    expect(storageRead).not.toHaveBeenCalled();
  });

  it("returns exact archived bytes for an authorized reprint", async () => {
    const bytes = new TextEncoder().encode("%PDF-1.7\narchived");
    const manifestSha256 = "a".repeat(64);
    const pdfSha256 = await sha256Bytes(bytes);
    const artifact: PodPrintArtifactDocument = {
      id: await derivePodPrintArtifactId("POD-TEST-1", manifestSha256),
      artifact_version: 1,
      renderer_version: "pod-browser-jspdf-html2canvas-v1",
      print_job_id: "POD-TEST-1",
      pod_job_id: "job-1",
      pod_job_ids: ["job-1"],
      manifest_document_id: "pm-test",
      manifest_document_path: "pod_print_manifests/pm-test",
      manifest_sha256: manifestSha256,
      pdf_sha256: pdfSha256,
      storage_bucket: "private-bucket",
      storage_object: `pod-print-artifacts/POD-TEST-1/${manifestSha256}.pdf`,
      storage_generation: "7",
      storage_metageneration: "1",
      size_bytes: bytes.byteLength,
      content_type: "application/pdf",
      crc32c: "crc",
      md5_hash: null,
      print_format_id: "a6-landscape",
      sheet_count: 1,
      item_count: 1,
      immutable: true,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
      schema_version: 1,
    };
    const metadata: PodPrintArtifactStorageMetadata = {
      bucket: artifact.storage_bucket,
      object: artifact.storage_object,
      generation: artifact.storage_generation,
      metageneration: artifact.storage_metageneration,
      size: bytes.byteLength,
      contentType: "application/pdf",
      crc32c: artifact.crc32c,
      md5Hash: null,
      metadata: {
        manifest_sha256: artifact.manifest_sha256,
        pdf_sha256: artifact.pdf_sha256,
        renderer_version: artifact.renderer_version,
        print_job_id: artifact.print_job_id,
        content_type: "application/pdf",
      },
    };
    const handler = createPodPrintArtifactHandler({
      authorize: async () => null,
      artifactStore: { read: async () => artifact, createOnly: vi.fn() },
      manifestStore: unusedManifestStore,
      storage: { createOnly: vi.fn(), readMetadata: async () => metadata, download: async () => bytes },
      now: () => "2026-01-01T00:00:00.000Z",
    });
    const response = await handler.fetch(new Request(`https://api.test/api/pod/print-artifact?artifact_id=${artifact.id}`));
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });
});
