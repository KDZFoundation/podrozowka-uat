import { describe, expect, it } from "vitest";
import {
  CURRENT_POSTCARD_PRINT_FORMAT,
  POD_IMPOSITION_ALGORITHM,
  planPodImposition,
  type PodPrintFormatConfig,
} from "./podImposition";
import {
  POD_CUT_STACK_PROFILE_VERSION,
  PodProductionBatchError,
  assertPodProductionBatchManifest,
  planPodProductionBatch,
  simulatePodCutAndStack,
  type PodProductionBatchSourceItem,
} from "./podProductionBatch";

const secondFormat: PodPrintFormatConfig = {
  version: 1,
  print_format_id: "postcard-105x74-v1",
  sheetWidthMm: 320,
  sheetHeightMm: 450,
  netWidthMm: 105,
  netHeightMm: 74,
  bleedMm: 3,
  orientation: "landscape",
  marginsMm: { top: 5, right: 5, bottom: 5, left: 5 },
  gapsMm: { horizontal: 0, vertical: 0 },
  duplexMode: "flip_on_short_edge",
};

const item = (index: number, overrides: Partial<PodProductionBatchSourceItem> = {}): PodProductionBatchSourceItem => ({
  pod_job_id: `pod-job-${Math.floor(index / 3)}`,
  print_job_id: `print-job-${Math.floor(index / 3)}`,
  print_job_item_id: `item-${index}`,
  inventory_unit_id: `unit-${index}`,
  source_order_id: `order-${String(Math.floor(index / 2)).padStart(3, "0")}`,
  card_design_id: `design-${index}`,
  print_manifest_id: `pm-${"a".repeat(64)}`,
  print_manifest_sha256: "b".repeat(64),
  print_manifest_state: "frozen",
  asset_set_id: `pas-${"c".repeat(64)}`,
  asset_set_sha256: "d".repeat(64),
  asset_set_state: "frozen",
  render_profile_version: "pod-render-profile-v1",
  render_profile_sha256: "e".repeat(64),
  render_input_sha256: "f".repeat(64),
  print_format_id: CURRENT_POSTCARD_PRINT_FORMAT.print_format_id,
  algorithm_version: POD_IMPOSITION_ALGORITHM,
  cut_stack_profile_version: POD_CUT_STACK_PROFILE_VERSION,
  sequence_index: index,
  batch_order_index: index,
  primary_language_code: "pl",
  secondary_language_code: null,
  ...overrides,
});

const plan = (count: number) => planPodProductionBatch(
  Array.from({ length: count }, (_, index) => item(index)),
  [CURRENT_POSTCARD_PRINT_FORMAT, secondFormat],
);

describe("deterministic POD production batch planner", () => {
  it("returns identical ID, hash and manifest for identical input and every permutation", async () => {
    const input = Array.from({ length: 10 }, (_, index) => item(index));
    const first = await planPodProductionBatch(input, [CURRENT_POSTCARD_PRINT_FORMAT]);
    const second = await planPodProductionBatch([...input].reverse(), [CURRENT_POSTCARD_PRINT_FORMAT]);
    expect(second).toEqual(first);
    await expect(assertPodProductionBatchManifest(first)).resolves.toBe(first);
  });

  it("gangs multiple orders and print jobs with one compatible format", async () => {
    const manifest = await plan(10);
    expect(manifest.groups).toHaveLength(1);
    expect(manifest.print_job_count).toBe(4);
    expect(manifest.groups[0].item_count).toBe(10);
  });

  it("creates separate groups for formats and incompatible render profiles", async () => {
    const manifest = await planPodProductionBatch([
      item(0),
      item(1, { print_format_id: secondFormat.print_format_id }),
      item(2, { render_profile_version: "pod-render-profile-v2", render_profile_sha256: "1".repeat(64) }),
    ], [CURRENT_POSTCARD_PRINT_FORMAT, secondFormat]);
    expect(manifest.groups).toHaveLength(3);
    expect(new Set(manifest.groups.map((group) => group.compatibility_key)).size).toBe(3);
  });

  it.each([1, 7, 8, 9, 10, 60])("plans %i cards with explicit blanks and reversible cut-and-stack", async (count) => {
    const manifest = await plan(count);
    const group = manifest.groups[0];
    const slotsPerSheet = group.cut_stack.slots_per_sheet;
    expect(group.sheet_count).toBe(Math.ceil(count / slotsPerSheet));
    expect(group.slots.filter((slot) => slot.kind === "empty")).toHaveLength(group.sheet_count * slotsPerSheet - count);
    expect(simulatePodCutAndStack(group)).toEqual(Array.from({ length: count }, (_, index) => index));
  });

  it("uses source index = slot * sheet_count + sheet and does not shift around blanks", async () => {
    const manifest = await plan(9);
    const group = manifest.groups[0];
    expect(group.sheet_count).toBe(2);
    for (const slot of group.slots) {
      if (slot.kind === "position") {
        expect(slot.source_sequence_index).toBe(slot.front_slot * group.sheet_count + slot.sheet_index);
      }
    }
    expect(group.slots.filter((slot) => slot.kind === "empty").every((slot) => slot.source_sequence_index === null)).toBe(true);
  });

  it("takes every front/back slot and coordinate mapping from planPodImposition", async () => {
    const manifest = await plan(8);
    const group = manifest.groups[0];
    const probes = Array.from({ length: group.cut_stack.slots_per_sheet }, (_, index) => ({
      id: `probe-${index}`,
      print_format_id: group.print_format_id,
    }));
    const geometry = planPodImposition(probes, [CURRENT_POSTCARD_PRINT_FORMAT]).groups[0];
    for (let slotIndex = 0; slotIndex < geometry.slotsPerSheet; slotIndex += 1) {
      const actual = group.slots.find((slot) => slot.sheet_index === 0 && slot.front_slot === slotIndex)!;
      const expected = geometry.placements[slotIndex];
      expect(actual.back_slot).toBe(expected.backSlot);
      expect(actual.front_coordinates).toEqual(expected.frontCoordinates);
      expect(actual.back_coordinates).toEqual(expected.backCoordinates);
    }
  });

  it("supports two SRA3 format configurations without mixing their sheets", async () => {
    const manifest = await planPodProductionBatch([
      ...Array.from({ length: 8 }, (_, index) => item(index)),
      ...Array.from({ length: 10 }, (_, index) => item(index + 20, { print_format_id: secondFormat.print_format_id })),
    ], [CURRENT_POSTCARD_PRINT_FORMAT, secondFormat]);
    expect(manifest.groups.map((group) => [group.print_format_id, group.cut_stack.slots_per_sheet])).toEqual([
      [secondFormat.print_format_id, 10],
      [CURRENT_POSTCARD_PRINT_FORMAT.print_format_id, 8],
    ]);
  });

  it("changes ID and hash after changing one durable identifier or source hash", async () => {
    const base = [item(0), item(1)];
    const original = await planPodProductionBatch(base, [CURRENT_POSTCARD_PRINT_FORMAT]);
    const changedId = await planPodProductionBatch([base[0], item(1, { card_design_id: "changed" })], [CURRENT_POSTCARD_PRINT_FORMAT]);
    const changedHash = await planPodProductionBatch([
      base[0],
      item(1, {
        asset_set_id: `pas-${"1".repeat(64)}`,
        asset_set_sha256: "2".repeat(64),
      }),
    ], [CURRENT_POSTCARD_PRINT_FORMAT]);
    expect(changedId.batch_id).not.toBe(original.batch_id);
    expect(changedId.batch_sha256).not.toBe(original.batch_sha256);
    expect(changedHash.batch_id).not.toBe(original.batch_id);
    expect(changedHash.batch_sha256).not.toBe(original.batch_sha256);
    const tampered = structuredClone(original);
    tampered.batch_sha256 = "1".repeat(64);
    await expect(assertPodProductionBatchManifest(tampered))
      .rejects.toMatchObject({ code: "pod_batch_manifest_integrity_mismatch" });
  });

  it("rejects one asset set ID associated with different hashes", async () => {
    const assetSetId = `pas-${"c".repeat(64)}`;
    await expect(planPodProductionBatch([
      item(0, { asset_set_id: assetSetId, asset_set_sha256: "d".repeat(64) }),
      item(1, { asset_set_id: assetSetId, asset_set_sha256: "1".repeat(64) }),
    ], [CURRENT_POSTCARD_PRINT_FORMAT])).rejects.toMatchObject({
      code: `pod_batch_source_hash_conflict:${assetSetId}`,
    });
  });

  it("rejects duplicate positions, inventory units, unknown formats and cut profiles", async () => {
    await expect(planPodProductionBatch([item(0), item(1, { print_job_item_id: "item-0" })], [CURRENT_POSTCARD_PRINT_FORMAT]))
      .rejects.toMatchObject({ code: "pod_batch_position_duplicate:item-0" });
    await expect(planPodProductionBatch([item(0), item(1, { inventory_unit_id: "unit-0" })], [CURRENT_POSTCARD_PRINT_FORMAT]))
      .rejects.toMatchObject({ code: "pod_batch_inventory_unit_duplicate:unit-0" });
    await expect(planPodProductionBatch([item(0, { print_format_id: "unknown" })], [CURRENT_POSTCARD_PRINT_FORMAT]))
      .rejects.toBeInstanceOf(PodProductionBatchError);
    await expect(planPodProductionBatch([item(0, { cut_stack_profile_version: "unknown" })], [CURRENT_POSTCARD_PRINT_FORMAT]))
      .rejects.toMatchObject({ code: "pod_batch_cut_stack_profile_unsupported" });
  });

  it("rejects non-frozen sources and incompatible duplex", async () => {
    await expect(planPodProductionBatch([item(0, { asset_set_state: "writing" })], [CURRENT_POSTCARD_PRINT_FORMAT]))
      .rejects.toMatchObject({ code: "pod_batch_asset_set_not_frozen" });
    await expect(planPodProductionBatch([item(0)], [{ ...CURRENT_POSTCARD_PRINT_FORMAT, duplexMode: "flip_on_long_edge" }]))
      .rejects.toMatchObject({ code: "pod_batch_duplex_incompatible" });
    await expect(planPodProductionBatch([item(0)], [{ ...CURRENT_POSTCARD_PRINT_FORMAT, sheetWidthMm: 321 }]))
      .rejects.toThrow();
    await expect(planPodProductionBatch([item(0, { print_manifest_sha256: "invalid" })], [CURRENT_POSTCARD_PRINT_FORMAT]))
      .rejects.toMatchObject({ code: "pod_batch_hash_invalid:print_manifest_sha256" });
  });
});
