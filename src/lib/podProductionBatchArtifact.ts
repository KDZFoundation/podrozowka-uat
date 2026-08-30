import { canonicalJson, sha256Utf8 } from "./podPrintManifest";
import { sha256Bytes, type PodPrintArtifactStorage, type PodPrintArtifactStorageMetadata } from "./podPrintArtifact";
import type { FrozenPodProductionBatch } from "./podProductionBatchPersistence";

export const POD_PRODUCTION_BATCH_ARTIFACT_VERSION = 1 as const;
export const POD_PRODUCTION_BATCH_ARTIFACT_CONTENT_TYPE = "application/pdf" as const;

export class PodProductionBatchArtifactError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "PodProductionBatchArtifactError";
  }
}

export interface PodProductionBatchArtifactDocument {
  id: string;
  artifact_version: typeof POD_PRODUCTION_BATCH_ARTIFACT_VERSION;
  batch_id: string;
  batch_sha256: string;
  group_index: number;
  print_format_id: string;
  cut_stack_profile_version: string;
  render_profile_version: string;
  render_profile_sha256: string;
  source_manifests: FrozenPodProductionBatch["manifest"]["source_manifests"];
  asset_sets: FrozenPodProductionBatch["manifest"]["asset_sets"];
  pdf_sha256: string;
  storage_bucket: string;
  storage_object: string;
  storage_generation: string;
  storage_metageneration: string;
  size_bytes: number;
  content_type: typeof POD_PRODUCTION_BATCH_ARTIFACT_CONTENT_TYPE;
  crc32c: string;
  md5_hash: string | null;
  sheet_count: number;
  item_count: number;
  immutable: true;
  status: "ready";
  created_at: string;
  created_by: string;
  schema_version: 1;
}

export interface PodProductionBatchArtifactStore {
  read(id: string): Promise<PodProductionBatchArtifactDocument | null>;
  createOnly(id: string, document: PodProductionBatchArtifactDocument): Promise<void>;
}

export const derivePodProductionBatchArtifactId = async (batchId: string, groupIndex: number) => {
  if (!batchId.trim() || !Number.isInteger(groupIndex) || groupIndex < 0) {
    throw new PodProductionBatchArtifactError("pod_batch_artifact_reference_invalid");
  }
  return `pba-${await sha256Utf8(canonicalJson({
    artifact_version: POD_PRODUCTION_BATCH_ARTIFACT_VERSION,
    batch_id: batchId,
    group_index: groupIndex,
  }))}`;
};

export const podProductionBatchArtifactObject = (
  batchId: string,
  groupIndex: number,
  batchSha256: string,
  pdfSha256: string,
) => {
  if (!/^[a-z0-9-]{1,96}$/.test(batchId) || !Number.isInteger(groupIndex) || groupIndex < 0
    || !/^[0-9a-f]{64}$/.test(batchSha256) || !/^[0-9a-f]{64}$/.test(pdfSha256)) {
    throw new PodProductionBatchArtifactError("pod_batch_artifact_path_invalid");
  }
  return `pod-production-batch-artifacts/${batchId}/group-${String(groupIndex).padStart(4, "0")}/${batchSha256}/${pdfSha256}.pdf`;
};

const identity = (artifact: PodProductionBatchArtifactDocument) => {
  const { created_at: _createdAt, created_by: _createdBy, ...business } = artifact;
  return business;
};

const expectedMetadata = (input: {
  batchId: string;
  batchSha256: string;
  groupIndex: number;
  cutStackProfileVersion: string;
  pdfSha256: string;
  printFormatId: string;
  renderProfileVersion: string;
  renderProfileSha256: string;
  sourceManifestsSha256: string;
  assetSetsSha256: string;
}) => ({
  batch_id: input.batchId,
  batch_sha256: input.batchSha256,
  group_index: String(input.groupIndex),
  cut_stack_profile_version: input.cutStackProfileVersion,
  pdf_sha256: input.pdfSha256,
  print_format_id: input.printFormatId,
  render_profile_version: input.renderProfileVersion,
  render_profile_sha256: input.renderProfileSha256,
  source_manifests_sha256: input.sourceManifestsSha256,
  asset_sets_sha256: input.assetSetsSha256,
  content_type: POD_PRODUCTION_BATCH_ARTIFACT_CONTENT_TYPE,
});

const verifyObject = async (
  storage: PodPrintArtifactStorage,
  object: string,
  generation: string | undefined,
  expectedSha256: string,
  expectedSize: number,
  expected: Record<string, string>,
) => {
  let metadata: PodPrintArtifactStorageMetadata;
  let bytes: Uint8Array;
  try {
    metadata = await storage.readMetadata(object, generation);
    bytes = await storage.download(object, metadata.generation);
  } catch (error) {
    if (String(error).includes("missing_object") || String(error).includes("missing")) {
      throw new PodProductionBatchArtifactError("pod_batch_artifact_missing_object");
    }
    throw error;
  }
  if (metadata.object !== object || metadata.contentType !== POD_PRODUCTION_BATCH_ARTIFACT_CONTENT_TYPE
    || metadata.size !== expectedSize || bytes.byteLength !== expectedSize
    || (generation && metadata.generation !== generation)) {
    throw new PodProductionBatchArtifactError("pod_batch_artifact_metadata_mismatch");
  }
  for (const [key, value] of Object.entries(expected)) {
    if (metadata.metadata[key] !== value) throw new PodProductionBatchArtifactError("pod_batch_artifact_metadata_mismatch");
  }
  if (await sha256Bytes(bytes) !== expectedSha256) {
    throw new PodProductionBatchArtifactError("pod_batch_artifact_hash_mismatch");
  }
  return { metadata, bytes };
};

export const createPodProductionBatchArtifact = async (
  storage: PodPrintArtifactStorage,
  store: PodProductionBatchArtifactStore,
  input: {
    batch: FrozenPodProductionBatch;
    groupIndex: number;
    pdfBytes: Uint8Array;
    createdAt: string;
    createdBy: string;
  },
) => {
  if (input.batch.header.state !== "FROZEN") throw new PodProductionBatchArtifactError("pod_batch_artifact_batch_not_frozen");
  const group = input.batch.manifest.groups[input.groupIndex];
  if (!group || group.group_index !== input.groupIndex) throw new PodProductionBatchArtifactError("pod_batch_artifact_group_missing");
  if (!input.pdfBytes.byteLength || new TextDecoder().decode(input.pdfBytes.slice(0, 5)) !== "%PDF-") {
    throw new PodProductionBatchArtifactError("pod_batch_artifact_pdf_invalid");
  }
  const id = await derivePodProductionBatchArtifactId(input.batch.header.id, input.groupIndex);
  const pdfSha256 = await sha256Bytes(input.pdfBytes);
  const object = podProductionBatchArtifactObject(input.batch.header.id, input.groupIndex, input.batch.header.batch_sha256, pdfSha256);
  const customMetadata = expectedMetadata({
    batchId: input.batch.header.id,
    batchSha256: input.batch.header.batch_sha256,
    groupIndex: input.groupIndex,
    cutStackProfileVersion: input.batch.header.cut_stack_profile_version,
    pdfSha256,
    printFormatId: group.print_format_id,
    renderProfileVersion: group.render_profile_version,
    renderProfileSha256: group.render_profile_sha256,
    sourceManifestsSha256: await sha256Utf8(canonicalJson(group.source_manifests)),
    assetSetsSha256: await sha256Utf8(canonicalJson(group.asset_sets)),
  });

  const existing = await store.read(id);
  if (existing) {
    if (existing.id !== id || existing.artifact_version !== POD_PRODUCTION_BATCH_ARTIFACT_VERSION
      || existing.batch_id !== input.batch.header.id || existing.group_index !== input.groupIndex
      || existing.pdf_sha256 !== pdfSha256 || existing.size_bytes !== input.pdfBytes.byteLength
      || existing.batch_sha256 !== input.batch.header.batch_sha256
      || existing.print_format_id !== group.print_format_id
      || existing.cut_stack_profile_version !== input.batch.header.cut_stack_profile_version
      || existing.render_profile_version !== group.render_profile_version
      || existing.render_profile_sha256 !== group.render_profile_sha256
      || canonicalJson(existing.source_manifests) !== canonicalJson(group.source_manifests)
      || canonicalJson(existing.asset_sets) !== canonicalJson(group.asset_sets)
      || existing.storage_object !== object) {
      throw new PodProductionBatchArtifactError("pod_batch_artifact_firestore_conflict");
    }
    const verified = await verifyObject(storage, existing.storage_object, existing.storage_generation,
      existing.pdf_sha256, existing.size_bytes, customMetadata);
    if (verified.metadata.bucket !== existing.storage_bucket
      || verified.metadata.metageneration !== existing.storage_metageneration
      || verified.metadata.crc32c !== existing.crc32c
      || verified.metadata.md5Hash !== existing.md5_hash) {
      throw new PodProductionBatchArtifactError("pod_batch_artifact_metadata_mismatch");
    }
    return { artifact: existing, bytes: verified.bytes, created: false };
  }

  let storageMetadata: PodPrintArtifactStorageMetadata;
  try {
    storageMetadata = await storage.createOnly(object, input.pdfBytes, customMetadata);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("precondition_failed")) throw error;
    try {
      storageMetadata = (await verifyObject(storage, object, undefined, pdfSha256, input.pdfBytes.byteLength, customMetadata)).metadata;
    } catch {
      throw new PodProductionBatchArtifactError("pod_batch_artifact_storage_conflict");
    }
  }
  const verified = await verifyObject(storage, object, storageMetadata.generation, pdfSha256, input.pdfBytes.byteLength, customMetadata);
  const artifact: PodProductionBatchArtifactDocument = {
    id,
    artifact_version: POD_PRODUCTION_BATCH_ARTIFACT_VERSION,
    batch_id: input.batch.header.id,
    batch_sha256: input.batch.header.batch_sha256,
    group_index: input.groupIndex,
    print_format_id: group.print_format_id,
    cut_stack_profile_version: input.batch.header.cut_stack_profile_version,
    render_profile_version: group.render_profile_version,
    render_profile_sha256: group.render_profile_sha256,
    source_manifests: group.source_manifests,
    asset_sets: group.asset_sets,
    pdf_sha256: pdfSha256,
    storage_bucket: verified.metadata.bucket,
    storage_object: object,
    storage_generation: verified.metadata.generation,
    storage_metageneration: verified.metadata.metageneration,
    size_bytes: input.pdfBytes.byteLength,
    content_type: POD_PRODUCTION_BATCH_ARTIFACT_CONTENT_TYPE,
    crc32c: verified.metadata.crc32c,
    md5_hash: verified.metadata.md5Hash,
    sheet_count: group.sheet_count,
    item_count: group.item_count,
    immutable: true,
    status: "ready",
    created_at: input.createdAt,
    created_by: input.createdBy,
    schema_version: 1,
  };
  try {
    await store.createOnly(id, artifact);
  } catch {
    const concurrent = await store.read(id);
    if (!concurrent || canonicalJson(identity(concurrent)) !== canonicalJson(identity(artifact))) {
      throw new PodProductionBatchArtifactError("pod_batch_artifact_firestore_conflict");
    }
    return { artifact: concurrent, bytes: verified.bytes, created: false };
  }
  return { artifact, bytes: verified.bytes, created: true };
};

export const reprintPodProductionBatchArtifact = async (
  storage: PodPrintArtifactStorage,
  store: PodProductionBatchArtifactStore,
  artifactId: string,
) => {
  const artifact = await store.read(artifactId);
  if (!artifact) throw new PodProductionBatchArtifactError("pod_batch_artifact_not_found");
  if (artifact.id !== await derivePodProductionBatchArtifactId(artifact.batch_id, artifact.group_index)
    || artifact.immutable !== true || artifact.status !== "ready") {
    throw new PodProductionBatchArtifactError("pod_batch_artifact_firestore_conflict");
  }
  const metadata = expectedMetadata({
    batchId: artifact.batch_id,
    batchSha256: artifact.batch_sha256,
    groupIndex: artifact.group_index,
    cutStackProfileVersion: artifact.cut_stack_profile_version,
    pdfSha256: artifact.pdf_sha256,
    printFormatId: artifact.print_format_id,
    renderProfileVersion: artifact.render_profile_version,
    renderProfileSha256: artifact.render_profile_sha256,
    sourceManifestsSha256: await sha256Utf8(canonicalJson(artifact.source_manifests)),
    assetSetsSha256: await sha256Utf8(canonicalJson(artifact.asset_sets)),
  });
  const verified = await verifyObject(storage, artifact.storage_object, artifact.storage_generation,
    artifact.pdf_sha256, artifact.size_bytes, metadata);
  if (verified.metadata.bucket !== artifact.storage_bucket
    || verified.metadata.metageneration !== artifact.storage_metageneration
    || verified.metadata.crc32c !== artifact.crc32c
    || verified.metadata.md5Hash !== artifact.md5_hash) {
    throw new PodProductionBatchArtifactError("pod_batch_artifact_metadata_mismatch");
  }
  return { artifact, bytes: verified.bytes };
};
