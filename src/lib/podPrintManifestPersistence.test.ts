// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CURRENT_POSTCARD_PRINT_FORMAT } from "./podImposition";
import {
  buildPodPrintManifest,
  canonicalJson,
  hashPodPrintRenderInput,
  serializePodPrintManifest,
  sha256Utf8,
  type PodPrintManifestSourceItem,
} from "./podPrintManifest";
import {
  PodPrintManifestConflictError,
  PodPrintManifestIntegrityError,
  POD_PRINT_MANIFEST_CHUNK_MAX_UTF8_BYTES,
  createPodPrintManifestPackage,
  derivePodPrintManifestId,
  freezePodPrintManifest,
  readFrozenPodPrintManifest,
  reconstructAndVerifyPodPrintManifest,
  type PodPrintManifestChunk,
  type PodPrintManifestHeader,
  type PodPrintManifestStore,
  type VersionedDocument,
} from "./podPrintManifestPersistence";

const source = async (index: number): Promise<PodPrintManifestSourceItem> => {
  const render_input = {
    qr_url: `https://podrozowka.test/r/token-${index}`,
    front_text: "Dziękujemy",
    back_qr_label: "Zeskanuj kod",
    image_front_url: `https://cdn.test/card-${index}.jpg`,
    image_version: "generation-1",
    photo_author: "Autor",
    crop_settings: { fit: "auto", x: 50, y: 50, zoom: 100 },
    country_iso2: "PL",
    country_flag_url: null,
  };
  return {
    id: `item-${index}`,
    print_format_id: CURRENT_POSTCARD_PRINT_FORMAT.print_format_id,
    batch_order_index: Math.floor(index / 10),
    sequence_index: index % 10,
    pod_job_id: `job-${Math.floor(index / 10)}`,
    inventory_unit_id: `unit-${index}`,
    card_design_id: `design-${index}`,
    source_order_id: `order-${Math.floor(index / 10)}`,
    primary_language_code: "pl",
    secondary_language_code: null,
    render_input,
    render_input_sha256: await hashPodPrintRenderInput(render_input),
  };
};

const manifestFor = async (count: number) => buildPodPrintManifest(
  await Promise.all(Array.from({ length: count }, (_, index) => source(index))),
  [CURRENT_POSTCARD_PRINT_FORMAT],
);

class MockManifestStore implements PodPrintManifestStore {
  headers = new Map<string, VersionedDocument<PodPrintManifestHeader>>();
  chunks = new Map<string, VersionedDocument<PodPrintManifestChunk>>();
  version = 0;
  headerCreateCount = 0;
  chunkCreateCount = 0;
  freezeCount = 0;
  failChunkCreateAt: number | null = null;

  private updateTime() {
    this.version += 1;
    return `v${this.version}`;
  }

  async readHeader(id: string) { return this.headers.get(id) ?? null; }
  async createHeader(id: string, data: PodPrintManifestHeader) {
    if (this.headers.has(id)) throw new Error("exists_false_conflict");
    this.headerCreateCount += 1;
    this.headers.set(id, { data: structuredClone(data), updateTime: this.updateTime() });
  }
  async readChunk(id: string) { return this.chunks.get(id) ?? null; }
  async createChunk(id: string, data: PodPrintManifestChunk) {
    if (this.chunks.has(id)) throw new Error("exists_false_conflict");
    if (this.failChunkCreateAt === this.chunkCreateCount) {
      this.failChunkCreateAt = null;
      throw new Error("simulated_interruption");
    }
    this.chunkCreateCount += 1;
    this.chunks.set(id, { data: structuredClone(data), updateTime: this.updateTime() });
  }
  async freezeHeader(id: string, data: Pick<PodPrintManifestHeader, "state" | "frozen_at">, updateTime: string) {
    const current = this.headers.get(id);
    if (!current || current.updateTime !== updateTime) throw new Error("update_time_conflict");
    this.freezeCount += 1;
    this.headers.set(id, { data: { ...current.data, ...data }, updateTime: this.updateTime() });
  }
}

const freezeInput = async (count = 12) => {
  const manifest = await manifestFor(count);
  return {
    batchId: "batch-2026-08-29",
    batchRevision: "1",
    printJobIds: [...new Set(manifest.format_groups.flatMap((group) => group.items.map((item) => item.pod_job_id)))].reverse(),
    manifest,
    createdAt: "2026-08-29T10:00:00.000Z",
    createdBy: "admin-a",
  };
};

describe("persistent POD print manifests", () => {
  it("produces the same manifest ID, canonical JSON, and SHA-256 for identical business input", async () => {
    const input = await freezeInput();
    const first = await createPodPrintManifestPackage(input);
    const second = await createPodPrintManifestPackage({ ...input, printJobIds: [...input.printJobIds].reverse() });
    expect(second.header.id).toBe(first.header.id);
    expect(second.canonicalJson).toBe(first.canonicalJson);
    expect(second.header.manifest_sha256).toBe(first.header.manifest_sha256);
  });

  it("does not include operational metadata in the canonical hash", async () => {
    const input = await freezeInput();
    const first = await createPodPrintManifestPackage(input);
    const second = await createPodPrintManifestPackage({
      ...input,
      createdAt: "2030-01-01T00:00:00.000Z",
      createdBy: "admin-b",
    });
    expect(second.header.manifest_sha256).toBe(first.header.manifest_sha256);
    expect(second.header.id).toBe(first.header.id);
  });

  it("is idempotent and returns an existing frozen manifest", async () => {
    const store = new MockManifestStore();
    const input = await freezeInput();
    const first = await freezePodPrintManifest(store, input);
    const second = await freezePodPrintManifest(store, input);
    expect(second.manifest).toEqual(first.manifest);
    expect(store.headerCreateCount).toBe(1);
    expect(store.chunkCreateCount).toBe(first.header.chunk_count);
    expect(store.freezeCount).toBe(1);
  });

  it("converges two concurrent identical requests on one manifest", async () => {
    const store = new MockManifestStore();
    const input = await freezeInput();
    const [first, second] = await Promise.all([
      freezePodPrintManifest(store, input),
      freezePodPrintManifest(store, input),
    ]);
    expect(second.header.id).toBe(first.header.id);
    expect(store.headers.size).toBe(1);
    expect(store.chunks.size).toBe(first.header.chunk_count);
  });

  it("rejects the same business key with a different manifest hash", async () => {
    const store = new MockManifestStore();
    const input = await freezeInput();
    await freezePodPrintManifest(store, input);
    const changed = structuredClone(input.manifest);
    changed.format_groups[0].items[0].render_input.front_text = "Zmienione";
    changed.format_groups[0].items[0].render_input_sha256 = await hashPodPrintRenderInput(changed.format_groups[0].items[0].render_input);
    await expect(freezePodPrintManifest(store, { ...input, manifest: changed }))
      .rejects.toBeInstanceOf(PodPrintManifestConflictError);
  });

  it("resumes safely after interruption between chunks", async () => {
    const store = new MockManifestStore();
    store.failChunkCreateAt = 1;
    const input = await freezeInput(205);
    await expect(freezePodPrintManifest(store, input)).rejects.toThrow("manifest_chunk_create_failed");
    expect(store.headers.values().next().value?.data.state).toBe("writing");
    const frozen = await freezePodPrintManifest(store, input);
    expect(frozen.header.state).toBe("frozen");
    expect(store.chunks.size).toBe(3);
  });

  it("rejects an existing chunk with a different hash or content", async () => {
    const store = new MockManifestStore();
    const input = await freezeInput();
    const packageData = await createPodPrintManifestPackage(input);
    await store.createHeader(packageData.header.id, packageData.header);
    const corrupt = structuredClone(packageData.chunks[0]);
    corrupt.positions[0].front_slot = 99;
    await store.createChunk(corrupt.id, corrupt);
    await expect(freezePodPrintManifest(store, input)).rejects.toBeInstanceOf(PodPrintManifestConflictError);
  });

  it("requires the exact updateTime to freeze and rejects a stale writer", async () => {
    const store = new MockManifestStore();
    const input = await freezeInput();
    const packageData = await createPodPrintManifestPackage(input);
    await store.createHeader(packageData.header.id, packageData.header);
    const stale = (await store.readHeader(packageData.header.id))!;
    const current = store.headers.get(packageData.header.id)!;
    store.headers.set(packageData.header.id, { data: current.data, updateTime: "newer-version" });
    await expect(store.freezeHeader(packageData.header.id, { state: "frozen", frozen_at: input.createdAt }, stale.updateTime))
      .rejects.toThrow("update_time_conflict");
  });

  it("does not allow a writing manifest to be used for PDF", async () => {
    const store = new MockManifestStore();
    const packageData = await createPodPrintManifestPackage(await freezeInput());
    await store.createHeader(packageData.header.id, packageData.header);
    await expect(readFrozenPodPrintManifest(store, packageData.header.id))
      .rejects.toBeInstanceOf(PodPrintManifestIntegrityError);
  });

  it("detects a missing or changed chunk before rendering", async () => {
    const store = new MockManifestStore();
    const frozen = await freezePodPrintManifest(store, await freezeInput());
    store.chunks.delete(frozen.chunks[0].id);
    await expect(readFrozenPodPrintManifest(store, frozen.header.id)).rejects.toThrow("manifest_chunk_missing");

    const packageData = await createPodPrintManifestPackage(await freezeInput());
    await expect(reconstructAndVerifyPodPrintManifest(
      { ...packageData.header, state: "frozen" },
      [{ ...packageData.chunks[0], chunk_sha256: "0".repeat(64) }],
    )).rejects.toThrow("manifest_chunk_hash_mismatch");
  });

  it("splits more than 500 positions into deterministic bounded chunks", async () => {
    const packageData = await createPodPrintManifestPackage(await freezeInput(501));
    expect(packageData.chunks).toHaveLength(6);
    expect(packageData.chunks.map((chunk) => chunk.positions.length)).toEqual([100, 100, 100, 100, 100, 1]);
    expect(packageData.chunks[5]).toMatchObject({ chunk_index: 5, range_start: 500, range_end: 500 });
  });

  it("also splits deterministically by canonical UTF-8 byte size", async () => {
    const sources = await Promise.all([source(0), source(1), source(2)]);
    for (const [index, item] of sources.entries()) {
      item.render_input.front_text = `${index}-${"ą".repeat(70_000)}`;
      item.render_input_sha256 = await hashPodPrintRenderInput(item.render_input);
    }
    const manifest = buildPodPrintManifest(sources, [CURRENT_POSTCARD_PRINT_FORMAT]);
    const packageData = await createPodPrintManifestPackage({
      batchId: "large-render-input",
      batchRevision: "1",
      printJobIds: ["job-0"],
      manifest,
      createdAt: "2026-08-29T10:00:00.000Z",
      createdBy: "admin-a",
    });
    expect(packageData.chunks.length).toBeGreaterThan(1);
    expect(packageData.chunks.flatMap((chunk) => chunk.positions)).toHaveLength(3);
    for (const chunk of packageData.chunks) {
      expect(new TextEncoder().encode(canonicalJson(chunk)).byteLength).toBeLessThanOrEqual(POD_PRINT_MANIFEST_CHUNK_MAX_UTF8_BYTES);
    }
    expect(packageData.chunks).toEqual((await createPodPrintManifestPackage({
      batchId: "large-render-input",
      batchRevision: "1",
      printJobIds: ["job-0"],
      manifest,
      createdAt: "2030-01-01T00:00:00.000Z",
      createdBy: "admin-b",
    })).chunks);
  });

  it("uses a stable UTF-8 SHA-256 test vector", async () => {
    expect(await sha256Utf8("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(new TextEncoder().encode("€")).toEqual(new Uint8Array([0xe2, 0x82, 0xac]));
    expect(await sha256Utf8("€")).toBe("c4cc90ed3d26f12d4b08a75140970a7904035c31cbb4515a83f19b9003c00d1d");
  });

  it("derives IDs independently of print job order", async () => {
    const base = { batchId: "batch", batchRevision: "2", algorithmVersion: "algo" };
    expect(await derivePodPrintManifestId({ ...base, printJobIds: ["b", "a"] }))
      .toBe(await derivePodPrintManifestId({ ...base, printJobIds: ["a", "b"] }));
  });

  it("mock store enforces exists:false and updateTime conflicts", async () => {
    const store = new MockManifestStore();
    const packageData = await createPodPrintManifestPackage(await freezeInput());
    await store.createHeader(packageData.header.id, packageData.header);
    await expect(store.createHeader(packageData.header.id, packageData.header)).rejects.toThrow("exists_false_conflict");
    await store.createChunk(packageData.chunks[0].id, packageData.chunks[0]);
    await expect(store.createChunk(packageData.chunks[0].id, packageData.chunks[0])).rejects.toThrow("exists_false_conflict");
    await expect(store.freezeHeader(packageData.header.id, { state: "frozen", frozen_at: "now" }, "wrong"))
      .rejects.toThrow("update_time_conflict");
  });

  it("canonical payload excludes created_at and created_by", async () => {
    const packageData = await createPodPrintManifestPackage(await freezeInput());
    expect(serializePodPrintManifest(packageData.manifest)).not.toContain("created_at");
    expect(serializePodPrintManifest(packageData.manifest)).not.toContain("created_by");
  });
});
