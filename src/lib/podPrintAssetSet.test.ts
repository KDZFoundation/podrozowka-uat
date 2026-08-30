import { describe, expect, it } from "vitest";
import { PodPrintArtifactError, type PodPrintArtifactStorage, type PodPrintArtifactStorageMetadata } from "./podPrintArtifact";
import {
  derivePodPrintAssetSetId,
  freezePodPrintAssetSet,
  hashPodPrintAssetSet,
  podPrintAssetObject,
  type PodPrintAssetCandidate,
  type PodPrintAssetSetChunk,
  type PodPrintAssetSetHeader,
  type PodPrintAssetSetItem,
  type PodPrintAssetSetStore,
} from "./podPrintAssetSet";

const manifestSha256 = "a".repeat(64);
const bytes = (value: string) => new TextEncoder().encode(value);
const candidate = (overrides: Partial<PodPrintAssetCandidate> = {}): PodPrintAssetCandidate => ({
  asset_role: "postcard_front_photo",
  source_kind: "external_url",
  source_url: "https://assets.example.test/photo.png",
  source_version: "generation-1",
  content_type: "image/png",
  bytes: bytes("same-image"),
  print_job_item_id: "item-1",
  render_input_sha256: "b".repeat(64),
  ...overrides,
});

class PreconditionStorage implements PodPrintArtifactStorage {
  objects = new Map<string, { bytes: Uint8Array; metadata: PodPrintArtifactStorageMetadata }>();
  attempts = 0;

  async createOnly(object: string, value: Uint8Array, custom: Record<string, string>) {
    this.attempts += 1;
    if (this.objects.has(object)) throw new PodPrintArtifactError("pod_artifact_storage_precondition_failed");
    await Promise.resolve();
    if (this.objects.has(object)) throw new PodPrintArtifactError("pod_artifact_storage_precondition_failed");
    const metadata: PodPrintArtifactStorageMetadata = {
      bucket: "private-assets",
      object,
      generation: String(this.objects.size + 1),
      metageneration: "1",
      size: value.byteLength,
      contentType: custom.content_type,
      crc32c: `crc-${this.objects.size + 1}`,
      md5Hash: null,
      metadata: { ...custom },
    };
    this.objects.set(object, { bytes: Uint8Array.from(value), metadata });
    return metadata;
  }

  async readMetadata(object: string, generation?: string) {
    const stored = this.objects.get(object);
    if (!stored || (generation && stored.metadata.generation !== generation)) throw new Error("missing");
    return structuredClone(stored.metadata);
  }

  async download(object: string, generation: string) {
    const stored = this.objects.get(object);
    if (!stored || stored.metadata.generation !== generation) throw new Error("missing");
    return Uint8Array.from(stored.bytes);
  }
}

class CreateOnlyStore implements PodPrintAssetSetStore {
  headers = new Map<string, { data: PodPrintAssetSetHeader; updateTime: string }>();
  items = new Map<string, PodPrintAssetSetItem>();
  chunks = new Map<string, PodPrintAssetSetChunk>();
  failItemCreates = 0;
  version = 0;

  async readHeader(id: string) { return structuredClone(this.headers.get(id) || null); }
  async createHeader(id: string, header: PodPrintAssetSetHeader) {
    await Promise.resolve();
    if (this.headers.has(id)) throw new Error("exists");
    this.version += 1;
    this.headers.set(id, { data: structuredClone(header), updateTime: `v${this.version}` });
  }
  async readItem(id: string) { return structuredClone(this.items.get(id) || null); }
  async createItem(id: string, item: PodPrintAssetSetItem) {
    if (this.failItemCreates > 0) { this.failItemCreates -= 1; throw new Error("unavailable"); }
    await Promise.resolve();
    if (this.items.has(id)) throw new Error("exists");
    this.items.set(id, structuredClone(item));
  }
  async readChunk(id: string) { return structuredClone(this.chunks.get(id) || null); }
  async createChunk(id: string, chunk: PodPrintAssetSetChunk) {
    await Promise.resolve();
    if (this.chunks.has(id)) throw new Error("exists");
    this.chunks.set(id, structuredClone(chunk));
  }
  async freezeHeader(id: string, data: Pick<PodPrintAssetSetHeader, "state" | "frozen_at">, updateTime: string) {
    const current = this.headers.get(id);
    if (!current || current.updateTime !== updateTime) throw new Error("version-conflict");
    this.version += 1;
    current.data = { ...current.data, ...data };
    current.updateTime = `v${this.version}`;
  }
}

const input = (candidates: PodPrintAssetCandidate[]) => ({
  manifest: { id: "pm-test", state: "frozen" as const, manifest_sha256: manifestSha256 },
  rendererVersion: "renderer-v1",
  renderProfileSha256: "c".repeat(64),
  candidates,
  createdAt: "2026-01-01T00:00:00.000Z",
  createdBy: "admin-1",
});

describe("frozen POD asset sets", () => {
  it("derives the same ID for the same manifest and render profile version", async () => {
    expect(await derivePodPrintAssetSetId(manifestSha256)).toBe(await derivePodPrintAssetSetId(manifestSha256));
  });

  it("hashes items independently of their order", async () => {
    const storage = new PreconditionStorage();
    const result = await freezePodPrintAssetSet(storage, new CreateOnlyStore(), input([
      candidate(),
      candidate({ asset_role: "country_flag", print_job_item_id: "item-2", bytes: bytes("flag") }),
    ]));
    expect(await hashPodPrintAssetSet(result.header, [...result.items].reverse())).toBe(result.header.asset_set_sha256);
  });

  it("changes the asset and set hashes when one byte changes", async () => {
    const first = await freezePodPrintAssetSet(new PreconditionStorage(), new CreateOnlyStore(), input([candidate()]));
    const second = await freezePodPrintAssetSet(new PreconditionStorage(), new CreateOnlyStore(), input([candidate({ bytes: bytes("same-imagf") })]));
    expect(first.items[0].sha256).not.toBe(second.items[0].sha256);
    expect(first.header.asset_set_sha256).not.toBe(second.header.asset_set_sha256);
  });

  it("deduplicates identical bytes across cards and source URLs", async () => {
    const storage = new PreconditionStorage();
    const result = await freezePodPrintAssetSet(storage, new CreateOnlyStore(), input([
      candidate(),
      candidate({ source_url: "https://cdn.example.test/same.png", print_job_item_id: "item-2" }),
    ]));
    expect(result.items).toHaveLength(2);
    expect(result.items[0].storage_object).toBe(result.items[1].storage_object);
    expect(storage.objects.size).toBe(1);
  });

  it("uses content-addressed paths", () => {
    expect(podPrintAssetObject("d".repeat(64), "image/png")).toBe(`pod-print-assets/sha256/dd/${"d".repeat(64)}.png`);
  });

  it("treats 412 with identical bytes as success and conflicting metadata as failure", async () => {
    const storage = new PreconditionStorage();
    await freezePodPrintAssetSet(storage, new CreateOnlyStore(), input([candidate()]));
    const recovered = await freezePodPrintAssetSet(storage, new CreateOnlyStore(), input([candidate()]));
    expect(recovered.header.state).toBe("frozen");
    const stored = storage.objects.values().next().value!;
    stored.metadata.metadata.asset_role = "country_flag";
    await expect(freezePodPrintAssetSet(storage, new CreateOnlyStore(), input([candidate()])))
      .rejects.toMatchObject({ code: "pod_asset_storage_conflict" });
  });

  it("repairs an interrupted item write on retry", async () => {
    const storage = new PreconditionStorage();
    const store = new CreateOnlyStore();
    store.failItemCreates = 1;
    await expect(freezePodPrintAssetSet(storage, store, input([candidate()])))
      .rejects.toMatchObject({ code: "pod_asset_set_item_create_failed" });
    const retry = await freezePodPrintAssetSet(storage, store, input([candidate()]));
    expect(retry.header.state).toBe("frozen");
    expect(storage.objects.size).toBe(1);
  });

  it("converges parallel freezing to one set", async () => {
    const storage = new PreconditionStorage();
    const store = new CreateOnlyStore();
    const [left, right] = await Promise.all([
      freezePodPrintAssetSet(storage, store, input([candidate()])),
      freezePodPrintAssetSet(storage, store, input([candidate()])),
    ]);
    expect(left.header.id).toBe(right.header.id);
    expect(left.header.asset_set_sha256).toBe(right.header.asset_set_sha256);
    expect(storage.objects.size).toBe(1);
    expect(store.headers.size).toBe(1);
  });

  it("rejects a writing manifest and a mismatched stored generation", async () => {
    await expect(freezePodPrintAssetSet(new PreconditionStorage(), new CreateOnlyStore(), {
      ...input([candidate()]), manifest: { ...input([]).manifest, state: "writing" as const },
    })).rejects.toMatchObject({ code: "pod_asset_set_manifest_not_frozen" });
    const storage = new PreconditionStorage();
    const result = await freezePodPrintAssetSet(storage, new CreateOnlyStore(), input([candidate()]));
    await expect(storage.download(result.items[0].storage_object, "wrong-generation")).rejects.toThrow();
  });
});
