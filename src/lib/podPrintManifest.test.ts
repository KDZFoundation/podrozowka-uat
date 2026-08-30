import { describe, expect, it } from "vitest";
import { CURRENT_POSTCARD_PRINT_FORMAT, type PodPrintFormatConfig } from "./podImposition";
import {
  buildPodPrintManifest,
  resolvePodPrintSourceOrderId,
  serializePodPrintManifest,
  type PodPrintManifestSourceItem,
} from "./podPrintManifest";

const squareFormat: PodPrintFormatConfig = {
  version: 1,
  print_format_id: "square-100-v1",
  sheetWidthMm: 320,
  sheetHeightMm: 450,
  netWidthMm: 100,
  netHeightMm: 100,
  bleedMm: 3,
  orientation: "portrait",
  marginsMm: { top: 6, right: 6, bottom: 6, left: 6 },
  gapsMm: { horizontal: 4, vertical: 4 },
  duplexMode: "flip_on_short_edge",
};

const source = (
  batchOrderIndex: number,
  sequenceIndex: number,
  overrides: Partial<PodPrintManifestSourceItem> = {},
): PodPrintManifestSourceItem => ({
  id: `job-${batchOrderIndex}-item-${sequenceIndex}`,
  print_format_id: CURRENT_POSTCARD_PRINT_FORMAT.print_format_id,
  batch_order_index: batchOrderIndex,
  sequence_index: sequenceIndex,
  pod_job_id: `job-${batchOrderIndex}`,
  inventory_unit_id: `unit-${batchOrderIndex}-${sequenceIndex}`,
  card_design_id: `design-${batchOrderIndex}`,
  source_order_id: `order-${batchOrderIndex}`,
  primary_language_code: "pl",
  secondary_language_code: null,
  render_input: {
    qr_url: `/r/token-${batchOrderIndex}-${sequenceIndex}`,
    front_text: "Dziękujemy",
    back_qr_label: "Zeskanuj kod",
    image_front_url: "https://example.test/card.jpg",
    image_version: "generation-1",
    photo_author: "Autor",
    crop_settings: { fit: "auto", x: 50, y: 50, zoom: 100 },
    country_iso2: "PL",
    country_flag_url: null,
  },
  render_input_sha256: "a".repeat(64),
  ...overrides,
});

const formats = [CURRENT_POSTCARD_PRINT_FORMAT, squareFormat];
const missingIdentifierCases: Array<[string, Partial<PodPrintManifestSourceItem>, string]> = [
  ["print job item", { id: "" }, "manifest_identifier_required:print_job_item_id"],
  ["POD job", { pod_job_id: "" }, "manifest_identifier_required:pod_job_id"],
  ["inventory unit", { inventory_unit_id: "" }, "manifest_identifier_required:inventory_unit_id"],
  ["card design", { card_design_id: "" }, "manifest_identifier_required:card_design_id"],
  ["source order", { source_order_id: "" }, "manifest_identifier_required:source_order_id"],
  ["print format", { print_format_id: "" }, "manifest_identifier_required:print_format_id"],
];

describe("buildPodPrintManifest", () => {
  it("returns an identical JSON manifest for identical input", () => {
    const input = [source(0, 0), source(0, 1), source(1, 0)];
    const first = buildPodPrintManifest(input, formats);
    const second = buildPodPrintManifest(input, formats);
    expect(second).toEqual(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(serializePodPrintManifest(second)).toBe(serializePodPrintManifest(first));
  });

  it("is independent of source array and format-config order", () => {
    const ordered = [source(0, 0), source(0, 1), source(1, 0), source(1, 1)];
    const shuffled = [ordered[3], ordered[1], ordered[2], ordered[0]];
    const shuffledManifest = buildPodPrintManifest(shuffled, [...formats].reverse());
    const orderedManifest = buildPodPrintManifest(ordered, formats);
    expect(shuffledManifest).toEqual(orderedManifest);
    expect(serializePodPrintManifest(shuffledManifest)).toBe(serializePodPrintManifest(orderedManifest));
  });

  it("combines jobs that use the same print format", () => {
    const manifest = buildPodPrintManifest([
      source(1, 0),
      source(0, 0),
      source(1, 1),
    ], formats);
    expect(manifest.format_groups).toHaveLength(1);
    expect(manifest.format_groups[0].items.map((item) => [item.batch_order_index, item.sequence_index])).toEqual([
      [0, 0], [1, 0], [1, 1],
    ]);
    expect(manifest.postcard_count).toBe(3);
    expect(manifest.sheet_count).toBe(1);
  });

  it("separates different physical formats", () => {
    const manifest = buildPodPrintManifest([
      source(0, 0),
      source(0, 1, { print_format_id: squareFormat.print_format_id }),
    ], formats);
    expect(manifest.format_groups.map((group) => [group.print_format_id, group.postcard_count])).toEqual([
      [CURRENT_POSTCARD_PRINT_FORMAT.print_format_id, 1],
      [squareFormat.print_format_id, 1],
    ]);
    expect(manifest.sheet_count).toBe(2);
  });

  it("preserves stable short-edge front/back mapping", () => {
    const manifest = buildPodPrintManifest(
      Array.from({ length: 8 }, (_, index) => source(0, index)),
      formats,
    );
    expect(manifest.format_groups[0].items.map((item) => [item.front_slot, item.back_slot])).toEqual([
      [0, 6], [1, 7], [2, 4], [3, 5], [4, 2], [5, 3], [6, 0], [7, 1],
    ]);
  });

  it("preserves languages and all required identifiers", () => {
    const manifest = buildPodPrintManifest([
      source(4, 2, {
        id: "print-item-a",
        pod_job_id: "pod-job-a",
        inventory_unit_id: "inventory-a",
        card_design_id: "design-a",
        source_order_id: "order-a",
        primary_language_code: "de",
        secondary_language_code: "pl",
      }),
    ], formats);
    expect(manifest.format_groups[0].items[0]).toMatchObject({
      sequence_index: 2,
      batch_order_index: 4,
      print_job_item_id: "print-item-a",
      pod_job_id: "pod-job-a",
      inventory_unit_id: "inventory-a",
      card_design_id: "design-a",
      source_order_id: "order-a",
      primary_language_code: "de",
      secondary_language_code: "pl",
      sheet_index: 0,
      front_slot: 0,
      back_slot: 6,
    });
  });

  it("serializes object keys canonically while preserving manifest array order", () => {
    const manifest = buildPodPrintManifest([source(0, 0), source(0, 1)], formats);
    const serialized = serializePodPrintManifest(manifest);
    expect(serialized).toBe(serializePodPrintManifest(JSON.parse(serialized)));
    expect(serialized.indexOf('"algorithm_version"')).toBeLessThan(serialized.indexOf('"format_groups"'));
    expect(serialized.indexOf('"format_groups"')).toBeLessThan(serialized.indexOf('"manifest_version"'));
  });

  it("rejects an unknown print format", () => {
    expect(() => buildPodPrintManifest([
      source(0, 0, { print_format_id: "unknown-format" }),
    ], formats)).toThrow("unknown_print_format_id:unknown-format");
  });

  it.each(missingIdentifierCases)("rejects a missing %s identifier", (_label, override, expectedError) => {
    expect(() => buildPodPrintManifest([
      source(0, 0, override),
    ], formats)).toThrow(expectedError);
  });

  it("resolves a warehouse source order without inventory_unit.order_id", () => {
    const sourceOrderId = resolvePodPrintSourceOrderId({
      inventory_unit_order_id: null,
      print_job_order_id: null,
      stock_production_order_id: "stock-order-42",
    });
    const manifest = buildPodPrintManifest([
      source(0, 0, { source_order_id: sourceOrderId }),
    ], formats);
    expect(manifest.format_groups[0].items[0].source_order_id).toBe("stock-order-42");
  });

  it("uses the source identifier appropriate for ecommerce, stock, and manual jobs", () => {
    expect(resolvePodPrintSourceOrderId({
      inventory_unit_order_id: "unit-order",
      print_job_order_id: "job-order",
      stock_production_order_id: "stock-order",
    })).toBe("unit-order");
    expect(resolvePodPrintSourceOrderId({
      inventory_unit_order_id: null,
      print_job_order_id: "job-order",
      stock_production_order_id: "stock-order",
    })).toBe("stock-order");
    expect(resolvePodPrintSourceOrderId({
      inventory_unit_order_id: null,
      print_job_order_id: "manual-job-order",
      stock_production_order_id: null,
    })).toBe("manual-job-order");
  });

  it("rejects a print job without any stable source-order identifier", () => {
    expect(() => resolvePodPrintSourceOrderId({
      inventory_unit_order_id: null,
      print_job_order_id: null,
      stock_production_order_id: null,
    })).toThrow("manifest_source_order_id_unavailable");
  });
});
