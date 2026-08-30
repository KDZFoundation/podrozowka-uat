import { canonicalJson, sha256Utf8 } from "./podPrintManifest";
import { sha256Bytes, type PodPrintArtifactStorage, type PodPrintArtifactStorageMetadata } from "./podPrintArtifact";
import { POD_PRINT_ASSET_SET_VERSION, POD_RENDER_PROFILE, POD_RENDER_PROFILE_VERSION } from "./podRenderProfile";

export type PodPrintAssetRole =
  | "postcard_front_photo"
  | "country_flag"
  | "postcard_front_template"
  | "postcard_back_template"
  | "print_font"
  | "qr_raster";

export type PodPrintAssetSourceKind = "external_url" | "derived_flag_url" | "local_template" | "pinned_font_url" | "generated_qr";

export class PodPrintAssetSetError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "PodPrintAssetSetError";
  }
}

export interface PodPrintAssetCandidate {
  asset_role: PodPrintAssetRole;
  source_kind: PodPrintAssetSourceKind;
  source_url: string | null;
  source_version: string | null;
  content_type: string;
  bytes: Uint8Array;
  print_job_item_id: string | null;
  render_input_sha256: string | null;
  font_family?: string | null;
  font_weight?: string | null;
  font_style?: string | null;
  font_unicode_range?: string | null;
  shared_key?: string | null;
  qr_payload_sha256?: string | null;
  qr_algorithm_version?: string | null;
  qr_width_px?: number | null;
  qr_margin_modules?: number | null;
  qr_error_correction_level?: string | null;
}

export interface PodPrintAssetSetItem {
  id: string;
  asset_set_id: string;
  asset_id: string;
  asset_role: PodPrintAssetRole;
  source_kind: PodPrintAssetSourceKind;
  source_url: string | null;
  source_version: string | null;
  sha256: string;
  content_type: string;
  size_bytes: number;
  storage_bucket: string;
  storage_object: string;
  storage_generation: string;
  storage_metageneration: string;
  crc32c: string;
  md5_hash: string | null;
  print_job_item_id: string | null;
  render_input_sha256: string | null;
  font_family: string | null;
  font_weight: string | null;
  font_style: string | null;
  font_unicode_range: string | null;
  shared_key: string | null;
  qr_payload_sha256?: string | null;
  qr_algorithm_version?: string | null;
  qr_width_px?: number | null;
  qr_margin_modules?: number | null;
  qr_error_correction_level?: string | null;
  schema_version: 1;
}

export interface PodPrintAssetSetHeader {
  id: string;
  asset_set_version: typeof POD_PRINT_ASSET_SET_VERSION;
  render_profile_version: typeof POD_RENDER_PROFILE_VERSION;
  render_profile_sha256: string;
  renderer_version: string;
  manifest_id: string;
  manifest_sha256: string;
  state: "writing" | "frozen";
  item_count: number;
  unique_asset_count: number;
  chunk_count: number;
  asset_set_sha256: string;
  created_at: string;
  created_by: string;
  frozen_at: string | null;
  schema_version: 1;
}

export interface VersionedAssetSetHeader {
  data: PodPrintAssetSetHeader;
  updateTime: string;
}

export interface PodPrintAssetSetChunk {
  id: string;
  asset_set_id: string;
  chunk_index: number;
  item_ids: string[];
  chunk_sha256: string;
  schema_version: 1;
}

export interface PodPrintAssetSetStore {
  readHeader(id: string): Promise<VersionedAssetSetHeader | null>;
  createHeader(id: string, header: PodPrintAssetSetHeader): Promise<void>;
  readItem(id: string): Promise<PodPrintAssetSetItem | null>;
  createItem(id: string, item: PodPrintAssetSetItem): Promise<void>;
  readChunk(id: string): Promise<PodPrintAssetSetChunk | null>;
  createChunk(id: string, chunk: PodPrintAssetSetChunk): Promise<void>;
  freezeHeader(id: string, data: Pick<PodPrintAssetSetHeader, "state" | "frozen_at">, updateTime: string): Promise<void>;
}

export interface PodPrintAssetSetManifestReference {
  id: string;
  state: "writing" | "frozen";
  manifest_sha256: string;
}

export interface FreezePodPrintAssetSetInput {
  manifest: PodPrintAssetSetManifestReference;
  rendererVersion: string;
  renderProfileSha256: string;
  candidates: PodPrintAssetCandidate[];
  createdAt: string;
  createdBy: string;
}

const compareText = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;

export const derivePodPrintAssetSetId = async (manifestSha256: string) => {
  if (!/^[0-9a-f]{64}$/i.test(manifestSha256)) throw new PodPrintAssetSetError("pod_asset_set_manifest_hash_mismatch");
  return `pas-${await sha256Utf8(canonicalJson({
    asset_set_version: POD_PRINT_ASSET_SET_VERSION,
    manifest_sha256: manifestSha256.toLowerCase(),
    render_profile_version: POD_RENDER_PROFILE_VERSION,
  }))}`;
};

export const podPrintAssetObject = (sha256: string, contentType: string) => {
  if (!/^[0-9a-f]{64}$/i.test(sha256)) throw new PodPrintAssetSetError("pod_asset_hash_invalid");
  const extension = contentType === "image/png" ? ".png"
    : contentType === "image/jpeg" ? ".jpg"
      : contentType === "image/webp" ? ".webp"
        : contentType === "font/woff2" ? ".woff2"
          : contentType === "font/woff" ? ".woff"
            : "";
  if (!extension) throw new PodPrintAssetSetError("pod_asset_content_type_unsupported");
  return `pod-print-assets/sha256/${sha256.slice(0, 2).toLowerCase()}/${sha256.toLowerCase()}${extension}`;
};

const itemBusinessPayload = (item: PodPrintAssetSetItem) => ({
  asset_id: item.asset_id,
  asset_role: item.asset_role,
  content_type: item.content_type,
  crc32c: item.crc32c,
  font_family: item.font_family,
  font_style: item.font_style,
  font_unicode_range: item.font_unicode_range,
  font_weight: item.font_weight,
  md5_hash: item.md5_hash,
  print_job_item_id: item.print_job_item_id,
  qr_algorithm_version: item.qr_algorithm_version || null,
  qr_error_correction_level: item.qr_error_correction_level || null,
  qr_margin_modules: item.qr_margin_modules ?? null,
  qr_payload_sha256: item.qr_payload_sha256 || null,
  qr_width_px: item.qr_width_px ?? null,
  render_input_sha256: item.render_input_sha256,
  sha256: item.sha256,
  shared_key: item.shared_key,
  size_bytes: item.size_bytes,
  source_kind: item.source_kind,
  source_url: item.source_url,
  source_version: item.source_version,
  storage_bucket: item.storage_bucket,
  storage_generation: item.storage_generation,
  storage_metageneration: item.storage_metageneration,
  storage_object: item.storage_object,
});

export const serializePodPrintAssetSet = (header: Pick<PodPrintAssetSetHeader,
  "asset_set_version" | "render_profile_version" | "render_profile_sha256" | "renderer_version" | "manifest_id" | "manifest_sha256">,
items: PodPrintAssetSetItem[]) => canonicalJson({
  asset_set_version: header.asset_set_version,
  items: [...items].map(itemBusinessPayload).sort((left, right) => compareText(canonicalJson(left), canonicalJson(right))),
  manifest_id: header.manifest_id,
  manifest_sha256: header.manifest_sha256,
  render_profile_sha256: header.render_profile_sha256,
  render_profile_version: header.render_profile_version,
  renderer_version: header.renderer_version,
});

export const hashPodPrintAssetSet = (header: Parameters<typeof serializePodPrintAssetSet>[0], items: PodPrintAssetSetItem[]) =>
  sha256Utf8(serializePodPrintAssetSet(header, items));

const expectedStorageMetadata = (candidate: PodPrintAssetCandidate, sha256: string) => ({
  asset_role: candidate.asset_role,
  asset_set_version: String(POD_PRINT_ASSET_SET_VERSION),
  asset_sha256: sha256,
  content_type: candidate.content_type,
  renderer_profile_version: POD_RENDER_PROFILE_VERSION,
  size_bytes: String(candidate.bytes.byteLength),
  source_kind: candidate.source_kind,
});

const verifyStoredAsset = async (
  storage: PodPrintArtifactStorage,
  object: string,
  sha256: string,
  size: number,
  contentType: string,
  expectedMetadata: Record<string, string>,
  generation?: string,
) => {
  const metadata = await storage.readMetadata(object, generation);
  const bytes = await storage.download(object, metadata.generation);
  if (metadata.object !== object || metadata.contentType !== contentType || metadata.size !== size || bytes.byteLength !== size) {
    throw new PodPrintAssetSetError("pod_asset_metadata_mismatch");
  }
  if (generation && metadata.generation !== generation) throw new PodPrintAssetSetError("pod_asset_generation_mismatch");
  for (const [key, value] of Object.entries(expectedMetadata)) {
    if (metadata.metadata[key] !== value) throw new PodPrintAssetSetError("pod_asset_metadata_mismatch");
  }
  if (await sha256Bytes(bytes) !== sha256) throw new PodPrintAssetSetError("pod_asset_hash_mismatch");
  return metadata;
};

const createOrVerifyAsset = async (storage: PodPrintArtifactStorage, candidate: PodPrintAssetCandidate) => {
  const sha256 = await sha256Bytes(candidate.bytes);
  const object = podPrintAssetObject(sha256, candidate.content_type);
  const customMetadata = expectedStorageMetadata(candidate, sha256);
  let metadata: PodPrintArtifactStorageMetadata;
  try {
    metadata = await storage.createOnly(object, candidate.bytes, customMetadata);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("precondition_failed")) throw error;
    try {
      metadata = await verifyStoredAsset(storage, object, sha256, candidate.bytes.byteLength, candidate.content_type, customMetadata);
    } catch {
      throw new PodPrintAssetSetError("pod_asset_storage_conflict");
    }
  }
  return {
    sha256,
    object,
    metadata: await verifyStoredAsset(
      storage,
      object,
      sha256,
      candidate.bytes.byteLength,
      candidate.content_type,
      customMetadata,
      metadata.generation,
    ),
  };
};

export const derivePodPrintAssetSetItemId = async (assetSetId: string, candidate: Pick<PodPrintAssetCandidate,
  "asset_role" | "print_job_item_id" | "render_input_sha256" | "shared_key">, sha256: string) =>
  `${assetSetId}-${await sha256Utf8(canonicalJson({
    asset_role: candidate.asset_role,
    print_job_item_id: candidate.print_job_item_id,
    render_input_sha256: candidate.render_input_sha256,
    sha256,
    shared_key: candidate.shared_key || null,
  }))}`;

const assertSameItem = (existing: PodPrintAssetSetItem, expected: PodPrintAssetSetItem) => {
  if (canonicalJson(itemBusinessPayload(existing)) !== canonicalJson(itemBusinessPayload(expected))) {
    throw new PodPrintAssetSetError("pod_asset_set_item_conflict");
  }
};

const headerBusinessPayload = (header: PodPrintAssetSetHeader) => ({
  asset_set_version: header.asset_set_version,
  id: header.id,
  item_count: header.item_count,
  chunk_count: header.chunk_count,
  manifest_id: header.manifest_id,
  manifest_sha256: header.manifest_sha256,
  render_profile_sha256: header.render_profile_sha256,
  render_profile_version: header.render_profile_version,
  renderer_version: header.renderer_version,
  schema_version: header.schema_version,
  unique_asset_count: header.unique_asset_count,
});

const assertSameHeader = (existing: PodPrintAssetSetHeader, expected: PodPrintAssetSetHeader) => {
  if (canonicalJson(headerBusinessPayload(existing)) !== canonicalJson(headerBusinessPayload(expected))) {
    throw new PodPrintAssetSetError("pod_asset_set_header_conflict");
  }
};

export const freezePodPrintAssetSet = async (
  storage: PodPrintArtifactStorage,
  store: PodPrintAssetSetStore,
  input: FreezePodPrintAssetSetInput,
) => {
  if (input.manifest.state !== "frozen") throw new PodPrintAssetSetError("pod_asset_set_manifest_not_frozen");
  const id = await derivePodPrintAssetSetId(input.manifest.manifest_sha256);
  const prepared = await Promise.all(input.candidates.map(async (candidate) => {
    const stored = await createOrVerifyAsset(storage, candidate);
    const itemId = await derivePodPrintAssetSetItemId(id, candidate, stored.sha256);
    return {
      id: itemId,
      asset_set_id: id,
      asset_id: `sha256:${stored.sha256}`,
      asset_role: candidate.asset_role,
      source_kind: candidate.source_kind,
      source_url: candidate.source_url,
      source_version: candidate.source_version,
      sha256: stored.sha256,
      content_type: candidate.content_type,
      size_bytes: candidate.bytes.byteLength,
      storage_bucket: stored.metadata.bucket,
      storage_object: stored.object,
      storage_generation: stored.metadata.generation,
      storage_metageneration: stored.metadata.metageneration,
      crc32c: stored.metadata.crc32c,
      md5_hash: stored.metadata.md5Hash,
      print_job_item_id: candidate.print_job_item_id,
      render_input_sha256: candidate.render_input_sha256,
      font_family: candidate.font_family || null,
      font_weight: candidate.font_weight || null,
      font_style: candidate.font_style || null,
      font_unicode_range: candidate.font_unicode_range || null,
      shared_key: candidate.shared_key || null,
      qr_payload_sha256: candidate.qr_payload_sha256 || null,
      qr_algorithm_version: candidate.qr_algorithm_version || null,
      qr_width_px: candidate.qr_width_px ?? null,
      qr_margin_modules: candidate.qr_margin_modules ?? null,
      qr_error_correction_level: candidate.qr_error_correction_level || null,
      schema_version: 1,
    } satisfies PodPrintAssetSetItem;
  }));
  const items = [...new Map(prepared.map((item) => [item.id, item])).values()]
    .sort((left, right) => compareText(left.id, right.id));
  const headerBase = {
    id,
    asset_set_version: POD_PRINT_ASSET_SET_VERSION,
    render_profile_version: POD_RENDER_PROFILE_VERSION,
    render_profile_sha256: input.renderProfileSha256,
    renderer_version: input.rendererVersion,
    manifest_id: input.manifest.id,
    manifest_sha256: input.manifest.manifest_sha256,
  } as const;
  const header: PodPrintAssetSetHeader = {
    ...headerBase,
    state: "writing",
    item_count: items.length,
    unique_asset_count: new Set(items.map((item) => item.sha256)).size,
    chunk_count: Math.ceil(items.length / 100),
    asset_set_sha256: await hashPodPrintAssetSet(headerBase, items),
    created_at: input.createdAt,
    created_by: input.createdBy,
    frozen_at: null,
    schema_version: 1,
  };

  let existingHeader = await store.readHeader(id);
  if (!existingHeader) {
    try {
      await store.createHeader(id, header);
    } catch {
      existingHeader = await store.readHeader(id);
      if (!existingHeader) throw new PodPrintAssetSetError("pod_asset_set_header_create_failed");
    }
  }
  existingHeader = existingHeader || await store.readHeader(id);
  if (!existingHeader) throw new PodPrintAssetSetError("pod_asset_set_header_missing");
  assertSameHeader(existingHeader.data, header);
  if (existingHeader.data.state === "frozen" && existingHeader.data.asset_set_sha256 !== header.asset_set_sha256) {
    throw new PodPrintAssetSetError("pod_asset_set_hash_conflict");
  }

  for (const item of items) {
    let existing = await store.readItem(item.id);
    if (!existing) {
      try {
        await store.createItem(item.id, item);
      } catch {
        existing = await store.readItem(item.id);
        if (!existing) throw new PodPrintAssetSetError("pod_asset_set_item_create_failed");
      }
    }
    assertSameItem(existing || item, item);
  }

  const chunks: PodPrintAssetSetChunk[] = [];
  for (let index = 0; index < header.chunk_count; index += 1) {
    const itemIds = items.slice(index * 100, (index + 1) * 100).map((item) => item.id);
    const chunkBase = { asset_set_id: id, chunk_index: index, item_ids: itemIds };
    const chunk: PodPrintAssetSetChunk = {
      id: `${id}-${String(index).padStart(6, "0")}`,
      ...chunkBase,
      chunk_sha256: await sha256Utf8(canonicalJson(chunkBase)),
      schema_version: 1,
    };
    let existing = await store.readChunk(chunk.id);
    if (!existing) {
      try {
        await store.createChunk(chunk.id, chunk);
      } catch {
        existing = await store.readChunk(chunk.id);
        if (!existing) throw new PodPrintAssetSetError("pod_asset_set_chunk_create_failed");
      }
    }
    if (canonicalJson(existing || chunk) !== canonicalJson(chunk)) throw new PodPrintAssetSetError("pod_asset_set_chunk_conflict");
    chunks.push(chunk);
  }

  if (existingHeader.data.state !== "frozen") {
    try {
      await store.freezeHeader(id, { state: "frozen", frozen_at: input.createdAt }, existingHeader.updateTime);
    } catch {
      const concurrent = await store.readHeader(id);
      if (!concurrent || concurrent.data.state !== "frozen") throw new PodPrintAssetSetError("pod_asset_set_freeze_conflict");
      assertSameHeader(concurrent.data, header);
    }
  }
  const frozen = await store.readHeader(id);
  if (!frozen || frozen.data.state !== "frozen" || frozen.data.asset_set_sha256 !== header.asset_set_sha256) {
    throw new PodPrintAssetSetError("pod_asset_set_integrity_failed");
  }
  await verifyPodPrintAssetSet(frozen.data, items);
  return { header: frozen.data, chunks, items, canonicalJson: serializePodPrintAssetSet(frozen.data, items) };
};

export const verifyPodPrintAssetSet = async (header: PodPrintAssetSetHeader, items: PodPrintAssetSetItem[]) => {
  if (header.state !== "frozen") throw new PodPrintAssetSetError("pod_asset_set_not_frozen");
  if (header.id !== await derivePodPrintAssetSetId(header.manifest_sha256)
    || header.asset_set_version !== POD_PRINT_ASSET_SET_VERSION
    || header.render_profile_version !== POD_RENDER_PROFILE_VERSION
    || !/^[0-9a-f]{64}$/.test(header.render_profile_sha256)
    || !/^[0-9a-f]{64}$/.test(header.asset_set_sha256)) {
    throw new PodPrintAssetSetError("pod_asset_set_header_mismatch");
  }
  if (items.length !== header.item_count) throw new PodPrintAssetSetError("pod_asset_set_item_count_mismatch");
  if (new Set(items.map((item) => item.id)).size !== items.length
    || new Set(items.map((item) => item.sha256)).size !== header.unique_asset_count) {
    throw new PodPrintAssetSetError("pod_asset_set_item_count_mismatch");
  }
  for (const item of items) {
    const expectedId = await derivePodPrintAssetSetItemId(header.id, item, item.sha256);
    if (item.id !== expectedId || item.asset_set_id !== header.id) {
      throw new PodPrintAssetSetError("pod_asset_set_item_mismatch");
    }
    if (item.asset_role === "qr_raster") {
      const payloadSha256 = item.source_url ? await sha256Utf8(item.source_url) : "";
      if (item.content_type !== POD_RENDER_PROFILE.qr.content_type
        || item.qr_payload_sha256 !== payloadSha256
        || item.qr_algorithm_version !== POD_RENDER_PROFILE.qr.algorithm_version
        || item.qr_width_px !== POD_RENDER_PROFILE.qr.width
        || item.qr_margin_modules !== POD_RENDER_PROFILE.qr.margin
        || item.qr_error_correction_level !== POD_RENDER_PROFILE.qr.error_correction_level) {
        throw new PodPrintAssetSetError("pod_asset_set_qr_profile_mismatch");
      }
    }
    if (item.asset_role === "print_font" && (item.content_type !== "font/woff2"
      || !item.font_family || !item.font_weight || !item.font_style || !item.font_unicode_range)) {
      throw new PodPrintAssetSetError("pod_asset_set_font_profile_mismatch");
    }
  }
  const actual = await hashPodPrintAssetSet(header, items);
  if (actual !== header.asset_set_sha256) throw new PodPrintAssetSetError("pod_asset_set_hash_mismatch");
  return { header, items: [...items].sort((left, right) => compareText(left.id, right.id)), canonicalJson: serializePodPrintAssetSet(header, items) };
};
