import crypto from "node:crypto";
import { json, preflight } from "../../../api/_lib/http.js";
import { gcpCreateFirebaseStorageImage, initiateGcsFirebaseStorageImageUpload } from "../../../api/_lib/gcp-storage.js";
import { resolveFirebaseAuthProjectId } from "../../../api/_lib/runtime-config.js";
import { requireAdmin } from "../../auth/require-admin.js";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

const storageBucket = () => process.env.POD_CARD_ASSET_BUCKET?.trim() || `${resolveFirebaseAuthProjectId()}.firebasestorage.app`;

const hasImageSignature = (bytes: Uint8Array, contentType: string) => {
  if (contentType === "image/jpeg") return bytes.byteLength >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === "image/png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return bytes.byteLength >= signature.length && signature.every((value, index) => bytes[index] === value);
  }
  if (contentType === "image/webp") return bytes.byteLength >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  return false;
};

/** Admin-only image upload used by the card-design creator. */
export default {
  async fetch(request: Request) {
    if (request.method === "OPTIONS") return preflight();
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const forbidden = await requireAdmin(request);
    if (forbidden) return forbidden;

    const contentType = (request.headers.get("content-type") || "").split(";", 1)[0].toLowerCase();
    if (contentType === "application/json") {
      const body = await request.json().catch(() => null) as { operation?: string; content_type?: string; size_bytes?: number } | null;
      const imageType = body?.content_type?.toLowerCase() || "";
      const extension = IMAGE_TYPES.get(imageType);
      if (body?.operation !== "initiate") return json({ error: "card_design_image_operation_invalid" }, 400);
      if (!extension) return json({ error: "card_design_image_type_not_supported" }, 415);
      const sizeBytes = Number(body?.size_bytes || 0);
      if (!Number.isInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_IMAGE_BYTES) {
        return json({ error: "card_design_image_too_large" }, 413);
      }
      const configuredOrigin = process.env.FRONTEND_ORIGIN || "https://podrozowka.web.app";
      const requestOrigin = request.headers.get("origin") || configuredOrigin;
      if (requestOrigin !== configuredOrigin) return json({ error: "card_design_image_origin_invalid" }, 403);
      try {
        const object = `card-designs/${crypto.randomUUID()}.${extension}`;
        const upload = await initiateGcsFirebaseStorageImageUpload(storageBucket(), object, sizeBytes, imageType, requestOrigin);
        return json({ upload_url: upload.uploadUrl, url: upload.url, object });
      } catch (error) {
        console.error("[admin card design image] upload initiation failed", error);
        return json({ error: "card_design_image_upload_init_failed" }, 502);
      }
    }

    const extension = IMAGE_TYPES.get(contentType);
    if (!extension) return json({ error: "card_design_image_type_not_supported" }, 415);

    const declaredLength = Number(request.headers.get("content-length") || 0);
    if (declaredLength > MAX_IMAGE_BYTES) return json({ error: "card_design_image_too_large" }, 413);
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (!bytes.byteLength || bytes.byteLength > MAX_IMAGE_BYTES) return json({ error: "card_design_image_too_large" }, 413);
    if (!hasImageSignature(bytes, contentType)) return json({ error: "card_design_image_invalid" }, 400);

    try {
      const object = `card-designs/${crypto.randomUUID()}.${extension}`;
      const uploaded = await gcpCreateFirebaseStorageImage(storageBucket(), object, bytes, contentType);
      return json({ url: uploaded.url, object: uploaded.object, generation: uploaded.generation });
    } catch (error) {
      console.error("[admin card design image] upload failed", error);
      return json({ error: "card_design_image_upload_failed" }, 502);
    }
  },
};
