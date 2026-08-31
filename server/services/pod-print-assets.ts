import { readFile } from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";
import { sha256Bytes } from "../../src/lib/podPrintArtifact.js";
import {
  PodPrintAssetSetError,
  type PodPrintAssetCandidate,
  type PodPrintAssetRole,
  type PodPrintAssetSourceKind,
} from "../../src/lib/podPrintAssetSet.js";
import { hashPodPrintRenderInput } from "../../src/lib/podPrintManifest.js";
import type { FrozenPodPrintManifest } from "../../src/lib/podPrintManifestPersistence.js";
import {
  POD_RENDER_PROFILE,
  hashPodRenderProfile,
  type PodRenderProfileAssetHashes,
} from "../../src/lib/podRenderProfile.js";
import { selectPodPrintFontAssets, type PodFontRegistryEntry } from "../../src/lib/podPrintFonts.js";
import { fetchPodImageAsset, resolvePodAssetUrl, validatePodAssetUrl, validatePodImageBytes } from "./pod-asset-fetch.js";

type StaticAssetDefinition = {
  key: string;
  role: PodPrintAssetRole;
  sourceKind: PodPrintAssetSourceKind;
  path: string;
  hashEnvironment: string;
  contentType: string;
  fontFamily?: string;
  fontWeight?: string;
  fontStyle?: string;
  fontUnicodeRange?: string;
};

export const POD_STATIC_ASSET_REGISTRY: readonly StaticAssetDefinition[] = [
  {
    key: "postcard-front-template",
    role: "postcard_front_template",
    sourceKind: "local_template",
    path: "src/assets/postcard-templates/canva-front-base.png",
    hashEnvironment: "POD_PRINT_TEMPLATE_FRONT_SHA256",
    contentType: "image/png",
  },
  {
    key: "postcard-back-template",
    role: "postcard_back_template",
    sourceKind: "local_template",
    path: "src/assets/postcard-templates/canva-back-base.png",
    hashEnvironment: "POD_PRINT_TEMPLATE_BACK_SHA256",
    contentType: "image/png",
  },
] as const;

const requiredHash = (name: string) => {
  const value = process.env[name]?.trim().toLowerCase() || "";
  if (!/^[0-9a-f]{64}$/.test(value)) throw new PodPrintAssetSetError(`pod_asset_expected_hash_required:${name}`);
  return value;
};

export const readPodRenderProfileAssetHashes = (fonts: readonly PodFontRegistryEntry[]): PodRenderProfileAssetHashes => ({
  postcard_front_template: requiredHash("POD_PRINT_TEMPLATE_FRONT_SHA256"),
  postcard_back_template: requiredHash("POD_PRINT_TEMPLATE_BACK_SHA256"),
  ...Object.fromEntries(fonts.map((font) => [font.key, font.sha256])),
});

const assertExpectedHash = async (bytes: Uint8Array, environmentName: string) => {
  const expected = requiredHash(environmentName);
  if (await sha256Bytes(bytes) !== expected) throw new PodPrintAssetSetError(`pod_asset_registry_hash_mismatch:${environmentName}`);
  return expected;
};

const assertWoff2 = (bytes: Uint8Array) => {
  if (bytes.byteLength < 4 || new TextDecoder("ascii").decode(bytes.slice(0, 4)) !== "wOF2") {
    throw new PodPrintAssetSetError("pod_asset_font_magic_invalid");
  }
};

const readBoundedFontBody = async (response: Response) => {
  if (!response.body) throw new PodPrintAssetSetError("pod_asset_empty_response");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > 2 * 1024 * 1024) {
      await reader.cancel();
      throw new PodPrintAssetSetError("pod_asset_too_large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
};

const fetchPinnedFont = async (definition: PodFontRegistryEntry, fetchImpl: typeof fetch) => {
  const sourceUrl = definition.source_url;
  const url = new URL(sourceUrl);
  if (url.protocol !== "https:") throw new PodPrintAssetSetError("pod_asset_font_url_forbidden");
  const allowed = new Set((process.env.POD_PRINT_FONT_ALLOWED_HOSTS || "").split(",").map((host) => host.trim().toLowerCase()).filter(Boolean));
  if (!allowed.has(url.hostname.toLowerCase())) throw new PodPrintAssetSetError("pod_asset_font_host_forbidden");
  await validatePodAssetUrl(sourceUrl, "POD_PRINT_FONT_ALLOWED_HOSTS");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetchImpl(url, { redirect: "error", signal: controller.signal, headers: { Accept: "font/woff2" } });
    if (!response.ok) throw new PodPrintAssetSetError(`pod_asset_font_fetch_failed:${response.status}`);
    if (response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "font/woff2") {
      throw new PodPrintAssetSetError("pod_asset_font_content_type_invalid");
    }
    const declaredSize = Number(response.headers.get("content-length") || 0);
    if (declaredSize > 2 * 1024 * 1024) throw new PodPrintAssetSetError("pod_asset_too_large");
    const bytes = await readBoundedFontBody(response);
    assertWoff2(bytes);
    if (await sha256Bytes(bytes) !== definition.sha256) throw new PodPrintAssetSetError(`pod_asset_registry_hash_mismatch:${definition.key}`);
    return { bytes, sourceUrl };
  } catch (error) {
    if (controller.signal.aborted) throw new PodPrintAssetSetError("pod_asset_fetch_timeout");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

const staticCandidates = async (): Promise<PodPrintAssetCandidate[]> => Promise.all(POD_STATIC_ASSET_REGISTRY.map(async (definition) => {
  const bytes = new Uint8Array(await readFile(path.resolve(process.cwd(), definition.path)));
  validatePodImageBytes(bytes, definition.contentType);
  await assertExpectedHash(bytes, definition.hashEnvironment);
  return {
    asset_role: definition.role,
    source_kind: definition.sourceKind,
    source_url: null,
    source_version: requiredHash(definition.hashEnvironment),
    content_type: definition.contentType,
    bytes,
    print_job_item_id: null,
    render_input_sha256: null,
    font_family: definition.fontFamily || null,
    font_weight: definition.fontWeight || null,
    font_style: definition.fontStyle || null,
    font_unicode_range: definition.fontUnicodeRange || null,
    shared_key: definition.key,
  } satisfies PodPrintAssetCandidate;
}));

const fontCandidates = async (fonts: readonly PodFontRegistryEntry[], fetchImpl: typeof fetch): Promise<PodPrintAssetCandidate[]> => (
  Promise.all(fonts.map(async (definition) => {
    const font = await fetchPinnedFont(definition, fetchImpl);
    return {
      asset_role: "print_font",
      source_kind: "pinned_font_url",
      source_url: font.sourceUrl,
      source_version: definition.sha256,
      content_type: "font/woff2",
      bytes: font.bytes,
      print_job_item_id: null,
      render_input_sha256: null,
      font_family: definition.family,
      font_weight: definition.weight,
      font_style: definition.style,
      font_unicode_range: definition.unicode_range,
      shared_key: definition.key,
    } satisfies PodPrintAssetCandidate;
  }))
);

const flagSource = (countryIso2: string | null, customUrl: string | null) => {
  if (customUrl) return { sourceUrl: customUrl, sourceKind: "external_url" as const };
  if (!countryIso2 || !/^[A-Za-z]{2}$/.test(countryIso2)) return null;
  return { sourceUrl: `https://flagcdn.com/w640/${countryIso2.toLowerCase()}.png`, sourceKind: "derived_flag_url" as const };
};

export const collectPodPrintAssetCandidates = async (
  frozen: FrozenPodPrintManifest,
  fetchImpl: typeof fetch = fetch,
) => {
  const items = frozen.manifest.format_groups.flatMap((group) => group.items);
  await Promise.all(items.map(async (item) => {
    if (await hashPodPrintRenderInput(item.render_input) !== item.render_input_sha256) {
      throw new PodPrintAssetSetError("pod_asset_render_input_hash_mismatch");
    }
  }));
  const selectedFonts = selectPodPrintFontAssets(frozen.manifest);
  const candidates: PodPrintAssetCandidate[] = [
    ...await staticCandidates(),
    ...await fontCandidates(selectedFonts, fetchImpl),
  ];
  const externalCache = new Map<string, Promise<Awaited<ReturnType<typeof fetchPodImageAsset>>>>();
  const fetchCached = (url: string) => {
    let result = externalCache.get(url);
    if (!result) {
      result = fetchPodImageAsset(url, fetchImpl);
      externalCache.set(url, result);
    }
    return result;
  };

  for (const item of items) {
    const input = item.render_input;
    if (!input.image_front_url) throw new PodPrintAssetSetError("pod_asset_front_photo_missing");
    const imageUrl = resolvePodAssetUrl(input.image_front_url);
    const image = await fetchCached(imageUrl);
    const qrPayloadSha256 = await sha256Bytes(new TextEncoder().encode(input.qr_url));
    candidates.push({
      asset_role: "postcard_front_photo",
      source_kind: "external_url",
      source_url: imageUrl,
      source_version: input.image_version,
      content_type: image.contentType,
      bytes: image.bytes,
      print_job_item_id: item.print_job_item_id,
      render_input_sha256: item.render_input_sha256,
    });
    const flag = flagSource(input.country_iso2, input.country_flag_url);
    if (!flag) throw new PodPrintAssetSetError("pod_asset_country_flag_missing");
    const flagUrl = resolvePodAssetUrl(flag.sourceUrl);
    const flagImage = await fetchCached(flagUrl);
    candidates.push({
      asset_role: "country_flag",
      source_kind: flag.sourceKind,
      source_url: flagUrl,
      source_version: null,
      content_type: flagImage.contentType,
      bytes: flagImage.bytes,
      print_job_item_id: item.print_job_item_id,
      render_input_sha256: item.render_input_sha256,
    });
    const qrBytes = Uint8Array.from(await QRCode.toBuffer(input.qr_url, {
      type: "png",
      width: POD_RENDER_PROFILE.qr.width,
      margin: POD_RENDER_PROFILE.qr.margin,
      errorCorrectionLevel: POD_RENDER_PROFILE.qr.error_correction_level,
    }));
    validatePodImageBytes(qrBytes, POD_RENDER_PROFILE.qr.content_type);
    candidates.push({
      asset_role: "qr_raster",
      source_kind: "generated_qr",
      source_url: input.qr_url,
      source_version: `${POD_RENDER_PROFILE.qr.algorithm_version}:${qrPayloadSha256}`,
      content_type: "image/png",
      bytes: qrBytes,
      print_job_item_id: item.print_job_item_id,
      render_input_sha256: item.render_input_sha256,
      qr_payload_sha256: qrPayloadSha256,
      qr_algorithm_version: POD_RENDER_PROFILE.qr.algorithm_version,
      qr_width_px: POD_RENDER_PROFILE.qr.width,
      qr_margin_modules: POD_RENDER_PROFILE.qr.margin,
      qr_error_correction_level: POD_RENDER_PROFILE.qr.error_correction_level,
    });
  }
  return {
    candidates,
    renderProfileSha256: await hashPodRenderProfile(readPodRenderProfileAssetHashes(selectedFonts)),
  };
};
