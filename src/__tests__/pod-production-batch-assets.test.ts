// @vitest-environment node
import { describe, expect, it } from "vitest";
import { assertPodProductionBatchAssetCoverage } from "../../server/services/pod-production-batch";
import type { PodPrintAssetRole, PodPrintAssetSetItem } from "../lib/podPrintAssetSet";

const asset = (
  role: PodPrintAssetRole,
  sharedKey: string | null,
  printJobItemId: string | null = null,
  renderInputSha256: string | null = null,
): PodPrintAssetSetItem => ({
  id: `${role}-${sharedKey || printJobItemId}`,
  asset_set_id: "asset-set",
  asset_id: `${role}-${sharedKey || printJobItemId}`,
  asset_role: role,
  source_kind: role === "print_font" ? "pinned_font_url" : role === "qr_raster" ? "generated_qr" : "local_template",
  source_url: null,
  source_version: null,
  sha256: "a".repeat(64),
  content_type: role === "print_font" ? "font/woff2" : "image/png",
  size_bytes: 1,
  storage_bucket: "bucket",
  storage_object: "object",
  storage_generation: "1",
  storage_metageneration: "1",
  crc32c: "crc",
  md5_hash: null,
  print_job_item_id: printJobItemId,
  render_input_sha256: renderInputSha256,
  font_family: role === "print_font" ? "PodNotoSansV2" : null,
  font_weight: role === "print_font" ? "100 900" : null,
  font_style: role === "print_font" ? "normal" : null,
  font_unicode_range: role === "print_font" ? "U+0000-00FF" : null,
  shared_key: sharedKey,
  schema_version: 1,
});

describe("POD production batch asset coverage", () => {
  it("accepts the dynamically selected multiscript fonts instead of obsolete Inter keys", () => {
    const renderHash = "b".repeat(64);
    const assets = [
      asset("postcard_front_template", "postcard-front-template"),
      asset("postcard_back_template", "postcard-back-template"),
      asset("print_font", "body-latin"),
      asset("print_font", "body-latin-ext"),
      asset("print_font", "body-greek"),
      asset("print_font", "handwriting-latin"),
      asset("postcard_front_photo", null, "item-1", renderHash),
      asset("country_flag", null, "item-1", renderHash),
      asset("qr_raster", null, "item-1", renderHash),
    ];

    expect(() => assertPodProductionBatchAssetCoverage(
      ["item-1"],
      new Map([["item-1", renderHash]]),
      assets,
      ["body-latin", "body-latin-ext", "body-greek", "handwriting-latin"],
    )).not.toThrow();
  });

  it("fails closed when one selected font is missing", () => {
    expect(() => assertPodProductionBatchAssetCoverage(
      [],
      new Map(),
      [
        asset("postcard_front_template", "postcard-front-template"),
        asset("postcard_back_template", "postcard-back-template"),
        asset("print_font", "body-latin"),
      ],
      ["body-latin", "body-greek"],
    )).toThrow("pod_batch_asset_coverage_mismatch:body-greek");
  });
});
