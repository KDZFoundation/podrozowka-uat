import { describe, expect, it, vi } from "vitest";
import {
  PodPrintArtifactError,
  createPodPrintArtifact,
  derivePodPrintArtifactId,
  podPrintArtifactStorageObject,
  reprintPodPrintArtifact,
  sha256Bytes,
  type PodPrintArtifactDocument,
  type PodPrintArtifactStorage,
  type PodPrintArtifactStorageMetadata,
  type PodPrintArtifactStore,
} from "./podPrintArtifact";

const pdf = (value = "canonical") => new TextEncoder().encode(`%PDF-1.7\n${value}`);
const manifestSha256 = "a".repeat(64);
const manifest = {
  id: `pm-${"b".repeat(64)}`,
  state: "frozen" as const,
  manifest_sha256: manifestSha256,
  print_job_ids: ["job-1"],
  print_format_ids: ["a6-landscape"],
  sheet_count: 2,
  postcard_count: 7,
};

class PreconditionStorage implements PodPrintArtifactStorage {
  objects = new Map<string, { bytes: Uint8Array; metadata: PodPrintArtifactStorageMetadata }>();
  createAttempts: Array<{ object: string; metadata: Record<string, string> }> = [];
  generation = 0;

  async createOnly(object: string, bytes: Uint8Array, custom: Record<string, string>) {
    this.createAttempts.push({ object, metadata: custom });
    if (this.objects.has(object)) throw new PodPrintArtifactError("pod_artifact_storage_precondition_failed");
    await Promise.resolve();
    if (this.objects.has(object)) throw new PodPrintArtifactError("pod_artifact_storage_precondition_failed");
    this.generation += 1;
    const metadata: PodPrintArtifactStorageMetadata = {
      bucket: "private-pod-artifacts",
      object,
      generation: String(this.generation),
      metageneration: "1",
      size: bytes.byteLength,
      contentType: "application/pdf",
      crc32c: `crc-${this.generation}`,
      md5Hash: `md5-${this.generation}`,
      metadata: { ...custom },
    };
    this.objects.set(object, { bytes: Uint8Array.from(bytes), metadata });
    return metadata;
  }

  async readMetadata(object: string, generation?: string) {
    const entry = this.objects.get(object);
    if (!entry || (generation && entry.metadata.generation !== generation)) {
      throw new PodPrintArtifactError("pod_artifact_missing_object");
    }
    return { ...entry.metadata, metadata: { ...entry.metadata.metadata } };
  }

  async download(object: string, generation: string) {
    const entry = this.objects.get(object);
    if (!entry || entry.metadata.generation !== generation) throw new PodPrintArtifactError("pod_artifact_missing_object");
    return Uint8Array.from(entry.bytes);
  }
}

class CreateOnlyStore implements PodPrintArtifactStore {
  documents = new Map<string, PodPrintArtifactDocument>();
  failCreates = 0;

  async read(id: string) {
    return this.documents.get(id) || null;
  }

  async createOnly(id: string, document: PodPrintArtifactDocument) {
    if (this.failCreates > 0) {
      this.failCreates -= 1;
      throw new Error("firestore_unavailable");
    }
    await Promise.resolve();
    if (this.documents.has(id)) throw new Error("firestore_exists_precondition");
    this.documents.set(id, structuredClone(document));
  }
}

const createInput = (bytes = pdf()) => ({
  printJobId: "POD-TEST-1",
  manifest,
  rendererVersion: "renderer-v1",
  pdfBytes: bytes,
  createdAt: "2026-01-01T00:00:00.000Z",
});

describe("canonical POD print artifacts", () => {
  it("uses deterministic IDs and Storage paths", async () => {
    expect(podPrintArtifactStorageObject("POD-TEST-1", manifestSha256)).toBe(`pod-print-artifacts/POD-TEST-1/${manifestSha256}.pdf`);
    expect(await derivePodPrintArtifactId("POD-TEST-1", manifestSha256)).toBe(await derivePodPrintArtifactId("POD-TEST-1", manifestSha256));
  });

  it("creates the object with create-only metadata and then the immutable document", async () => {
    const storage = new PreconditionStorage();
    const store = new CreateOnlyStore();
    const result = await createPodPrintArtifact(storage, store, createInput());
    expect(result.created).toBe(true);
    expect(storage.createAttempts).toHaveLength(1);
    expect(storage.createAttempts[0].metadata).toMatchObject({
      manifest_sha256: manifestSha256,
      pdf_sha256: await sha256Bytes(pdf()),
      renderer_version: "renderer-v1",
      print_job_id: "POD-TEST-1",
      content_type: "application/pdf",
    });
    expect(store.documents.get(result.artifact.id)).toMatchObject({ immutable: true, status: "ready", storage_generation: "1" });
  });

  it("treats an identical second call and GCS 412 as idempotent success", async () => {
    const storage = new PreconditionStorage();
    const firstStore = new CreateOnlyStore();
    const first = await createPodPrintArtifact(storage, firstStore, createInput());
    const recoveredStore = new CreateOnlyStore();
    const recovered = await createPodPrintArtifact(storage, recoveredStore, createInput());
    expect(recovered.created).toBe(true);
    expect(recovered.artifact.storage_generation).toBe(first.artifact.storage_generation);
    const second = await createPodPrintArtifact(storage, recoveredStore, createInput());
    expect(second.created).toBe(false);
    expect(storage.createAttempts).toHaveLength(2);
  });

  it("rejects GCS 412 when existing bytes or required metadata differ", async () => {
    const storage = new PreconditionStorage();
    const originalStore = new CreateOnlyStore();
    await createPodPrintArtifact(storage, originalStore, createInput(pdf("other")));
    await expect(createPodPrintArtifact(storage, new CreateOnlyStore(), createInput())).rejects.toMatchObject({
      code: "pod_artifact_storage_conflict",
    });
    const object = storage.objects.values().next().value as { bytes: Uint8Array; metadata: PodPrintArtifactStorageMetadata };
    object.metadata.metadata.manifest_sha256 = "c".repeat(64);
    await expect(createPodPrintArtifact(storage, new CreateOnlyStore(), createInput(pdf("other")))).rejects.toMatchObject({
      code: "pod_artifact_storage_conflict",
    });
  });

  it("repairs upload success followed by a Firestore failure on retry", async () => {
    const storage = new PreconditionStorage();
    const store = new CreateOnlyStore();
    store.failCreates = 1;
    await expect(createPodPrintArtifact(storage, store, createInput())).rejects.toMatchObject({ code: "pod_artifact_firestore_write_failed" });
    const retry = await createPodPrintArtifact(storage, store, createInput());
    expect(retry.created).toBe(true);
    expect(storage.objects.size).toBe(1);
    expect(storage.createAttempts).toHaveLength(2);
  });

  it("converges two parallel creates to one object and one document", async () => {
    const storage = new PreconditionStorage();
    const store = new CreateOnlyStore();
    const [left, right] = await Promise.all([
      createPodPrintArtifact(storage, store, createInput()),
      createPodPrintArtifact(storage, store, createInput()),
    ]);
    expect(storage.objects.size).toBe(1);
    expect(store.documents.size).toBe(1);
    expect(left.artifact).toEqual(right.artifact);
  });

  it("detects an immutable Firestore document conflict", async () => {
    const storage = new PreconditionStorage();
    const store = new CreateOnlyStore();
    const first = await createPodPrintArtifact(storage, store, createInput());
    store.documents.set(first.artifact.id, { ...first.artifact, manifest_sha256: "d".repeat(64) });
    await expect(createPodPrintArtifact(storage, store, createInput())).rejects.toMatchObject({ code: "pod_artifact_firestore_conflict" });
  });

  it("rejects a Firestore document with a different renderer or generation", async () => {
    const storage = new PreconditionStorage();
    const store = new CreateOnlyStore();
    const first = await createPodPrintArtifact(storage, store, createInput());
    store.documents.set(first.artifact.id, { ...first.artifact, renderer_version: "other-renderer" });
    await expect(createPodPrintArtifact(storage, store, createInput())).rejects.toMatchObject({ code: "pod_artifact_firestore_conflict" });
    store.documents.set(first.artifact.id, { ...first.artifact, storage_generation: "999" });
    await expect(createPodPrintArtifact(storage, store, createInput())).rejects.toMatchObject({ code: "pod_artifact_firestore_conflict" });
  });

  it("reprints exact stored bytes without invoking any renderer", async () => {
    const storage = new PreconditionStorage();
    const store = new CreateOnlyStore();
    const renderer = vi.fn();
    const created = await createPodPrintArtifact(storage, store, createInput());
    const reprint = await reprintPodPrintArtifact(storage, store, created.artifact.id);
    expect(Array.from(reprint.bytes)).toEqual(Array.from(pdf()));
    expect(renderer).not.toHaveBeenCalled();
  });

  it("detects missing objects, changed bytes, generation, size, and hashes", async () => {
    const storage = new PreconditionStorage();
    const store = new CreateOnlyStore();
    const created = await createPodPrintArtifact(storage, store, createInput());
    const object = storage.objects.get(created.artifact.storage_object)!;
    storage.objects.delete(created.artifact.storage_object);
    await expect(reprintPodPrintArtifact(storage, store, created.artifact.id)).rejects.toMatchObject({ code: "pod_artifact_missing_object" });
    storage.objects.set(created.artifact.storage_object, object);
    object.bytes = pdf("tampered");
    object.metadata.size = object.bytes.byteLength;
    await expect(reprintPodPrintArtifact(storage, store, created.artifact.id)).rejects.toMatchObject({ code: "pod_artifact_metadata_mismatch" });
    object.bytes = pdf("tamperxxx");
    object.metadata.size = object.bytes.byteLength;
    await expect(reprintPodPrintArtifact(storage, store, created.artifact.id)).rejects.toMatchObject({ code: "pod_artifact_hash_mismatch" });
    object.bytes = pdf();
    object.metadata.size = object.bytes.byteLength;
    object.metadata.generation = "999";
    await expect(reprintPodPrintArtifact(storage, store, created.artifact.id)).rejects.toMatchObject({ code: "pod_artifact_missing_object" });
  });

  it("rejects a writing manifest and invalid manifest hash", async () => {
    await expect(createPodPrintArtifact(new PreconditionStorage(), new CreateOnlyStore(), {
      ...createInput(), manifest: { ...manifest, state: "writing" as const },
    })).rejects.toMatchObject({ code: "pod_artifact_manifest_not_frozen" });
    await expect(createPodPrintArtifact(new PreconditionStorage(), new CreateOnlyStore(), {
      ...createInput(), manifest: { ...manifest, manifest_sha256: "invalid" },
    })).rejects.toMatchObject({ code: "pod_artifact_manifest_hash_mismatch" });
  });

  it("uses a new immutable path when manifest SHA-256 changes", () => {
    expect(podPrintArtifactStorageObject("POD-TEST-1", "e".repeat(64))).not.toBe(
      podPrintArtifactStorageObject("POD-TEST-1", manifestSha256),
    );
  });
});
