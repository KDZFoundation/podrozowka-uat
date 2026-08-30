import { describe, expect, it } from "vitest";
import { CURRENT_POSTCARD_PRINT_FORMAT, POD_IMPOSITION_ALGORITHM } from "./podImposition";
import { POD_CUT_STACK_PROFILE_VERSION, planPodProductionBatch, type PodProductionBatchSourceItem } from "./podProductionBatch";
import {
  freezePodProductionBatch,
  type PodProductionBatchChunk,
  type PodProductionBatchHeader,
  type PodProductionBatchMembership,
  type PodProductionBatchStore,
} from "./podProductionBatchPersistence";

const source = (index: number, overrides: Partial<PodProductionBatchSourceItem> = {}): PodProductionBatchSourceItem => ({
  pod_job_id: `pod-${index}`,
  print_job_id: `job-${Math.floor(index / 2)}`,
  print_job_item_id: `item-${index}`,
  inventory_unit_id: `unit-${index}`,
  source_order_id: `order-${index}`,
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
  ...overrides,
});

class AtomicStore implements PodProductionBatchStore {
  headers = new Map<string, { data: PodProductionBatchHeader; updateTime: string }>();
  chunks = new Map<string, PodProductionBatchChunk>();
  memberships = new Map<string, PodProductionBatchMembership>();
  version = 0;
  failChunkCreates = 0;
  successfulChunkCreatesBeforeFailure = -1;
  chunkCreateCount = 0;
  loseReservationResponse = false;

  async readHeader(id: string) { return structuredClone(this.headers.get(id) || null); }
  async readChunk(id: string) { return structuredClone(this.chunks.get(id) || null); }
  async readMembership(id: string) { return structuredClone(this.memberships.get(id) || null); }
  async createChunk(id: string, chunk: PodProductionBatchChunk) {
    if (this.successfulChunkCreatesBeforeFailure === this.chunkCreateCount) {
      this.successfulChunkCreatesBeforeFailure = -1;
      throw new Error("unavailable");
    }
    if (this.failChunkCreates > 0) { this.failChunkCreates -= 1; throw new Error("unavailable"); }
    await Promise.resolve();
    if (this.chunks.has(id)) throw new Error("exists:false");
    this.chunks.set(id, structuredClone(chunk));
    this.chunkCreateCount += 1;
  }
  async reserveBatch(header: PodProductionBatchHeader, memberships: PodProductionBatchMembership[]) {
    await Promise.resolve();
    if (this.headers.has(header.id) || memberships.some((membership) => this.memberships.has(membership.id))) {
      throw new Error("exists:false");
    }
    this.version += 1;
    this.headers.set(header.id, { data: structuredClone(header), updateTime: `v${this.version}` });
    memberships.forEach((membership) => this.memberships.set(membership.id, structuredClone(membership)));
    if (this.loseReservationResponse) { this.loseReservationResponse = false; throw new Error("lost-response"); }
  }
  async freezeBatch(id: string, update: Pick<PodProductionBatchHeader, "state" | "frozen_at">, updateTime: string) {
    await Promise.resolve();
    const header = this.headers.get(id);
    if (!header || header.updateTime !== updateTime) throw new Error("updateTime-conflict");
    this.version += 1;
    header.data = { ...header.data, ...update };
    header.updateTime = `v${this.version}`;
  }
}

const manifest = (count: number, offset = 0) => planPodProductionBatch(
  Array.from({ length: count }, (_, index) => source(index + offset)),
  [CURRENT_POSTCARD_PRINT_FORMAT],
);

const freeze = async (store: AtomicStore, count = 10, offset = 0) => freezePodProductionBatch(store, {
  manifest: await manifest(count, offset),
  createdAt: "2026-08-30T00:00:00.000Z",
  createdBy: "admin-1",
});

describe("POD production batch persistence", () => {
  it("converges ten parallel workers on one frozen batch", async () => {
    const store = new AtomicStore();
    const results = await Promise.all(Array.from({ length: 10 }, () => freeze(store, 10)));
    expect(new Set(results.map((result) => result.header.id)).size).toBe(1);
    expect(store.headers.size).toBe(1);
    expect(store.memberships.size).toBe(10);
    expect(results.every((result) => result.header.state === "FROZEN")).toBe(true);
  });

  it("is idempotent after a lost successful reservation response", async () => {
    const store = new AtomicStore();
    store.loseReservationResponse = true;
    const first = await freeze(store, 10);
    const retry = await freeze(store, 10);
    expect(retry.header.id).toBe(first.header.id);
    expect(store.headers.size).toBe(1);
    expect(store.memberships.size).toBe(10);
  });

  it("rejects overlapping different batches atomically", async () => {
    const store = new AtomicStore();
    const firstManifest = await manifest(10);
    const secondManifest = await planPodProductionBatch([
      source(0),
      ...Array.from({ length: 9 }, (_, index) => source(index + 20)),
    ], [CURRENT_POSTCARD_PRINT_FORMAT]);
    const results = await Promise.allSettled([
      freezePodProductionBatch(store, { manifest: firstManifest, createdAt: "2026-08-30T00:00:00.000Z", createdBy: "a" }),
      freezePodProductionBatch(store, { manifest: secondManifest, createdAt: "2026-08-30T00:00:00.000Z", createdBy: "b" }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  });

  it("resumes after a partial chunk write", async () => {
    const store = new AtomicStore();
    store.successfulChunkCreatesBeforeFailure = 1;
    await expect(freeze(store, 120)).rejects.toMatchObject({ code: "pod_batch_chunk_create_failed" });
    expect(store.chunks.size).toBe(1);
    const resumed = await freeze(store, 120);
    expect(resumed.header.state).toBe("FROZEN");
    expect(resumed.manifest.item_count).toBe(120);
  });

  it("does not rewrite a frozen batch on retry", async () => {
    const store = new AtomicStore();
    const first = await freeze(store, 10);
    const version = store.headers.get(first.header.id)!.updateTime;
    const second = await freeze(store, 10);
    expect(second.header).toEqual(first.header);
    expect(store.headers.get(first.header.id)!.updateTime).toBe(version);
  });
});
