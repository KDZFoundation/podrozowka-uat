import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { PodPrintAssetSetError } from "../../src/lib/podPrintAssetSet.js";

const MAX_REDIRECTS = 3;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;
const SUPPORTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

const allowedHosts = (environmentName: string) => new Set(
  (process.env[environmentName] || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
);

/**
 * Card designs stored by Firebase Hosting may use a root-relative image URL.
 * Resolve only that form against the configured public frontend origin; a
 * protocol-relative URL must never be allowed to change the trusted host.
 */
export const resolvePodAssetUrl = (value: string) => {
  if (!value.startsWith("/")) return value;
  let frontendOrigin: URL;
  try {
    frontendOrigin = new URL(process.env.FRONTEND_ORIGIN || "https://podrozowka.web.app");
  } catch {
    throw new PodPrintAssetSetError("pod_asset_frontend_origin_invalid");
  }
  if (frontendOrigin.protocol !== "https:") throw new PodPrintAssetSetError("pod_asset_frontend_origin_invalid");
  const resolved = new URL(value, frontendOrigin);
  if (resolved.origin !== frontendOrigin.origin) throw new PodPrintAssetSetError("pod_asset_relative_url_forbidden");
  return resolved.toString();
};

const privateIpv4 = (address: string) => {
  const octets = address.split(".").map(Number);
  return octets[0] === 10
    || octets[0] === 127
    || octets[0] === 0
    || (octets[0] === 169 && octets[1] === 254)
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168)
    || (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127)
    || octets[0] >= 224;
};

const privateIpv6 = (address: string) => {
  const normalized = address.toLowerCase().split("%")[0];
  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  return normalized === "::" || normalized === "::1"
    || normalized.startsWith("fc") || normalized.startsWith("fd")
    || normalized.startsWith("fe8") || normalized.startsWith("fe9")
    || normalized.startsWith("fea") || normalized.startsWith("feb")
    || normalized.startsWith("ff")
    || (mappedIpv4 ? privateIpv4(mappedIpv4) : false);
};

const assertPublicAddress = (address: string) => {
  const version = isIP(address);
  if ((version === 4 && privateIpv4(address)) || (version === 6 && privateIpv6(address))) {
    throw new PodPrintAssetSetError("pod_asset_url_private_address");
  }
};

export const validatePodAssetUrl = async (value: string, allowlistEnvironment = "POD_PRINT_ASSET_ALLOWED_HOSTS") => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new PodPrintAssetSetError("pod_asset_url_invalid");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) {
    throw new PodPrintAssetSetError("pod_asset_url_forbidden");
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!allowedHosts(allowlistEnvironment).has(hostname)) throw new PodPrintAssetSetError("pod_asset_url_host_forbidden");
  if (hostname === "localhost" || hostname === "metadata.google.internal") {
    throw new PodPrintAssetSetError("pod_asset_url_private_address");
  }
  if (isIP(hostname)) {
    assertPublicAddress(hostname);
  } else {
    const addresses = await lookup(hostname, { all: true, verbatim: true }).catch(() => {
      throw new PodPrintAssetSetError("pod_asset_dns_failed");
    });
    if (!addresses.length) throw new PodPrintAssetSetError("pod_asset_dns_failed");
    addresses.forEach(({ address }) => assertPublicAddress(address));
  }
  return url;
};

const imageTypeFromMagic = (bytes: Uint8Array) => {
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12
    && new TextDecoder("ascii").decode(bytes.slice(0, 4)) === "RIFF"
    && new TextDecoder("ascii").decode(bytes.slice(8, 12)) === "WEBP") return "image/webp";
  throw new PodPrintAssetSetError("pod_asset_magic_bytes_invalid");
};

const readBoundedBody = async (response: Response, maxBytes: number) => {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > maxBytes) throw new PodPrintAssetSetError("pod_asset_too_large");
  if (!response.body) throw new PodPrintAssetSetError("pod_asset_empty_response");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    size += result.value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new PodPrintAssetSetError("pod_asset_too_large");
    }
    chunks.push(result.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
};

export const fetchPodImageAsset = async (sourceUrl: string, fetchImpl: typeof fetch = fetch) => {
  let url = await validatePodAssetUrl(sourceUrl);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetchImpl(url, {
        redirect: "manual",
        signal: controller.signal,
        headers: { Accept: "image/png,image/jpeg,image/webp" },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        if (redirect === MAX_REDIRECTS) throw new PodPrintAssetSetError("pod_asset_redirect_limit");
        const location = response.headers.get("location");
        if (!location) throw new PodPrintAssetSetError("pod_asset_redirect_invalid");
        url = await validatePodAssetUrl(new URL(location, url).toString());
        continue;
      }
      if (!response.ok) throw new PodPrintAssetSetError(`pod_asset_fetch_failed:${response.status}`);
      const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() || "";
      if (!SUPPORTED_IMAGE_TYPES.has(contentType)) throw new PodPrintAssetSetError("pod_asset_content_type_unsupported");
      const bytes = await readBoundedBody(response, MAX_IMAGE_BYTES);
      if (imageTypeFromMagic(bytes) !== contentType) throw new PodPrintAssetSetError("pod_asset_content_type_mismatch");
      return { bytes, contentType, finalUrl: url.toString() };
    } catch (error) {
      if (controller.signal.aborted) throw new PodPrintAssetSetError("pod_asset_fetch_timeout");
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new PodPrintAssetSetError("pod_asset_redirect_limit");
};

export const validatePodImageBytes = (bytes: Uint8Array, contentType: string) => {
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw new PodPrintAssetSetError("pod_asset_too_large");
  if (!SUPPORTED_IMAGE_TYPES.has(contentType) || imageTypeFromMagic(bytes) !== contentType) {
    throw new PodPrintAssetSetError("pod_asset_content_type_mismatch");
  }
};
