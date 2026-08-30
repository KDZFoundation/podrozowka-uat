import { canonicalJson, sha256Utf8 } from "./podPrintManifest";

export const POD_PRINT_ARTIFACT_VERSION = 1;
export const POD_PRINT_ARTIFACT_STATUS = "ready" as const;
export const POD_PRINT_ARTIFACT_CONTENT_TYPE = "application/pdf" as const;

export class PodPrintArtifactError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "PodPrintArtifactError";
  }
}

export interface PodPrintArtifactStorageMetadata {
  bucket: string;
  object: string;
  generation: string;
  metageneration: string;
  size: number;
  contentType: string;
  crc32c: string;
  md5Hash: string | null;
  metadata: Record<string, string>;
}

export interface PodPrintArtifactDocument {
  id: string;
  artifact_version: number;
  renderer_version: string;
  print_job_id: string;
  pod_job_id: string | null;
  pod_job_ids: string[];
  manifest_document_id: string;
  manifest_document_path: string;
  manifest_sha256: string;
  pdf_sha256: string;
  storage_bucket: string;
  storage_object: string;
  storage_generation: string;
  storage_metageneration: string;
  size_bytes: number;
  content_type: typeof POD_PRINT_ARTIFACT_CONTENT_TYPE;
  crc32c: string;
  md5_hash: string | null;
  print_format_id: string;
  sheet_count: number;
  item_count: number;
  immutable: true;
  status: typeof POD_PRINT_ARTIFACT_STATUS;
  created_at: string;
  schema_version: 1;
}

export interface PodPrintArtifactManifestReference {
  id: string;
  state: "writing" | "frozen";
  manifest_sha256: string;
  print_job_ids: string[];
  print_format_ids: string[];
  sheet_count: number;
  postcard_count: number;
}

export interface PodPrintArtifactStorage {
  createOnly(object: string, bytes: Uint8Array, metadata: Record<string, string>): Promise<PodPrintArtifactStorageMetadata>;
  readMetadata(object: string, generation?: string): Promise<PodPrintArtifactStorageMetadata>;
  download(object: string, generation: string): Promise<Uint8Array>;
}

export interface PodPrintArtifactStore {
  read(id: string): Promise<PodPrintArtifactDocument | null>;
  createOnly(id: string, document: PodPrintArtifactDocument): Promise<void>;
}

export interface CreatePodPrintArtifactInput {
  printJobId: string;
  manifest: PodPrintArtifactManifestReference;
  rendererVersion: string;
  pdfBytes: Uint8Array;
  createdAt: string;
}

const validatePrintJobId = (value: string) => {
  if (!/^[A-Za-z0-9._-]{1,160}$/.test(value)) throw new PodPrintArtifactError("pod_artifact_print_job_id_invalid");
};

export const podPrintArtifactStorageObject = (printJobId: string, manifestSha256: string) => {
  validatePrintJobId(printJobId);
  if (!/^[0-9a-f]{64}$/i.test(manifestSha256)) throw new PodPrintArtifactError("pod_artifact_manifest_hash_mismatch");
  return `pod-print-artifacts/${printJobId}/${manifestSha256.toLowerCase()}.pdf`;
};

export const derivePodPrintArtifactId = async (printJobId: string, manifestSha256: string) => {
  const digest = await sha256Utf8(canonicalJson({
    artifact_version: POD_PRINT_ARTIFACT_VERSION,
    manifest_sha256: manifestSha256,
    print_job_id: printJobId,
  }));
  return `pa-${digest}`;
};

export const sha256Bytes = async (bytes: Uint8Array) => {
  const stable = Uint8Array.from(bytes);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", stable);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const expectedObjectMetadata = (input: {
  manifestSha256: string;
  pdfSha256: string;
  rendererVersion: string;
  printJobId: string;
}) => ({
  manifest_sha256: input.manifestSha256,
  pdf_sha256: input.pdfSha256,
  renderer_version: input.rendererVersion,
  print_job_id: input.printJobId,
  content_type: POD_PRINT_ARTIFACT_CONTENT_TYPE,
});

const assertStorageObject = async (
  storage: PodPrintArtifactStorage,
  expected: { object: string; pdfSha256: string; size: number; metadata: Record<string, string> },
  generation?: string,
) => {
  const metadata = await storage.readMetadata(expected.object, generation);
  const bytes = await storage.download(expected.object, metadata.generation);
  if (metadata.object !== expected.object || metadata.contentType !== POD_PRINT_ARTIFACT_CONTENT_TYPE) {
    throw new PodPrintArtifactError("pod_artifact_metadata_mismatch");
  }
  if (generation && metadata.generation !== generation) throw new PodPrintArtifactError("pod_artifact_metadata_mismatch");
  if (metadata.size !== expected.size || bytes.byteLength !== expected.size) throw new PodPrintArtifactError("pod_artifact_metadata_mismatch");
  for (const [key, value] of Object.entries(expected.metadata)) {
    if (metadata.metadata[key] !== value) throw new PodPrintArtifactError("pod_artifact_metadata_mismatch");
  }
  if (await sha256Bytes(bytes) !== expected.pdfSha256) throw new PodPrintArtifactError("pod_artifact_hash_mismatch");
  return { metadata, bytes };
};

const artifactIdentity = (document: PodPrintArtifactDocument) => ({
  artifact_version: document.artifact_version,
  renderer_version: document.renderer_version,
  print_job_id: document.print_job_id,
  pod_job_id: document.pod_job_id,
  pod_job_ids: document.pod_job_ids,
  manifest_document_id: document.manifest_document_id,
  manifest_document_path: document.manifest_document_path,
  manifest_sha256: document.manifest_sha256,
  pdf_sha256: document.pdf_sha256,
  storage_bucket: document.storage_bucket,
  storage_object: document.storage_object,
  storage_generation: document.storage_generation,
  storage_metageneration: document.storage_metageneration,
  size_bytes: document.size_bytes,
  content_type: document.content_type,
  crc32c: document.crc32c,
  md5_hash: document.md5_hash,
  print_format_id: document.print_format_id,
  sheet_count: document.sheet_count,
  item_count: document.item_count,
  immutable: document.immutable,
  status: document.status,
  schema_version: document.schema_version,
});

const assertArtifactDocument = (existing: PodPrintArtifactDocument, expected: PodPrintArtifactDocument) => {
  if (canonicalJson(artifactIdentity(existing)) !== canonicalJson(artifactIdentity(expected))) {
    throw new PodPrintArtifactError("pod_artifact_firestore_conflict");
  }
};

const assertArtifactRecordShape = async (artifact: PodPrintArtifactDocument) => {
  const expectedId = await derivePodPrintArtifactId(artifact.print_job_id, artifact.manifest_sha256);
  const expectedObject = podPrintArtifactStorageObject(artifact.print_job_id, artifact.manifest_sha256);
  if (artifact.id !== expectedId
    || artifact.artifact_version !== POD_PRINT_ARTIFACT_VERSION
    || artifact.schema_version !== 1
    || artifact.manifest_document_path !== `pod_print_manifests/${artifact.manifest_document_id}`
    || artifact.storage_object !== expectedObject
    || artifact.content_type !== POD_PRINT_ARTIFACT_CONTENT_TYPE
    || artifact.immutable !== true
    || artifact.status !== POD_PRINT_ARTIFACT_STATUS) {
    throw new PodPrintArtifactError("pod_artifact_firestore_conflict");
  }
};

const assertStoredMetadataMatchesDocument = (
  artifact: PodPrintArtifactDocument,
  metadata: PodPrintArtifactStorageMetadata,
) => {
  if (metadata.bucket !== artifact.storage_bucket
    || metadata.generation !== artifact.storage_generation
    || metadata.metageneration !== artifact.storage_metageneration
    || metadata.crc32c !== artifact.crc32c
    || metadata.md5Hash !== artifact.md5_hash) {
    throw new PodPrintArtifactError("pod_artifact_metadata_mismatch");
  }
};

const assertArtifactMatchesInput = (
  artifact: PodPrintArtifactDocument,
  input: CreatePodPrintArtifactInput,
  pdfSha256: string,
  object: string,
) => {
  if (artifact.renderer_version !== input.rendererVersion
    || artifact.print_job_id !== input.printJobId
    || artifact.manifest_document_id !== input.manifest.id
    || artifact.manifest_sha256 !== input.manifest.manifest_sha256
    || artifact.pdf_sha256 !== pdfSha256
    || artifact.storage_object !== object
    || artifact.size_bytes !== input.pdfBytes.byteLength
    || canonicalJson(artifact.pod_job_ids) !== canonicalJson(input.manifest.print_job_ids)
    || artifact.print_format_id !== input.manifest.print_format_ids.join(",")
    || artifact.sheet_count !== input.manifest.sheet_count
    || artifact.item_count !== input.manifest.postcard_count) {
    throw new PodPrintArtifactError("pod_artifact_firestore_conflict");
  }
};

export const createPodPrintArtifact = async (
  storage: PodPrintArtifactStorage,
  store: PodPrintArtifactStore,
  input: CreatePodPrintArtifactInput,
) => {
  if (input.manifest.state !== "frozen") throw new PodPrintArtifactError("pod_artifact_manifest_not_frozen");
  if (!/^[0-9a-f]{64}$/i.test(input.manifest.manifest_sha256)) {
    throw new PodPrintArtifactError("pod_artifact_manifest_hash_mismatch");
  }
  if (!input.pdfBytes.byteLength) throw new PodPrintArtifactError("pod_artifact_empty_pdf");
  const pdfSha256 = await sha256Bytes(input.pdfBytes);
  const object = podPrintArtifactStorageObject(input.printJobId, input.manifest.manifest_sha256);
  const id = await derivePodPrintArtifactId(input.printJobId, input.manifest.manifest_sha256);
  const objectMetadata = expectedObjectMetadata({
    manifestSha256: input.manifest.manifest_sha256,
    pdfSha256,
    rendererVersion: input.rendererVersion,
    printJobId: input.printJobId,
  });

  const existingDocument = await store.read(id);
  if (existingDocument) {
    await assertArtifactRecordShape(existingDocument);
    assertArtifactMatchesInput(existingDocument, input, pdfSha256, object);
    const currentMetadata = await storage.readMetadata(object);
    if (currentMetadata.generation !== existingDocument.storage_generation) {
      throw new PodPrintArtifactError("pod_artifact_firestore_conflict");
    }
    const verified = await assertStorageObject(storage, {
      object,
      pdfSha256,
      size: input.pdfBytes.byteLength,
      metadata: objectMetadata,
    }, existingDocument.storage_generation);
    assertStoredMetadataMatchesDocument(existingDocument, verified.metadata);
    return { artifact: existingDocument, bytes: verified.bytes, created: false };
  }

  let storageMetadata: PodPrintArtifactStorageMetadata;
  try {
    storageMetadata = await storage.createOnly(object, input.pdfBytes, objectMetadata);
  } catch (error) {
    if (!(error instanceof PodPrintArtifactError) || error.code !== "pod_artifact_storage_precondition_failed") throw error;
    try {
      const verified = await assertStorageObject(storage, {
        object,
        pdfSha256,
        size: input.pdfBytes.byteLength,
        metadata: objectMetadata,
      });
      storageMetadata = verified.metadata;
    } catch {
      throw new PodPrintArtifactError("pod_artifact_storage_conflict");
    }
  }
  const verified = await assertStorageObject(storage, {
    object,
    pdfSha256,
    size: input.pdfBytes.byteLength,
    metadata: objectMetadata,
  }, storageMetadata.generation);
  const artifact: PodPrintArtifactDocument = {
    id,
    artifact_version: POD_PRINT_ARTIFACT_VERSION,
    renderer_version: input.rendererVersion,
    print_job_id: input.printJobId,
    pod_job_id: input.manifest.print_job_ids.length === 1 ? input.manifest.print_job_ids[0] : null,
    pod_job_ids: [...input.manifest.print_job_ids],
    manifest_document_id: input.manifest.id,
    manifest_document_path: `pod_print_manifests/${input.manifest.id}`,
    manifest_sha256: input.manifest.manifest_sha256,
    pdf_sha256: pdfSha256,
    storage_bucket: verified.metadata.bucket,
    storage_object: object,
    storage_generation: verified.metadata.generation,
    storage_metageneration: verified.metadata.metageneration,
    size_bytes: input.pdfBytes.byteLength,
    content_type: POD_PRINT_ARTIFACT_CONTENT_TYPE,
    crc32c: verified.metadata.crc32c,
    md5_hash: verified.metadata.md5Hash,
    print_format_id: input.manifest.print_format_ids.join(","),
    sheet_count: input.manifest.sheet_count,
    item_count: input.manifest.postcard_count,
    immutable: true,
    status: POD_PRINT_ARTIFACT_STATUS,
    created_at: input.createdAt,
    schema_version: 1,
  };
  try {
    await store.createOnly(id, artifact);
  } catch {
    const concurrent = await store.read(id);
    if (!concurrent) throw new PodPrintArtifactError("pod_artifact_firestore_write_failed");
    assertArtifactDocument(concurrent, artifact);
    return { artifact: concurrent, bytes: verified.bytes, created: false };
  }
  return { artifact, bytes: verified.bytes, created: true };
};

export const reprintPodPrintArtifact = async (
  storage: PodPrintArtifactStorage,
  store: PodPrintArtifactStore,
  artifactId: string,
) => {
  const artifact = await store.read(artifactId);
  if (!artifact) throw new PodPrintArtifactError("pod_artifact_not_found");
  await assertArtifactRecordShape(artifact);
  const verified = await assertStorageObject(storage, {
    object: artifact.storage_object,
    pdfSha256: artifact.pdf_sha256,
    size: artifact.size_bytes,
    metadata: expectedObjectMetadata({
      manifestSha256: artifact.manifest_sha256,
      pdfSha256: artifact.pdf_sha256,
      rendererVersion: artifact.renderer_version,
      printJobId: artifact.print_job_id,
    }),
  }, artifact.storage_generation);
  assertStoredMetadataMatchesDocument(artifact, verified.metadata);
  return { artifact, bytes: verified.bytes };
};
