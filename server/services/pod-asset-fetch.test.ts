// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPodImageAsset, resolvePodAssetUrl, validatePodAssetUrl } from "./pod-asset-fetch";

const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
const originalAllowedHosts = process.env.POD_PRINT_ASSET_ALLOWED_HOSTS;
const originalFrontendOrigin = process.env.FRONTEND_ORIGIN;

describe("POD asset SSRF protection", () => {
  afterEach(() => {
    if (originalAllowedHosts === undefined) delete process.env.POD_PRINT_ASSET_ALLOWED_HOSTS;
    else process.env.POD_PRINT_ASSET_ALLOWED_HOSTS = originalAllowedHosts;
    if (originalFrontendOrigin === undefined) delete process.env.FRONTEND_ORIGIN;
    else process.env.FRONTEND_ORIGIN = originalFrontendOrigin;
    vi.useRealTimers();
  });

  it.each([
    "https://127.0.0.1/image.png",
    "https://10.0.0.1/image.png",
    "https://169.254.169.254/latest/meta-data",
    "https://[::1]/image.png",
  ])("rejects local, private, link-local, and metadata addresses", async (url) => {
    process.env.POD_PRINT_ASSET_ALLOWED_HOSTS = new URL(url).hostname.replace(/^\[|\]$/g, "");
    await expect(validatePodAssetUrl(url)).rejects.toThrow();
  });

  it("rejects a redirect to a forbidden host", async () => {
    process.env.POD_PRINT_ASSET_ALLOWED_HOSTS = "93.184.216.34";
    const fetchMock = vi.fn(async () => new Response(null, { status: 302, headers: { Location: "https://127.0.0.1/private.png" } }));
    await expect(fetchPodImageAsset("https://93.184.216.34/image.png", fetchMock as typeof fetch)).rejects.toThrow();
  });

  it("rejects oversized responses", async () => {
    process.env.POD_PRINT_ASSET_ALLOWED_HOSTS = "93.184.216.34";
    const fetchMock = vi.fn(async () => new Response(Uint8Array.from(png).buffer, { headers: { "Content-Type": "image/png", "Content-Length": String(16 * 1024 * 1024) } }));
    await expect(fetchPodImageAsset("https://93.184.216.34/image.png", fetchMock as typeof fetch)).rejects.toMatchObject({ code: "pod_asset_too_large" });
  });

  it("aborts a fetch that exceeds the configured timeout", async () => {
    vi.useFakeTimers();
    process.env.POD_PRINT_ASSET_ALLOWED_HOSTS = "93.184.216.34";
    const fetchMock = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }));
    const pending = fetchPodImageAsset("https://93.184.216.34/image.png", fetchMock as typeof fetch);
    const rejection = expect(pending).rejects.toMatchObject({ code: "pod_asset_fetch_timeout" });
    await vi.advanceTimersByTimeAsync(15_001);
    await rejection;
    vi.useRealTimers();
  });

  it("rejects fake content types and invalid magic bytes", async () => {
    process.env.POD_PRINT_ASSET_ALLOWED_HOSTS = "93.184.216.34";
    const html = vi.fn(async () => new Response("<html/>", { headers: { "Content-Type": "image/png" } }));
    await expect(fetchPodImageAsset("https://93.184.216.34/image.png", html as typeof fetch)).rejects.toMatchObject({ code: "pod_asset_magic_bytes_invalid" });
    const wrongType = vi.fn(async () => new Response(Uint8Array.from(png).buffer, { headers: { "Content-Type": "text/html" } }));
    await expect(fetchPodImageAsset("https://93.184.216.34/image.png", wrongType as typeof fetch)).rejects.toMatchObject({ code: "pod_asset_content_type_unsupported" });
  });

  it("accepts a bounded image with matching MIME and magic bytes", async () => {
    process.env.POD_PRINT_ASSET_ALLOWED_HOSTS = "93.184.216.34";
    const fetchMock = vi.fn(async () => new Response(Uint8Array.from(png).buffer, { headers: { "Content-Type": "image/png" } }));
    const result = await fetchPodImageAsset("https://93.184.216.34/image.png", fetchMock as typeof fetch);
    expect(Array.from(result.bytes)).toEqual(Array.from(png));
  });

  it("resolves a Hosting-relative design image without allowing an origin change", () => {
    process.env.FRONTEND_ORIGIN = "https://podrozowka.web.app";
    expect(resolvePodAssetUrl("/card-designs/grecja/front.webp")).toBe("https://podrozowka.web.app/card-designs/grecja/front.webp");
    expect(() => resolvePodAssetUrl("//attacker.example/front.webp")).toThrow("pod_asset_relative_url_forbidden");
  });
});
