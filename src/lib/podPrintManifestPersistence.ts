import {
  POD_PRINT_MANIFEST_LEGACY_VERSION,
  POD_PRINT_MANIFEST_VERSION,
  canonicalJson,
  hashPodPrintManifest,
  serializePodPrintManifest,
  sha256Utf8,
  type PodPrintManifest,
  type PodPrintManifestFormatGroup,
  type PodPrintManifestItem,
} from "./podPrintManifest";

export const POD_PRINT_MANIFEST_SCHEMA_VERSION = 1;
export const POD_PRINT_MANIFEST_CHUNK_SIZE = 100;
// Firestore documents are limited to 1 MiB. Canonical JSON is smaller than
// Firestore's typed REST representation, so keep a conservative 256 KiB cap.
export const POD_PRINT_MANIFEST_CHUNK_MAX_UTF8_BYTES = 256 * 1024;

export class PodPrintManifestConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PodPrintManifestConflictError";
  }
}

export class PodPrintManifestIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PodPrintManifestIntegrityError";
  }
}

export type PodPrintManifestGroupMetadata = Omit<PodPrintManifestFormatGroup, "items">;

export interface PodPrintManifestChunkPosition extends PodPrintManifestItem {
  print_format_id: string;
}

export interface PodPrintManifestHeader {
  id: string;
  batch_id: string;
  batch_revision: string;
  manifest_version: number;
  algorithm_version: string;
  manifest_sha256: string;
  state: "writing" | "frozen";
  print_job_ids: string[];
  source_order_ids: string[];
  print_format_ids: string[];
  postcard_count: number;
  sheet_count: number;
  chunk_count: number;
  format_groups: PodPrintManifestGroupMetadata[];
  schema_version: number;
  created_at: string;
  created_by: string;
  frozen_at: string | null;
}

export interface PodPrintManifestChunk {
  id: string;
  manifest_id: string;
  chunk_index: number;
  range_start: number;
  range_end: number;
  positions: PodPrintManifestChunkPosition[];
  chunk_sha256: string;
  schema_version: number;
}

export interface VersionedDocument<T> {
  data: T;
  updateTime: string;
}

export interface PodPrintManifestStore {
  readHeader(id: string): Promise<VersionedDocument<PodPrintManifestHeader> | null>;
  createHeader(id: string, data: PodPrintManifestHeader): Promise<void>;
  readChunk(id: string): Promise<VersionedDocument<PodPrintManifestChunk> | null>;
  createChunk(id: string, data: PodPrintManifestChunk): Promise<void>;
  freezeHeader(id: string, data: Pick<PodPrintManifestHeader, "state" | "frozen_at">, updateTime: string): Promise<void>;
}

export interface FreezePodPrintManifestInput {
  batchId: string;
  batchRevision: string;
  printJobIds: string[];
  manifest: PodPrintManifest;
  createdAt: string;
  createdBy: string;
}

export interface FrozenPodPrintManifest {
  header: PodPrintManifestHeader;
  chunks: PodPrintManifestChunk[];
  manifest: PodPrintManifest;
  canonicalJson: string;
}

const compareText = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
const uniqueSorted = (values: string[]) => [...new Set(values)].sort(compareText);

export const derivePodPrintManifestId = async (input: {
  batchId: string;
  batchRevision: string;
  printJobIds: string[];
  manifestVersion?: number;
  algorithmVersion: string;
}) => {
  const key = canonicalJson({
    algorithm_version: input.algorithmVersion,
    batch_id: input.batchId,
    batch_revision: input.batchRevision,
    manifest_version: input.manifestVersion ?? POD_PRINT_MANIFEST_VERSION,
    print_job_ids: uniqueSorted(input.printJobIds),
  });
  return `pm-${await sha256Utf8(key)}`;
};

const flattenManifest = (manifest: PodPrintManifest): PodPrintManifestChunkPosition[] => manifest.format_groups.flatMap(
  (group) => group.items.map((item) => ({ print_format_id: group.print_format_id, ...item })),
);

const chunkPayload = (chunk: Omit<PodPrintManifestChunk, "chunk_sha256" | "schema_version" | "id">) => ({
  manifest_id: chunk.manifest_id,
  chunk_index: chunk.chunk_index,
  range_start: chunk.range_start,
  range_end: chunk.range_end,
  positions: chunk.positions,
});

const utf8ByteLength = (value: string) => new TextEncoder().encode(value).byteLength;

export const createPodPrintManifestPackage = async (input: FreezePodPrintManifestInput) => {
  const printJobIds = uniqueSorted(input.printJobIds);
  const manifestPrintJobIds = uniqueSorted(input.manifest.format_groups.flatMap(
    (group) => group.items.map((item) => item.pod_job_id),
  ));
  if (canonicalJson(printJobIds) !== canonicalJson(manifestPrintJobIds)) {
    throw new PodPrintManifestIntegrityError("manifest_print_job_ids_mismatch");
  }
  const manifestId = await derivePodPrintManifestId({
    batchId: input.batchId,
    batchRevision: input.batchRevision,
    printJobIds,
    algorithmVersion: input.manifest.algorithm_version,
  });
  const manifestSha256 = await hashPodPrintManifest(input.manifest);
  const positions = flattenManifest(input.manifest);
  const chunks: PodPrintManifestChunk[] = [];
  for (let start = 0; start < positions.length;) {
    const chunkIndex = chunks.length;
    let selected: PodPrintManifestChunkPosition[] = [];
    while (start + selected.length < positions.length && selected.length < POD_PRINT_MANIFEST_CHUNK_SIZE) {
      const candidate = [...selected, positions[start + selected.length]];
      const candidatePayload = {
        manifest_id: manifestId,
        chunk_index: chunkIndex,
        range_start: start,
        range_end: start + candidate.length - 1,
        positions: candidate,
      };
      const candidateDocument = {
        id: `${manifestId}-${String(chunkIndex).padStart(6, "0")}`,
        ...candidatePayload,
        chunk_sha256: "0".repeat(64),
        schema_version: POD_PRINT_MANIFEST_SCHEMA_VERSION,
      };
      if (utf8ByteLength(canonicalJson(candidateDocument)) > POD_PRINT_MANIFEST_CHUNK_MAX_UTF8_BYTES) {
        if (!selected.length) {
          throw new PodPrintManifestIntegrityError(`manifest_position_exceeds_chunk_byte_limit:${positions[start].print_job_item_id}`);
        }
        break;
      }
      selected = candidate;
    }
    const chunkBase = {
      manifest_id: manifestId,
      chunk_index: chunkIndex,
      range_start: start,
      range_end: start + selected.length - 1,
      positions: selected,
    };
    chunks.push({
      id: `${manifestId}-${String(chunkIndex).padStart(6, "0")}`,
      ...chunkBase,
      chunk_sha256: await sha256Utf8(canonicalJson(chunkPayload(chunkBase))),
      schema_version: POD_PRINT_MANIFEST_SCHEMA_VERSION,
    });
    start += selected.length;
  }
  const formatGroups = input.manifest.format_groups.map(({ items: _items, ...metadata }) => metadata);
  const sourceOrderIds = uniqueSorted(positions.map((position) => position.source_order_id));
  const header: PodPrintManifestHeader = {
    id: manifestId,
    batch_id: input.batchId,
    batch_revision: input.batchRevision,
    manifest_version: input.manifest.manifest_version,
    algorithm_version: input.manifest.algorithm_version,
    manifest_sha256: manifestSha256,
    state: "writing",
    print_job_ids: printJobIds,
    source_order_ids: sourceOrderIds,
    print_format_ids: input.manifest.format_groups.map((group) => group.print_format_id).sort(compareText),
    postcard_count: input.manifest.postcard_count,
    sheet_count: input.manifest.sheet_count,
    chunk_count: chunks.length,
    format_groups: formatGroups,
    schema_version: POD_PRINT_MANIFEST_SCHEMA_VERSION,
    created_at: input.createdAt,
    created_by: input.createdBy,
    frozen_at: null,
  };
  return { header, chunks, manifest: input.manifest, canonicalJson: serializePodPrintManifest(input.manifest) };
};

const headerBusinessPayload = (header: PodPrintManifestHeader) => ({
  id: header.id,
  batch_id: header.batch_id,
  batch_revision: header.batch_revision,
  manifest_version: header.manifest_version,
  algorithm_version: header.algorithm_version,
  manifest_sha256: header.manifest_sha256,
  print_job_ids: header.print_job_ids,
  source_order_ids: header.source_order_ids,
  print_format_ids: header.print_format_ids,
  postcard_count: header.postcard_count,
  sheet_count: header.sheet_count,
  chunk_count: header.chunk_count,
  format_groups: header.format_groups,
  schema_version: header.schema_version,
});

const assertSameHeader = (existing: PodPrintManifestHeader, expected: PodPrintManifestHeader) => {
  if (canonicalJson(headerBusinessPayload(existing)) !== canonicalJson(headerBusinessPayload(expected))) {
    throw new PodPrintManifestConflictError(`manifest_business_key_conflict:${expected.id}`);
  }
};

const assertSameChunk = async (existing: PodPrintManifestChunk, expected: PodPrintManifestChunk) => {
  const expectedHash = await sha256Utf8(canonicalJson(chunkPayload(expected)));
  const existingHash = await sha256Utf8(canonicalJson(chunkPayload(existing)));
  if (existing.chunk_sha256 !== existingHash || expected.chunk_sha256 !== expectedHash || existingHash !== expectedHash) {
    throw new PodPrintManifestConflictError(`manifest_chunk_conflict:${expected.id}`);
  }
};

const createOrVerifyHeader = async (store: PodPrintManifestStore, expected: PodPrintManifestHeader) => {
  let existing = await store.readHeader(expected.id);
  if (!existing) {
    try {
      await store.createHeader(expected.id, expected);
    } catch {
      existing = await store.readHeader(expected.id);
      if (!existing) throw new PodPrintManifestIntegrityError(`manifest_header_create_failed:${expected.id}`);
    }
  }
  existing = existing ?? await store.readHeader(expected.id);
  if (!existing) throw new PodPrintManifestIntegrityError(`manifest_header_missing:${expected.id}`);
  assertSameHeader(existing.data, expected);
  return existing;
};

const createOrVerifyChunk = async (store: PodPrintManifestStore, expected: PodPrintManifestChunk) => {
  let existing = await store.readChunk(expected.id);
  if (!existing) {
    try {
      await store.createChunk(expected.id, expected);
    } catch {
      existing = await store.readChunk(expected.id);
      if (!existing) throw new PodPrintManifestIntegrityError(`manifest_chunk_create_failed:${expected.id}`);
    }
  }
  existing = existing ?? await store.readChunk(expected.id);
  if (!existing) throw new PodPrintManifestIntegrityError(`manifest_chunk_missing:${expected.id}`);
  await assertSameChunk(existing.data, expected);
};

export const reconstructAndVerifyPodPrintManifest = async (
  header: PodPrintManifestHeader,
  chunks: PodPrintManifestChunk[],
): Promise<FrozenPodPrintManifest> => {
  if (header.state !== "frozen") throw new PodPrintManifestIntegrityError(`manifest_not_frozen:${header.id}`);
  if (header.manifest_version !== POD_PRINT_MANIFEST_VERSION && header.manifest_version !== POD_PRINT_MANIFEST_LEGACY_VERSION) {
    throw new PodPrintManifestIntegrityError(`manifest_version_unsupported:${header.manifest_version}`);
  }
  if (chunks.length !== header.chunk_count) throw new PodPrintManifestIntegrityError(`manifest_chunk_count_mismatch:${header.id}`);
  const orderedChunks = [...chunks].sort((left, right) => left.chunk_index - right.chunk_index);
  const positions: PodPrintManifestChunkPosition[] = [];
  for (let index = 0; index < orderedChunks.length; index += 1) {
    const chunk = orderedChunks[index];
    if (chunk.id !== `${header.id}-${String(index).padStart(6, "0")}` || chunk.chunk_index !== index) {
      throw new PodPrintManifestIntegrityError(`manifest_chunk_sequence_invalid:${chunk.id}`);
    }
    if (chunk.schema_version !== POD_PRINT_MANIFEST_SCHEMA_VERSION
      || chunk.range_start !== positions.length
      || chunk.range_end !== chunk.range_start + chunk.positions.length - 1) {
      throw new PodPrintManifestIntegrityError(`manifest_chunk_range_invalid:${chunk.id}`);
    }
    const actualHash = await sha256Utf8(canonicalJson(chunkPayload(chunk)));
    if (chunk.chunk_sha256 !== actualHash) throw new PodPrintManifestIntegrityError(`manifest_chunk_hash_mismatch:${chunk.id}`);
    positions.push(...chunk.positions);
  }
  if (positions.length !== header.postcard_count) throw new PodPrintManifestIntegrityError(`manifest_postcard_count_mismatch:${header.id}`);
  const manifest: PodPrintManifest = {
    manifest_version: header.manifest_version as PodPrintManifest["manifest_version"],
    algorithm_version: header.algorithm_version as PodPrintManifest["algorithm_version"],
    postcard_count: header.postcard_count,
    sheet_count: header.sheet_count,
    format_groups: header.format_groups.map((metadata) => ({
      ...metadata,
      items: positions
        .filter((position) => position.print_format_id === metadata.print_format_id)
        .map(({ print_format_id: _printFormatId, ...item }) => item),
    })),
  };
  const canonical = serializePodPrintManifest(manifest);
  if (await sha256Utf8(canonical) !== header.manifest_sha256) {
    throw new PodPrintManifestIntegrityError(`manifest_hash_mismatch:${header.id}`);
  }
  for (const item of manifest.format_groups.flatMap((group) => group.items)) {
    if (await sha256Utf8(canonicalJson(item.render_input)) !== item.render_input_sha256) {
      throw new PodPrintManifestIntegrityError(`manifest_render_input_hash_mismatch:${item.print_job_item_id}`);
    }
  }
  return { header, chunks: orderedChunks, manifest, canonicalJson: canonical };
};

export const readFrozenPodPrintManifest = async (store: PodPrintManifestStore, manifestId: string) => {
  const header = await store.readHeader(manifestId);
  if (!header) return null;
  if (header.data.state !== "frozen") throw new PodPrintManifestIntegrityError(`manifest_not_frozen:${manifestId}`);
  const chunks: PodPrintManifestChunk[] = [];
  for (let index = 0; index < header.data.chunk_count; index += 1) {
    const id = `${manifestId}-${String(index).padStart(6, "0")}`;
    const chunk = await store.readChunk(id);
    if (!chunk) throw new PodPrintManifestIntegrityError(`manifest_chunk_missing:${id}`);
    chunks.push(chunk.data);
  }
  return reconstructAndVerifyPodPrintManifest(header.data, chunks);
};

export const freezePodPrintManifest = async (
  store: PodPrintManifestStore,
  input: FreezePodPrintManifestInput,
): Promise<FrozenPodPrintManifest> => {
  const packageData = await createPodPrintManifestPackage(input);
  let header = await createOrVerifyHeader(store, packageData.header);
  if (header.data.state === "frozen") {
    return (await readFrozenPodPrintManifest(store, header.data.id))!;
  }
  for (const chunk of packageData.chunks) await createOrVerifyChunk(store, chunk);
  header = (await store.readHeader(packageData.header.id))!;
  assertSameHeader(header.data, packageData.header);
  if (header.data.state !== "frozen") {
    try {
      await store.freezeHeader(header.data.id, { state: "frozen", frozen_at: input.createdAt }, header.updateTime);
    } catch {
      const concurrent = await store.readHeader(header.data.id);
      if (!concurrent || concurrent.data.state !== "frozen") {
        throw new PodPrintManifestConflictError(`manifest_freeze_version_conflict:${header.data.id}`);
      }
      assertSameHeader(concurrent.data, packageData.header);
    }
  }
  const frozen = await readFrozenPodPrintManifest(store, packageData.header.id);
  if (!frozen) throw new PodPrintManifestIntegrityError(`manifest_missing_after_freeze:${packageData.header.id}`);
  return frozen;
};
