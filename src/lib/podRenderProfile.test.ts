import { describe, expect, it } from "vitest";
import { canonicalJson, sha256Utf8 } from "./podPrintManifest";
import { hashPodRenderProfile, POD_RENDER_PROFILE, POD_RENDER_PROFILE_VERSION } from "./podRenderProfile";

describe("POD render profile", () => {
  it("pins pixel-affecting libraries, QR configuration, fonts, and html2canvas options", async () => {
    expect(POD_RENDER_PROFILE).toMatchObject({
      render_profile_version: "pod-render-profile-v2",
      libraries: { html2canvas: "1.4.1", jspdf: "4.2.1", qrcode: "1.5.4" },
      qr: { width: 600, margin: 3, error_correction_level: "M", content_type: "image/png" },
      raster: { allow_taint: false, use_cors: true, scroll_x: 0, scroll_y: 0, jpeg_quality: 0.96 },
    });
    expect(POD_RENDER_PROFILE.fonts).toMatchObject({
      registry_version: "fontsource-5.3.0-v1",
      selection_algorithm_version: "unicode-script-and-language-v1",
      source: "fontsource-cdn-pinned-sha256",
    });
    expect(await hashPodRenderProfile()).toMatch(/^[0-9a-f]{64}$/);
  });

  it("requires a profile version change when QR, template, or font configuration changes", async () => {
    const hashes = {
      postcard_front_template: "a".repeat(64),
      postcard_back_template: "b".repeat(64),
      "body-latin": "c".repeat(64),
    };
    const currentHash = await hashPodRenderProfile(hashes);
    const changedQr = { ...POD_RENDER_PROFILE, qr: { ...POD_RENDER_PROFILE.qr, margin: 4 } };
    const changedFont = { ...POD_RENDER_PROFILE, fonts: { ...POD_RENDER_PROFILE.fonts, registry_version: "fontsource-5.3.1-v1" } };
    expect(await sha256Utf8(canonicalJson({ ...changedQr, asset_sha256: hashes }))).not.toBe(currentHash);
    expect(await sha256Utf8(canonicalJson({ ...changedFont, asset_sha256: hashes }))).not.toBe(currentHash);
    expect(await hashPodRenderProfile({ ...hashes, "body-latin": "f".repeat(64) })).not.toBe(currentHash);
    expect(POD_RENDER_PROFILE_VERSION).toBe("pod-render-profile-v2");
  });
});
