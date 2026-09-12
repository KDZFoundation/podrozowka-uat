import crypto from "node:crypto";
import { gcpAccessToken } from "./gcp-firestore.js";
import { PodPrintArtifactError, type PodPrintArtifactStorage, type PodPrintArtifactStorageMetadata } from "../../src/lib/podPrintArtifact.js";

type GcsObjectResource = {
  bucket?: string;
  name?: string;
  generation?: string | number;
  metageneration?: string | number;
  size?: string | number;
  contentType?: string;
  crc32c?: string;
  md5Hash?: string;
  metadata?: Record<string, string>;
};

const bucketName = () => {
  const value = process.env.POD_PRINT_ARTIFACT_BUCKET || "";
  if (!value) throw new Error("pod_artifact_storage_bucket_required");
  return value;
};

export const normalizeGcsObjectMetadata = (value: GcsObjectResource): PodPrintArtifactStorageMetadata => {
  if (!value.bucket || !value.name || !value.generation || !value.metageneration || !value.size || !value.crc32c) {
    throw new PodPrintArtifactError("pod_artifact_metadata_mismatch");
  }
  return {
    bucket: value.bucket,
    object: value.name,
    generation: String(value.generation),
    metageneration: String(value.metageneration),
    size: Number(value.size),
    contentType: value.contentType || "",
    crc32c: value.crc32c,
    md5Hash: value.md5Hash || null,
    metadata: value.metadata || {},
  };
};

const authorizedFetch = async (url: string, init: RequestInit = {}) => {
  const token = await gcpAccessToken();
  return fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
};

export type GcsBinaryObjectMetadata = {
  bucket: string;
  object: string;
  generation: string;
  size: number;
  contentType: string;
};

const metadataUrl = (bucket: string, object: string, generation?: string) => {
  const query = new URLSearchParams();
  if (generation) query.set("generation", generation);
  return `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(object)}?${query}`;
};

export const gcsCreateOnlyUploadUrl = (bucket: string) =>
  `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?uploadType=multipart&ifGenerationMatch=0`;

export const gcsCreateOnlyResumableUploadUrl = (bucket: string, object: string) => {
  const query = new URLSearchParams({
    uploadType: "resumable",
    ifGenerationMatch: "0",
    name: object,
  });
  return `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?${query}`;
};

export const initiateGcsCreateOnlyResumableUpload = async (
  object: string,
  sizeBytes: number,
  metadata: Record<string, string>,
  origin: string,
) => {
  const bucket = bucketName();
  const contentType = metadata.content_type;
  if (!contentType) throw new Error("gcs_content_type_required");
  const response = await authorizedFetch(
    gcsCreateOnlyResumableUploadUrl(bucket, object),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": contentType,
        "X-Upload-Content-Length": String(sizeBytes),
        Origin: origin,
      },
      body: JSON.stringify({ name: object, contentType, metadata }),
    },
  );
  if (response.status === 412) throw new PodPrintArtifactError("pod_artifact_storage_precondition_failed");
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`pod_artifact_storage_upload_init_failed:${response.status}:${JSON.stringify(body)}`);
  const uploadUrl = response.headers.get("location");
  if (!uploadUrl) throw new Error("pod_artifact_storage_upload_location_missing");
  return uploadUrl;
};

export const gcpPodPrintArtifactStorage: PodPrintArtifactStorage = {
  createOnly: async (object, bytes, metadata) => {
    const bucket = bucketName();
    const contentType = metadata.content_type;
    if (!contentType) throw new Error("gcs_content_type_required");
    const contentHash = metadata.pdf_sha256 || metadata.asset_sha256;
    if (!contentHash) throw new Error("gcs_content_hash_required");
    const boundary = `pod-content-${contentHash}`;
    const resource = JSON.stringify({ name: object, contentType, metadata });
    const prefix = Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${resource}\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`);
    const suffix = Buffer.from(`\r\n--${boundary}--`);
    const body = Buffer.concat([prefix, Buffer.from(bytes), suffix]);
    const url = gcsCreateOnlyUploadUrl(bucket);
    const response = await authorizedFetch(url, {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}`, "Content-Length": String(body.byteLength) },
      body: Uint8Array.from(body),
    });
    if (response.status === 412) throw new PodPrintArtifactError("pod_artifact_storage_precondition_failed");
    const result = await response.json().catch(() => null) as GcsObjectResource | null;
    if (!response.ok) {
      console.error("pod_storage_upload_failed", {
        bucket,
        serviceAccount: process.env.GCP_SERVICE_ACCOUNT_EMAIL,
        status: response.status,
      });
      throw new Error(`pod_artifact_storage_upload_failed:${response.status}:${JSON.stringify(result)}`);
    }
    return normalizeGcsObjectMetadata(result || {});
  },
  readMetadata: async (object, generation) => {
    const response = await authorizedFetch(metadataUrl(bucketName(), object, generation));
    if (response.status === 404) throw new PodPrintArtifactError("pod_artifact_missing_object");
    const result = await response.json().catch(() => null) as GcsObjectResource | null;
    if (!response.ok) throw new Error(`pod_artifact_storage_metadata_failed:${response.status}:${JSON.stringify(result)}`);
    return normalizeGcsObjectMetadata(result || {});
  },
  download: async (object, generation) => {
    const url = `${metadataUrl(bucketName(), object, generation)}&alt=media`;
    const response = await authorizedFetch(url);
    if (response.status === 404) throw new PodPrintArtifactError("pod_artifact_missing_object");
    if (!response.ok) throw new Error(`pod_artifact_storage_download_failed:${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  },
};

/** Store a private binary document once. Used for courier labels, which must
 * never be regenerated by repeating the carrier's create-shipment call. */
export const gcpCreateOnlyBinaryObject = async (
  bucket: string,
  object: string,
  bytes: Uint8Array,
  contentType: string,
  metadata: Record<string, string> = {},
): Promise<GcsBinaryObjectMetadata> => {
  const boundary = `binary-${crypto.randomUUID()}`;
  const resource = JSON.stringify({ name: object, contentType, metadata });
  const prefix = Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${resource}\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`);
  const suffix = Buffer.from(`\r\n--${boundary}--`);
  const body = Buffer.concat([prefix, Buffer.from(bytes), suffix]);
  const response = await authorizedFetch(gcsCreateOnlyUploadUrl(bucket), {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}`, "Content-Length": String(body.byteLength) },
    body: Uint8Array.from(body),
  });
  if (response.status === 412) throw new Error("gcs_object_already_exists");
  const result = await response.json().catch(() => null) as GcsObjectResource | null;
  if (!response.ok || !result?.bucket || !result.name || !result.generation || !result.size) {
    throw new Error(`gcs_binary_upload_failed:${response.status}`);
  }
  return { bucket: result.bucket, object: result.name, generation: String(result.generation), size: Number(result.size), contentType: result.contentType || contentType };
};

export const gcpDownloadBinaryObject = async (bucket: string, object: string, generation: string) => {
  const response = await authorizedFetch(`${metadataUrl(bucket, object, generation)}&alt=media`);
  if (response.status === 404) throw new Error("gcs_binary_object_missing");
  if (!response.ok) throw new Error(`gcs_binary_download_failed:${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
};

/**
 * Upload a catalog image and expose it through Firebase Storage's tokenized
 * download endpoint. The object itself remains immutable; the token is stored
 * as object metadata so the public URL never needs a service-account token.
 */
export const gcpCreateFirebaseStorageImage = async (
  bucket: string,
  object: string,
  bytes: Uint8Array,
  contentType: string,
) => {
  const token = crypto.randomUUID();
  const stored = await gcpCreateOnlyBinaryObject(bucket, object, bytes, contentType, {
    cacheControl: "public,max-age=31536000,immutable",
    firebaseStorageDownloadTokens: token,
  });
  return {
    ...stored,
    url: `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(object)}?alt=media&token=${encodeURIComponent(token)}`,
  };
};
