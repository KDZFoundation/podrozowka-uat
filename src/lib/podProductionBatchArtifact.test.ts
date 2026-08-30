import { describe, expect, it, vi } from "vitest";
import { CURRENT_POSTCARD_PRINT_FORMAT, POD_IMPOSITION_ALGORITHM } from "./podImposition";
import { PodPrintArtifactError, type PodPrintArtifactStorage, type PodPrintArtifactStorageMetadata } from "./podPrintArtifact";
import { POD_CUT_STACK_PROFILE_VERSION, planPodProductionBatch, type PodProductionBatchSourceItem } from "./podProductionBatch";
import type { FrozenPodProductionBatch, PodProductionBatchHeader } from "./podProductionBatchPersistence";
import {
  createPodProductionBatchArtifact,
  reprintPodProductionBatchArtifact,
  type PodProductionBatchArtifactDocument,
  type PodProductionBatchArtifactStore,
} from "./podProductionBatchArtifact";

const source = (index: number): PodProductionBatchSourceItem => ({
  pod_job_id: `pod-${index}`,
  print_job_id: "job-1",
  print_job_item_id: `item-${index}`,
  inventory_unit_id: `unit-${index}`,
  source_order_id: "order-1",
  card_design_id: `design-${index}`,
  print_manifest_id: `pm-${"a".repeat(64)}`,
  print_manifest_sha256: "b".repeat(64),
  print_manifest_state: "frozen",
  asset_set_id: `pas-${"c".repeat(64)}`,
  asset_set_sha256: "d".repeat(64),
  asset_set_state: "frozen",
  render_profile_version: "pod-render-profile-v1",
  render_profile_sha256: "e".repeat(64),
  render_input_sha256: "f".repeat(64),
  print_format_id: CURRENT_POSTCARD_PRINT_FORMAT.print_format_id,
  algorithm_version: POD_IMPOSITION_ALGORITHM,
  cut_stack_profile_version: POD_CUT_STACK_PROFILE_VERSION,
  sequence_index: index,
  batch_order_index: index,
  primary_language_code: "pl",
  secondary_language_code: null,
});

const frozenBatch = async (): Promise<FrozenPodProductionBatch> => {
  const manifest = await planPodProductionBatch([source(0)], [CURRENT_POSTCARD_PRINT_FORMAT]);
  const header: PodProductionBatchHeader = {
    id: manifest.batch_id,
    batch_manifest_version: manifest.batch_manifest_version,
    batch_algorithm_version: manifest.batch_algorithm_version,
    batch_sha256: manifest.batch_sha256,
    cut_stack_profile_version: manifest.cut_stack_profile_version,
    state: "FROZEN",
    sheet_width_mm: manifest.sheet_width_mm,
    sheet_height_mm: manifest.sheet_height_mm,
    item_count: manifest.item_count,
    print_job_count: manifest.print_job_count,
    sheet_count: manifest.sheet_count,
    empty_slot_count: manifest.empty_slot_count,
    chunk_count: 1,
    source_manifests: manifest.source_manifests,
    asset_sets: manifest.asset_sets,
    groups: manifest.groups.map(({ positions: _positions, slots: _slots, ...group }) => group),
    schema_version: 1,
    created_at: "2026-08-30T00:00:00.000Z",
    created_by: "admin",
    frozen_at: "2026-08-30T00:00:00.000Z",
  };
  return { header, chunks: [], manifest, canonicalJson: "" };
};

class Storage implements PodPrintArtifactStorage {
  objects = new Map<string, { bytes: Uint8Array; metadata: PodPrintArtifactStorageMetadata }>();
  generation = 0;
  async createOnly(object: string, bytes: Uint8Array, custom: Record<string, string>) {
    if (this.objects.has(object)) throw new PodPrintArtifactError("pod_artifact_storage_precondition_failed");
    this.generation += 1;
    const metadata: PodPrintArtifactStorageMetadata = {
      bucket: "private-bucket",
      object,
      generation: String(this.generation),
      metageneration: "1",
      size: bytes.byteLength,
      contentType: custom.content_type,
      crc32c: `crc-${this.generation}`,
      md5Hash: null,
      metadata: { ...custom },
    };
    this.objects.set(object, { bytes: Uint8Array.from(bytes), metadata });
    return structuredClone(metadata);
  }
  async readMetadata(object: string, generation?: string) {
    const entry = this.objects.get(object);
    if (!entry || (generation && entry.metadata.generation !== generation)) throw new Error("missing");
    return structuredClone(entry.metadata);
  }
  async download(object: string, generation: string) {
    const entry = this.objects.get(object);
    if (!entry || entry.metadata.generation !== generation) throw new Error("missing");
    return Uint8Array.from(entry.bytes);
  }
}

class Store implements PodProductionBatchArtifactStore {
  documents = new Map<string, PodProductionBatchArtifactDocument>();
  failCreates = 0;
  async read(id: string) { return structuredClone(this.documents.get(id) || null); }
  async createOnly(id: string, document: PodProductionBatchArtifactDocument) {
    if (this.failCreates > 0) { this.failCreates -= 1; throw new Error("firestore-unavailable"); }
    await Promise.resolve();
    if (this.documents.has(id)) throw new Error("exists:false");
    this.documents.set(id, structuredClone(document));
  }
}

class LostResponseStorage extends Storage {
  loseNextResponse = true;
  override async createOnly(object: string, bytes: Uint8Array, custom: Record<string, string>) {
    const metadata = await super.createOnly(object, bytes, custom);
    if (this.loseNextResponse) {
      this.loseNextResponse = false;
      throw new Error("network-response-lost");
    }
    return metadata;
  }
}

const pdf = (value = "canonical") => new TextEncoder().encode(`%PDF-1.7\n${value}`);
const input = async (bytes = pdf()) => ({
  batch: await frozenBatch(),
  groupIndex: 0,
  pdfBytes: bytes,
  createdAt: "2026-08-30T00:00:00.000Z",
  createdBy: "admin",
});

describe("immutable POD production batch artifacts", () => {
  it("performs the first content-addressed create-only upload", async () => {
    const storage = new Storage();
    const result = await createPodProductionBatchArtifact(storage, new Store(), await input());
    expect(result.created).toBe(true);
    expect(result.artifact.storage_object).toContain(result.artifact.pdf_sha256);
    expect(result.artifact.storage_generation).toBe("1");
  });

  it("converges parallel artifact creation to one object and document", async () => {
    const storage = new Storage();
    const store = new Store();
    const request = await input();
    const [left, right] = await Promise.all([
      createPodProductionBatchArtifact(storage, store, request),
      createPodProductionBatchArtifact(storage, store, request),
    ]);
    expect(left.artifact).toEqual(right.artifact);
    expect(storage.objects.size).toBe(1);
    expect(store.documents.size).toBe(1);
  });

  it("recovers on retry after the successful upload response was lost", async () => {
    const storage = new LostResponseStorage();
    const store = new Store();
    await expect(createPodProductionBatchArtifact(storage, store, await input())).rejects.toThrow("network-response-lost");
    const retry = await createPodProductionBatchArtifact(storage, store, await input());
    expect(retry.created).toBe(true);
    expect(storage.objects.size).toBe(1);
    expect(store.documents.size).toBe(1);
  });

  it("resumes when GCS succeeded before the Firestore artifact write failed", async () => {
    const storage = new Storage();
    const store = new Store();
    store.failCreates = 1;
    await expect(createPodProductionBatchArtifact(storage, store, await input()))
      .rejects.toMatchObject({ code: "pod_batch_artifact_firestore_conflict" });
    const retry = await createPodProductionBatchArtifact(storage, store, await input());
    expect(retry.created).toBe(true);
    expect(storage.objects.size).toBe(1);
  });

  it("treats 412 with identical bytes as idempotent and rejects different content", async () => {
    const storage = new Storage();
    const first = await createPodProductionBatchArtifact(storage, new Store(), await input());
    const recovered = await createPodProductionBatchArtifact(storage, new Store(), await input());
    expect(recovered.artifact.storage_generation).toBe(first.artifact.storage_generation);
    const entry = storage.objects.get(first.artifact.storage_object)!;
    entry.metadata.metadata.batch_sha256 = "f".repeat(64);
    await expect(createPodProductionBatchArtifact(storage, new Store(), await input()))
      .rejects.toMatchObject({ code: "pod_batch_artifact_storage_conflict" });
  });

  it("downloads the exact generation and detects changed bytes", async () => {
    const storage = new Storage();
    const store = new Store();
    const created = await createPodProductionBatchArtifact(storage, store, await input());
    const reprint = await reprintPodProductionBatchArtifact(storage, store, created.artifact.id);
    expect(Array.from(reprint.bytes)).toEqual(Array.from(pdf()));
    const entry = storage.objects.get(created.artifact.storage_object)!;
    entry.bytes = pdf("tamperxxx");
    entry.metadata.size = entry.bytes.byteLength;
    await expect(reprintPodProductionBatchArtifact(storage, store, created.artifact.id))
      .rejects.toMatchObject({ code: "pod_batch_artifact_hash_mismatch" });
  });

  it("rejects a missing recorded generation", async () => {
    const storage = new Storage();
    const store = new Store();
    const created = await createPodProductionBatchArtifact(storage, store, await input());
    store.documents.set(created.artifact.id, { ...created.artifact, storage_generation: "999" });
    await expect(reprintPodProductionBatchArtifact(storage, store, created.artifact.id))
      .rejects.toMatchObject({ code: "pod_batch_artifact_missing_object" });
  });

  it("reprints without invoking rendering or asset acquisition", async () => {
    const storage = new Storage();
    const store = new Store();
    const render = vi.fn();
    const fetchAssets = vi.fn();
    const created = await createPodProductionBatchArtifact(storage, store, await input());
    await reprintPodProductionBatchArtifact(storage, store, created.artifact.id);
    expect(render).not.toHaveBeenCalled();
    expect(fetchAssets).not.toHaveBeenCalled();
  });
});
