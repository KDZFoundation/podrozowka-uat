import {
  POD_IMPOSITION_ALGORITHM,
  SRA3_SHEET_HEIGHT_MM,
  SRA3_SHEET_WIDTH_MM,
  planPodImposition,
  type PodDuplexMode,
  type PodImpositionSideCoordinates,
  type PodPrintFormatConfig,
  type PodPrintOrientation,
} from "./podImposition";
import { canonicalJson, sha256Utf8 } from "./podPrintManifest";
import type { PodPrintFormatSource } from "./podPrintManifest";

export const POD_PRODUCTION_BATCH_MANIFEST_VERSION = 1 as const;
export const POD_PRODUCTION_BATCH_ALGORITHM_VERSION = "pod-production-batch-cut-stack-v1" as const;
export const POD_CUT_STACK_PROFILE_VERSION = "cut-stack-short-edge-sra3-v1" as const;

export class PodProductionBatchError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "PodProductionBatchError";
  }
}

export interface PodProductionBatchSourceItem {
  pod_job_id: string;
  print_job_id: string;
  print_job_item_id: string;
  inventory_unit_id: string;
  source_order_id: string;
  card_design_id: string;
  print_manifest_id: string;
  print_manifest_sha256: string;
  print_manifest_state: "writing" | "frozen";
  asset_set_id: string;
  asset_set_sha256: string;
  asset_set_state: "writing" | "frozen";
  render_profile_version: string;
  render_profile_sha256: string;
  render_input_sha256: string;
  print_format_id: string;
  format_source?: PodPrintFormatSource;
  algorithm_version: string;
  cut_stack_profile_version: string;
  sequence_index: number;
  batch_order_index: number;
  primary_language_code: string | null;
  secondary_language_code: string | null;
}

export interface PodCutStackProfileDefinition {
  cut_stack_profile_version: typeof POD_CUT_STACK_PROFILE_VERSION;
  sheet_stack_order: "ascending_sheet_index_top_to_bottom";
  pile_merge_order: "ascending_front_slot";
  slot_traversal_order: "row_major_top_left_to_bottom_right";
  printer_output_order: "sheet_index_ascending";
  printer_output_face: "face_up";
  duplex_mode: "flip_on_short_edge";
  sheet_orientation: "portrait";
}

export interface PodCutStackGroupConfiguration extends PodCutStackProfileDefinition {
  columns: number;
  rows: number;
  slots_per_sheet: number;
}

export const POD_CUT_STACK_PROFILE: PodCutStackProfileDefinition = {
  cut_stack_profile_version: POD_CUT_STACK_PROFILE_VERSION,
  sheet_stack_order: "ascending_sheet_index_top_to_bottom",
  pile_merge_order: "ascending_front_slot",
  slot_traversal_order: "row_major_top_left_to_bottom_right",
  printer_output_order: "sheet_index_ascending",
  printer_output_face: "face_up",
  duplex_mode: "flip_on_short_edge",
  sheet_orientation: "portrait",
};

export interface PodProductionBatchSourceReference {
  id: string;
  sha256: string;
}

export interface PodProductionBatchPosition extends PodProductionBatchSourceItem {
  kind: "position";
  batch_sequence_index: number;
  source_sequence_index: number;
  sheet_index: number;
  front_slot: number;
  back_slot: number;
  front_coordinates: PodImpositionSideCoordinates;
  back_coordinates: PodImpositionSideCoordinates;
  cut_pile_index: number;
  position_in_cut_pile: number;
}

export interface PodProductionBatchEmptySlot {
  kind: "empty";
  batch_sequence_index: null;
  source_sequence_index: null;
  sheet_index: number;
  front_slot: number;
  back_slot: number;
  front_coordinates: PodImpositionSideCoordinates;
  back_coordinates: PodImpositionSideCoordinates;
  cut_pile_index: number;
  position_in_cut_pile: number;
}

export type PodProductionBatchSlot = PodProductionBatchPosition | PodProductionBatchEmptySlot;

export interface PodProductionBatchGroup {
  group_index: number;
  compatibility_key: string;
  print_format_id: string;
  print_format: PodPrintFormatConfig;
  sheet_width_mm: number;
  sheet_height_mm: number;
  duplex_mode: PodDuplexMode;
  render_profile_version: string;
  render_profile_sha256: string;
  algorithm_version: string;
  cut_stack: PodCutStackGroupConfiguration;
  item_count: number;
  sheet_count: number;
  empty_slot_count: number;
  source_manifests: PodProductionBatchSourceReference[];
  asset_sets: PodProductionBatchSourceReference[];
  positions: PodProductionBatchPosition[];
  slots: PodProductionBatchSlot[];
}

export interface PodProductionBatchManifest {
  batch_manifest_version: typeof POD_PRODUCTION_BATCH_MANIFEST_VERSION;
  batch_algorithm_version: typeof POD_PRODUCTION_BATCH_ALGORITHM_VERSION;
  batch_id: string;
  batch_sha256: string;
  cut_stack_profile_version: typeof POD_CUT_STACK_PROFILE_VERSION;
  sheet_width_mm: typeof SRA3_SHEET_WIDTH_MM;
  sheet_height_mm: typeof SRA3_SHEET_HEIGHT_MM;
  item_count: number;
  print_job_count: number;
  sheet_count: number;
  empty_slot_count: number;
  source_manifests: PodProductionBatchSourceReference[];
  asset_sets: PodProductionBatchSourceReference[];
  groups: PodProductionBatchGroup[];
}

const compareText = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
const hashPattern = /^[0-9a-f]{64}$/;

export const comparePodProductionBatchItems = (
  left: PodProductionBatchSourceItem,
  right: PodProductionBatchSourceItem,
) => compareText(left.print_format_id, right.print_format_id)
  || left.batch_order_index - right.batch_order_index
  || compareText(left.source_order_id, right.source_order_id)
  || compareText(left.print_job_id, right.print_job_id)
  || left.sequence_index - right.sequence_index
  || compareText(left.inventory_unit_id, right.inventory_unit_id)
  || compareText(left.print_job_item_id, right.print_job_item_id);

const requiredTextFields: Array<keyof Pick<PodProductionBatchSourceItem,
  "pod_job_id" | "print_job_id" | "print_job_item_id" | "inventory_unit_id" | "source_order_id"
  | "card_design_id" | "print_manifest_id" | "asset_set_id" | "render_profile_version"
  | "print_format_id" | "algorithm_version" | "cut_stack_profile_version">> = [
    "pod_job_id",
    "print_job_id",
    "print_job_item_id",
    "inventory_unit_id",
    "source_order_id",
    "card_design_id",
    "print_manifest_id",
    "asset_set_id",
    "render_profile_version",
    "print_format_id",
    "algorithm_version",
    "cut_stack_profile_version",
  ];

const validateItem = (item: PodProductionBatchSourceItem) => {
  for (const field of requiredTextFields) {
    if (!item[field].trim()) throw new PodProductionBatchError(`pod_batch_identifier_required:${field}`);
  }
  for (const field of ["print_manifest_sha256", "asset_set_sha256", "render_profile_sha256", "render_input_sha256"] as const) {
    if (!hashPattern.test(item[field])) throw new PodProductionBatchError(`pod_batch_hash_invalid:${field}`);
  }
  if (item.print_manifest_state !== "frozen") throw new PodProductionBatchError("pod_batch_manifest_not_frozen");
  if (item.asset_set_state !== "frozen") throw new PodProductionBatchError("pod_batch_asset_set_not_frozen");
  if (item.algorithm_version !== POD_IMPOSITION_ALGORITHM) throw new PodProductionBatchError("pod_batch_algorithm_unsupported");
  if (item.cut_stack_profile_version !== POD_CUT_STACK_PROFILE_VERSION) {
    throw new PodProductionBatchError("pod_batch_cut_stack_profile_unsupported");
  }
  if (!Number.isInteger(item.sequence_index) || item.sequence_index < 0
    || !Number.isInteger(item.batch_order_index) || item.batch_order_index < 0) {
    throw new PodProductionBatchError("pod_batch_source_index_invalid");
  }
};

const referenceList = (items: PodProductionBatchSourceItem[], id: "print_manifest_id" | "asset_set_id", hash: "print_manifest_sha256" | "asset_set_sha256") => {
  const byId = new Map<string, string>();
  for (const item of items) {
    const existing = byId.get(item[id]);
    if (existing && existing !== item[hash]) throw new PodProductionBatchError(`pod_batch_source_hash_conflict:${item[id]}`);
    byId.set(item[id], item[hash]);
  }
  return Array.from(byId, ([sourceId, sha256]) => ({ id: sourceId, sha256 }))
    .sort((left, right) => compareText(left.id, right.id));
};

const compatibilityPayload = (item: PodProductionBatchSourceItem, format: PodPrintFormatConfig) => ({
  algorithm_version: item.algorithm_version,
  cut_stack_profile_version: item.cut_stack_profile_version,
  duplex_mode: format.duplexMode,
  print_format: format,
  print_format_id: item.print_format_id,
  render_profile_sha256: item.render_profile_sha256,
  render_profile_version: item.render_profile_version,
  sheet_height_mm: format.sheetHeightMm,
  sheet_width_mm: format.sheetWidthMm,
});

export const serializePodProductionBatchManifest = (manifest: PodProductionBatchManifest) => {
  const { batch_sha256: _batchSha256, ...payload } = manifest;
  return canonicalJson(payload);
};

export const hashPodProductionBatchManifest = (manifest: PodProductionBatchManifest) =>
  sha256Utf8(serializePodProductionBatchManifest(manifest));

const deriveBatchId = async (
  orderedItems: PodProductionBatchSourceItem[],
  formats: PodPrintFormatConfig[],
) => `pb-${await sha256Utf8(canonicalJson({
  batch_algorithm_version: POD_PRODUCTION_BATCH_ALGORITHM_VERSION,
  batch_manifest_version: POD_PRODUCTION_BATCH_MANIFEST_VERSION,
  cut_stack_profile_version: POD_CUT_STACK_PROFILE_VERSION,
  formats: [...formats].sort((left, right) => compareText(left.print_format_id, right.print_format_id)),
  items: [...orderedItems].sort(comparePodProductionBatchItems),
}))}`;

const slotGeometry = (format: PodPrintFormatConfig) => {
  const firstPass = planPodImposition([{ id: "slot-probe", print_format_id: format.print_format_id }], [format]).groups[0];
  if (!firstPass) throw new PodProductionBatchError("pod_batch_imposition_geometry_missing");
  const slots = firstPass.slotsPerSheet;
  const probes = Array.from({ length: slots }, (_, index) => ({ id: `slot-${index}`, print_format_id: format.print_format_id }));
  const planned = planPodImposition(probes, [format]);
  const group = planned.groups[0];
  if (!group || group.sheetCount !== 1 || group.slotsPerSheet !== slots) {
    throw new PodProductionBatchError("pod_batch_imposition_geometry_mismatch");
  }
  return group;
};

export const planPodProductionBatch = async (
  sourceItems: readonly PodProductionBatchSourceItem[],
  formatConfigs: readonly PodPrintFormatConfig[],
): Promise<PodProductionBatchManifest> => {
  if (!sourceItems.length) throw new PodProductionBatchError("pod_batch_items_required");
  const formats = formatConfigs.map((format) => structuredClone(format))
    .sort((left, right) => compareText(left.print_format_id, right.print_format_id));
  const formatById = new Map<string, PodPrintFormatConfig>();
  for (const format of formats) {
    if (formatById.has(format.print_format_id)) throw new PodProductionBatchError(`pod_batch_format_duplicate:${format.print_format_id}`);
    planPodImposition([], [format]);
    if (format.duplexMode !== POD_CUT_STACK_PROFILE.duplex_mode) throw new PodProductionBatchError("pod_batch_duplex_incompatible");
    if (format.sheetWidthMm !== SRA3_SHEET_WIDTH_MM || format.sheetHeightMm !== SRA3_SHEET_HEIGHT_MM) {
      throw new PodProductionBatchError("pod_batch_sheet_incompatible");
    }
    formatById.set(format.print_format_id, format);
  }

  const positionIds = new Set<string>();
  const inventoryIds = new Set<string>();
  const orderedItems = [...sourceItems].sort(comparePodProductionBatchItems);
  for (const item of orderedItems) {
    validateItem(item);
    if (!formatById.has(item.print_format_id)) throw new PodProductionBatchError(`pod_batch_print_format_unknown:${item.print_format_id}`);
    if (positionIds.has(item.print_job_item_id)) throw new PodProductionBatchError(`pod_batch_position_duplicate:${item.print_job_item_id}`);
    if (inventoryIds.has(item.inventory_unit_id)) throw new PodProductionBatchError(`pod_batch_inventory_unit_duplicate:${item.inventory_unit_id}`);
    positionIds.add(item.print_job_item_id);
    inventoryIds.add(item.inventory_unit_id);
  }

  const grouped = new Map<string, PodProductionBatchSourceItem[]>();
  for (const item of orderedItems) {
    const key = canonicalJson(compatibilityPayload(item, formatById.get(item.print_format_id)!));
    const entries = grouped.get(key) || [];
    entries.push(item);
    grouped.set(key, entries);
  }

  const batchSequenceByItemId = new Map(orderedItems.map((item, index) => [item.print_job_item_id, index]));
  const groups: PodProductionBatchGroup[] = [];
  for (const [compatibilityKey, entries] of grouped.entries()) {
    const format = formatById.get(entries[0].print_format_id)!;
    const geometry = slotGeometry(format);
    const sheetCount = Math.ceil(entries.length / geometry.slotsPerSheet);
    const cutStack: PodCutStackGroupConfiguration = {
      ...POD_CUT_STACK_PROFILE,
      columns: geometry.columns,
      rows: geometry.rows,
      slots_per_sheet: geometry.slotsPerSheet,
    };
    const slots: PodProductionBatchSlot[] = [];
    const positions: PodProductionBatchPosition[] = [];
    for (let sheetIndex = 0; sheetIndex < sheetCount; sheetIndex += 1) {
      for (let frontSlot = 0; frontSlot < geometry.slotsPerSheet; frontSlot += 1) {
        const sourceSequenceIndex = frontSlot * sheetCount + sheetIndex;
        const probe = geometry.placements[frontSlot];
        const common = {
          sheet_index: sheetIndex,
          front_slot: probe.frontSlot,
          back_slot: probe.backSlot,
          front_coordinates: probe.frontCoordinates,
          back_coordinates: probe.backCoordinates,
          cut_pile_index: frontSlot,
          position_in_cut_pile: sheetIndex,
        };
        const source = entries[sourceSequenceIndex];
        if (!source) {
          slots.push({ kind: "empty", batch_sequence_index: null, source_sequence_index: null, ...common });
          continue;
        }
        const position: PodProductionBatchPosition = {
          kind: "position",
          ...source,
          batch_sequence_index: batchSequenceByItemId.get(source.print_job_item_id)!,
          source_sequence_index: sourceSequenceIndex,
          ...common,
        };
        positions.push(position);
        slots.push(position);
      }
    }
    groups.push({
      group_index: groups.length,
      compatibility_key: compatibilityKey,
      print_format_id: format.print_format_id,
      print_format: format,
      sheet_width_mm: format.sheetWidthMm,
      sheet_height_mm: format.sheetHeightMm,
      duplex_mode: format.duplexMode,
      render_profile_version: entries[0].render_profile_version,
      render_profile_sha256: entries[0].render_profile_sha256,
      algorithm_version: entries[0].algorithm_version,
      cut_stack: cutStack,
      item_count: entries.length,
      sheet_count: sheetCount,
      empty_slot_count: slots.length - entries.length,
      source_manifests: referenceList(entries, "print_manifest_id", "print_manifest_sha256"),
      asset_sets: referenceList(entries, "asset_set_id", "asset_set_sha256"),
      positions: positions.sort((left, right) => left.source_sequence_index - right.source_sequence_index),
      slots,
    });
  }

  const usedFormatIds = new Set(orderedItems.map((item) => item.print_format_id));
  const batchId = await deriveBatchId(orderedItems, formats.filter((format) => usedFormatIds.has(format.print_format_id)));
  const withoutHash: Omit<PodProductionBatchManifest, "batch_sha256"> = {
    batch_manifest_version: POD_PRODUCTION_BATCH_MANIFEST_VERSION,
    batch_algorithm_version: POD_PRODUCTION_BATCH_ALGORITHM_VERSION,
    batch_id: batchId,
    cut_stack_profile_version: POD_CUT_STACK_PROFILE_VERSION,
    sheet_width_mm: SRA3_SHEET_WIDTH_MM,
    sheet_height_mm: SRA3_SHEET_HEIGHT_MM,
    item_count: orderedItems.length,
    print_job_count: new Set(orderedItems.map((item) => item.print_job_id)).size,
    sheet_count: groups.reduce((sum, group) => sum + group.sheet_count, 0),
    empty_slot_count: groups.reduce((sum, group) => sum + group.empty_slot_count, 0),
    source_manifests: referenceList(orderedItems, "print_manifest_id", "print_manifest_sha256"),
    asset_sets: referenceList(orderedItems, "asset_set_id", "asset_set_sha256"),
    groups,
  };
  const manifest: PodProductionBatchManifest = { ...withoutHash, batch_sha256: "" };
  manifest.batch_sha256 = await hashPodProductionBatchManifest(manifest);
  return manifest;
};

export const simulatePodCutAndStack = (group: PodProductionBatchGroup) => group.slots
  .filter((slot): slot is PodProductionBatchPosition => slot.kind === "position")
  .sort((left, right) => left.cut_pile_index - right.cut_pile_index
    || left.position_in_cut_pile - right.position_in_cut_pile)
  .map((position) => position.source_sequence_index);

export const assertPodProductionBatchManifest = async (manifest: PodProductionBatchManifest) => {
  const formatsByCanonical = new Map(manifest.groups.map((group) => [canonicalJson(group.print_format), group.print_format]));
  const allPositions = manifest.groups.flatMap((group) => group.positions);
  if (manifest.batch_manifest_version !== POD_PRODUCTION_BATCH_MANIFEST_VERSION
    || manifest.batch_algorithm_version !== POD_PRODUCTION_BATCH_ALGORITHM_VERSION
    || manifest.cut_stack_profile_version !== POD_CUT_STACK_PROFILE_VERSION
    || manifest.sheet_width_mm !== SRA3_SHEET_WIDTH_MM
    || manifest.sheet_height_mm !== SRA3_SHEET_HEIGHT_MM
    || manifest.item_count !== allPositions.length
    || manifest.print_job_count !== new Set(allPositions.map((position) => position.print_job_id)).size
    || manifest.sheet_count !== manifest.groups.reduce((sum, group) => sum + group.sheet_count, 0)
    || manifest.empty_slot_count !== manifest.groups.reduce((sum, group) => sum + group.empty_slot_count, 0)
    || canonicalJson(manifest.source_manifests) !== canonicalJson(referenceList(allPositions, "print_manifest_id", "print_manifest_sha256"))
    || canonicalJson(manifest.asset_sets) !== canonicalJson(referenceList(allPositions, "asset_set_id", "asset_set_sha256"))
    || manifest.batch_id !== await deriveBatchId(
      allPositions.map(({ kind: _kind, batch_sequence_index: _batch, source_sequence_index: _source,
        sheet_index: _sheet, front_slot: _front, back_slot: _back, front_coordinates: _frontCoordinates,
        back_coordinates: _backCoordinates, cut_pile_index: _pile, position_in_cut_pile: _pilePosition, ...source }) => source),
      Array.from(formatsByCanonical.values()).sort((left, right) => compareText(left.print_format_id, right.print_format_id)),
    )
    || manifest.batch_sha256 !== await hashPodProductionBatchManifest(manifest)) {
    throw new PodProductionBatchError("pod_batch_manifest_integrity_mismatch");
  }
  const batchIndexes = [...allPositions].sort((left, right) => left.batch_sequence_index - right.batch_sequence_index)
    .map((position) => position.batch_sequence_index);
  if (canonicalJson(batchIndexes) !== canonicalJson(Array.from({ length: manifest.item_count }, (_, index) => index))) {
    throw new PodProductionBatchError("pod_batch_sequence_integrity_mismatch");
  }
  for (let groupIndex = 0; groupIndex < manifest.groups.length; groupIndex += 1) {
    const group = manifest.groups[groupIndex];
    const geometry = slotGeometry(group.print_format);
    if (group.group_index !== groupIndex
      || !group.positions.length
      || group.compatibility_key !== canonicalJson(compatibilityPayload(group.positions[0], group.print_format))
      || group.positions.some((position) => canonicalJson(compatibilityPayload(position, group.print_format)) !== group.compatibility_key)
      || group.print_format_id !== group.print_format.print_format_id
      || group.sheet_width_mm !== SRA3_SHEET_WIDTH_MM
      || group.sheet_height_mm !== SRA3_SHEET_HEIGHT_MM
      || group.duplex_mode !== POD_CUT_STACK_PROFILE.duplex_mode
      || group.cut_stack.cut_stack_profile_version !== POD_CUT_STACK_PROFILE_VERSION
      || group.cut_stack.columns !== geometry.columns
      || group.cut_stack.rows !== geometry.rows
      || group.cut_stack.slots_per_sheet !== geometry.slotsPerSheet
      || group.item_count !== group.positions.length
      || group.slots.length !== group.sheet_count * geometry.slotsPerSheet
      || group.empty_slot_count !== group.slots.filter((slot) => slot.kind === "empty").length
      || canonicalJson(group.source_manifests) !== canonicalJson(referenceList(group.positions, "print_manifest_id", "print_manifest_sha256"))
      || canonicalJson(group.asset_sets) !== canonicalJson(referenceList(group.positions, "asset_set_id", "asset_set_sha256"))) {
      throw new PodProductionBatchError("pod_batch_group_integrity_mismatch");
    }
    const seenPhysicalSlots = new Set<string>();
    for (const slot of group.slots) {
      const key = `${slot.sheet_index}:${slot.front_slot}`;
      const probe = geometry.placements[slot.front_slot];
      if (seenPhysicalSlots.has(key) || !probe
        || slot.sheet_index < 0 || slot.sheet_index >= group.sheet_count
        || slot.front_slot !== probe.frontSlot
        || slot.back_slot !== probe.backSlot
        || slot.cut_pile_index !== slot.front_slot
        || slot.position_in_cut_pile !== slot.sheet_index
        || canonicalJson(slot.front_coordinates) !== canonicalJson(probe.frontCoordinates)
        || canonicalJson(slot.back_coordinates) !== canonicalJson(probe.backCoordinates)) {
        throw new PodProductionBatchError("pod_batch_slot_geometry_mismatch");
      }
      seenPhysicalSlots.add(key);
      const expectedSourceIndex = slot.front_slot * group.sheet_count + slot.sheet_index;
      if (slot.kind === "position" && slot.source_sequence_index !== expectedSourceIndex) {
        throw new PodProductionBatchError("pod_batch_cut_stack_formula_mismatch");
      }
      if (slot.kind === "empty" && expectedSourceIndex < group.item_count) {
        throw new PodProductionBatchError("pod_batch_empty_slot_mismatch");
      }
    }
    const slotPositions = group.slots.filter((slot): slot is PodProductionBatchPosition => slot.kind === "position")
      .sort((left, right) => left.source_sequence_index - right.source_sequence_index);
    if (canonicalJson(slotPositions) !== canonicalJson(group.positions)) {
      throw new PodProductionBatchError("pod_batch_position_slot_mismatch");
    }
    const expected = Array.from({ length: group.item_count }, (_, index) => index);
    if (canonicalJson(simulatePodCutAndStack(group)) !== canonicalJson(expected)) {
      throw new PodProductionBatchError("pod_batch_cut_stack_integrity_mismatch");
    }
  }
  return manifest;
};

export type { PodPrintFormatConfig, PodPrintOrientation };
