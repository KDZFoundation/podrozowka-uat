export const POD_IMPOSITION_ALGORITHM = "pod-sra3-configurable-v1" as const;
export const SRA3_SHEET_WIDTH_MM = 320;
export const SRA3_SHEET_HEIGHT_MM = 450;

export type PodPrintOrientation = "landscape" | "portrait";
export type PodDuplexMode = "flip_on_short_edge" | "flip_on_long_edge";

export interface PodPrintFormatConfig {
  version: 1;
  print_format_id: string;
  sheetWidthMm: number;
  sheetHeightMm: number;
  netWidthMm: number;
  netHeightMm: number;
  bleedMm: number;
  orientation: PodPrintOrientation;
  marginsMm: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  gapsMm: {
    horizontal: number;
    vertical: number;
  };
  duplexMode: PodDuplexMode;
}

export interface PodImpositionSourceItem {
  id: string;
  print_format_id: string;
}

export interface PodImpositionRectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PodImpositionSideCoordinates {
  artwork: PodImpositionRectangle;
  trim: PodImpositionRectangle;
}

export interface PodImpositionPlacement<T extends PodImpositionSourceItem> {
  item: T;
  sequenceIndex: number;
  groupSequenceIndex: number;
  sheetIndex: number;
  frontSlot: number;
  backSlot: number;
  frontCoordinates: PodImpositionSideCoordinates;
  backCoordinates: PodImpositionSideCoordinates;
}

export interface PodImpositionGroup<T extends PodImpositionSourceItem> {
  printFormatId: string;
  config: PodPrintFormatConfig;
  netWidthMm: number;
  netHeightMm: number;
  grossWidthMm: number;
  grossHeightMm: number;
  columns: number;
  rows: number;
  slotsPerSheet: number;
  sheetCount: number;
  placements: PodImpositionPlacement<T>[];
}

export interface PodImpositionPlan<T extends PodImpositionSourceItem> {
  algorithm: typeof POD_IMPOSITION_ALGORITHM;
  itemCount: number;
  sheetCount: number;
  groups: PodImpositionGroup<T>[];
}

export const CURRENT_POSTCARD_PRINT_FORMAT: PodPrintFormatConfig = {
  version: 1,
  print_format_id: "postcard-148x105-v1",
  sheetWidthMm: SRA3_SHEET_WIDTH_MM,
  sheetHeightMm: SRA3_SHEET_HEIGHT_MM,
  netWidthMm: 148,
  netHeightMm: 105,
  bleedMm: 3,
  orientation: "landscape",
  marginsMm: { top: 3, right: 6, bottom: 3, left: 6 },
  gapsMm: { horizontal: 0, vertical: 0 },
  duplexMode: "flip_on_short_edge",
};

const assertFiniteNonNegative = (name: string, value: number) => {
  if (!Number.isFinite(value) || value < 0) throw new Error(`invalid_imposition_value:${name}`);
};

const assertFinitePositive = (name: string, value: number) => {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`invalid_imposition_value:${name}`);
};

const orientedNetDimensions = (config: PodPrintFormatConfig) => {
  const shortEdge = Math.min(config.netWidthMm, config.netHeightMm);
  const longEdge = Math.max(config.netWidthMm, config.netHeightMm);
  return config.orientation === "landscape"
    ? { width: longEdge, height: shortEdge }
    : { width: shortEdge, height: longEdge };
};

const validateConfig = (config: PodPrintFormatConfig) => {
  if (config.version !== 1) throw new Error(`unsupported_print_format_version:${config.version}`);
  if (!config.print_format_id.trim()) throw new Error("print_format_id_required");
  assertFinitePositive("sheetWidthMm", config.sheetWidthMm);
  assertFinitePositive("sheetHeightMm", config.sheetHeightMm);
  if (config.sheetWidthMm !== SRA3_SHEET_WIDTH_MM || config.sheetHeightMm !== SRA3_SHEET_HEIGHT_MM) {
    throw new Error(`unsupported_imposition_sheet:${config.sheetWidthMm}x${config.sheetHeightMm}`);
  }
  assertFinitePositive("netWidthMm", config.netWidthMm);
  assertFinitePositive("netHeightMm", config.netHeightMm);
  assertFiniteNonNegative("bleedMm", config.bleedMm);
  Object.entries(config.marginsMm).forEach(([key, value]) => assertFiniteNonNegative(`marginsMm.${key}`, value));
  Object.entries(config.gapsMm).forEach(([key, value]) => assertFiniteNonNegative(`gapsMm.${key}`, value));
};

const gridForConfig = (config: PodPrintFormatConfig) => {
  validateConfig(config);
  const net = orientedNetDimensions(config);
  const grossWidthMm = net.width + config.bleedMm * 2;
  const grossHeightMm = net.height + config.bleedMm * 2;
  const availableWidth = config.sheetWidthMm - config.marginsMm.left - config.marginsMm.right;
  const availableHeight = config.sheetHeightMm - config.marginsMm.top - config.marginsMm.bottom;
  const columns = Math.floor((availableWidth + config.gapsMm.horizontal) / (grossWidthMm + config.gapsMm.horizontal));
  const rows = Math.floor((availableHeight + config.gapsMm.vertical) / (grossHeightMm + config.gapsMm.vertical));
  if (columns < 1 || rows < 1) throw new Error(`print_format_does_not_fit_sheet:${config.print_format_id}`);
  return {
    netWidthMm: net.width,
    netHeightMm: net.height,
    grossWidthMm,
    grossHeightMm,
    columns,
    rows,
    slotsPerSheet: columns * rows,
  };
};

const slotCoordinates = (
  slot: number,
  config: PodPrintFormatConfig,
  grid: ReturnType<typeof gridForConfig>,
): PodImpositionSideCoordinates => {
  const column = slot % grid.columns;
  const row = Math.floor(slot / grid.columns);
  const x = config.marginsMm.left + column * (grid.grossWidthMm + config.gapsMm.horizontal);
  const y = config.marginsMm.top + row * (grid.grossHeightMm + config.gapsMm.vertical);
  return {
    artwork: { x, y, width: grid.grossWidthMm, height: grid.grossHeightMm },
    trim: {
      x: x + config.bleedMm,
      y: y + config.bleedMm,
      width: grid.netWidthMm,
      height: grid.netHeightMm,
    },
  };
};

const backSlotForDuplex = (
  frontSlot: number,
  config: PodPrintFormatConfig,
  grid: ReturnType<typeof gridForConfig>,
) => {
  const column = frontSlot % grid.columns;
  const row = Math.floor(frontSlot / grid.columns);
  const sheetIsPortrait = config.sheetHeightMm >= config.sheetWidthMm;
  const mirrorRows = config.duplexMode === "flip_on_short_edge" ? sheetIsPortrait : !sheetIsPortrait;
  const backColumn = mirrorRows ? column : grid.columns - 1 - column;
  const backRow = mirrorRows ? grid.rows - 1 - row : row;
  return backRow * grid.columns + backColumn;
};

export const planPodImposition = <T extends PodImpositionSourceItem>(
  orderedItems: readonly T[],
  formatConfigs: readonly PodPrintFormatConfig[],
): PodImpositionPlan<T> => {
  const configById = new Map<string, PodPrintFormatConfig>();
  for (const config of formatConfigs) {
    if (configById.has(config.print_format_id)) throw new Error(`duplicate_print_format_id:${config.print_format_id}`);
    validateConfig(config);
    configById.set(config.print_format_id, config);
  }

  const grouped = new Map<string, Array<{ item: T; sequenceIndex: number }>>();
  orderedItems.forEach((item, sequenceIndex) => {
    if (!configById.has(item.print_format_id)) throw new Error(`unknown_print_format_id:${item.print_format_id}`);
    const entries = grouped.get(item.print_format_id) ?? [];
    entries.push({ item, sequenceIndex });
    grouped.set(item.print_format_id, entries);
  });

  const groups = Array.from(grouped.entries()).map(([printFormatId, entries]) => {
    const config = configById.get(printFormatId)!;
    const grid = gridForConfig(config);
    const placements = entries.map(({ item, sequenceIndex }, groupSequenceIndex) => {
      const sheetIndex = Math.floor(groupSequenceIndex / grid.slotsPerSheet);
      const frontSlot = groupSequenceIndex % grid.slotsPerSheet;
      const backSlot = backSlotForDuplex(frontSlot, config, grid);
      return {
        item,
        sequenceIndex,
        groupSequenceIndex,
        sheetIndex,
        frontSlot,
        backSlot,
        frontCoordinates: slotCoordinates(frontSlot, config, grid),
        backCoordinates: slotCoordinates(backSlot, config, grid),
      } satisfies PodImpositionPlacement<T>;
    });
    return {
      printFormatId,
      config,
      ...grid,
      sheetCount: Math.ceil(entries.length / grid.slotsPerSheet),
      placements,
    } satisfies PodImpositionGroup<T>;
  });

  return {
    algorithm: POD_IMPOSITION_ALGORITHM,
    itemCount: orderedItems.length,
    sheetCount: groups.reduce((total, group) => total + group.sheetCount, 0),
    groups,
  };
};
