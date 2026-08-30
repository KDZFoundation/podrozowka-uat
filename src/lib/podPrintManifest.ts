import {
  POD_IMPOSITION_ALGORITHM,
  planPodImposition,
  type PodImpositionSourceItem,
  type PodImpositionSideCoordinates,
  type PodPrintFormatConfig,
} from "./podImposition";

export const POD_PRINT_MANIFEST_LEGACY_VERSION = 1 as const;
export const POD_PRINT_MANIFEST_VERSION = 2 as const;
export type PodPrintFormatSource = "inventory_unit" | "legacy_fallback_v1";

export interface PodPrintRenderInput {
  qr_url: string;
  front_text: string | null;
  back_qr_label: string | null;
  image_front_url: string | null;
  image_version: string | null;
  photo_author: string | null;
  crop_settings: unknown;
  country_iso2: string | null;
  country_flag_url: string | null;
}

export interface PodPrintManifestSourceItem extends PodImpositionSourceItem {
  format_source?: PodPrintFormatSource;
  batch_order_index: number;
  sequence_index: number;
  pod_job_id: string;
  inventory_unit_id: string;
  card_design_id: string;
  source_order_id: string;
  primary_language_code: string | null;
  secondary_language_code: string | null;
  render_input: PodPrintRenderInput;
  render_input_sha256: string;
}

export interface PodPrintManifestItem {
  format_source?: PodPrintFormatSource;
  sequence_index: number;
  batch_order_index: number;
  print_job_item_id: string;
  pod_job_id: string;
  inventory_unit_id: string;
  card_design_id: string;
  source_order_id: string;
  primary_language_code: string | null;
  secondary_language_code: string | null;
  render_input: PodPrintRenderInput;
  render_input_sha256: string;
  sheet_index: number;
  front_slot: number;
  back_slot: number;
  front_coordinates: PodImpositionSideCoordinates;
  back_coordinates: PodImpositionSideCoordinates;
}

export interface PodPrintManifestFormatGroup {
  print_format_id: string;
  print_format: PodPrintFormatConfig;
  postcard_count: number;
  sheet_count: number;
  columns: number;
  rows: number;
  slots_per_sheet: number;
  gross_width_mm: number;
  gross_height_mm: number;
  items: PodPrintManifestItem[];
}

export interface PodPrintManifest {
  manifest_version: typeof POD_PRINT_MANIFEST_LEGACY_VERSION | typeof POD_PRINT_MANIFEST_VERSION;
  algorithm_version: typeof POD_IMPOSITION_ALGORITHM;
  postcard_count: number;
  sheet_count: number;
  format_groups: PodPrintManifestFormatGroup[];
}

const integerAtLeastZero = (name: string, value: number) => {
  if (!Number.isInteger(value) || value < 0) throw new Error(`invalid_manifest_index:${name}`);
};

const requiredId = (name: string, value: string) => {
  if (!value.trim()) throw new Error(`manifest_identifier_required:${name}`);
};

export interface PodPrintSourceOrderInput {
  inventory_unit_order_id?: string | null;
  print_job_order_id?: string | null;
  stock_production_order_id?: string | null;
}

export const resolvePodPrintSourceOrderId = (input: PodPrintSourceOrderInput): string => {
  const sourceOrderId = input.inventory_unit_order_id?.trim()
    || input.stock_production_order_id?.trim()
    || input.print_job_order_id?.trim();
  if (!sourceOrderId) {
    throw new Error("manifest_source_order_id_unavailable: print job has no order_id or stock_production_order_id");
  }
  return sourceOrderId;
};

export const canonicalizeJsonValue = (value: unknown): unknown => {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("manifest_contains_non_finite_number");
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalizeJsonValue);
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.keys(record)
      .sort(compareText)
      .reduce<Record<string, unknown>>((result, key) => {
        const entry = record[key];
        if (entry === undefined) throw new Error(`manifest_contains_undefined:${key}`);
        result[key] = canonicalizeJsonValue(entry);
        return result;
      }, {});
  }
  throw new Error(`manifest_contains_unsupported_value:${typeof value}`);
};

const copyFormatConfig = (config: PodPrintFormatConfig): PodPrintFormatConfig => ({
  version: config.version,
  print_format_id: config.print_format_id,
  sheetWidthMm: config.sheetWidthMm,
  sheetHeightMm: config.sheetHeightMm,
  netWidthMm: config.netWidthMm,
  netHeightMm: config.netHeightMm,
  bleedMm: config.bleedMm,
  orientation: config.orientation,
  marginsMm: {
    top: config.marginsMm.top,
    right: config.marginsMm.right,
    bottom: config.marginsMm.bottom,
    left: config.marginsMm.left,
  },
  gapsMm: {
    horizontal: config.gapsMm.horizontal,
    vertical: config.gapsMm.vertical,
  },
  duplexMode: config.duplexMode,
});

const compareManifestItems = (left: PodPrintManifestSourceItem, right: PodPrintManifestSourceItem) => (
  left.batch_order_index - right.batch_order_index
  || left.sequence_index - right.sequence_index
);

const compareText = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;

export const buildPodPrintManifest = (
  sourceItems: readonly PodPrintManifestSourceItem[],
  formatConfigs: readonly PodPrintFormatConfig[],
): PodPrintManifest => {
  const positionKeys = new Set<string>();
  const unitIds = new Set<string>();
  for (const item of sourceItems) {
    integerAtLeastZero("batch_order_index", item.batch_order_index);
    integerAtLeastZero("sequence_index", item.sequence_index);
    requiredId("pod_job_id", item.pod_job_id);
    requiredId("print_job_item_id", item.id);
    requiredId("inventory_unit_id", item.inventory_unit_id);
    requiredId("card_design_id", item.card_design_id);
    requiredId("source_order_id", item.source_order_id);
    requiredId("print_format_id", item.print_format_id);
    requiredId("render_input.qr_url", item.render_input.qr_url);
    requiredId("render_input_sha256", item.render_input_sha256);
    const positionKey = `${item.batch_order_index}:${item.sequence_index}`;
    if (positionKeys.has(positionKey)) throw new Error(`duplicate_manifest_position:${positionKey}`);
    if (unitIds.has(item.inventory_unit_id)) throw new Error(`duplicate_manifest_inventory_unit:${item.inventory_unit_id}`);
    positionKeys.add(positionKey);
    unitIds.add(item.inventory_unit_id);
  }

  const orderedItems = [...sourceItems].sort(compareManifestItems);
  const plan = planPodImposition(orderedItems, formatConfigs);
  const groups = plan.groups
    .map((group): PodPrintManifestFormatGroup => ({
      print_format_id: group.printFormatId,
      print_format: copyFormatConfig(group.config),
      postcard_count: group.placements.length,
      sheet_count: group.sheetCount,
      columns: group.columns,
      rows: group.rows,
      slots_per_sheet: group.slotsPerSheet,
      gross_width_mm: group.grossWidthMm,
      gross_height_mm: group.grossHeightMm,
      items: group.placements.map((placement) => ({
        format_source: placement.item.format_source || "legacy_fallback_v1",
        sequence_index: placement.item.sequence_index,
        batch_order_index: placement.item.batch_order_index,
        print_job_item_id: placement.item.id,
        pod_job_id: placement.item.pod_job_id,
        inventory_unit_id: placement.item.inventory_unit_id,
        card_design_id: placement.item.card_design_id,
        source_order_id: placement.item.source_order_id,
        primary_language_code: placement.item.primary_language_code,
        secondary_language_code: placement.item.secondary_language_code,
        render_input: canonicalizeJsonValue(placement.item.render_input) as PodPrintRenderInput,
        render_input_sha256: placement.item.render_input_sha256,
        sheet_index: placement.sheetIndex,
        front_slot: placement.frontSlot,
        back_slot: placement.backSlot,
        front_coordinates: placement.frontCoordinates,
        back_coordinates: placement.backCoordinates,
      })),
    }))
    .sort((left, right) => compareText(left.print_format_id, right.print_format_id));

  return {
    manifest_version: POD_PRINT_MANIFEST_VERSION,
    algorithm_version: POD_IMPOSITION_ALGORITHM,
    postcard_count: sourceItems.length,
    sheet_count: groups.reduce((total, group) => total + group.sheet_count, 0),
    format_groups: groups,
  };
};

export const serializePodPrintManifest = (manifest: PodPrintManifest): string => (
  JSON.stringify(canonicalizeJsonValue(manifest))
);

export const canonicalJson = (value: unknown): string => JSON.stringify(canonicalizeJsonValue(value));

export const sha256Utf8 = async (value: string): Promise<string> => {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

export const hashPodPrintRenderInput = (input: PodPrintRenderInput) => sha256Utf8(canonicalJson(input));

export const hashPodPrintManifest = (manifest: PodPrintManifest) => sha256Utf8(serializePodPrintManifest(manifest));
