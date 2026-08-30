import { canonicalJson, sha256Utf8 } from "./podPrintManifest";
import {
  POD_PRODUCTION_BATCH_MANIFEST_VERSION,
  assertPodProductionBatchManifest,
  hashPodProductionBatchManifest,
  type PodProductionBatchGroup,
  type PodProductionBatchManifest,
  type PodProductionBatchPosition,
  type PodProductionBatchSlot,
} from "./podProductionBatch";

export const POD_PRODUCTION_BATCH_SCHEMA_VERSION = 1 as const;
export const POD_PRODUCTION_BATCH_CHUNK_SIZE = 100;
export const POD_PRODUCTION_BATCH_CHUNK_MAX_UTF8_BYTES = 256 * 1024;
export const POD_PRODUCTION_BATCH_MAX_ATOMIC_MEMBERSHIPS = 450;

export class PodProductionBatchPersistenceError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "PodProductionBatchPersistenceError";
  }
}

export type PodProductionBatchGroupMetadata = Omit<PodProductionBatchGroup, "positions" | "slots">;

export interface PodProductionBatchHeader {
  id: string;
  batch_manifest_version: number;
  batch_algorithm_version: string;
  batch_sha256: string;
  cut_stack_profile_version: string;
  state: "BUILDING" | "FROZEN";
  sheet_width_mm: number;
  sheet_height_mm: number;
  item_count: number;
  print_job_count: number;
  sheet_count: number;
  empty_slot_count: number;
  chunk_count: number;
  source_manifests: PodProductionBatchManifest["source_manifests"];
  asset_sets: PodProductionBatchManifest["asset_sets"];
  groups: PodProductionBatchGroupMetadata[];
  schema_version: typeof POD_PRODUCTION_BATCH_SCHEMA_VERSION;
  created_at: string;
  created_by: string;
  frozen_at: string | null;
}

export interface PodProductionBatchPersistedSlot {
  group_index: number;
  slot: PodProductionBatchSlot;
}

export interface PodProductionBatchChunk {
  id: string;
  batch_id: string;
  chunk_index: number;
  range_start: number;
  range_end: number;
  slots: PodProductionBatchPersistedSlot[];
  chunk_sha256: string;
  schema_version: typeof POD_PRODUCTION_BATCH_SCHEMA_VERSION;
}

export interface PodProductionBatchMembership {
  id: string;
  print_job_item_id: string;
  inventory_unit_id: string;
  batch_id: string;
  batch_sha256: string;
  state: "ASSIGNED";
  schema_version: typeof POD_PRODUCTION_BATCH_SCHEMA_VERSION;
  created_at: string;
}

export interface VersionedProductionBatchHeader {
  data: PodProductionBatchHeader;
  updateTime: string;
}

export interface PodProductionBatchStore {
  readHeader(id: string): Promise<VersionedProductionBatchHeader | null>;
  readChunk(id: string): Promise<PodProductionBatchChunk | null>;
  createChunk(id: string, chunk: PodProductionBatchChunk): Promise<void>;
  readMembership(id: string): Promise<PodProductionBatchMembership | null>;
  reserveBatch(header: PodProductionBatchHeader, memberships: PodProductionBatchMembership[]): Promise<void>;
  freezeBatch(
    id: string,
    headerUpdate: Pick<PodProductionBatchHeader, "state" | "frozen_at">,
    updateTime: string,
  ): Promise<void>;
}

export interface FreezePodProductionBatchInput {
  manifest: PodProductionBatchManifest;
  createdAt: string;
  createdBy: string;
}

export interface FrozenPodProductionBatch {
  header: PodProductionBatchHeader;
  chunks: PodProductionBatchChunk[];
  manifest: PodProductionBatchManifest;
  canonicalJson: string;
}

const compareText = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;

export const derivePodProductionBatchMembershipId = async (printJobItemId: string) => {
  if (!printJobItemId.trim()) throw new PodProductionBatchPersistenceError("pod_batch_membership_item_id_required");
  return `pbm-${await sha256Utf8(printJobItemId)}`;
};

const chunkPayload = (chunk: Pick<PodProductionBatchChunk,
  "batch_id" | "chunk_index" | "range_start" | "range_end" | "slots">) => ({
    batch_id: chunk.batch_id,
    chunk_index: chunk.chunk_index,
    range_start: chunk.range_start,
    range_end: chunk.range_end,
    slots: chunk.slots,
  });

const headerBusinessPayload = (header: PodProductionBatchHeader) => ({
  id: header.id,
  batch_manifest_version: header.batch_manifest_version,
  batch_algorithm_version: header.batch_algorithm_version,
  batch_sha256: header.batch_sha256,
  cut_stack_profile_version: header.cut_stack_profile_version,
  sheet_width_mm: header.sheet_width_mm,
  sheet_height_mm: header.sheet_height_mm,
  item_count: header.item_count,
  print_job_count: header.print_job_count,
  sheet_count: header.sheet_count,
  empty_slot_count: header.empty_slot_count,
  chunk_count: header.chunk_count,
  source_manifests: header.source_manifests,
  asset_sets: header.asset_sets,
  groups: header.groups,
  schema_version: header.schema_version,
});

const membershipBusinessPayload = (membership: PodProductionBatchMembership) => ({
  id: membership.id,
  print_job_item_id: membership.print_job_item_id,
  inventory_unit_id: membership.inventory_unit_id,
  batch_id: membership.batch_id,
  batch_sha256: membership.batch_sha256,
  schema_version: membership.schema_version,
});

const assertSameHeader = (actual: PodProductionBatchHeader, expected: PodProductionBatchHeader) => {
  if (canonicalJson(headerBusinessPayload(actual)) !== canonicalJson(headerBusinessPayload(expected))) {
    throw new PodProductionBatchPersistenceError("pod_batch_header_conflict");
  }
};

const assertSameMembership = (actual: PodProductionBatchMembership, expected: PodProductionBatchMembership) => {
  if (canonicalJson(membershipBusinessPayload(actual)) !== canonicalJson(membershipBusinessPayload(expected))) {
    throw new PodProductionBatchPersistenceError("pod_batch_membership_conflict");
  }
};

export const createPodProductionBatchPackage = async (input: FreezePodProductionBatchInput) => {
  await assertPodProductionBatchManifest(input.manifest);
  if (input.manifest.item_count > POD_PRODUCTION_BATCH_MAX_ATOMIC_MEMBERSHIPS) {
    throw new PodProductionBatchPersistenceError("pod_batch_atomic_membership_limit_exceeded");
  }
  const flattened: PodProductionBatchPersistedSlot[] = input.manifest.groups.flatMap((group) =>
    group.slots.map((slot) => ({ group_index: group.group_index, slot })),
  );
  const chunks: PodProductionBatchChunk[] = [];
  for (let start = 0; start < flattened.length;) {
    const chunkIndex = chunks.length;
    let slots: PodProductionBatchPersistedSlot[] = [];
    while (start + slots.length < flattened.length && slots.length < POD_PRODUCTION_BATCH_CHUNK_SIZE) {
      const candidateSlots = [...slots, flattened[start + slots.length]];
      const candidate = {
        id: `${input.manifest.batch_id}-${String(chunkIndex).padStart(6, "0")}`,
        batch_id: input.manifest.batch_id,
        chunk_index: chunkIndex,
        range_start: start,
        range_end: start + candidateSlots.length - 1,
        slots: candidateSlots,
        chunk_sha256: "0".repeat(64),
        schema_version: POD_PRODUCTION_BATCH_SCHEMA_VERSION,
      };
      if (new TextEncoder().encode(canonicalJson(candidate)).byteLength > POD_PRODUCTION_BATCH_CHUNK_MAX_UTF8_BYTES) {
        if (!slots.length) throw new PodProductionBatchPersistenceError("pod_batch_slot_exceeds_chunk_limit");
        break;
      }
      slots = candidateSlots;
    }
    const base = {
      batch_id: input.manifest.batch_id,
      chunk_index: chunkIndex,
      range_start: start,
      range_end: start + slots.length - 1,
      slots,
    };
    chunks.push({
      id: `${input.manifest.batch_id}-${String(chunkIndex).padStart(6, "0")}`,
      ...base,
      chunk_sha256: await sha256Utf8(canonicalJson(chunkPayload(base))),
      schema_version: POD_PRODUCTION_BATCH_SCHEMA_VERSION,
    });
    start += slots.length;
  }
  const groups = input.manifest.groups.map(({ positions: _positions, slots: _slots, ...metadata }) => metadata);
  const header: PodProductionBatchHeader = {
    id: input.manifest.batch_id,
    batch_manifest_version: input.manifest.batch_manifest_version,
    batch_algorithm_version: input.manifest.batch_algorithm_version,
    batch_sha256: input.manifest.batch_sha256,
    cut_stack_profile_version: input.manifest.cut_stack_profile_version,
    state: "BUILDING",
    sheet_width_mm: input.manifest.sheet_width_mm,
    sheet_height_mm: input.manifest.sheet_height_mm,
    item_count: input.manifest.item_count,
    print_job_count: input.manifest.print_job_count,
    sheet_count: input.manifest.sheet_count,
    empty_slot_count: input.manifest.empty_slot_count,
    chunk_count: chunks.length,
    source_manifests: input.manifest.source_manifests,
    asset_sets: input.manifest.asset_sets,
    groups,
    schema_version: POD_PRODUCTION_BATCH_SCHEMA_VERSION,
    created_at: input.createdAt,
    created_by: input.createdBy,
    frozen_at: null,
  };
  const positions = input.manifest.groups.flatMap((group) => group.positions)
    .sort((left, right) => left.batch_sequence_index - right.batch_sequence_index);
  const memberships = await Promise.all(positions.map(async (position): Promise<PodProductionBatchMembership> => ({
    id: await derivePodProductionBatchMembershipId(position.print_job_item_id),
    print_job_item_id: position.print_job_item_id,
    inventory_unit_id: position.inventory_unit_id,
    batch_id: input.manifest.batch_id,
    batch_sha256: input.manifest.batch_sha256,
    state: "ASSIGNED",
    schema_version: POD_PRODUCTION_BATCH_SCHEMA_VERSION,
    created_at: input.createdAt,
  })));
  return { header, chunks, memberships };
};

export const reconstructAndVerifyPodProductionBatch = async (
  header: PodProductionBatchHeader,
  chunks: PodProductionBatchChunk[],
): Promise<FrozenPodProductionBatch> => {
  if (header.state !== "FROZEN") throw new PodProductionBatchPersistenceError("pod_batch_not_frozen");
  if (header.batch_manifest_version !== POD_PRODUCTION_BATCH_MANIFEST_VERSION
    || chunks.length !== header.chunk_count) {
    throw new PodProductionBatchPersistenceError("pod_batch_chunk_count_mismatch");
  }
  const orderedChunks = [...chunks].sort((left, right) => left.chunk_index - right.chunk_index);
  const flattened: PodProductionBatchPersistedSlot[] = [];
  for (let index = 0; index < orderedChunks.length; index += 1) {
    const chunk = orderedChunks[index];
    const expectedId = `${header.id}-${String(index).padStart(6, "0")}`;
    if (chunk.id !== expectedId || chunk.batch_id !== header.id || chunk.chunk_index !== index
      || chunk.range_start !== flattened.length || chunk.range_end !== chunk.range_start + chunk.slots.length - 1
      || chunk.chunk_sha256 !== await sha256Utf8(canonicalJson(chunkPayload(chunk)))) {
      throw new PodProductionBatchPersistenceError("pod_batch_chunk_integrity_mismatch");
    }
    flattened.push(...chunk.slots);
  }
  const groups: PodProductionBatchGroup[] = header.groups.map((metadata) => {
    const slots = flattened.filter((entry) => entry.group_index === metadata.group_index).map((entry) => entry.slot);
    const positions = slots.filter((slot): slot is PodProductionBatchPosition => slot.kind === "position")
      .sort((left, right) => left.source_sequence_index - right.source_sequence_index);
    return { ...metadata, positions, slots };
  });
  const manifest: PodProductionBatchManifest = {
    batch_manifest_version: header.batch_manifest_version as 1,
    batch_algorithm_version: header.batch_algorithm_version as PodProductionBatchManifest["batch_algorithm_version"],
    batch_id: header.id,
    batch_sha256: header.batch_sha256,
    cut_stack_profile_version: header.cut_stack_profile_version as PodProductionBatchManifest["cut_stack_profile_version"],
    sheet_width_mm: header.sheet_width_mm as PodProductionBatchManifest["sheet_width_mm"],
    sheet_height_mm: header.sheet_height_mm as PodProductionBatchManifest["sheet_height_mm"],
    item_count: header.item_count,
    print_job_count: header.print_job_count,
    sheet_count: header.sheet_count,
    empty_slot_count: header.empty_slot_count,
    source_manifests: header.source_manifests,
    asset_sets: header.asset_sets,
    groups,
  };
  if (await hashPodProductionBatchManifest(manifest) !== header.batch_sha256) {
    throw new PodProductionBatchPersistenceError("pod_batch_hash_mismatch");
  }
  await assertPodProductionBatchManifest(manifest);
  return { header, chunks: orderedChunks, manifest, canonicalJson: canonicalJson(manifest) };
};

export const readFrozenPodProductionBatch = async (store: PodProductionBatchStore, batchId: string) => {
  const header = await store.readHeader(batchId);
  if (!header) return null;
  if (header.data.state !== "FROZEN") throw new PodProductionBatchPersistenceError("pod_batch_not_frozen");
  const chunks: PodProductionBatchChunk[] = [];
  for (let index = 0; index < header.data.chunk_count; index += 1) {
    const chunk = await store.readChunk(`${batchId}-${String(index).padStart(6, "0")}`);
    if (!chunk) throw new PodProductionBatchPersistenceError("pod_batch_chunk_missing");
    chunks.push(chunk);
  }
  return reconstructAndVerifyPodProductionBatch(header.data, chunks);
};

export const freezePodProductionBatch = async (
  store: PodProductionBatchStore,
  input: FreezePodProductionBatchInput,
): Promise<FrozenPodProductionBatch> => {
  const packageData = await createPodProductionBatchPackage(input);

  let header = await store.readHeader(packageData.header.id);
  const existingMemberships = await Promise.all(packageData.memberships.map((membership) => store.readMembership(membership.id)));
  for (let index = 0; index < existingMemberships.length; index += 1) {
    const existing = existingMemberships[index];
    if (existing) assertSameMembership(existing, packageData.memberships[index]);
  }

  if (!header) {
    if (existingMemberships.some(Boolean)) throw new PodProductionBatchPersistenceError("pod_batch_orphan_membership_conflict");
    try {
      await store.reserveBatch(packageData.header, packageData.memberships);
    } catch {
      header = await store.readHeader(packageData.header.id);
      const freshMemberships = await Promise.all(packageData.memberships.map((membership) => store.readMembership(membership.id)));
      if (!header || freshMemberships.some((membership) => !membership)) {
        throw new PodProductionBatchPersistenceError("pod_batch_reservation_conflict");
      }
      freshMemberships.forEach((membership, index) => assertSameMembership(membership!, packageData.memberships[index]));
    }
  }
  header = header || await store.readHeader(packageData.header.id);
  if (!header) throw new PodProductionBatchPersistenceError("pod_batch_header_missing");
  assertSameHeader(header.data, packageData.header);
  if (header.data.state === "FROZEN") return (await readFrozenPodProductionBatch(store, header.data.id))!;

  for (const expected of packageData.chunks) {
    let existing = await store.readChunk(expected.id);
    if (!existing) {
      try {
        await store.createChunk(expected.id, expected);
      } catch {
        existing = await store.readChunk(expected.id);
        if (!existing) throw new PodProductionBatchPersistenceError("pod_batch_chunk_create_failed");
      }
    }
    if (canonicalJson(existing || expected) !== canonicalJson(expected)) {
      throw new PodProductionBatchPersistenceError("pod_batch_chunk_conflict");
    }
  }

  const completeChunks = await Promise.all(packageData.chunks.map((chunk) => store.readChunk(chunk.id)));
  if (completeChunks.some((chunk) => !chunk)) throw new PodProductionBatchPersistenceError("pod_batch_chunk_missing");
  const completeMemberships = await Promise.all(packageData.memberships.map((membership) => store.readMembership(membership.id)));
  if (completeMemberships.some((membership) => !membership)) {
    throw new PodProductionBatchPersistenceError("pod_batch_membership_missing");
  }
  completeMemberships.forEach((membership, index) => assertSameMembership(membership!, packageData.memberships[index]));
  const frozenHeader = { ...header.data, state: "FROZEN" as const, frozen_at: input.createdAt };
  await reconstructAndVerifyPodProductionBatch(frozenHeader, completeChunks as PodProductionBatchChunk[]);

  try {
    await store.freezeBatch(header.data.id, { state: "FROZEN", frozen_at: input.createdAt }, header.updateTime);
  } catch {
    const concurrent = await store.readHeader(header.data.id);
    if (!concurrent || concurrent.data.state !== "FROZEN") {
      throw new PodProductionBatchPersistenceError("pod_batch_freeze_conflict");
    }
    assertSameHeader(concurrent.data, packageData.header);
  }
  const frozen = await readFrozenPodProductionBatch(store, header.data.id);
  if (!frozen) throw new PodProductionBatchPersistenceError("pod_batch_missing_after_freeze");
  return frozen;
};
